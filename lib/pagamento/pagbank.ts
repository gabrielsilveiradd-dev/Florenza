import { createHash, timingSafeEqual } from "node:crypto";
import { pagBankEmTeste } from "@/lib/pagamento/config";

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
 */

const API = () => (pagBankEmTeste() ? "https://sandbox.api.pagseguro.com" : "https://api.pagseguro.com");

function token(): string {
  const valor = process.env.PAGBANK_TOKEN;
  if (!valor) throw new Error("PAGBANK_TOKEN não está configurado.");
  return valor;
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
  urlBase: string;
};

/** Devolve o link de pagamento para onde a pessoa é mandada. */
export async function criarCheckout(e: EntradaDoCheckout): Promise<string> {
  const destino = `${e.urlBase}/conta/pedido/${e.numero}`;
  const nome = e.comprador.nome.trim();

  const corpo: Record<string, unknown> = {
    // É por aqui que o pagamento volta ao pedido. O webhook lê este campo do
    // pedido buscado na API, nunca do corpo do aviso.
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
    // aqui também, como segunda forma de achar o pedido — ver `pedidoDaOrder`.
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
    redirect_url: destino,
    return_url: destino,
  };

  // Aviso por webhook só em endereço HTTPS público. No localhost não há aviso, e
  // o pedido fica aguardando pagamento.
  if (e.urlBase.startsWith("https://")) {
    corpo.payment_notification_urls = [`${e.urlBase}/api/pagbank/webhook`];
  }

  // A cobrança vence junto com a reserva: não dá para pagar peça que já voltou
  // para a vitrine. Sem esta data, o PagBank vence o checkout em 2 horas.
  if (e.expiraEm) corpo.expiration_date = dataParaPagBank(e.expiraEm);

  const resposta = await fetch(`${API()}/checkouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const dados = await resposta.json().catch(() => null);

  if (!resposta.ok || !dados) {
    throw new Error(`PagBank recusou o checkout (${resposta.status}): ${JSON.stringify(dados)?.slice(0, 300)}`);
  }

  const links: Array<{ rel?: string; href?: string }> = Array.isArray(dados.links) ? dados.links : [];
  const url = links.find((l) => l.rel === "PAY")?.href;
  if (!url) throw new Error("PagBank não devolveu o link de pagamento.");
  return url;
}

export type CobrancaDoPagBank = {
  id: string;
  status: string;
  statusDetalhe: string | null;
  valorCentavos: number;
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
 * O PagBank não tem status de "estornado": a cobrança paga continua com o status
 * dela, e o estorno aparece em `amount.summary.refunded`. `registrar_pagamento()`
 * precisa saber do estorno, então aqui ele vira um status — o único que não vem
 * cru da API.
 */
function statusDaCobranca(c: { status?: unknown; amount?: { summary?: { refunded?: unknown } } }): string {
  return Number(c.amount?.summary?.refunded ?? 0) > 0 ? "REFUNDED" : String(c.status);
}

/** A verdade sobre um pagamento é o que a API diz, com o token da loja. */
export async function buscarOrder(id: string): Promise<OrderDoPagBank> {
  // O id vai para dentro da URL; qualquer outra coisa é tentativa de mexer no
  // caminho da requisição.
  if (!/^ORDE_[0-9A-Za-z_-]{1,64}$/.test(id)) throw new Error(`Id de pedido do PagBank inválido: ${id}`);

  const resposta = await fetch(`${API()}/orders/${id}`, {
    headers: { Authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!resposta.ok) throw new Error(`PagBank não achou o pedido ${id} (${resposta.status}).`);

  const o = await resposta.json();
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
    cobrancas: cobrancas.map((c) => ({
      id: String(c.id),
      status: statusDaCobranca(c),
      statusDetalhe: c.payment_response?.message ?? null,
      // `paid` é o que entrou de fato; antes de pagar, ele é zero e vale o valor
      // cobrado. É esse número que o banco compara com o total do pedido.
      valorCentavos: Number(c.amount?.summary?.paid || c.amount?.value || 0),
      metodo: c.payment_method?.type ?? null,
      parcelas: c.payment_method?.installments ? Number(c.payment_method.installments) : null,
      pagoEm: c.paid_at ?? null,
    })),
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
