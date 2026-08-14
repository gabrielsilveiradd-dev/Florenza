import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoComprar } from "@/components/BotaoComprar";
import { Footer } from "@/components/Footer";
import {
  buscarCategoria, buscarProduto, formatarPreco, linhaDoMaterial, listarTodosOsProdutos,
} from "@/lib/catalogo";

import "../produto.css";

/**
 * A página continua pré-renderizada, mas com validade.
 *
 * Sem isto o HTML congelaria no build: a peça esgotaria no banco e o site
 * seguiria oferecendo "Comprar" até o próximo deploy. Com estoque de verdade em
 * jogo, isso é justamente o bug que não pode existir.
 *
 * Um minuto é bastante: o carrinho reconfere o estoque ao abrir e
 * `criar_pedido()` confere de novo com a linha travada. Esta camada existe para
 * a pessoa não se apegar a uma peça que já foi — não para autorizar a venda.
 *
 * Dinâmico seria a saída errada. Estas 20 páginas mais as 3 de categoria são
 * conteúdo público, igual para todo mundo, e torná-las dinâmicas cobraria uma
 * ida ao banco por visita — o oposto do que lib/supabase/publico.ts foi escrito
 * para conseguir.
 */
export const revalidate = 60;

/**
 * Página de produto — o destino de "Ver detalhes", que no protótipo era
 * `href="#"` porque a página não existia.
 */
export async function generateStaticParams() {
  // Antes os três slugs de categoria estavam escritos aqui. Com o catálogo no
  // banco isso viraria mentira no dia em que uma categoria nova fosse criada
  // pelo painel: as peças dela simplesmente não ganhariam página.
  const produtos = await listarTodosOsProdutos();
  return produtos.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const produto = await buscarProduto((await params).slug);
  if (!produto) return {};
  return {
    title: `${produto.nome} — Florenza`,
    description: produto.descricao,
    openGraph: {
      title: `${produto.nome} — Florenza`,
      description: produto.descricao,
      images: produto.imagemUrl ? [produto.imagemUrl] : undefined,
      type: "website",
    },
  };
}

export default async function PaginaProduto({ params }: { params: Promise<{ slug: string }> }) {
  const produto = await buscarProduto((await params).slug);
  if (!produto) notFound();

  const categoria = await buscarCategoria(produto.categoriaSlug);
  const retrato = categoria?.variante === "foto";

  // Só as linhas que a peça realmente tem: anel de formatura mostra pedra e
  // lapidação, aliança mostra largura. Uma tabela com "—" em metade das linhas
  // não informa nada.
  const ficha: Array<[string, string]> = [
    ["Código", produto.sku],
    ...(produto.metal ? ([["Metal", produto.metal]] as Array<[string, string]>) : []),
    ...(produto.pedra ? ([["Pedra", produto.pedra]] as Array<[string, string]>) : []),
    ...(produto.lapidacao ? ([["Lapidação", produto.lapidacao]] as Array<[string, string]>) : []),
    ...(produto.larguraMm != null
      ? ([["Largura", `${produto.larguraMm} mm`]] as Array<[string, string]>)
      : []),
  ];

  return (
    <>
      <main className="pdp">
        <Link className="pdp__voltar" href={`/${produto.categoriaSlug}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          {categoria ? `Voltar para ${categoria.nome}` : "Voltar"}
        </Link>

        <div className="pdp__grade">
          <div className={`pdp__foto${retrato ? " pdp__foto--retrato" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={produto.imagemUrl}
              srcSet={produto.imagemSmUrl ? `${produto.imagemSmUrl} 480w, ${produto.imagemUrl} 960w` : undefined}
              sizes="(max-width: 860px) 92vw, 520px"
              alt={produto.alt ?? produto.nome}
              loading="eager"
            />
          </div>

          <div>
            <p className="pdp__eyebrow">{categoria?.nome ?? "Florenza"}</p>
            <h1 className="pdp__nome">{produto.nome}</h1>
            <p className="pdp__material">{linhaDoMaterial(produto)}</p>
            <p className="pdp__preco">{formatarPreco(produto.precoCentavos)}</p>
            <p className="pdp__desc">{produto.descricao}</p>

            <ul className="pdp__ficha">
              {ficha.map(([rotulo, valor]) => (
                <li key={rotulo}>
                  <span className="rotulo">{rotulo}</span>
                  <span>{valor}</span>
                </li>
              ))}
            </ul>

            <div className="pdp__acoes">
              <BotaoComprar
                className="pdp__comprar"
                produto={{
                  sku: produto.sku,
                  slug: produto.slug,
                  nome: produto.nome,
                  precoCentavos: produto.precoCentavos,
                  imagemUrl: produto.imagemUrl,
                  estoque: produto.estoque,
                }}
              />
              {produto.estoque <= 0 ? (
                <p className="pdp__estoque">
                  Esta peça está sem unidades no momento. Fale com a Florenza pelo WhatsApp
                  para saber do próximo lote ou encomendar uma igual.
                </p>
              ) : produto.estoque <= 2 ? (
                <p className="pdp__estoque">
                  {produto.estoque === 1
                    ? "Última peça disponível."
                    : "Restam 2 peças disponíveis."}
                </p>
              ) : null}
            </div>

            <p className="pdp__nota">
              Peça feita sob encomenda. O pagamento é combinado por WhatsApp depois que o
              pedido chega — não há cobrança automática neste site.
            </p>
          </div>
        </div>
      </main>

      <Footer colecoes="categoria" />
    </>
  );
}
