import { createHash, timingSafeEqual, verify } from "node:crypto";
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

export type ResultadoDoEstorno =
  | { resultado: "ok"; http: number }
  | { resultado: "recusado"; http: number; mensagem: string }
  /** Sem resposta conclusiva: pode ter sido feito. A reconciliação decide; nada de reenviar. */
  | { resultado: "incerto"; http: number | null; mensagem: string };

/**
 * reference/cancelar-pagamento e page/passo-a-passo-devolvendo-uma-cobrança-paga:
 * POST /charges/{id}/cancel com `amount.value` em centavos, total ou parcial.
 * Sucesso documentado: 201.
 */
export async function cancelarCobranca(cobrancaId: string, valorCentavos: number): Promise<ResultadoDoEstorno> {
  if (!/^CHAR_[0-9A-Za-z_-]{1,64}$/.test(cobrancaId)) throw new Error(`Id de cobrança inválido: ${cobrancaId}`);

  try {
    const { status, dados } = await chamar("POST", `/charges/${cobrancaId}/cancel`, {
      amount: { value: Math.round(valorCentavos) },
    });
    if (status >= 200 && status < 300) return { resultado: "ok", http: status };
    const mensagem = JSON.stringify(dados)?.slice(0, 300) ?? "";
    return status >= 500 ? { resultado: "incerto", http: status, mensagem } : { resultado: "recusado", http: status, mensagem };
  } catch (erro) {
    return { resultado: "incerto", http: null, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}

/** reference/consultar-pedido-parametros: GET /orders?charge_id=. */
export async function orderDaCobranca(cobrancaId: string): Promise<string | null> {
  if (!/^CHAR_[0-9A-Za-z_-]{1,64}$/.test(cobrancaId)) throw new Error(`Id de cobrança inválido: ${cobrancaId}`);
  const { status, dados } = await chamar("GET", `/orders?charge_id=${cobrancaId}`);
  if (status !== 200) throw new Error(`PagBank não achou a order da cobrança ${cobrancaId} (${status}).`);
  const id = dados?.orders?.[0]?.id;
  return typeof id === "string" ? id : null;
}

export type ContestacaoDoPagBank = {
  id: string;
  /** reference/objeto-chargeback: AWAITING_EVIDENCE, REVIEW_WITH_PAGBANK, SUBMITTED_ISSUER, APPROVED, DENIED, EXPIRED, CLOSED, WON, LOST. */
  status: string;
  valorCentavos: number;
  prazo: string | null;
  classificacao: string | null;
  codigoMotivo: string | null;
  /** reference/objeto-chargeback: `transaction.reference_id`. O exemplo da consulta traz nulo. */
  pedidoId: string | null;
  cliente: string | null;
};

/** reference/consultar-chargeback: GET /chargebacks/{id}. */
export async function consultarChargeback(id: string): Promise<ContestacaoDoPagBank> {
  if (!/^CBKS_[0-9A-Za-z_-]{1,64}$/.test(id)) throw new Error(`Id de contestação inválido: ${id}`);

  const { status, dados: c } = await chamar("GET", `/chargebacks/${id}`);
  if (status !== 200 || !c) throw new Error(`PagBank não achou a contestação ${id} (${status}).`);

  const referencia = c.transaction?.reference_id;
  return {
    id: String(c.id),
    status: String(c.status),
    valorCentavos: Number(c.amount?.value ?? 0),
    prazo: c.due_date ?? null,
    classificacao: c.classification ?? null,
    codigoMotivo: c.reason_code ?? null,
    pedidoId: typeof referencia === "string" && UUID.test(referencia) ? referencia : null,
    cliente: c.transaction?.customer_email ?? null,
  };
}

export type NotificacaoLegada = { status: string | null; referencia: string | null; codigo: string | null; valorCentavos: number };

/**
 * reference/webhooks: GET {API antiga}/v3/transactions/notifications/{code}?email=&token=,
 * com resposta em XML. O token vai na URL (é o que a documentação pede), então esta
 * chamada nunca entra em log com a URL completa.
 *
 * SUPOSIÇÃO – validar no sandbox: `<reference>` traz o nosso `reference_id`.
 * `null` se a API antiga não estiver configurada (PAGBANK_LEGACY_API_URL, PAGBANK_EMAIL).
 */
export async function consultarNotificacaoLegada(codigo: string): Promise<NotificacaoLegada | null> {
  const base = process.env.PAGBANK_LEGACY_API_URL;
  const email = process.env.PAGBANK_EMAIL;
  if (!base || !email || !/^[A-Za-z0-9-]{1,36}$/.test(codigo)) return null;

  const busca = new URLSearchParams({ email, token: token() });
  const resposta = await fetch(`${base.replace(/\/$/, "")}/v3/transactions/notifications/${codigo}?${busca}`, {
    headers: { "Content-Type": "application/xml" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!resposta.ok) throw new Error(`PagBank não achou a notificação ${codigo} (${resposta.status}).`);

  const xml = await resposta.text();
  const campo = (nome: string) => xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1]?.trim() ?? null;
  return {
    status: campo("status"),
    referencia: campo("reference"),
    codigo: campo("code"),
    valorCentavos: Math.round(Number(campo("grossAmount") ?? 0) * 100),
  };
}

/* ---- Autenticidade dos avisos ---- */

let chavePublica: string | null = null;

/**
 * reference/validacao-de-autenticidade: GET /public-keys?type=webhook. O campo
 * `public_key` vem em Base64, no formato X.509. `renovar` pega a nova depois de uma
 * rotação de chave.
 */
async function chavePublicaDoWebhook(renovar = false): Promise<string | null> {
  if (chavePublica && !renovar) return chavePublica;
  const { status, dados } = await chamar("GET", "/public-keys?type=webhook");
  if (status !== 200 || typeof dados?.public_key !== "string") return null;
  const linhas = dados.public_key.match(/.{1,64}/g)?.join("\n");
  chavePublica = `-----BEGIN PUBLIC KEY-----\n${linhas}\n-----END PUBLIC KEY-----\n`;
  return chavePublica;
}

function algumaAssinaturaValida(assinaturas: string[], corpoCru: string, chave: string): boolean {
  return assinaturas.some((assinatura) => {
    try {
      return verify("sha256", Buffer.from(corpoCru, "utf8"), chave, Buffer.from(assinatura, "base64"));
    } catch {
      return false;
    }
  });
}

export type AutenticidadeDoAviso = "ecdsa" | "token" | "invalida" | "ausente";

/**
 * Confere o aviso pelas duas formas documentadas:
 *
 *   - `x-payload-signature` (reference/validacao-de-autenticidade): ECDSA com
 *     SHA-256 sobre os bytes do corpo, em Base64; pode vir mais de uma, separadas
 *     por vírgula, e basta uma válida. É como vêm os eventos de preferência.
 *   - `x-authenticity-token` (docs/confirmar-autenticidade-da-notificacao): SHA-256
 *     de `{token}-{corpo cru}`.
 *
 * Mesmo um aviso forjado só faz o servidor ir à API, e um pagamento aprovado não se
 * forja. A assinatura existe para ninguém usar o webhook como gatilho de consultas.
 */
export async function assinaturaDoWebhook(cabecalhos: Headers, corpoCru: string): Promise<AutenticidadeDoAviso> {
  const assinada = cabecalhos.get("x-payload-signature");
  if (assinada) {
    const assinaturas = assinada.split(",").map((a) => a.trim()).filter(Boolean);
    const chave = await chavePublicaDoWebhook().catch(() => null);
    if (chave && algumaAssinaturaValida(assinaturas, corpoCru, chave)) return "ecdsa";
    // Pode ser rotação de chave: a página manda consultar de novo.
    const nova = await chavePublicaDoWebhook(true).catch(() => null);
    return nova && algumaAssinaturaValida(assinaturas, corpoCru, nova) ? "ecdsa" : "invalida";
  }

  const assinatura = cabecalhos.get("x-authenticity-token");
  if (!assinatura) return "ausente";

  const esperado = Buffer.from(createHash("sha256").update(`${token()}-${corpoCru}`).digest("hex"));
  const recebido = Buffer.from(assinatura.trim().toLowerCase());
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido) ? "token" : "invalida";
}
