import Link from "next/link";
import { BotaoComprar } from "@/components/BotaoComprar";
import {
  formatarPreco,
  linhaDoMaterial,
  type Categoria,
  type Produto,
} from "@/lib/catalogo";

/**
 * O card da vitrine. Reproduz elemento por elemento os dois formatos que
 * existiam no site: o que js/catalogo.js montava para os anéis de formatura e o
 * que estava escrito à mão nas páginas de aliança.
 *
 * A diferença entre eles é a `variante` da categoria e não é cosmética:
 * `produto` são as fotos recortadas com fundo transparente, deitadas, que
 * precisam de 5/4 + object-fit:contain (os modificadores `--produto`); `foto`
 * são as fotos de aliança, em pé, que usam o 4/5 + cover do padrão. Sem os
 * modificadores, o `cover` corta justamente o aro do anel.
 *
 * O escape manual de js/catalogo.js (`esc()`) não existe mais: JSX escapa
 * sozinho, inclusive quando o texto passar a vir do banco.
 */
const CoracaoFav = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <path d="M12 20s-7-4.35-9.5-8.5C.8 8.1 2.4 4.8 5.8 4.2c2-.35 3.7.6 4.9 2.2 1.2-1.6 2.9-2.55 4.9-2.2 3.4.6 5 3.9 3.3 7.3C19 15.65 12 20 12 20z" />
  </svg>
);

function textoAlternativo(produto: Produto): string {
  if (produto.alt) return produto.alt;
  // Montado como em js/catalogo.js. O `?? ""` existe porque lapidação é nula
  // para aliança — no original, `produto.lapidacao.toLowerCase()` teria
  // quebrado a página assim que um produto sem lapidação entrasse na grade.
  const pedra = produto.pedra ? ` com pedra ${produto.pedra}` : "";
  const lapidacao = produto.lapidacao ? ` em lapidação ${produto.lapidacao.toLowerCase()}` : "";
  return `${produto.nome} — ${produto.metal ?? ""}${pedra}${lapidacao}`;
}

export function RingCard({
  produto,
  categoria,
  escondido = false,
  colapsado = false,
}: {
  produto: Produto;
  categoria: Categoria;
  /** Aplica .is-hidden — o card some com transição, ainda ocupando espaço. */
  escondido?: boolean;
  /** display:none, aplicado só depois da transição, para a grade refluir. */
  colapsado?: boolean;
}) {
  const ehProduto = categoria.variante === "produto";
  const tag = categoria.filtroCampo === "corPedra" ? produto.corPedra : produto.material;

  return (
    <article
      className={`ringCard${escondido ? " is-hidden" : ""}`}
      style={colapsado ? { display: "none" } : undefined}
      data-tags={tag ?? undefined}
      data-material={produto.material ?? undefined}
      data-sku={produto.sku}
    >
      <button className="ringCard__fav" type="button" aria-label={`Favoritar ${produto.nome}`}>
        <CoracaoFav />
      </button>

      <Link
        className={`ringCard__media${ehProduto ? " ringCard__media--produto" : ""}`}
        href={`/produto/${produto.slug}`}
        aria-label={`Ver ${produto.nome}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`ringCard__img${ehProduto ? " ringCard__img--produto" : ""}`}
          src={produto.imagemUrl}
          srcSet={produto.imagemSmUrl ? `${produto.imagemSmUrl} 480w, ${produto.imagemUrl} 960w` : undefined}
          sizes={produto.imagemSmUrl ? "(max-width: 640px) 88vw, 280px" : undefined}
          alt={textoAlternativo(produto)}
          loading="lazy"
          decoding="async"
        />
      </Link>

      <div className="ringCard__body">
        <h3 className="ringCard__name">{produto.nome}</h3>
        <p className="ringCard__material">{linhaDoMaterial(produto)}</p>
        <p className="ringCard__desc">{produto.descricao}</p>
        {/* A linha do código só existia nos anéis de formatura, onde o SKU vem
            do nome do arquivo da foto e é usado na logística do cliente. */}
        {produto.lapidacao && (
          <p className="ringCard__sku">
            Cód. {produto.sku} · Lapidação {produto.lapidacao}
          </p>
        )}
        <div className="ringCard__foot">
          <span className="ringCard__price">
            {formatarPreco(produto.precoCentavos)}
            {/* Avisa antes de a pessoa se apegar à peça. Só nas últimas
                unidades: em estoque cheio isso viraria pressão de venda, que
                não é o tom da casa. */}
            {produto.estoque > 0 && produto.estoque <= 2 && (
              <span className="ringCard__restam">
                {produto.estoque === 1 ? "última peça" : "restam 2"}
              </span>
            )}
          </span>
          <Link
            className="ringCard__view"
            href={`/produto/${produto.slug}`}
            aria-label={`Ver detalhes de ${produto.nome}`}
          >
            &rarr;
          </Link>
        </div>
        <BotaoComprar
          produto={{
            sku: produto.sku,
            slug: produto.slug,
            nome: produto.nome,
            precoCentavos: produto.precoCentavos,
            imagemUrl: produto.imagemUrl,
            estoque: produto.estoque,
          }}
        />
      </div>
    </article>
  );
}
