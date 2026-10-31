import { describe, expect, it } from "vitest";
import { classificarEvento, efeitoDoStatusLegado } from "@/lib/pagamento/eventos";
import { sanitizarParaLog } from "@/lib/pagamento/sanitizar";

const texto = (o: unknown) => JSON.stringify(o);

describe("classificarEvento", () => {
  it("pagamento: order sem estorno", () => {
    const corpo = texto({ id: "ORDE_1", charges: [{ id: "CHAR_1", status: "PAID", amount: { summary: { refunded: 0 } } }] });
    expect(classificarEvento(corpo)).toEqual({ tipo: "pagamento", recurso: "order", recursoId: "ORDE_1" });
  });

  it("estorno: order com valor devolvido", () => {
    const corpo = texto({ id: "ORDE_1", charges: [{ amount: { summary: { refunded: 500 } } }] });
    expect(classificarEvento(corpo)).toEqual({ tipo: "estorno", recurso: "order", recursoId: "ORDE_1" });
  });

  it("estorno: evento de cancelamento, com o id da cobrança", () => {
    expect(classificarEvento(texto({ id: "CHAR_9" }))).toEqual({ tipo: "estorno", recurso: "cobranca", recursoId: "CHAR_9" });
  });

  it.each([
    ["direto", { id: "CBKS_1", status: "AWAITING_EVIDENCE" }],
    ["em data", { event: "CHARGEBACK", data: { id: "CBKS_1" } }],
    ["em chargeback", { chargeback: { id: "CBKS_1" } }],
  ])("contestação: objeto %s", (_nome, corpo) => {
    expect(classificarEvento(texto(corpo))).toEqual({ tipo: "contestacao", recurso: "chargeback", recursoId: "CBKS_1" });
  });

  it("pós-transação: formulário com notificationCode", () => {
    const corpo = "notificationCode=ABC-123&notificationType=transaction";
    expect(classificarEvento(corpo)).toEqual({ tipo: "pos_transacao", recurso: "notificacao", recursoId: "ABC-123" });
  });

  it("notificationCode fora do formato não vai para a URL de consulta", () => {
    const evento = classificarEvento("notificationCode=../../etc/passwd");
    expect(evento.tipo).toBe("unknown");
  });

  it.each([
    ["id estranho", texto({ id: "XPTO_1" })],
    ["objeto vazio", texto({})],
    ["JSON que não é objeto", "42"],
    ["null", "null"],
    ["texto solto", "ola mundo"],
    ["corpo vazio", ""],
  ])("desconhecido: %s", (_nome, corpo) => {
    const evento = classificarEvento(corpo);
    expect(evento.tipo).toBe("unknown");
    expect(evento.recurso).toBeNull();
  });
});

describe("efeitoDoStatusLegado", () => {
  it.each([
    ["5", "disputa"],
    ["9", "disputa"],
    ["6", "estorno"],
    ["7", "estorno"],
    ["8", "estorno"],
    ["3", "nenhum"],
    ["99", "desconhecido"],
    [null, "desconhecido"],
  ])("status %s -> %s", (status, efeito) => {
    expect(efeitoDoStatusLegado(status)).toBe(efeito);
  });
});

describe("sanitizarParaLog", () => {
  const corpo = {
    reference_id: "pedido-1",
    customer: {
      name: "Maria Souza",
      email: "maria@exemplo.com",
      tax_id: "12345678909",
      phone: { country: "+55", area: "11", number: "999998888" },
    },
    charges: [
      {
        id: "CHAR_1",
        status: "PAID",
        payment_method: {
          type: "CREDIT_CARD",
          card: { first_digits: "411111", last_digits: "1111", exp_month: 12, holder: { name: "MARIA" } },
          authorization_code: "999",
        },
        amount: { value: 100 },
      },
    ],
    shipping: { address: { street: "Rua das Flores", number: "12", postal_code: "01310100" } },
    Authorization: "Bearer segredo",
    token: "segredo",
    public_key: "MIIB",
  };
  const log = sanitizarParaLog(corpo)!;

  it.each(["Maria", "Souza", "maria@", "12345678909", "999998888", "Flores", "01310100", "segredo", "411111", "MIIB", "MARIA"])(
    "não deixa passar %s",
    (trecho) => {
      expect(log).not.toContain(trecho);
    }
  );

  it("mantém o que a homologação precisa ver", () => {
    expect(log).toContain("CHAR_1");
    expect(log).toContain('"status":"PAID"');
    expect(log).toContain('"value":100');
    expect(log).toContain("m***@exemplo.com");
  });

  it("corpo ausente não vira texto", () => {
    expect(sanitizarParaLog(undefined)).toBeNull();
    expect(sanitizarParaLog(null)).toBeNull();
  });
});
