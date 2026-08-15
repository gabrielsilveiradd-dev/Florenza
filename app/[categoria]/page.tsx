import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogoGrade } from "@/components/CatalogoGrade";
import { Footer } from "@/components/Footer";
import { buscarCategoria, listarCategorias, listarProdutos } from "@/lib/catalogo";

// Terceira camada de CSS, só nas páginas de categoria — igual ao <link> que
// existia apenas em aneis-formatura.html e aliancas-*.html.
import "../estilos/categoria.css";

// Quarta camada, e só para uma categoria. O arquivo carrega nas três rotas
// (o import é da rota compartilhada), mas toda regra dele desce de
// `.categoryPage--formatura` — classe que só o slug `aneis-formatura` recebe.
// Alianças de ouro e de prata baixam o CSS e não casam com uma linha dele.
import "./formatura.css";

/** O slug que ganha o tratamento refinado; ver formatura.css. */
const SLUG_FORMATURA = "aneis-formatura";

/**
 * Uma rota para as três páginas que antes eram três arquivos HTML quase iguais:
 * aneis-formatura.html, aliancas-ouro.html e aliancas-prata.html. Os slugs são
 * os mesmos nomes, sem a extensão, e são também as chaves da tabela
 * `categorias` — o mesmo identificador do começo ao fim.
 */
/**
 * Pré-renderizada, mas com validade — mesmo motivo da página de produto: sem
 * isto a grade congelaria no build e seguiria oferecendo "Comprar" numa peça
 * que já esgotou no banco, até o próximo deploy.
 */
export const revalidate = 60;

export async function generateStaticParams() {
  const categorias = await listarCategorias();
  return categorias.map((categoria) => ({ categoria: categoria.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ categoria: string }>;
}): Promise<Metadata> {
  const categoria = await buscarCategoria((await params).categoria);
  if (!categoria) return {};
  return {
    title: `${categoria.nome} — Florenza`,
    description: categoria.descricao,
  };
}

export default async function PaginaCategoria({
  params,
}: {
  params: Promise<{ categoria: string }>;
}) {
  const slug = (await params).categoria;
  const categoria = await buscarCategoria(slug);
  if (!categoria) notFound();

  const produtos = await listarProdutos(slug);
  const ehFormatura = slug === SLUG_FORMATURA;

  return (
    <>
      {/* A classe é o interruptor de formatura.css. Nas outras categorias o
          <main> continua sem classe nenhuma, como sempre esteve. */}
      <main className={ehFormatura ? "categoryPage--formatura" : undefined}>
        <section className="categoryPage__header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="categoryPage__img"
            src={categoria.imagemUrl}
            alt={`${categoria.nome} Florenza`}
            loading="eager"
          />
          <p className="section-eyebrow">Categoria</p>
          <h1 className="categoryPage__title">{categoria.nome}</h1>
          <p className="categoryPage__desc">{categoria.descricao}</p>
          <Link className="categoryPage__back" href="/#categoryShowcase">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            {/* Mesmo destino (#categoryShowcase), outra promessa: em formatura
                o link convida a descobrir as demais coleções, em vez de sugerir
                que a pessoa se perdeu. As alianças seguem com o rótulo antigo,
                que é o que esta tarefa não pode mexer. */}
            {ehFormatura ? "Explorar outras categorias" : "Voltar às categorias"}
          </Link>
        </section>

        <section className="catalog categoryPage__catalog" aria-label={`${categoria.nome} disponíveis`}>
          {/* A costura entre a joia do topo e a grade. Não é enfeite solto: o
              risco e a palavra em serifa dizem que uma seção terminou e outra
              começou, papel que antes cabia à linha de 1px do cabeçalho. */}
          {ehFormatura && (
            <div className="fmt-abertura">
              <span className="fmt-abertura__risco" aria-hidden="true" />
              <h2 className="fmt-abertura__titulo">A coleção</h2>
            </div>
          )}

          <CatalogoGrade categoria={categoria} produtos={produtos} />

          {categoria.nota.length > 0 && (
            <p className="categoryPage__note">
              {categoria.nota.map((linha, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {linha}
                </span>
              ))}
            </p>
          )}
        </section>
      </main>

      <Footer />
    </>
  );
}
