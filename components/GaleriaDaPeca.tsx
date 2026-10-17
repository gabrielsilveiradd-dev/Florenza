"use client";

import { useState } from "react";

/**
 * Fotos da página da peça: a principal e, quando existe, a peça em uso (na
 * mão). Com uma foto só, renderiza exatamente o que a página tinha antes —
 * nenhuma miniatura, nenhum botão.
 *
 * As duas fotos têm cortes diferentes e isso não é detalhe: o recorte com fundo
 * transparente pede `contain` + sombra (senão o aro sai cortado), e a foto de
 * cena pede `cover` sem sombra (senão aparece uma moldura de marfim em volta da
 * mão). Quem decide é `cena`, por foto, e não a categoria.
 */
export type FotoDaGaleria = {
  src: string;
  srcSmall: string | null;
  alt: string;
  /** Foto com fundo cheio (a peça na mão). */
  cena: boolean;
  /** Rótulo da miniatura para leitor de tela. */
  rotulo: string;
};

export function GaleriaDaPeca({ fotos, retrato }: { fotos: FotoDaGaleria[]; retrato: boolean }) {
  const [ativa, setAtiva] = useState(0);
  const foto = fotos[ativa] ?? fotos[0];

  const classe = [
    "pdp__foto",
    retrato ? "pdp__foto--retrato" : "",
    foto.cena ? "pdp__foto--cena" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="pdp__galeria">
      <div className={classe}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={foto.src}
          src={foto.src}
          srcSet={foto.srcSmall ? `${foto.srcSmall} 480w, ${foto.src} 960w` : undefined}
          sizes="(max-width: 860px) 92vw, 520px"
          alt={foto.alt}
          loading="eager"
        />
      </div>

      {fotos.length > 1 && (
        <div className="pdp__miniaturas" role="group" aria-label="Fotos da peça">
          {fotos.map((f, i) => (
            <button
              key={f.src}
              type="button"
              className={`pdp__miniatura${f.cena ? " pdp__miniatura--cena" : ""}`}
              aria-label={f.rotulo}
              aria-pressed={i === ativa}
              onClick={() => setAtiva(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.srcSmall ?? f.src} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
