/* CAMADA DE ACESSO AO CATÁLOGO — único ponto que a vitrine enxerga.
 *
 * Herda o papel que `listarProdutos()` tinha em js/data/aneis-formatura.js: as
 * páginas de categoria não sabem de onde os produtos vêm. Com as chaves do
 * Supabase configuradas, vêm do banco; sem elas, do módulo local — e nenhuma
 * página percebe a diferença.
 *
 * SOBRE O MODO LOCAL: ele existe para o site continuar abrindo em quem clona o
 * repositório sem `.env.local`. Não é um plano B de produção — repare que a
 * queda para o catálogo local só acontece quando o Supabase NÃO está
 * configurado. Se estiver e a consulta falhar, o erro sobe. É deliberado: numa
 * joalheria, servir um preço velho em silêncio é pior que mostrar erro, porque
 * o preço do ouro muda e a peça seria vendida pelo valor errado.
 */
import { createClientePublico } from "@/lib/supabase/publico";
import { supabaseConfigurado } from "@/lib/supabase/config";
import {
  categorias as categoriasLocais,
  produtos as produtosLocais,
  type Categoria,
  type Produto,
} from "@/lib/data/catalogo-local";

export type { Categoria, Produto, OpcaoFiltro } from "@/lib/data/catalogo-local";

/** As colunas que a vitrine usa. Escrito uma vez para as três consultas. */
const COLUNAS_PRODUTO =
  "sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, " +
  "largura_mm, material, descricao, preco_centavos, imagem_url, imagem_sm_url, " +
  "alt, aros, estoque, ativo";

type LinhaProduto = {
  sku: string;
  slug: string;
  categoria_slug: string;
  nome: string;
  metal: string | null;
  pedra: string | null;
  cor_pedra: string | null;
  lapidacao: string | null;
  largura_mm: number | string | null;
  material: string | null;
  descricao: string | null;
  preco_centavos: number;
  imagem_url: string | null;
  imagem_sm_url: string | null;
  alt: string | null;
  aros: number;
  estoque: number;
  ativo: boolean;
};

type LinhaCategoria = {
  slug: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  filtro_campo: "cor_pedra" | "material" | null;
  variante: "produto" | "foto";
  rotulo_filtro: string | null;
  nota: string[] | null;
  filtro_opcoes: { slug: string; nome: string; amostra: string | null; ordem: number }[] | null;
};

/**
 * snake_case do banco -> camelCase daqui.
 *
 * `largura_mm` é numeric no Postgres, e numeric chega como string no JavaScript
 * (é assim que o driver evita perder precisão em decimal). Sem o Number() aqui,
 * "3" viraria "3mm" por concatenação em umas telas e NaN em outras.
 */
function paraFicha(linha: LinhaProduto): Produto {
  return {
    sku: linha.sku,
    slug: linha.slug,
    categoriaSlug: linha.categoria_slug,
    nome: linha.nome,
    metal: linha.metal,
    pedra: linha.pedra,
    corPedra: linha.cor_pedra,
    lapidacao: linha.lapidacao,
    larguraMm: linha.largura_mm === null ? null : Number(linha.largura_mm),
    material: linha.material,
    descricao: linha.descricao ?? "",
    precoCentavos: linha.preco_centavos,
    imagemUrl: linha.imagem_url ?? "",
    imagemSmUrl: linha.imagem_sm_url,
    alt: linha.alt,
    aros: linha.aros,
    estoque: linha.estoque,
    ativo: linha.ativo,
  };
}

function paraCategoria(linha: LinhaCategoria): Categoria {
  return {
    slug: linha.slug,
    nome: linha.nome,
    descricao: linha.descricao ?? "",
    imagemUrl: linha.imagem_url ?? "",
    // O banco guarda o nome da coluna ('cor_pedra'); a vitrine pensa em campo
    // da ficha ('corPedra'). A tradução mora aqui, e só aqui.
    filtroCampo: linha.filtro_campo === "cor_pedra" ? "corPedra" : linha.filtro_campo,
    variante: linha.variante,
    rotuloFiltro: linha.rotulo_filtro ?? "",
    nota: linha.nota ?? [],
    opcoes: [...(linha.filtro_opcoes ?? [])]
      .sort((a, b) => a.ordem - b.ordem)
      .map(({ slug, nome, amostra }) => ({ slug, nome, amostra })),
  };
}

/** Todas as categorias, na ordem em que aparecem no site. */
export async function listarCategorias(): Promise<Categoria[]> {
  if (!supabaseConfigurado()) return categoriasLocais;

  const supabase = createClientePublico();
  const { data, error } = await supabase
    .from("categorias")
    .select(
      "slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, " +
        "filtro_opcoes (slug, nome, amostra, ordem)"
    )
    .eq("ativo", true)
    .order("ordem");

  if (error) throw new Error(`Falha ao listar categorias: ${error.message}`);
  return (data as unknown as LinhaCategoria[]).map(paraCategoria);
}

/** Uma categoria pelo slug — `undefined` quando não existe (vira 404). */
export async function buscarCategoria(slug: string): Promise<Categoria | undefined> {
  if (!supabaseConfigurado()) return categoriasLocais.find((c) => c.slug === slug);

  const supabase = createClientePublico();
  const { data, error } = await supabase
    .from("categorias")
    .select(
      "slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, " +
        "filtro_opcoes (slug, nome, amostra, ordem)"
    )
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar a categoria ${slug}: ${error.message}`);
  return data ? paraCategoria(data as unknown as LinhaCategoria) : undefined;
}

/** Produtos ativos de uma categoria, na ordem do SKU. */
export async function listarProdutos(categoriaSlug: string): Promise<Produto[]> {
  if (!supabaseConfigurado()) {
    return produtosLocais
      .filter((p) => p.categoriaSlug === categoriaSlug && p.ativo)
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }

  const supabase = createClientePublico();
  const { data, error } = await supabase
    .from("produtos")
    .select(COLUNAS_PRODUTO)
    // O `ativo` também está na RLS, que é quem de fato protege. Repetir aqui não
    // é redundância inútil: é o que deixa o índice parcial produtos_vitrine_idx
    // ser escolhido pelo planejador.
    .eq("categoria_slug", categoriaSlug)
    .eq("ativo", true)
    .order("sku");

  if (error) throw new Error(`Falha ao listar produtos de ${categoriaSlug}: ${error.message}`);
  return (data as unknown as LinhaProduto[]).map(paraFicha);
}

/** Um produto pelo slug — usado pela página de produto. */
export async function buscarProduto(slug: string): Promise<Produto | undefined> {
  if (!supabaseConfigurado()) {
    return produtosLocais.find((p) => p.slug === slug && p.ativo);
  }

  const supabase = createClientePublico();
  const { data, error } = await supabase
    .from("produtos")
    .select(COLUNAS_PRODUTO)
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar o produto ${slug}: ${error.message}`);
  return data ? paraFicha(data as unknown as LinhaProduto) : undefined;
}

/** Todos os produtos ativos — usado para gerar as rotas de /produto/[slug]. */
export async function listarTodosOsProdutos(): Promise<Produto[]> {
  if (!supabaseConfigurado()) return produtosLocais.filter((p) => p.ativo);

  const supabase = createClientePublico();
  const { data, error } = await supabase
    .from("produtos")
    .select(COLUNAS_PRODUTO)
    .eq("ativo", true)
    .order("sku");

  if (error) throw new Error(`Falha ao listar o catálogo: ${error.message}`);
  return (data as unknown as LinhaProduto[]).map(paraFicha);
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 317900 -> "R$ 3.179,00". Formatar só na exibição; o dado é sempre inteiro. */
export function formatarPreco(precoCentavos: number): string {
  return moeda.format(precoCentavos / 100);
}

/**
 * A linha logo abaixo do nome no card. A ficha guarda metal, pedra e largura
 * separados porque o banco os guarda assim; quem junta é a exibição — e junta
 * diferente por categoria: anel de formatura mostra a pedra, aliança mostra a
 * largura. Era exatamente o texto que estava fixo no HTML de cada card.
 */
export function linhaDoMaterial(produto: Produto): string {
  const partes = [produto.metal];
  if (produto.pedra) partes.push(produto.pedra);
  else if (produto.larguraMm != null) partes.push(`${produto.larguraMm}mm`);
  return partes.filter(Boolean).join(" · ");
}

/** "16 peças nesta categoria" / "8 de 16 peças" — filtrado, a primeira mentiria. */
export function textoDaContagem(visiveis: number, total: number): string {
  const peca = total === 1 ? "peça" : "peças";
  if (visiveis < total) return `${visiveis} de ${total} ${peca}`;
  return `${total} ${peca} nesta categoria`;
}

/** O valor pelo qual o card é filtrado, conforme o campo que a categoria usa. */
export function tagDoProduto(produto: Produto, filtroCampo: Categoria["filtroCampo"]): string | null {
  if (filtroCampo === "corPedra") return produto.corPedra;
  if (filtroCampo === "material") return produto.material;
  return null;
}
