"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * As coleções da Florenza — vitrine, não carrossel de slides.
 *
 * Evolução da `CategoryCarousel`: mesmas categorias, mesmas imagens, mesmos
 * links (inclusive o `target="_blank"`, que é o comportamento que o site já
 * tinha). O que muda é a hierarquia — o nome da coleção passa a ser o título da
 * experiência, e a joia ilustra — e a mecânica da troca.
 *
 * DUAS DECISÕES DE MECÂNICA, as duas por causa da experiência:
 *
 * 1. Saiu o `track` com `scroll-snap` horizontal. Todas as categorias ficam
 *    empilhadas no mesmo lugar, e a troca é opacidade + um deslocamento curto.
 *    Isso resolve três coisas de uma vez: não há mais rolagem horizontal para
 *    o usuário descobrir, as imagens já estão todas no DOM (a troca nunca
 *    mostra quadro vazio nem pisca), e a animação anda em `transform`/`opacity`,
 *    que o navegador resolve sem recalcular layout.
 *
 * 2. NADA aqui escuta `wheel`, `touchmove` ou rolagem da página. A seção não
 *    prende, não gruda e não sequestra o scroll — passa-se por ela como por
 *    qualquer outra. Navegar é clicar: setas, nomes das coleções, a própria
 *    joia, ou as setas do teclado quando a seção está em foco.
 */

type Colecao = {
  href: string;
  img: string;
  alt: string;
  /** Título da experiência. */
  rotulo: string;
  /** Nome curto, para a régua de navegação não virar uma linha de texto. */
  curto: string;
  /** Uma frase. A elegância aqui está em não explicar demais. */
  frase: string;
  cta: string;
};

const COLECOES: Colecao[] = [
  {
    href: "/aliancas-ouro",
    img: "/categorias/aliançaouro.png",
    alt: "Aliança de ouro Florenza",
    rotulo: "Alianças de Ouro",
    curto: "Ouro",
    frase: "Promessas que atravessam gerações.",
    cta: "Descobrir alianças",
  },
  {
    href: "/aliancas-prata",
    img: "/categorias/alliançaprata.png",
    alt: "Aliança de prata Florenza",
    rotulo: "Alianças de Prata",
    curto: "Prata",
    frase: "Elegância discreta, para todos os dias.",
    cta: "Descobrir alianças",
  },
  {
    href: "/aneis-formatura",
    img: "/categorias/anelformatura.png",
    alt: "Anel de formatura Florenza",
    rotulo: "Anéis de Formatura",
    curto: "Formatura",
    frase: "Uma conquista merece ser eternizada.",
    cta: "Explorar coleção",
  },
];

const Seta = ({ para }: { para: "esq" | "dir" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {para === "esq" ? <path d="M19 12H5M11 18l-6-6 6-6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
  </svg>
);

export function ColecoesShowcase() {
  const [indice, setIndice] = useState(0);
  const secaoRef = useRef<HTMLElement>(null);

  const total = COLECOES.length;
  // Circular: da última volta para a primeira. Numa vitrine de três peças, um
  // botão desabilitado na ponta é mais frustrante que útil.
  const ir = useCallback((passo: number) => {
    setIndice((atual) => (atual + passo + total) % total);
  }, [total]);

  /* Setas do teclado, só quando o foco está dentro da seção.
   *
   * Ouvinte no elemento e não em `window`: preso à janela, ele roubaria as
   * setas de qualquer outro lugar da página — inclusive de quem estivesse
   * navegando um <select>. E isto NÃO é captura de scroll: teclado de seta com
   * foco na seção é navegação normal de componente. */
  useEffect(() => {
    const secao = secaoRef.current;
    if (!secao) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "ArrowLeft") { evento.preventDefault(); ir(-1); }
      if (evento.key === "ArrowRight") { evento.preventDefault(); ir(1); }
    };

    secao.addEventListener("keydown", aoTeclar);
    return () => secao.removeEventListener("keydown", aoTeclar);
  }, [ir]);

  const anterior = COLECOES[(indice - 1 + total) % total];
  const proxima = COLECOES[(indice + 1) % total];

  return (
    <section className="col" id="categoryShowcase" ref={secaoRef} aria-roledescription="carrossel">
      <div className="col__palco js-reveal">
        <p className="col__eyebrow">Coleções</p>

        {/* O título e a frase vivem empilhados, um por coleção, e só o ativo
            aparece. Trocar o texto de um elemento só custaria um remonte, e
            remonte corta a transição no meio. */}
        <div className="col__titulos">
          {COLECOES.map((c, i) => (
            <div
              className={`col__titulo-bloco${i === indice ? " is-ativo" : ""}`}
              key={c.href}
              aria-hidden={i !== indice}
            >
              <h2 className="col__nome">{c.rotulo}</h2>
              <p className="col__frase">{c.frase}</p>
            </div>
          ))}
        </div>

        <div className="col__vitrine">
          <button
            className="col__seta col__seta--esq"
            type="button"
            onClick={() => ir(-1)}
            aria-label={`Coleção anterior: ${anterior.rotulo}`}
          >
            <Seta para="esq" />
            <span className="col__seta-dica">{anterior.curto}</span>
          </button>

          <div className="col__joias">
            {COLECOES.map((c, i) => (
              <Link
                className={`col__joia${i === indice ? " is-ativo" : ""}`}
                href={c.href}
                key={c.href}
                target="_blank"
                rel="noopener"
                tabIndex={i === indice ? undefined : -1}
                aria-hidden={i !== indice}
                aria-label={`Ver ${c.rotulo} (abre em nova aba)`}
              >
                {/* Sem `loading="lazy"`: as três imagens precisam estar prontas
                    antes da primeira troca, senão a segunda coleção aparece em
                    branco por um instante. São três PNGs — o custo é pequeno
                    perto do defeito que evita. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="col__img" src={c.img} alt={c.alt} decoding="async" />
              </Link>
            ))}
          </div>

          <button
            className="col__seta col__seta--dir"
            type="button"
            onClick={() => ir(1)}
            aria-label={`Próxima coleção: ${proxima.rotulo}`}
          >
            <span className="col__seta-dica">{proxima.curto}</span>
            <Seta para="dir" />
          </button>
        </div>

        <div className="col__ctas">
          {COLECOES.map((c, i) => (
            <Link
              className={`col__cta${i === indice ? " is-ativo" : ""}`}
              href={c.href}
              key={c.href}
              target="_blank"
              rel="noopener"
              tabIndex={i === indice ? undefined : -1}
              aria-hidden={i !== indice}
            >
              {c.cta}
              <Seta para="dir" />
            </Link>
          ))}
        </div>

        <nav className="col__regua" aria-label="Escolher coleção">
          {COLECOES.map((c, i) => (
            <button
              className={`col__regua-item${i === indice ? " is-ativo" : ""}`}
              type="button"
              key={c.href}
              onClick={() => setIndice(i)}
              aria-current={i === indice ? "true" : undefined}
            >
              {c.curto}
            </button>
          ))}
        </nav>

        <p className="col__contador" aria-live="polite">
          <span>{String(indice + 1).padStart(2, "0")}</span>
          <span className="col__contador-barra" aria-hidden="true" />
          <span className="col__contador-total">{String(total).padStart(2, "0")}</span>
        </p>
      </div>
    </section>
  );
}
