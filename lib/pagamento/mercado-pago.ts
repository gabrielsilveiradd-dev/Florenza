import { createHmac, timingSafeEqual } from "node:crypto";
import { mercadoPagoEmTeste } from "@/lib/pagamento/config";

/**
 * CONVERSA COM O MERCADO PAGO — só servidor.
 *
 * Checkout Pro: o site cria uma "preferência" com o valor do pedido e manda a
 * pessoa para a página de pagamento do Mercado Pago. Cartão nunca passa por
 * este site nem por este banco, que é exatamente o que se quer numa joalheria.
 *
 * O VALOR SAI DO BANCO. Quem chama `criarPreferencia` passa o total que
 * `criar_pedido()` calculou — nunca um número vindo do navegador.
 *
 * Dinheiro chega aqui em centavos e só vira reais na fronteira com a API, que
 * pede `unit_price` em reais. É o único lugar do projeto onde isso acontece.
 */

const API = "https://api.mercadopago.com";

function token(): string {
  const valor = process.env.MP_ACCESS_TOKEN;
  if (!valor) throw new Error("MP_ACCESS_TOKEN não está configurado.");
  return valor;
}

/**
 * A API pede data com fuso explícito. O Brasil não tem mais horário de verão
 * desde 2019, então -03:00 é fixo para o horário de Brasília.
 */
function dataParaMercadoPago(iso: string): string {
  const brasilia = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return brasilia.toISOString().replace("Z", "-03:00");
}

export type EntradaDaPreferencia = {
  pedidoId: string;
  numero: number;
  totalCentavos: number;
  expiraEm: string | null;
  itens: Array<{ nome: string; quantidade: number }>;
  comprador: { nome: string; email: string | null; cpf: string | null };
  urlBase: string;
};

/** Devolve o link de pagamento para onde a pessoa é mandada. */
export async function criarPreferencia(e: EntradaDaPreferencia): Promise<string> {
  const destino = `${e.urlBase}/conta/pedido/${e.numero}`;
  const [primeiroNome, ...sobrenome] = e.comprador.nome.trim().split(/\s+/);

  const corpo: Record<string, unknown> = {
    // Um item só, com o total do pedido. Listar peça por peça obrigaria a
    // representar o desconto do cupom, e a preferência não tem campo para
    // desconto livre — o valor cobrado sairia diferente do pedido.
    items: [
      {
        id: String(e.numero),
        title: `Pedido #${e.numero} · Florenza`,
        description: e.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ").slice(0, 250),
        quantity: 1,
        currency_id: "BRL",
        unit_price: Math.round(e.totalCentavos) / 100,
      },
    ],
    payer: {
      name: primeiroNome,
      surname: sobrenome.join(" ") || undefined,
      email: e.comprador.email ?? undefined,
      identification: e.comprador.cpf ? { type: "CPF", number: e.comprador.cpf } : undefined,
    },
    // É por aqui que o pagamento volta ao pedido. O webhook lê este campo do
    // pagamento buscado na API, nunca do corpo do aviso.
    external_reference: e.pedidoId,
    statement_descriptor: "FLORENZA",
    back_urls: { success: destino, pending: destino, failure: destino },
    // Boleto fora: ele compensa em até três dias úteis, e a reserva da peça
    // vence em 48 horas. Pagar um boleto de uma reserva já vencida é o caso
    // que mais gera estorno.
    payment_methods: { excluded_payment_types: [{ id: "ticket" }] },
    metadata: { pedido_numero: e.numero },
  };

  // O Mercado Pago só aceita retorno automático e aviso por webhook em
  // endereço HTTPS público. No localhost, a página do pedido sincroniza
  // sozinha quando a pessoa volta — ver app/conta/pedido/[numero]/page.tsx.
  if (e.urlBase.startsWith("https://")) {
    corpo.auto_return = "approved";
    corpo.notification_url = `${e.urlBase}/api/mercadopago/webhook`;
  }

  // A cobrança vence junto com a reserva: não dá para pagar peça que já voltou
  // para a vitrine.
  if (e.expiraEm) {
    corpo.expires = true;
    corpo.expiration_date_to = dataParaMercadoPago(e.expiraEm);
    corpo.date_of_expiration = dataParaMercadoPago(e.expiraEm);
  }

  const resposta = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok || !dados) {
    throw new Error(
      `Mercado Pago recusou a preferência (${resposta.status}): ${JSON.stringify(dados)?.slice(0, 300)}`
    );
  }

  const url: string | undefined = mercadoPagoEmTeste()
    ? dados.sandbox_init_point ?? dados.init_point
    : dados.init_point;
  if (!url) throw new Error("Mercado Pago não devolveu o link de pagamento.");
  return url;
}

export type PagamentoDoMercadoPago = {
  id: string;
  status: string;
  statusDetalhe: string | null;
  /** O `external_reference` — o id do pedido que criou a cobrança. */
  pedidoId: string | null;
  valorCentavos: number;
  metodo: string | null;
  parcelas: number | null;
  aprovadoEm: string | null;
};

/** A verdade sobre um pagamento é o que a API diz, com o token da loja. */
export async function buscarPagamento(id: string): Promise<PagamentoDoMercadoPago> {
  // O id vai para dentro da URL. Id do Mercado Pago é numérico; qualquer outra
  // coisa é tentativa de mexer no caminho da requisição.
  if (!/^\d{1,20}$/.test(id)) throw new Error(`Id de pagamento inválido: ${id}`);

  const resposta = await fetch(`${API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!resposta.ok) throw new Error(`Mercado Pago não achou o pagamento ${id} (${resposta.status}).`);

  const p = await resposta.json();
  return {
    id: String(p.id),
    status: String(p.status),
    statusDetalhe: p.status_detail ?? null,
    pedidoId: typeof p.external_reference === "string" ? p.external_reference : null,
    // `transaction_amount` é o valor da compra, sem os juros de parcelamento
    // que o comprador assume. É ele que se compara com o total do pedido.
    valorCentavos: Math.round(Number(p.transaction_amount ?? 0) * 100),
    metodo: p.payment_method_id ?? p.payment_type_id ?? null,
    parcelas: typeof p.installments === "number" ? p.installments : null,
    aprovadoEm: p.date_approved ?? null,
  };
}

/**
 * Confere a assinatura `x-signature` do aviso.
 *
 * É defesa a mais, não a principal: mesmo um aviso forjado só faz o servidor ir
 * à API buscar um pagamento, e um pagamento aprovado não se forja. A
 * assinatura existe para ninguém usar o webhook como gatilho de consultas.
 *
 * Sem `MP_WEBHOOK_SECRET` configurado a resposta é "sem-segredo", e o aviso
 * segue — a conferência na API continua valendo.
 */
export function assinaturaDoWebhook(
  cabecalhos: Headers,
  dataId: string
): "valida" | "invalida" | "sem-segredo" {
  const segredo = process.env.MP_WEBHOOK_SECRET;
  if (!segredo) return "sem-segredo";

  const partes = new Map(
    (cabecalhos.get("x-signature") ?? "").split(",").map((parte) => {
      const [chave, ...valor] = parte.split("=");
      return [chave.trim(), valor.join("=").trim()] as const;
    })
  );
  const ts = partes.get("ts");
  const v1 = partes.get("v1");
  if (!ts || !v1) return "invalida";

  // Manifesto do jeito que a documentação do Mercado Pago define; partes sem
  // valor saem do texto, e id alfanumérico entra em minúsculas.
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const requestId = cabecalhos.get("x-request-id");
  const manifesto =
    (id ? `id:${id};` : "") + (requestId ? `request-id:${requestId};` : "") + `ts:${ts};`;

  const esperado = Buffer.from(createHmac("sha256", segredo).update(manifesto).digest("hex"));
  const recebido = Buffer.from(v1);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
    ? "valida"
    : "invalida";
}
