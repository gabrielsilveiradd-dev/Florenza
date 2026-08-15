"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORIAS_NAV } from "@/lib/navegacao";

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

/**
 * As três vêm de `lib/navegacao.ts`, que é a mesma lista da barra do topo e do
 * rodapé. Antes esta cópia vivia aqui, e a do rodapé em outro arquivo: renomear
 * uma categoria exigia lembrar de três lugares, e o site passava a chamá-la de
 * dois jeitos até alguém reparar.
 *
 * O CTA é "Explorar" para as três. Antes duas diziam "Descobrir alianças" e uma
 * "Explorar coleção" — três botões com dois verbos e dois substantivos, para a
 * mesma ação. O rótulo do botão não precisa repetir o nome que está logo acima.
 */
const COLECOES = CATEGORIAS_NAV;

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

  /* Arrastar de lado troca a coleção — só no toque, e sem tocar no scroll.
   *
   * Isto NÃO contradiz a regra da seção ("nada escuta wheel, touchmove ou
   * scroll"). Aquela regra existe para a página nunca ser sequestrada na
   * vertical, e aqui nada é sequestrado: não há `preventDefault` em lugar
   * nenhum, então a rolagem vertical segue exatamente como seguiria se este
   * código não existisse. O gesto só conta quando é claramente horizontal —
   * 45px de percurso e pelo menos 1,5x mais largo que alto.
   *
   * Existe porque no celular não há hover: as setas continuam lá e continuam
   * clicáveis, mas quem chega numa vitrine de três peças tenta arrastar antes
   * de procurar botão. */
  const toque = useRef<{ x: number; y: number } | null>(null);

  const aoIniciarToque = (evento: React.PointerEvent) => {
    if (evento.pointerType === "mouse") return;
    toque.current = { x: evento.clientX, y: evento.clientY };
  };

  const aoTerminarToque = (evento: React.PointerEvent) => {
    if (!toque.current) return;
    const dx = evento.clientX - toque.current.x;
    const dy = evento.clientY - toque.current.y;
    toque.current = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    ir(dx < 0 ? 1 : -1);
  };

  const anterior = COLECOES[(indice - 1 + total) % total];
  const proxima = COLECOES[(indice + 1) % total];

  return (
    <section className="col" id="categoryShowcase" ref={secaoRef} aria-roledescription="carrossel">
      <div className="col__palco js-reveal">
        <p className="col__eyebrow">Descubra sua joia</p>
        {/* A frase de abertura da seção, fixa — não muda com a coleção ativa.
            Ela diz o que a seção é (descoberta) e deixa o título abaixo dizer
            o que a coleção é. */}
        <p className="col__chamada">Cada história pede uma joia diferente.</p>

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

          <div
            className="col__joias"
            onPointerDown={aoIniciarToque}
            onPointerUp={aoTerminarToque}
            onPointerCancel={() => { toque.current = null; }}
          >
            {COLECOES.map((c, i) => (
              <Link
                className={`col__joia${i === indice ? " is-ativo" : ""}`}
                href={c.href}
                key={c.href}
                tabIndex={i === indice ? undefined : -1}
                aria-hidden={i !== indice}
                aria-label={`Ver ${c.rotulo}`}
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
              tabIndex={i === indice ? undefined : -1}
              aria-hidden={i !== indice}
              aria-label={`Explorar ${c.rotulo}`}
            >
              Explorar
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
