import type { PGlite } from "@electric-sql/pglite";
import { SEGREDO } from "./banco-de-teste";

/**
 * O PAGBANK E O BANCO DOS TESTES.
 *
 * Os módulos de produção rodam de verdade, com as dependências reais: só o `fetch` e
 * o `rpcComSegredo` são trocados. O `fetch` cai neste PagBank simulado, com as formas
 * de resposta da documentação, e o RPC cai nas funções reais, num Postgres em memória.
 */

export const API = "https://sandbox.api.pagseguro.com";
export const LEGADO = "https://ws.sandbox.pagseguro.uol.com.br";
export const TOKEN = "token-de-teste";

export function prepararAmbiente(): void {
  process.env.PAGBANK_ENABLED = "true";
  process.env.PAGBANK_ENV = "sandbox";
  process.env.PAGBANK_TOKEN = TOKEN;
  process.env.PAGBANK_API_URL = API;
  process.env.PAGBANK_URL_SECRET = "segredo-das-urls-com-mais-de-32-caracteres";
  process.env.PAGBANK_WEBHOOK_URL = "https://loja.exemplo/api/pagbank/webhook";
  process.env.PAGBANK_LEGACY_API_URL = LEGADO;
  process.env.PAGBANK_EMAIL = "loja@exemplo.com";
  process.env.PAGAMENTO_SEGREDO_BANCO = SEGREDO;
  process.env.NEXT_PUBLIC_SITE_URL = "https://loja.exemplo";
}

/* ---- O banco ---- */

let db: PGlite;

export function usarBanco(banco: PGlite): void {
  db = banco;
}

/** Como o PostgREST: linhas para TABLE, o valor para escalar. */
export async function rpcNoBanco<T>(funcao: string, argumentos: Record<string, unknown>): Promise<T> {
  const todos: Record<string, unknown> = { p_segredo: process.env.PAGAMENTO_SEGREDO_BANCO, ...argumentos };
  const nomes = Object.keys(todos);
  const lista = nomes.map((n, i) => `${n} => $${i + 1}`).join(", ");
  try {
    const r = await db.query<Record<string, unknown>>(
      `select * from public.${funcao}(${lista})`,
      nomes.map((n) => todos[n] ?? null)
    );
    const colunas = r.fields.map((f) => f.name);
    if (colunas.length === 1 && colunas[0] === funcao) return (r.rows[0]?.[funcao] ?? null) as T;
    return r.rows as T;
  } catch (erro) {
    const falha = new Error(`${funcao}: ${(erro as Error).message}`) as Error & { codigo?: string };
    falha.codigo = (erro as { code?: string }).code;
    throw falha;
  }
}

/* ---- O PagBank ---- */

type Cobranca = {
  id: string;
  status: string;
  amount: { value: number; summary: { total: number; paid: number; refunded: number } };
  payment_method: { type: string; installments?: number };
  paid_at?: string;
};
type Order = { id: string; reference_id: string | null; charges: Cobranca[] };
type Checkout = { id: string; status: string; orders?: Array<{ id: string }> };

export type Chamada = { metodo: string; caminho: string; corpo: unknown };

export class PagBankSimulado {
  orders = new Map<string, Order>();
  checkouts = new Map<string, Checkout>();
  chargebacks = new Map<string, Record<string, unknown>>();
  notificacoes = new Map<string, string>();
  chamadas: Chamada[] = [];
  /** Caminhos que respondem este HTTP, ou `"rede"` para falha de conexão. */
  falhas = new Map<string, number | "rede">();
  proximoCheckout = 1;

  limpar(): void {
    this.orders.clear();
    this.checkouts.clear();
    this.chargebacks.clear();
    this.notificacoes.clear();
    this.falhas.clear();
    this.chamadas = [];
  }

  checkout(id: string, status: string, orders: string[] | "sem campo" = []): void {
    this.checkouts.set(id, {
      id,
      status,
      ...(orders === "sem campo" ? {} : { orders: orders.map((o) => ({ id: o })) }),
    });
  }

  order(id: string, referencia: string | null, cobrancas: Cobranca[]): void {
    this.orders.set(id, { id, reference_id: referencia, charges: cobrancas });
  }

  chamou(metodo: string, trecho: string): number {
    return this.chamadas.filter((c) => c.metodo === metodo && c.caminho.includes(trecho)).length;
  }

  fetch = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(entrada);
    const legado = url.startsWith(LEGADO);
    const caminho = url.replace(legado ? LEGADO : API, "");
    const metodo = init?.method ?? "GET";
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    this.chamadas.push({ metodo, caminho, corpo });

    for (const [trecho, falha] of this.falhas) {
      if (!caminho.includes(trecho)) continue;
      if (falha === "rede") throw new Error("fetch failed");
      return json(falha, { error_messages: [{ code: String(falha) }] });
    }

    if (legado) {
      const codigo = caminho.split("/").pop()?.split("?")[0] ?? "";
      const xml = this.notificacoes.get(codigo);
      return xml ? new Response(xml, { status: 200 }) : json(404, null);
    }

    if (metodo === "GET" && caminho.startsWith("/checkouts/")) {
      const c = this.checkouts.get(caminho.split("/")[2]);
      return c ? json(200, c) : json(404, {});
    }
    if (metodo === "POST" && caminho === "/checkouts") {
      const id = `CHEC_SIM${this.proximoCheckout++}`;
      this.checkouts.set(id, { id, status: "ACTIVE", orders: [] });
      return json(201, { id, status: "ACTIVE", links: [{ rel: "PAY", href: `https://pagar.exemplo/${id}` }] });
    }
    if (metodo === "POST" && caminho.endsWith("/inactivate")) {
      const c = this.checkouts.get(caminho.split("/")[2]);
      if (c) c.status = "INACTIVE";
      return new Response(null, { status: 204 });
    }
    if (metodo === "GET" && caminho.startsWith("/orders?charge_id=")) {
      const cobranca = caminho.split("=")[1];
      const achadas = [...this.orders.values()].filter((o) => o.charges.some((c) => c.id === cobranca));
      return json(200, { orders: achadas.map((o) => ({ id: o.id })) });
    }
    if (metodo === "GET" && caminho.startsWith("/orders/")) {
      const o = this.orders.get(caminho.split("/")[2]);
      return o ? json(200, o) : json(404, {});
    }
    if (metodo === "POST" && caminho.startsWith("/charges/")) {
      const id = caminho.split("/")[2];
      const valor = (corpo as { amount: { value: number } }).amount.value;
      for (const o of this.orders.values()) {
        const c = o.charges.find((x) => x.id === id);
        if (!c) continue;
        c.amount.summary.refunded += valor;
        if (c.amount.summary.refunded >= c.amount.summary.paid) c.status = "CANCELED";
        return json(201, c);
      }
      return json(404, {});
    }
    if (metodo === "GET" && caminho.startsWith("/chargebacks/")) {
      const c = this.chargebacks.get(caminho.split("/")[2]);
      return c ? json(200, c) : json(404, {});
    }
    return json(404, {});
  };
}

function json(status: number, dados: unknown): Response {
  return new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json" } });
}

export function cobranca(
  id: string,
  status: string,
  e: { valor?: number; pago?: number; estornado?: number } = {}
): Cobranca {
  const valor = e.valor ?? 100_000;
  const pago = e.pago ?? (status === "PAID" ? valor : 0);
  return {
    id,
    status,
    amount: { value: valor, summary: { total: valor, paid: pago, refunded: e.estornado ?? 0 } },
    payment_method: { type: "PIX" },
    ...(pago > 0 ? { paid_at: "2026-10-31T12:00:00-03:00" } : {}),
  };
}

/* ---- Os pedidos ---- */

let sequencia = 0;

export type PedidoDeTeste = { id: string; numero: number; sku: string; checkoutId: string };

/** Um pedido real no banco, já descontado do estoque, com um checkout vinculado. */
export async function criarPedido(
  banco: PGlite,
  e: { total?: number; expiraEm?: Date; estoque?: number } = {}
): Promise<PedidoDeTeste> {
  sequencia++;
  const sku = `TESTE-${sequencia}`;
  const total = e.total ?? 100_000;
  const expiraEm = e.expiraEm ?? new Date(Date.now() + 48 * 3600_000);

  await banco.query("insert into public.categorias (slug, nome) values ('testes', 'Testes') on conflict do nothing");
  const produto = await banco.query<{ id: string }>(
    `insert into public.produtos (sku, slug, categoria_slug, nome, preco_centavos, estoque)
     values ($1, $2, 'testes', 'Anel de teste', $3, $4) returning id`,
    [sku, sku.toLowerCase(), total, e.estoque ?? 5]
  );
  const pedido = await banco.query<{ id: string; numero: number }>(
    `insert into public.pedidos (nome, email, total_centavos, status, expira_em)
     values ('Cliente de Teste', 'cliente@exemplo.com', $1, 'aguardando_pagamento', $2) returning id, numero`,
    [total, expiraEm.toISOString()]
  );
  const { id, numero } = pedido.rows[0];
  await banco.query(
    `insert into public.pedido_itens (pedido_id, produto_id, sku, nome, preco_centavos, quantidade)
     values ($1, $2, $3, 'Anel de teste', $4, 1)`,
    [id, produto.rows[0].id, sku, total]
  );

  const checkoutId = `CHEC_${sku.replace("-", "")}`;
  await rpcNoBanco("pagbank_vincular_checkout", {
    p_pedido_id: id,
    p_checkout_id: checkoutId,
    p_pay_url: `https://pagar.exemplo/${checkoutId}`,
    p_expira_em: expiraEm.toISOString(),
  });
  return { id, numero: Number(numero), sku, checkoutId };
}

export async function situacao(banco: PGlite, pedidoId: string) {
  const r = await banco.query<{
    status: string;
    pagamento_estado: string | null;
    estornado_centavos: number;
    estoque_no_estorno: string | null;
  }>("select status, pagamento_estado, estornado_centavos, estoque_no_estorno from public.pedidos where id = $1", [pedidoId]);
  return r.rows[0];
}

export async function estoque(banco: PGlite, sku: string): Promise<number> {
  const r = await banco.query<{ estoque: number }>("select estoque from public.produtos where sku = $1", [sku]);
  return r.rows[0].estoque;
}

export async function alertas(banco: PGlite, pedidoId: string): Promise<string[]> {
  const r = await banco.query<{ alerta: string }>(
    "select alerta from public.payment_events where pedido_id = $1 and alerta is not null",
    [pedidoId]
  );
  return r.rows.map((l) => l.alerta);
}
