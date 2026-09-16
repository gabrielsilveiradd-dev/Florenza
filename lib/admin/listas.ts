/* As listas das abas Pedidos, Clientes, Catálogo e Cupons.
 *
 * Mesmo contrato de dashboard-data.ts: com Supabase plugado consulta o banco,
 * sem ele devolve os dados de exemplo. Quem chama não sabe a diferença.
 */
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { produtos as produtosLocais, categorias as categoriasLocais } from "@/lib/data/catalogo-local";
import { CLIENTES_DEMO, CUPONS_DEMO, PEDIDOS_DEMO } from "@/lib/admin/dados-demo";

export type ItemAdmin = {
  sku: string;
  nome: string;
  preco_centavos: number;
  quantidade: number;
  aros: number | null;
  tamanho: number | null;
  tamanho_par: number | null;
};

export type PagamentoAdmin = {
  provedor_pagamento_id: string;
  status: string;
  status_detalhe: string | null;
  metodo: string | null;
  valor_centavos: number;
  parcelas: number | null;
  /** O que precisa de gente olhando: valor a menor, estorno, estoque que não voltou. */
  pendencia: string | null;
  created_at: string;
};

/**
 * O pedido inteiro, como a equipe precisa para despachar: contato, CPF,
 * endereço, forma de envio, medida de cada aro, presente, observações e
 * pagamentos. Antes o painel mostrava nome, cidade e total — o resto só pelo
 * SQL Editor.
 */
export type PedidoAdmin = {
  id: string;
  numero: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  cep: string | null;
  logradouro: string | null;
  endereco_numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  origem: string;
  status: string;
  subtotal_centavos: number;
  desconto_centavos: number;
  cupom_codigo: string | null;
  /** 0 e sem nome na venda lançada à mão e nos pedidos de antes do frete. */
  frete_nome: string | null;
  frete_centavos: number;
  frete_prazo_min_dias: number | null;
  frete_prazo_max_dias: number | null;
  total_centavos: number;
  presente: boolean;
  mensagem_presente: string | null;
  observacoes: string | null;
  codigo_rastreio: string | null;
  transportadora: string | null;
  expira_em: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  itens: ItemAdmin[];
  pagamentos: PagamentoAdmin[];
};

export type ClienteAdmin = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  origem: string;
  created_at: string;
  observacoes: string | null;
};

export type ProdutoAdmin = {
  id: string;
  sku: string;
  slug: string;
  categoria_slug: string;
  nome: string;
  preco_centavos: number;
  imagem_url: string | null;
  imagem_sm_url: string | null;
  estoque: number;
  aros: number;
  ativo: boolean;
};

export type CupomAdmin = {
  codigo: string;
  descricao: string | null;
  tipo: "percentual" | "valor";
  valor: number;
  minimo_centavos: number;
  validade_ate: string | null;
  limite_usos: number | null;
  usos: number;
  ativo: boolean;
  so_primeira_compra: boolean;
  um_por_cliente: boolean;
  created_at: string;
};

const COLUNAS_PEDIDO =
  "id, numero, nome, email, telefone, cpf, cep, logradouro, endereco_numero, complemento, bairro, " +
  "cidade, uf, origem, status, subtotal_centavos, desconto_centavos, cupom_codigo, total_centavos, " +
  "frete_nome, frete_centavos, frete_prazo_min_dias, frete_prazo_max_dias, " +
  "presente, mensagem_presente, observacoes, codigo_rastreio, transportadora, expira_em, " +
  "motivo_cancelamento, created_at, " +
  "pedido_itens(sku, nome, preco_centavos, quantidade, aros, tamanho, tamanho_par), " +
  "pagamentos(provedor_pagamento_id, status, status_detalhe, metodo, valor_centavos, parcelas, pendencia, created_at)";

export async function listarPedidosAdmin(): Promise<PedidoAdmin[]> {
  if (!supabaseConfigurado()) {
    return [...PEDIDOS_DEMO].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("pedidos")
    .select(COLUNAS_PEDIDO)
    .order("created_at", { ascending: false })
    .limit(200);

  // O cast existe porque o projeto ainda não tem os tipos gerados do banco
  // (`npx supabase gen types typescript --linked` só roda com um projeto
  // linkado). Com eles, o supabase-js infere a relação aninhada sozinho e este
  // tipo intermediário pode sair.
  type LinhaPedido = Omit<PedidoAdmin, "itens" | "pagamentos"> & {
    pedido_itens: ItemAdmin[] | null;
    pagamentos: PagamentoAdmin[] | null;
  };
  const linhas = (data ?? []) as unknown as LinhaPedido[];

  return linhas.map(({ pedido_itens, pagamentos, ...resto }) => ({
    ...resto,
    itens: pedido_itens ?? [],
    pagamentos: (pagamentos ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }));
}

export async function listarClientesAdmin(): Promise<ClienteAdmin[]> {
  if (!supabaseConfigurado()) {
    return [...CLIENTES_DEMO].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("vw_clientes")
    .select("id, nome, email, telefone, cidade, uf, origem, created_at, observacoes")
    .order("created_at", { ascending: false })
    .limit(500);

  return (data ?? []) as ClienteAdmin[];
}

export async function listarProdutosAdmin(): Promise<ProdutoAdmin[]> {
  if (!supabaseConfigurado()) {
    return produtosLocais.map((p) => ({
      id: p.sku,
      sku: p.sku,
      slug: p.slug,
      categoria_slug: p.categoriaSlug,
      nome: p.nome,
      preco_centavos: p.precoCentavos,
      imagem_url: p.imagemUrl,
      imagem_sm_url: null,
      estoque: p.estoque,
      aros: p.aros,
      ativo: p.ativo,
    }));
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("produtos")
    .select("id, sku, slug, categoria_slug, nome, preco_centavos, imagem_url, imagem_sm_url, estoque, aros, ativo")
    .order("categoria_slug")
    .order("sku");

  return (data ?? []) as ProdutoAdmin[];
}

export async function listarCategoriasAdmin() {
  if (!supabaseConfigurado()) {
    return categoriasLocais.map((c) => ({ slug: c.slug, nome: c.nome }));
  }
  const supabase = await createClient();
  const { data } = await supabase.from("categorias").select("slug, nome").order("ordem");
  return (data ?? []) as { slug: string; nome: string }[];
}

/** `cupons` não é legível pela API — só a policy de admin abre a tabela. */
export async function listarCuponsAdmin(): Promise<CupomAdmin[]> {
  if (!supabaseConfigurado()) return CUPONS_DEMO;

  const supabase = await createClient();
  const { data } = await supabase
    .from("cupons")
    .select(
      "codigo, descricao, tipo, valor, minimo_centavos, validade_ate, limite_usos, usos, ativo, " +
        "so_primeira_compra, um_por_cliente, created_at"
    )
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as CupomAdmin[];
}
