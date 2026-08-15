"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RingScene } from "@/components/rings3d/cena";

/**
 * Seção "Materiais": dois anéis 3D em Three.js, o mesmo .glb carregado duas
 * vezes e recolorido (prata / ouro), girando em loop.
 *
 * A separação que o site já tinha foi mantida de propósito: a cena
 * (rings3d/cena.ts) não conhece o seletor de metal, e o seletor não conhece a
 * cena — ele só liga e desliga as classes `is-silver` / `is-gold` na <section>,
 * e todo o efeito visual (luz, vinheta, posição do indicador) continua saindo
 * do `:has` em estilos/rings-3d.css. Transformar isso em estado do React
 * obrigaria a reescrever aquele CSS, que é exatamente o que a migração não faz.
 *
 * A cena entra por import dinâmico porque toca `window` e `document` na
 * construção — e porque o Three.js não precisa entrar no bundle de quem nunca
 * rola até aqui.
 */
type Metal = "silver" | "gold" | null;

const Chevrons = () => (
  <span className="rings3d-hint-chevrons">
    {[0, 1, 2].map((i) => (
      <svg key={i} viewBox="0 0 16 9" fill="none">
        <path d="M1 1L8 8L15 1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ))}
  </span>
);

const Check = () => (
  <svg viewBox="0 0 13 13" fill="none">
    <path d="M1 6.5L5 10.5L12 2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SetaCta = () => (
  <svg viewBox="0 0 14 10" fill="none">
    <path d="M1 5H13M13 5L9 1M13 5L9 9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Rings3D() {
  const [metal, setMetal] = useState<Metal>(null);
  const canvasPrata = useRef<HTMLCanvasElement>(null);
  const canvasOuro = useRef<HTMLCanvasElement>(null);
  const painelPrata = useRef<HTMLDivElement>(null);
  const painelOuro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cenas: RingScene[] = [];
    let quadro = 0;
    let cancelado = false;

    (async () => {
      const { RingScene, OPCOES_PRATA, OPCOES_OURO } = await import("@/components/rings3d/cena");
      if (cancelado) return;
      if (!canvasPrata.current || !canvasOuro.current || !painelPrata.current || !painelOuro.current) return;

      cenas = [
        new RingScene(canvasPrata.current, painelPrata.current, OPCOES_PRATA),
        new RingScene(canvasOuro.current, painelOuro.current, OPCOES_OURO),
      ];

      const animar = (t: number) => {
        cenas.forEach((cena) => cena.tick(t));
        quadro = requestAnimationFrame(animar);
      };
      quadro = requestAnimationFrame(animar);
    })();

    // Aba escondida não precisa renderizar WebGL.
    const aoTrocarVisibilidade = () => {
      cenas.forEach((cena) => (cena.visible = !document.hidden));
    };
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);

    return () => {
      cancelado = true;
      cancelAnimationFrame(quadro);
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
      cenas.forEach((cena) => cena.destruir());
    };
  }, []);

  // Clicar de novo no metal já escolhido devolve a seção ao neutro.
  const escolher = (escolhido: Exclude<Metal, null>) =>
    setMetal((atual) => (atual === escolhido ? null : escolhido));

  const classeSecao = ["rings3d-section", metal === "silver" ? "is-silver" : "", metal === "gold" ? "is-gold" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classeSecao} id="ringsSection" aria-label="Materiais: prata 925 e ouro 18K">
      {/* PRATA */}
      <div
        className="rings3d-panel silver"
        id="panelSilver"
        ref={painelPrata}
        tabIndex={0}
        role="button"
        aria-expanded="false"
        aria-label="Ver detalhes da Prata 925"
      >
        <span className="rings3d-glow" aria-hidden="true" />
        <canvas className="rings3d-canvas" id="canvasSilver" ref={canvasPrata} />

        {/* A instrução escrita saiu. "Passe o mouse ou toque" ensinava com
            palavra o que os chevrons já ensinam com movimento — e ainda
            descrevia o gesto errado para metade dos visitantes, já que num
            aparelho de toque não existe mouse. Os chevrons ficam: eles pulsam
            para baixo, indicando que há algo a revelar, e somem quando o
            painel abre (.rings3d-panel.open .rings3d-hint). */}
        <div className="rings3d-hint" aria-hidden="true">
          <Chevrons />
        </div>

        <div className="rings3d-card silver-card">
          <h3>Prata 925</h3>
          <p className="sub">Pureza, brilho e permanência.</p>
          <p className="desc">
            A prata 925 oferece beleza e qualidade em cada detalhe, com um brilho que atravessa o tempo.
          </p>
          <ul>
            <li><Check />Acabamento sofisticado</li>
            <li><Check />Alta durabilidade</li>
            <li><Check />Design atemporal</li>
          </ul>
          <Link className="rings3d-cta" href="/aliancas-prata" target="_blank" rel="noopener">
            Conhecer Prata 925
            <SetaCta />
          </Link>
        </div>
      </div>

      <div className="rings3d-divider" />

      {/* Seletor de metal. O container é pointer-events:none e só os dois botões
          capturam o ponteiro, para não roubar o mouseenter/mouseleave dos
          painéis — é ele que aciona a rotação e a carta de cada anel. */}
      <div className="rings3d-selector" role="group" aria-label="Escolha seu metal">
        <button
          className="rings3d-metal rings3d-metal--silver"
          type="button"
          data-metal="silver"
          aria-pressed={metal === "silver"}
          aria-label="Destacar Prata 925"
          onClick={() => escolher("silver")}
        >
          Prata
        </button>
        <span className="rings3d-rail rings3d-rail--silver" aria-hidden="true" />
        <span className="rings3d-selector-dot" aria-hidden="true" />
        <span className="rings3d-rail rings3d-rail--gold" aria-hidden="true" />
        <button
          className="rings3d-metal rings3d-metal--gold"
          type="button"
          data-metal="gold"
          aria-pressed={metal === "gold"}
          aria-label="Destacar Ouro 18K"
          onClick={() => escolher("gold")}
        >
          Ouro
        </button>
      </div>

      {/* OURO */}
      <div
        className="rings3d-panel gold"
        id="panelGold"
        ref={painelOuro}
        tabIndex={0}
        role="button"
        aria-expanded="false"
        aria-label="Ver detalhes do Ouro 18K"
      >
        <span className="rings3d-glow" aria-hidden="true" />
        <canvas className="rings3d-canvas" id="canvasGold" ref={canvasOuro} />

        {/* A instrução escrita saiu. "Passe o mouse ou toque" ensinava com
            palavra o que os chevrons já ensinam com movimento — e ainda
            descrevia o gesto errado para metade dos visitantes, já que num
            aparelho de toque não existe mouse. Os chevrons ficam: eles pulsam
            para baixo, indicando que há algo a revelar, e somem quando o
            painel abre (.rings3d-panel.open .rings3d-hint). */}
        <div className="rings3d-hint" aria-hidden="true">
          <Chevrons />
        </div>

        <div className="rings3d-card gold-card">
          <h3>Ouro</h3>
          <p className="sub">Um símbolo que atravessa gerações.</p>
          <p className="desc">
            O ouro 18K é sinônimo de nobreza, beleza e eternidade. Um clássico que nunca perde seu valor.
          </p>
          <ul>
            <li><Check />Pureza e autenticidade</li>
            <li><Check />Resistência para toda vida</li>
            <li><Check />Brilho incomparável</li>
          </ul>
          <Link className="rings3d-cta" href="/aliancas-ouro" target="_blank" rel="noopener">
            Conhecer Ouro 18K
            <SetaCta />
          </Link>
        </div>
      </div>

      <div className="rings3d-grain" />
    </section>
  );
}
