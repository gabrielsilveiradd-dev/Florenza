import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { avisarPagamentoConfirmado } from "@/lib/avisos";
import { estornarPeloPainel } from "@/lib/pagamento/estorno";
import { reconcileOrder } from "@/lib/pagamento/reconciliar";
import { bancoDeTeste } from "./banco-de-teste";
import {
  PagBankSimulado, alertas, cobranca, criarPedido, estoque, prepararAmbiente, situacao, usarBanco,
} from "./simulador";

vi.mock("@/lib/pagamento/banco", async () => {
  const { rpcNoBanco } = await import("./simulador");
  return { rpcComSegredo: rpcNoBanco };
});
vi.mock("@/lib/avisos", () => ({
  avisarPagamentoConfirmado: vi.fn(async () => {}),
  avisarAlertaDePagamento: vi.fn(async () => {}),
}));

const VENCIDA = new Date(Date.now() - 60 * 60 * 1000);
const VENCEU_AGORA = new Date(Date.now() - 60 * 1000);
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

async function regraDeEstoque(regra: string) {
  await db.query("update public.configuracoes_loja set estoque_no_estorno = $1", [regra]);
}

describe("confirmação", () => {
  it("cobrança paga leva o pedido a pago, e o aviso sai uma vez só", async () => {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "ACTIVE", ["ORDE_A1"]);
    API.order("ORDE_A1", p.id, [cobranca("CHAR_A1", "PAID")]);

    const r = await reconcileOrder(p.id, "job");
    expect(r).toMatchObject({ estado: "paid", mudou: true, expirou: false, verificado: true });
    expect(await situacao(db, p.id)).toMatchObject({ status: "pago", pagamento_estado: "paid" });

    const segunda = await reconcileOrder(p.id, "pagina");
    expect(segunda).toMatchObject({ estado: "paid", mudou: false });
    expect(avisarPagamentoConfirmado).toHaveBeenCalledTimes(1);

    const linhas = await db.query("select 1 from public.pagamentos where pedido_id = $1", [p.id]);
    expect(linhas.rows).toHaveLength(1);
  });

  it("cartão recusado vira declined e não mexe no estoque", async () => {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "ACTIVE", ["ORDE_A2"]);
    API.order("ORDE_A2", p.id, [cobranca("CHAR_A2", "DECLINED")]);

    expect(await reconcileOrder(p.id, "pagina")).toMatchObject({ estado: "declined" });
    expect(await situacao(db, p.id)).toMatchObject({ status: "aguardando_pagamento", pagamento_estado: "declined" });
    expect(await estoque(db, p.sku)).toBe(5);
  });

  it("pago a menos vira alerta para a equipe, não venda", async () => {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "ACTIVE", ["ORDE_A3"]);
    API.order("ORDE_A3", p.id, [cobranca("CHAR_A3", "PAID", { valor: 100 })]);

    await reconcileOrder(p.id, "webhook");
    expect((await situacao(db, p.id)).status).toBe("aguardando_pagamento");
    expect((await alertas(db, p.id)).length).toBeGreaterThan(0);
  });

  it("order que o PagBank associa a outro pedido não paga este", async () => {
    const p = await criarPedido(db);
    const outro = await criarPedido(db);
    API.checkout(p.checkoutId, "ACTIVE", ["ORDE_A4"]);
    API.order("ORDE_A4", outro.id, [cobranca("CHAR_A4", "PAID")]);

    const r = await reconcileOrder(p.id, "job");
    expect(r?.verificado).toBe(false);
    expect((await situacao(db, p.id)).status).toBe("aguardando_pagamento");
    expect((await alertas(db, p.id)).join()).toContain("ORDE_A4");
  });

  it("falha de API na consulta não conclui recusa", async () => {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "ACTIVE", ["ORDE_A5", "ORDE_A6"]);
    API.order("ORDE_A5", p.id, [cobranca("CHAR_A5", "DECLINED")]);
    API.falhas.set("/orders/ORDE_A6", 500);

    const r = await reconcileOrder(p.id, "job");
    expect(r?.verificado).toBe(false);
    expect((await situacao(db, p.id)).pagamento_estado).toBe("pending");
  });

  it("pedido inexistente devolve null", async () => {
    expect(await reconcileOrder("00000000-0000-4000-8000-000000000000", "job")).toBeNull();
  });
});

describe("expiração", () => {
  it("reserva vencida, com prova de que não há pagamento: expira, inativa o checkout e devolve a peça", async () => {
    const p = await criarPedido(db, { expiraEm: VENCIDA });
    API.checkout(p.checkoutId, "ACTIVE", []);

    const r = await reconcileOrder(p.id, "job");
    expect(r).toMatchObject({ expirou: true, estado: "expired", verificado: true });
    expect(API.chamou("POST", `/checkouts/${p.checkoutId}/inactivate`)).toBe(1);
    expect(await situacao(db, p.id)).toMatchObject({ status: "cancelado", pagamento_estado: "expired" });
    expect(await estoque(db, p.sku)).toBe(6);
  });

  it("reconciliar de novo não devolve a peça duas vezes", async () => {
    const p = await criarPedido(db, { expiraEm: VENCIDA });
    API.checkout(p.checkoutId, "ACTIVE", []);
    await reconcileOrder(p.id, "job");
    await reconcileOrder(p.id, "job");
    expect(await estoque(db, p.sku)).toBe(6);
  });

  it("reserva vencida, mas paga: fica paga", async () => {
    const p = await criarPedido(db, { expiraEm: VENCIDA });
    API.checkout(p.checkoutId, "EXPIRED", ["ORDE_B1"]);
    API.order("ORDE_B1", p.id, [cobranca("CHAR_B1", "PAID")]);

    const r = await reconcileOrder(p.id, "job");
    expect(r).toMatchObject({ estado: "paid", expirou: false });
    expect((await situacao(db, p.id)).status).toBe("pago");
    expect(await estoque(db, p.sku)).toBe(5);
  });

  it("sem o campo `orders` na resposta: não expira, e avisa", async () => {
    const p = await criarPedido(db, { expiraEm: VENCIDA });
    API.checkout(p.checkoutId, "EXPIRED", "sem campo");

    const r = await reconcileOrder(p.id, "job");
    expect(r?.expirou).toBe(false);
    expect((await situacao(db, p.id)).status).toBe("aguardando_pagamento");
    expect((await alertas(db, p.id)).join()).toContain("não foi expirado");
  });

  it.each([
    ["erro 500", 500],
    ["erro 401", 401],
    ["falha de rede", "rede"],
  ] as const)("consulta do checkout com %s: não expira, e avisa", async (_nome, falha) => {
    const p = await criarPedido(db, { expiraEm: VENCIDA });
    API.falhas.set(`/checkouts/${p.checkoutId}`, falha);

    const r = await reconcileOrder(p.id, "job");
    expect(r).toMatchObject({ expirou: false, verificado: false });
    expect((await situacao(db, p.id)).status).toBe("aguardando_pagamento");
    expect((await alertas(db, p.id)).join()).toContain("não foi expirado");
    expect(await estoque(db, p.sku)).toBe(5);
  });

  it("cartão em análise segura a reserva, sem alerta", async () => {
    const p = await criarPedido(db, { expiraEm: VENCIDA });
    API.checkout(p.checkoutId, "EXPIRED", ["ORDE_B2"]);
    API.order("ORDE_B2", p.id, [cobranca("CHAR_B2", "IN_ANALYSIS")]);

    expect(await reconcileOrder(p.id, "job")).toMatchObject({ expirou: false, estado: "pending" });
    expect((await situacao(db, p.id)).status).toBe("aguardando_pagamento");
    expect(await alertas(db, p.id)).toEqual([]);
  });

  it("dentro da carência depois do vencimento: ainda não expira", async () => {
    const p = await criarPedido(db, { expiraEm: VENCEU_AGORA });
    API.checkout(p.checkoutId, "EXPIRED", []);
    expect(await reconcileOrder(p.id, "job")).toMatchObject({ expirou: false });
  });

  it("pagamento que chega depois de expirar é reconhecido", async () => {
    const p = await criarPedido(db, { expiraEm: VENCIDA });
    API.checkout(p.checkoutId, "ACTIVE", []);
    await reconcileOrder(p.id, "job");
    expect((await situacao(db, p.id)).pagamento_estado).toBe("expired");

    API.checkout(p.checkoutId, "INACTIVE", ["ORDE_B3"]);
    API.order("ORDE_B3", p.id, [cobranca("CHAR_B3", "PAID")]);
    await reconcileOrder(p.id, "webhook");
    expect((await situacao(db, p.id)).pagamento_estado).toBe("paid");
  });
});

describe("estorno", () => {
  async function pedidoPago(id: string) {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "INACTIVE", [`ORDE_${id}`]);
    API.order(`ORDE_${id}`, p.id, [cobranca(`CHAR_${id}`, "PAID")]);
    await reconcileOrder(p.id, "webhook");
    return p;
  }
  const admin = { id: "00000000-0000-4000-8000-0000000000aa", email: "admin@exemplo.com" };

  beforeAll(async () => {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [admin.id, admin.email]);
  });
  beforeEach(() => regraDeEstoque("perguntar"));

  it("parcial e depois total, com registro de quem fez", async () => {
    const p = await pedidoPago("C1");

    const parcial = await estornarPeloPainel({
      pedidoId: p.id, cobrancaId: "CHAR_C1", valorCentavos: 40_000, devolverEstoque: null, motivo: "ajuste", admin,
    });
    expect(parcial.ok).toBe(true);
    expect(await situacao(db, p.id)).toMatchObject({ pagamento_estado: "partially_refunded", estornado_centavos: 40_000 });
    expect(await estoque(db, p.sku)).toBe(5);

    const total = await estornarPeloPainel({
      pedidoId: p.id, cobrancaId: "CHAR_C1", valorCentavos: 60_000, devolverEstoque: true, motivo: null, admin,
    });
    expect(total.ok).toBe(true);
    expect(await situacao(db, p.id)).toMatchObject({ pagamento_estado: "refunded", estornado_centavos: 100_000 });
    expect(await estoque(db, p.sku)).toBe(6);

    const quem = await db.query<{ admin_email: string; status: string }>(
      "select admin_email, status from public.pagamento_estornos where pedido_id = $1",
      [p.id]
    );
    expect(quem.rows).toHaveLength(2);
    expect(quem.rows.every((l) => l.admin_email === admin.email && l.status === "concluido")).toBe(true);
  });

  it("estorno maior que o valor pago é recusado antes de chamar o PagBank", async () => {
    const p = await pedidoPago("C2");
    const r = await estornarPeloPainel({
      pedidoId: p.id, cobrancaId: "CHAR_C2", valorCentavos: 100_001, devolverEstoque: null, motivo: null, admin,
    });
    expect(r.ok).toBe(false);
    expect(API.chamou("POST", "/charges/")).toBe(0);
  });

  it("sem resposta conclusiva fica incerto, não repete, e a conferência resolve", async () => {
    const p = await pedidoPago("C3");
    API.falhas.set("/charges/CHAR_C3/cancel", "rede");

    const r = await estornarPeloPainel({
      pedidoId: p.id, cobrancaId: "CHAR_C3", valorCentavos: 100_000, devolverEstoque: null, motivo: null, admin,
    });
    expect(r).toMatchObject({ ok: false, http: 504 });
    expect(API.chamou("POST", "/charges/CHAR_C3/cancel")).toBe(1);

    // Com um incerto aberto, um segundo estorno não passa.
    const segundo = await estornarPeloPainel({
      pedidoId: p.id, cobrancaId: "CHAR_C3", valorCentavos: 100_000, devolverEstoque: null, motivo: null, admin,
    });
    expect(segundo.ok).toBe(false);
    expect(API.chamou("POST", "/charges/CHAR_C3/cancel")).toBe(1);

    // O PagBank tinha feito: a reconciliação encontra o valor devolvido.
    API.falhas.clear();
    API.order("ORDE_C3", p.id, [cobranca("CHAR_C3", "CANCELED", { pago: 100_000, estornado: 100_000 })]);
    await reconcileOrder(p.id, "job");
    expect((await situacao(db, p.id)).pagamento_estado).toBe("refunded");
    const estado = await db.query<{ status: string }>(
      "select status from public.pagamento_estornos where pedido_id = $1",
      [p.id]
    );
    expect(estado.rows[0].status).not.toBe("incerto");
  });

  it("recusa do PagBank não muda o pedido e libera tentar de novo", async () => {
    const p = await pedidoPago("C4");
    API.falhas.set("/charges/CHAR_C4/cancel", 400);
    const r = await estornarPeloPainel({
      pedidoId: p.id, cobrancaId: "CHAR_C4", valorCentavos: 10_000, devolverEstoque: null, motivo: null, admin,
    });
    expect(r).toMatchObject({ ok: false, http: 502 });
    expect((await situacao(db, p.id)).pagamento_estado).toBe("paid");

    API.falhas.clear();
    const denovo = await estornarPeloPainel({
      pedidoId: p.id, cobrancaId: "CHAR_C4", valorCentavos: 10_000, devolverEstoque: null, motivo: null, admin,
    });
    expect(denovo.ok).toBe(true);
  });

  it("estorno feito fora do site, no painel do PagBank, também é reconhecido", async () => {
    const p = await pedidoPago("C5");
    API.order("ORDE_C5", p.id, [cobranca("CHAR_C5", "PAID", { pago: 100_000, estornado: 25_000 })]);
    await reconcileOrder(p.id, "webhook");
    expect(await situacao(db, p.id)).toMatchObject({ pagamento_estado: "partially_refunded", estornado_centavos: 25_000 });
  });

  describe("regra de estoque", () => {
    async function estornoTotal(id: string) {
      const p = await pedidoPago(id);
      API.order(`ORDE_${id}`, p.id, [cobranca(`CHAR_${id}`, "CANCELED", { pago: 100_000, estornado: 100_000 })]);
      return p;
    }

    it("perguntar: não mexe, e pede a decisão", async () => {
      const p = await estornoTotal("D1");
      await reconcileOrder(p.id, "webhook");
      expect(await estoque(db, p.sku)).toBe(5);
      expect((await alertas(db, p.id)).join()).toContain("decida");
    });

    it("devolver: volta uma vez, por mais que reconcilie", async () => {
      await regraDeEstoque("devolver");
      const p = await estornoTotal("D2");
      await reconcileOrder(p.id, "webhook");
      await reconcileOrder(p.id, "job");
      await reconcileOrder(p.id, "painel");
      expect(await estoque(db, p.sku)).toBe(6);
      expect((await situacao(db, p.id)).estoque_no_estorno).toBe("devolvido");
    });

    it("não devolver: fica retido", async () => {
      await regraDeEstoque("nao_devolver");
      const p = await estornoTotal("D3");
      await reconcileOrder(p.id, "webhook");
      expect(await estoque(db, p.sku)).toBe(5);
      expect((await situacao(db, p.id)).estoque_no_estorno).toBe("retido");
    });
  });
});

describe("contestação", () => {
  const contestacao = (id: string, status: string, referencia: string | null) => ({
    id,
    status,
    amount: { value: 100_000 },
    due_date: "2026-11-15T00:00:00-03:00",
    classification: "FRAUD",
    reason_code: "4837",
    transaction: { reference_id: referencia, customer_email: "cliente@exemplo.com" },
  });

  it("aberta, ganha: volta a paid", async () => {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "INACTIVE", ["ORDE_E1"]);
    API.order("ORDE_E1", p.id, [cobranca("CHAR_E1", "PAID")]);
    await reconcileOrder(p.id, "webhook");

    await db.query(
      "insert into public.pagamento_disputas (id, pedido_id, status, valor_centavos) values ('CBKS_E1', $1, 'AWAITING_EVIDENCE', 100000)",
      [p.id]
    );
    API.chargebacks.set("CBKS_E1", contestacao("CBKS_E1", "AWAITING_EVIDENCE", p.id));
    expect(await reconcileOrder(p.id, "job")).toMatchObject({ estado: "in_dispute" });

    API.chargebacks.set("CBKS_E1", contestacao("CBKS_E1", "WON", p.id));
    expect(await reconcileOrder(p.id, "job")).toMatchObject({ estado: "paid" });
  });

  it("aberta, perdida: refunded, com o valor debitado", async () => {
    const p = await criarPedido(db);
    API.checkout(p.checkoutId, "INACTIVE", ["ORDE_E2"]);
    API.order("ORDE_E2", p.id, [cobranca("CHAR_E2", "PAID")]);
    await reconcileOrder(p.id, "webhook");

    await db.query(
      "insert into public.pagamento_disputas (id, pedido_id, status, valor_centavos) values ('CBKS_E2', $1, 'AWAITING_EVIDENCE', 100000)",
      [p.id]
    );
    API.chargebacks.set("CBKS_E2", contestacao("CBKS_E2", "LOST", p.id));
    await reconcileOrder(p.id, "job");
    expect(await situacao(db, p.id)).toMatchObject({ pagamento_estado: "refunded", estornado_centavos: 100_000 });
  });
});
