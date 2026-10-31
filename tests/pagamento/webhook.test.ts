import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { avisarPagamentoConfirmado } from "@/lib/avisos";
import { urlDeNotificacao } from "@/lib/pagamento/assinatura-url";
import { abrirCobranca } from "@/lib/pagamento/cobranca";
import { criarCheckout } from "@/lib/pagamento/pagbank";
import { receberAviso } from "@/lib/pagamento/webhook";
import { SEGREDO, bancoDeTeste } from "./banco-de-teste";
import {
  PagBankSimulado, TOKEN, alertas, cobranca, criarPedido, estoque, prepararAmbiente, rpcNoBanco, situacao, usarBanco,
} from "./simulador";

vi.mock("@/lib/pagamento/banco", async () => {
  const { rpcNoBanco: rpc } = await import("./simulador");
  return {
    rpcComSegredo: rpc,
    vincularCheckout: (e: { pedidoId: string; checkoutId: string; payUrl: string; expiraEm: string | null }) =>
      rpc("pagbank_vincular_checkout", {
        p_pedido_id: e.pedidoId,
        p_checkout_id: e.checkoutId,
        p_pay_url: e.payUrl,
        p_expira_em: e.expiraEm,
      }),
  };
});
vi.mock("@/lib/avisos", () => ({
  avisarPagamentoConfirmado: vi.fn(async () => {}),
  avisarAlertaDePagamento: vi.fn(async () => {}),
}));

const API = new PagBankSimulado();
let db: PGlite;

beforeAll(async () => {
  prepararAmbiente();
  db = await bancoDeTeste();
  usarBanco(db);
  vi.stubGlobal("fetch", API.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => db.close());
beforeEach(() => {
  API.limpar();
  vi.mocked(avisarPagamentoConfirmado).mockClear();
});

/** Com o `x-authenticity-token` de docs/confirmar-autenticidade-da-notificacao. */
function assinado(corpoCru: string, extra: Record<string, string> = {}) {
  const token = createHash("sha256").update(`${TOKEN}-${corpoCru}`).digest("hex");
  return {
    corpoCru,
    cabecalhos: new Headers({ "x-authenticity-token": token, ...extra }),
    numeroAssinado: { p: null, s: null },
  };
}

async function entregar(aviso: Parameters<typeof receberAviso>[0]) {
  const r = await receberAviso(aviso);
  if (r.http === 200) await r.depois?.();
  return r;
}

async function eventos(recursoId: string) {
  const r = await db.query<{ tipo: string; assinatura: string; processado_em: string | null; alerta: string | null; pedido_id: string | null }>(
    "select tipo, assinatura, processado_em, alerta, pedido_id from public.payment_events where recurso_id = $1",
    [recursoId]
  );
  return r.rows;
}

describe("autenticidade", () => {
  it("sem prova nenhuma: 401, e nada é gravado", async () => {
    const corpo = JSON.stringify({ id: "ORDE_FALSA" });
    const r = await receberAviso({ corpoCru: corpo, cabecalhos: new Headers(), numeroAssinado: { p: null, s: null } });
    expect(r.http).toBe(401);
    expect(await eventos("ORDE_FALSA")).toEqual([]);
    expect(API.chamadas).toEqual([]);
  });

  it("token errado: 401", async () => {
    const corpo = JSON.stringify({ id: "ORDE_FALSA2" });
    const r = await receberAviso({
      corpoCru: corpo,
      cabecalhos: new Headers({ "x-authenticity-token": "deadbeef" }),
      numeroAssinado: { p: null, s: null },
    });
    expect(r.http).toBe(401);
    expect(await eventos("ORDE_FALSA2")).toEqual([]);
  });

  it("URL com assinatura forjada não conta como prova", async () => {
    const corpo = JSON.stringify({ id: "ORDE_FALSA3" });
    const r = await receberAviso({
      corpoCru: corpo,
      cabecalhos: new Headers(),
      numeroAssinado: { p: "1", s: "aaaaaaaaaaaaaaaaaaaaaa" },
    });
    expect(r.http).toBe(401);
  });

  it("URL assinada vale, mesmo com token que não confere, e fica registrado", async () => {
    const p = await criarPedido(db);
    API.order("ORDE_W0", p.id, [cobranca("CHAR_W0", "PAID")]);
    const url = new URL(urlDeNotificacao("https://loja.exemplo/api/pagbank/webhook", p.numero)!);

    const r = await entregar({
      corpoCru: JSON.stringify({ id: "ORDE_W0" }),
      cabecalhos: new Headers({ "x-authenticity-token": "deadbeef" }),
      numeroAssinado: { p: url.searchParams.get("p"), s: url.searchParams.get("s") },
    });
    expect(r.http).toBe(200);
    expect((await eventos("ORDE_W0"))[0].assinatura).toBe("url (assinatura não conferiu)");
    expect((await situacao(db, p.id)).status).toBe("pago");
  });

  it("o corpo do aviso não prova pagamento: quem decide é a consulta", async () => {
    const p = await criarPedido(db);
    API.order("ORDE_W00", p.id, [cobranca("CHAR_W00", "DECLINED")]);
    // O corpo diz que pagou; a API diz que não.
    await entregar(assinado(JSON.stringify({ id: "ORDE_W00", reference_id: p.id, charges: [{ status: "PAID" }] })));
    expect((await situacao(db, p.id)).status).toBe("aguardando_pagamento");
  });
});

describe("idempotência", () => {
  it("o mesmo aviso duas vezes: um evento, uma promoção, um aviso ao cliente", async () => {
    const p = await criarPedido(db);
    API.order("ORDE_W1", p.id, [cobranca("CHAR_W1", "PAID")]);
    const corpo = JSON.stringify({ id: "ORDE_W1", reference_id: p.id });

    const primeira = await entregar(assinado(corpo));
    expect(primeira).toMatchObject({ http: 200, corpo: { repetido: false } });
    const consultas = API.chamou("GET", "/orders/ORDE_W1");

    const segunda = await receberAviso(assinado(corpo));
    expect(segunda).toMatchObject({ http: 200, corpo: { repetido: true } });
    expect(segunda).not.toHaveProperty("depois");

    expect(await eventos("ORDE_W1")).toHaveLength(1);
    expect(API.chamou("GET", "/orders/ORDE_W1")).toBe(consultas);
    expect(avisarPagamentoConfirmado).toHaveBeenCalledTimes(1);
    expect((await situacao(db, p.id)).status).toBe("pago");
    expect(await estoque(db, p.sku)).toBe(5);
  });

  it("avisos diferentes da mesma order não pagam duas vezes", async () => {
    const p = await criarPedido(db);
    API.order("ORDE_W2", p.id, [cobranca("CHAR_W2", "PAID")]);
    await entregar(assinado(JSON.stringify({ id: "ORDE_W2", reference_id: p.id, seq: 1 })));
    await entregar(assinado(JSON.stringify({ id: "ORDE_W2", reference_id: p.id, seq: 2 })));

    expect(avisarPagamentoConfirmado).toHaveBeenCalledTimes(1);
    const pagamentos = await db.query("select 1 from public.pagamentos where pedido_id = $1", [p.id]);
    expect(pagamentos.rows).toHaveLength(1);
  });

  it("evento que falhou ao processar é tentado de novo ao repetir", async () => {
    const p = await criarPedido(db);
    API.order("ORDE_W3", p.id, [cobranca("CHAR_W3", "PAID")]);
    API.falhas.set("/orders/ORDE_W3", "rede");
    const corpo = JSON.stringify({ id: "ORDE_W3", reference_id: p.id });

    expect((await entregar(assinado(corpo))).http).toBe(200);
    expect((await situacao(db, p.id)).status).toBe("aguardando_pagamento");

    API.falhas.clear();
    const repeticao = await entregar(assinado(corpo));
    expect(repeticao).toMatchObject({ http: 200, corpo: { repetido: true } });
    expect((await situacao(db, p.id)).status).toBe("pago");
    expect(await eventos("ORDE_W3")).toHaveLength(1);
  });
});

describe("tipos de evento", () => {
  it("desconhecido é guardado e vira alerta", async () => {
    const corpo = JSON.stringify({ id: "XPTO_1", qualquer: true });
    expect((await entregar(assinado(corpo))).http).toBe(200);
    const [linha] = await eventos("XPTO_1");
    expect(linha.tipo).toBe("unknown");
    expect(linha.alerta).toBeTruthy();
  });

  it("order de outra origem da conta não mexe em pedido e vira alerta", async () => {
    API.order("ORDE_W4", null, [cobranca("CHAR_W4", "PAID")]);
    await entregar(assinado(JSON.stringify({ id: "ORDE_W4" })));
    expect((await eventos("ORDE_W4"))[0].processado_em).toBeTruthy();
    const alerta = await db.query<{ alerta: string }>(
      "select alerta from public.payment_events where chave = 'alerta:order-sem-pedido:ORDE_W4'"
    );
    expect(alerta.rows).toHaveLength(1);
  });

  it("contestação: consulta a API, marca o pedido, avisa a equipe", async () => {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "INACTIVE", ["ORDE_W5"]);
    API.order("ORDE_W5", p.id, [cobranca("CHAR_W5", "PAID")]);
    await entregar(assinado(JSON.stringify({ id: "ORDE_W5", reference_id: p.id })));

    API.chargebacks.set("CBKS_W5", {
      id: "CBKS_W5",
      status: "AWAITING_EVIDENCE",
      amount: { value: 100_000 },
      transaction: { reference_id: p.id },
    });
    await entregar(assinado(JSON.stringify({ id: "CBKS_W5", status: "AWAITING_EVIDENCE" })));

    expect((await situacao(db, p.id)).pagamento_estado).toBe("in_dispute");
    expect((await alertas(db, p.id)).length).toBeGreaterThan(0);
    expect((await eventos("CBKS_W5"))[0].pedido_id).toBe(p.id);
  });

  it("contestação sem referência ao pedido não se perde: alerta com os dados", async () => {
    API.chargebacks.set("CBKS_W6", {
      id: "CBKS_W6",
      status: "AWAITING_EVIDENCE",
      amount: { value: 5_000 },
      transaction: { reference_id: null },
    });
    await entregar(assinado(JSON.stringify({ id: "CBKS_W6" })));
    expect((await eventos("CBKS_W6"))[0].alerta).toContain("CBKS_W6");
  });

  it("evento de cancelamento: acha a order pela cobrança e reconhece o estorno", async () => {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "INACTIVE", ["ORDE_W7"]);
    API.order("ORDE_W7", p.id, [cobranca("CHAR_W7", "PAID")]);
    await entregar(assinado(JSON.stringify({ id: "ORDE_W7", reference_id: p.id })));

    API.order("ORDE_W7", p.id, [cobranca("CHAR_W7", "CANCELED", { pago: 100_000, estornado: 100_000 })]);
    await entregar(assinado(JSON.stringify({ id: "CHAR_W7" })));
    expect((await situacao(db, p.id)).pagamento_estado).toBe("refunded");
  });

  it("formato antigo: precisa existir na API, e o XML não vai inteiro para o log", async () => {
    const p = await criarPedido(db);
    API.notificacoes.set(
      "ABC-777",
      `<transaction><code>TX1</code><reference>${p.id}</reference><status>5</status><grossAmount>1000.00</grossAmount>
       <sender><name>Pessoa Secreta</name><email>secreta@exemplo.com</email></sender></transaction>`
    );

    const falso = await receberAviso({
      corpoCru: "notificationCode=NAO-EXISTE",
      cabecalhos: new Headers(),
      numeroAssinado: { p: null, s: null },
    });
    expect(falso.http).toBe(401);

    const r = await entregar({
      corpoCru: "notificationCode=ABC-777&notificationType=transaction",
      cabecalhos: new Headers(),
      numeroAssinado: { p: null, s: null },
    });
    expect(r.http).toBe(200);
    expect((await eventos("ABC-777"))[0].assinatura).toBe("consulta");

    const logs = await db.query<{ caminho: string; resposta: string }>(
      "select caminho, resposta from public.payment_logs where caminho like '%ABC-777%'"
    );
    expect(logs.rows.length).toBeGreaterThan(0);
    for (const l of logs.rows) {
      expect(l.caminho).not.toContain(TOKEN);
      expect(l.resposta).not.toContain("Pessoa Secreta");
      expect(l.resposta).not.toContain("secreta@");
    }
  });
});

describe("abrir a cobrança e o log", () => {
  it("o id devolvido vira o vínculo, e o log não guarda token nem CPF", async () => {
    const p = await criarPedido(db);
    const { checkoutId } = await criarCheckout({
      pedidoId: p.id,
      numero: p.numero,
      totalCentavos: 100_000,
      expiraEm: null,
      itens: [{ nome: "Anel", quantidade: 1 }],
      comprador: { nome: "Maria Souza", email: "maria@exemplo.com", cpf: "12345678909", telefone: "11999998888" },
      urlRetorno: "https://loja.exemplo/volta",
      urlNotificacao: null,
    });
    expect(checkoutId).toMatch(/^CHEC_/);

    const r = await db.query<{ requisicao: string; resposta: string; http_status: number }>(
      "select requisicao, resposta, http_status from public.payment_logs where caminho = '/checkouts' order by id desc limit 1"
    );
    const linha = r.rows[0];
    expect(linha.http_status).toBe(201);
    for (const proibido of [TOKEN, "12345678909", "Maria Souza", "maria@exemplo.com", "999998888"]) {
      expect(linha.requisicao).not.toContain(proibido);
    }
  });

  it("401 ou 403 ao abrir cobrança avisam a equipe, uma vez por dia", async () => {
    const p = await criarPedido(db);
    API.falhas.set("/checkouts", 403);
    const entrada = {
      pedidoId: p.id,
      numero: p.numero,
      totalCentavos: 100_000,
      expiraEm: null,
      itens: [{ nome: "Anel", quantidade: 1 }],
      comprador: { nome: "Maria Souza", email: null, cpf: null, telefone: null },
    };
    await expect(abrirCobranca({ ...entrada, urlBase: "https://loja.exemplo" })).rejects.toThrow("403");
    await expect(abrirCobranca({ ...entrada, urlBase: "https://loja.exemplo" })).rejects.toThrow("403");

    const linhas = await db.query("select 1 from public.payment_events where chave like 'alerta:checkout-403:%'");
    expect(linhas.rows).toHaveLength(1);
  });
});

describe("as portas do banco", () => {
  it.each([
    ["pagbank_contexto_pedido", "p_pedido_id => '00000000-0000-4000-8000-000000000000'"],
    ["pagbank_expirar_pedido", "p_pedido_id => '00000000-0000-4000-8000-000000000000'"],
    ["pagbank_registrar_log", "p_ambiente=>'x',p_metodo=>'x',p_caminho=>'x',p_http_status=>1,p_duracao_ms=>1,p_requisicao=>'x',p_resposta=>'x',p_erro=>'x'"],
  ])("%s recusa segredo errado", async (funcao, argumentos) => {
    await expect(db.query(`select public.${funcao}(p_segredo => 'errado', ${argumentos})`)).rejects.toThrow();
  });

  it("segredo certo passa", async () => {
    await expect(
      rpcNoBanco("pagbank_registrar_log", {
        p_segredo: SEGREDO, p_ambiente: "sandbox", p_metodo: "GET", p_caminho: "/x", p_http_status: 200,
        p_duracao_ms: 1, p_requisicao: null, p_resposta: null, p_erro: null,
      })
    ).resolves.not.toThrow();
  });

  it.each(["payment_logs", "payment_events", "pagbank_checkouts", "pagbank_orders", "pagamento_estornos", "pagamento_disputas"])(
    "%s: RLS ligada, e visitante ou cliente não leem nem gravam",
    async (tabela) => {
      const rls = await db.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where oid = $1::regclass",
        [`public.${tabela}`]
      );
      expect(rls.rows[0].relrowsecurity).toBe(true);

      for (const papel of ["anon", "authenticated"]) {
        await db.exec(`set role ${papel}`);
        try {
          const lidas = await db
            .query(`select * from public.${tabela}`)
            .then((r) => r.rows.length)
            .catch(() => 0);
          expect(lidas).toBe(0);
          await expect(db.query(`delete from public.${tabela}`).then((r) => r.affectedRows ?? 0).catch(() => 0)).resolves.toBe(0);
        } finally {
          await db.exec("reset role");
        }
      }
    }
  );

  it("o banco recusa transição inválida, mesmo escrita à mão", async () => {
    const p = await criarPedido(db);
    API.order("ORDE_W8", p.id, [cobranca("CHAR_W8", "PAID")]);
    await entregar(assinado(JSON.stringify({ id: "ORDE_W8", reference_id: p.id })));
    await expect(db.query("update public.pedidos set pagamento_estado = 'pending' where id = $1", [p.id])).rejects.toThrow();

    const r = await rpcNoBanco<Array<{ mudou: boolean; rejeitada: boolean; anterior: string }>>("pagbank_aplicar_estado", {
      p_pedido_id: p.id, p_estado: "expired", p_estornado: null, p_origem: "teste",
    });
    expect(r[0]).toMatchObject({ mudou: false, rejeitada: true, anterior: "paid" });
    expect((await situacao(db, p.id)).pagamento_estado).toBe("paid");
  });

  it("pedido pago nunca expira", async () => {
    const p = await criarPedido(db, { expiraEm: new Date(Date.now() - 3600_000) });
    API.order("ORDE_W9", p.id, [cobranca("CHAR_W9", "PAID")]);
    await entregar(assinado(JSON.stringify({ id: "ORDE_W9", reference_id: p.id })));
    expect(await rpcNoBanco("pagbank_expirar_pedido", { p_pedido_id: p.id })).toBe(false);
    expect((await situacao(db, p.id)).status).toBe("pago");
  });

  it("o cron antigo não expira pedido com checkout", async () => {
    const p = await criarPedido(db, { expiraEm: new Date(Date.now() - 3600_000) });
    await db.query("select public.expirar_pedidos_vencidos()");
    expect((await situacao(db, p.id)).status).toBe("aguardando_pagamento");
  });
});
