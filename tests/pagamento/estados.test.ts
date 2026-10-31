import { describe, expect, it } from "vitest";
import {
  ESTADOS_DE_PAGAMENTO, decidirEstado, situacaoDasDisputas, transicaoValida, type EstadoDePagamento,
} from "@/lib/pagamento/estados";
import { bancoDeTeste } from "./banco-de-teste";

describe("transições", () => {
  it.each<[EstadoDePagamento, EstadoDePagamento]>([
    ["pending", "paid"],
    ["pending", "declined"],
    ["pending", "expired"],
    ["declined", "paid"],
    ["expired", "paid"],
    ["paid", "refunded"],
    ["paid", "partially_refunded"],
    ["paid", "in_dispute"],
    ["partially_refunded", "refunded"],
    ["in_dispute", "paid"],
    ["refunded", "in_dispute"],
  ])("aceita %s -> %s", (de, para) => {
    expect(transicaoValida(de, para)).toBe(true);
  });

  it.each<[EstadoDePagamento, EstadoDePagamento]>([
    ["paid", "pending"],
    ["paid", "declined"],
    ["paid", "expired"],
    ["refunded", "paid"],
    ["refunded", "pending"],
    ["expired", "pending"],
    ["expired", "declined"],
    ["partially_refunded", "paid"],
  ])("recusa %s -> %s", (de, para) => {
    expect(transicaoValida(de, para)).toBe(false);
  });

  it("repetir o mesmo estado nunca é transição inválida", () => {
    for (const estado of ESTADOS_DE_PAGAMENTO) expect(transicaoValida(estado, estado)).toBe(true);
  });

  it("o TypeScript e o banco têm a mesma tabela, par a par", async () => {
    const db = await bancoDeTeste();
    for (const de of ESTADOS_DE_PAGAMENTO) {
      for (const para of ESTADOS_DE_PAGAMENTO) {
        // Nulo e "mesmo estado" a trigger resolve antes de perguntar à função.
        if (de === para) continue;
        const r = await db.query<{ ok: boolean }>("select public.pagamento_transicao_valida($1, $2) as ok", [de, para]);
        expect(r.rows[0].ok, `${de} -> ${para}`).toBe(transicaoValida(de, para));
      }
    }

    // A trigger, ponta a ponta: de nulo vai para qualquer um, para nulo não volta.
    const pedido = await db.query<{ id: string }>(
      "insert into public.pedidos (nome, total_centavos) values ('Teste', 100) returning id"
    );
    const id = pedido.rows[0].id;
    await db.query("update public.pedidos set pagamento_estado = 'pending' where id = $1", [id]);
    await db.query("update public.pedidos set pagamento_estado = 'pending' where id = $1", [id]);
    await expect(db.query("update public.pedidos set pagamento_estado = null where id = $1", [id])).rejects.toThrow();
    await db.close();
  });
});

describe("decidirEstado", () => {
  const paga = { status: "PAID", pagoCentavos: 1000, estornadoCentavos: 0 };
  const base = { atual: "pending" as EstadoDePagamento, totalCentavos: 1000 };

  it("pagamento integral vira paid", () => {
    expect(decidirEstado({ ...base, cobrancas: [paga] }).estado).toBe("paid");
  });

  it("pago a menos não vira paid", () => {
    expect(decidirEstado({ ...base, cobrancas: [{ ...paga, pagoCentavos: 1 }] }).estado).toBe("pending");
  });

  it("parcial e total de estorno", () => {
    const parcial = decidirEstado({ ...base, atual: "paid", cobrancas: [{ ...paga, estornadoCentavos: 400 }] });
    expect(parcial).toEqual({ estado: "partially_refunded", estornadoCentavos: 400 });
    const total = decidirEstado({ ...base, atual: "paid", cobrancas: [{ ...paga, status: "CANCELED", estornadoCentavos: 1000 }] });
    expect(total).toEqual({ estado: "refunded", estornadoCentavos: 1000 });
  });

  it("recusa só com todas as cobranças recusadas", () => {
    const recusada = { status: "DECLINED", pagoCentavos: 0, estornadoCentavos: 0 };
    const analise = { status: "IN_ANALYSIS", pagoCentavos: 0, estornadoCentavos: 0 };
    expect(decidirEstado({ ...base, cobrancas: [recusada] }).estado).toBe("declined");
    expect(decidirEstado({ ...base, cobrancas: [recusada, analise] }).estado).toBe("pending");
  });

  it("resposta sem dinheiro não desfaz estado com dinheiro", () => {
    expect(decidirEstado({ ...base, atual: "paid", cobrancas: [] }).estado).toBe("paid");
    const recusada = { status: "DECLINED", pagoCentavos: 0, estornadoCentavos: 0 };
    expect(decidirEstado({ ...base, atual: "paid", cobrancas: [recusada] }).estado).toBe("paid");
  });

  it("a contestação aberta vale mais que o pagamento", () => {
    expect(decidirEstado({ ...base, atual: "paid", cobrancas: [paga], disputa: "aberta" }).estado).toBe("in_dispute");
    expect(decidirEstado({ ...base, atual: "in_dispute", cobrancas: [paga], disputa: "ganha" }).estado).toBe("paid");
    expect(decidirEstado({ ...base, atual: "in_dispute", cobrancas: [paga], disputa: "perdida" })).toEqual({
      estado: "refunded",
      estornadoCentavos: 1000,
    });
  });

  it("entre várias contestações, vale a pior", () => {
    expect(situacaoDasDisputas(["WON", "AWAITING_EVIDENCE"])).toBe("aberta");
    expect(situacaoDasDisputas(["WON", "LOST"])).toBe("perdida");
    expect(situacaoDasDisputas(["WON"])).toBe("ganha");
    expect(situacaoDasDisputas([])).toBeNull();
    expect(situacaoDasDisputas(["DENIED"])).toBe("aberta");
  });
});
