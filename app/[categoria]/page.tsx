import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogoGrade } from "@/components/CatalogoGrade";
import { Footer } from "@/components/Footer";
import { buscarCategoria, listarCategorias, listarProdutos } from "@/lib/catalogo";

// Terceira camada de CSS, só nas páginas de categoria — igual ao <link> que
// existia apenas em aneis-formatura.html e aliancas-*.html.
import "../estilos/categoria.css";

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

  return (
    <>
      <main>
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
            Voltar às categorias
          </Link>
        </section>

        <section className="catalog categoryPage__catalog" aria-label={`${categoria.nome} disponíveis`}>
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

      <Footer colecoes="categoria" />
    </>
  );
}
