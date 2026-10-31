import { createHash, timingSafeEqual } from "node:crypto";
import { pagBankApiUrl } from "@/lib/pagamento/config";

/**
 * CONVERSA COM O PAGBANK — só servidor.
 *
 * Checkout PagBank: o site cria um checkout com o valor do pedido e manda a
 * pessoa para a página de pagamento do PagBank. Cartão nunca passa por este site
 * nem por este banco, que é exatamente o que se quer numa joalheria.
 *
 * O VALOR SAI DO BANCO. Quem chama `criarCheckout` passa o total que
 * `criar_pedido()` calculou — nunca um número vindo do navegador.
 *
 * A API fala em centavos inteiros, como o resto do projeto: nada de conversão.
 *
 * Cada campo cita a página que o sustenta, em developer.pagbank.com.br. O que a
 * documentação não garante está marcado com "SUPOSIÇÃO – validar no sandbox".
 */

function token(): string {
  const valor = process.env.PAGBANK_TOKEN;
  if (!valor) throw new Error("PAGBANK_TOKEN não está configurado.");
  return valor;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RespostaDaApi = { status: number; dados: any };

/** Toda chamada ao PagBank passa por aqui. */
async function chamar(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<RespostaDaApi> {
  const resposta = await fetch(`${pagBankApiUrl()}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

/**
 * A API pede data com fuso explícito. O Brasil não tem mais horário de verão
 * desde 2019, então -03:00 é fixo para o horário de Brasília.
 */
function dataParaPagBank(iso: string): string {
  const brasilia = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return brasilia.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

/** O PagBank só aceita celular: DDD + 9 dígitos começando em 9. Fora disso, sem telefone. */
function celularParaPagBank(telefone: string | null) {
  const digitos = (telefone ?? "").replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "");
  if (!/^\d{2}9\d{8}$/.test(digitos)) return undefined;
  return { country: "+55", area: digitos.slice(0, 2), number: digitos.slice(2) };
}

export type EntradaDoCheckout = {
  pedidoId: string;
  numero: number;
  totalCentavos: number;
  expiraEm: string | null;
  itens: Array<{ nome: string; quantidade: number }>;
  comprador: { nome: string; email: string | null; cpf: string | null; telefone: string | null };
  urlRetorno: string;
  /** `null` no localhost: o PagBank só avisa endereço público. */
  urlNotificacao: string | null;
};

/** reference/criar-checkout: POST /checkouts. Guarde o `checkoutId`: é ele que vincula o pedido. */
export async function criarCheckout(e: EntradaDoCheckout): Promise<{ checkoutId: string; payUrl: string }> {
  const nome = e.comprador.nome.trim();

  const corpo: Record<string, unknown> = {
    // Redundância: o vínculo principal é o id devolvido na resposta.
    reference_id: e.pedidoId,
    // A pessoa ainda pode corrigir os dados na página do PagBank: com `false`, um
    // telefone fora do formato deles impediria o pagamento inteiro.
    customer_modifiable: true,
    customer: {
      // O PagBank exige nome e sobrenome; com um nome só, a pessoa preenche lá.
      name: /\s/.test(nome) ? nome : undefined,
      email: e.comprador.email ?? undefined,
      tax_id: e.comprador.cpf ?? undefined,
      phone: celularParaPagBank(e.comprador.telefone),
    },
    // Um item só, com o total do pedido: frete e desconto já estão dentro dele,
    // e o valor cobrado não tem como sair diferente do pedido. O id do pedido vai
    // aqui também, como segunda redundância — ver `pedidoDaOrder`.
    items: [
      {
        reference_id: e.pedidoId,
        name: `Pedido #${e.numero} · Florenza`,
        description: e.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ").slice(0, 255),
        quantity: 1,
        unit_amount: Math.round(e.totalCentavos),
      },
    ],
    // Boleto fora: ele compensa em até três dias úteis, e a reserva da peça
    // vence em 48 horas. Pagar um boleto de uma reserva já vencida é o caso que
    // mais gera estorno.
    payment_methods: [{ type: "PIX" }, { type: "CREDIT_CARD" }],
    soft_descriptor: "FLORENZA",
    redirect_url: e.urlRetorno,
    return_url: e.urlRetorno,
  };

  if (e.urlNotificacao) corpo.payment_notification_urls = [e.urlNotificacao];

  // A cobrança vence junto com a reserva: não dá para pagar peça que já voltou
  // para a vitrine. Sem esta data, o PagBank vence o checkout em 2 horas.
  if (e.expiraEm) corpo.expiration_date = dataParaPagBank(e.expiraEm);

  const { status, dados } = await chamar("POST", "/checkouts", corpo);
  if (status < 200 || status >= 300 || !dados) {
    throw new Error(`PagBank recusou o checkout (${status}): ${JSON.stringify(dados)?.slice(0, 300)}`);
  }

  const links: Array<{ rel?: string; href?: string }> = Array.isArray(dados.links) ? dados.links : [];
  const payUrl = links.find((l) => l.rel === "PAY")?.href;
  if (!payUrl || typeof dados.id !== "string") {
    throw new Error("PagBank não devolveu o id do checkout ou o link de pagamento.");
  }
  return { checkoutId: dados.id, payUrl };
}

/** reference/inativar-checkout: POST /checkouts/{id}/inactivate, sem corpo. */
export async function inativarCheckout(checkoutId: string): Promise<void> {
  if (!/^CHEC_[0-9A-Za-z_-]{1,64}$/.test(checkoutId)) throw new Error(`Id de checkout inválido: ${checkoutId}`);
  const { status } = await chamar("POST", `/checkouts/${checkoutId}/inactivate`);
  if (status < 200 || status >= 300) throw new Error(`PagBank não inativou ${checkoutId} (${status}).`);
}

export type CobrancaDoPagBank = {
  id: string;
  status: string;
  statusDetalhe: string | null;
  valorCentavos: number;
  /** reference/objeto-order: `amount.summary.paid`. */
  pagoCentavos: number;
  /** reference/objeto-order: `amount.summary.refunded`. */
  estornadoCentavos: number;
  metodo: string | null;
  parcelas: number | null;
  pagoEm: string | null;
};

export type OrderDoPagBank = {
  id: string;
  /** O id do pedido que criou o checkout. */
  pedidoId: string | null;
  cobrancas: CobrancaDoPagBank[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Qual pedido do site gerou esta order. Pagamento de outra origem na mesma conta
 * (link avulso, maquininha) não traz o id de um pedido em nenhum dos dois campos.
 */
function pedidoDaOrder(o: { reference_id?: unknown; items?: Array<{ reference_id?: unknown }> }): string | null {
  const candidatos = [o.reference_id, o.items?.[0]?.reference_id];
  const achado = candidatos.find((c) => typeof c === "string" && UUID.test(c));
  return typeof achado === "string" ? achado : null;
}

/**
 * O PagBank não tem status de "estornado": no estorno total a cobrança vira
 * CANCELED, no parcial continua PAID, e só `amount.summary.refunded` conta a
 * história (page/passo-a-passo-devolvendo-uma-cobrança-paga). Aqui isso vira um
 * status, os únicos dois que não vêm crus da API.
 */
function statusDaCobranca(status: unknown, pago: number, estornado: number): string {
  if (estornado <= 0) return String(status);
  return pago > 0 && estornado < pago ? "PARTIALLY_REFUNDED" : "REFUNDED";
}

export type ChecagemDoCheckout = {
  /** reference/objeto-checkout: ACTIVE, INACTIVE ou EXPIRED. */
  status: string | null;
  orderIds: string[];
  /** A resposta trouxe o campo `orders`? Sem ele, não dá para afirmar que não há pagamento. */
  conheceOrders: boolean;
};

/**
 * reference/consultar-checkout: GET /checkouts/{id}. A página diz que a resposta
 * inclui os pagamentos do checkout, mas o exemplo não mostra o campo.
 *
 * SUPOSIÇÃO – validar no sandbox: `orders` é uma lista de objetos com `id` (ORDE_...).
 * Se o campo não vier, `conheceOrders` fica `false`, e o pedido não expira por aqui.
 */
export async function consultarCheckout(checkoutId: string): Promise<ChecagemDoCheckout> {
  if (!/^CHEC_[0-9A-Za-z_-]{1,64}$/.test(checkoutId)) throw new Error(`Id de checkout inválido: ${checkoutId}`);

  const { status, dados } = await chamar("GET", `/checkouts/${checkoutId}`);
  if (status !== 200 || !dados) throw new Error(`PagBank não achou o checkout ${checkoutId} (${status}).`);

  const orders: unknown = dados.orders;
  const conheceOrders = Array.isArray(orders);
  return {
    status: typeof dados.status === "string" ? dados.status : null,
    conheceOrders,
    orderIds: conheceOrders
      ? (orders as Array<{ id?: unknown }>)
          .map((o) => o?.id)
          .filter((id): id is string => typeof id === "string" && id.startsWith("ORDE_"))
      : [],
  };
}

/** A verdade sobre um pagamento é o que a API diz, com o token da loja. */
export async function buscarOrder(id: string): Promise<OrderDoPagBank> {
  // O id vai para dentro da URL; qualquer outra coisa é tentativa de mexer no
  // caminho da requisição.
  if (!/^ORDE_[0-9A-Za-z_-]{1,64}$/.test(id)) throw new Error(`Id de pedido do PagBank inválido: ${id}`);

  const { status, dados: o } = await chamar("GET", `/orders/${id}`);
  if (status !== 200 || !o) throw new Error(`PagBank não achou o pedido ${id} (${status}).`);

  type Cobranca = {
    id: unknown;
    status?: unknown;
    amount?: { value?: unknown; summary?: { paid?: unknown; refunded?: unknown } };
    payment_response?: { message?: string };
    payment_method?: { type?: string; installments?: unknown };
    paid_at?: string;
  };
  const cobrancas: Cobranca[] = Array.isArray(o.charges) ? o.charges : [];

  return {
    id: String(o.id),
    pedidoId: pedidoDaOrder(o),
    cobrancas: cobrancas.map((c) => {
      const pago = Number(c.amount?.summary?.paid ?? 0);
      const estornado = Number(c.amount?.summary?.refunded ?? 0);
      return {
        id: String(c.id),
        status: statusDaCobranca(c.status, pago, estornado),
        statusDetalhe: c.payment_response?.message ?? null,
        // É esse número que o banco compara com o total do pedido.
        valorCentavos: pago || Number(c.amount?.value ?? 0),
        pagoCentavos: pago,
        estornadoCentavos: estornado,
        metodo: c.payment_method?.type ?? null,
        parcelas: c.payment_method?.installments ? Number(c.payment_method.installments) : null,
        pagoEm: c.paid_at ?? null,
      };
    }),
  };
}

/**
 * Confere o `x-authenticity-token`: SHA-256 de `{token}-{corpo cru}`.
 *
 * É defesa a mais, não a principal: mesmo um aviso forjado só faz o servidor ir
 * à API buscar um pedido, e um pagamento aprovado não se forja. A assinatura
 * existe para ninguém usar o webhook como gatilho de consultas.
 *
 * Sem o cabeçalho a resposta é "ausente", e o aviso segue — a conferência na API
 * continua valendo, e recusar perderia um pagamento real se o PagBank trocar o
 * jeito de assinar (a documentação já descreve um segundo, `x-payload-signature`).
 */
export function assinaturaDoWebhook(cabecalhos: Headers, corpoCru: string): "valida" | "invalida" | "ausente" {
  const assinatura = cabecalhos.get("x-authenticity-token");
  if (!assinatura) return "ausente";

  const esperado = Buffer.from(createHash("sha256").update(`${token()}-${corpoCru}`).digest("hex"));
  const recebido = Buffer.from(assinatura.trim().toLowerCase());
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? "valida" : "invalida";
}
