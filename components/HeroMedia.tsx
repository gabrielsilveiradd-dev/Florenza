"use client";

import { useEffect, useRef } from "react";

/**
 * Hero: alterna foto e vídeo — portado de js/main.js.
 *
 * 2s depois de abrir, a foto (herome.png) dá lugar ao vídeo
 * (joalheriaMelhor.mp4). Quando o vídeo termina, a foto volta por mais 2s e o
 * ciclo recomeça. O gatilho é o evento "ended", não um tempo fixo: trocar o
 * vídeo por um mais curto ou mais longo só encurta ou alonga o ciclo, sem
 * mexer neste arquivo.
 *
 * O ciclo só roda com a hero na tela. Fora dela o vídeo era decodificado à toa
 * — no celular isso disputa CPU com os outros vídeos e com o WebGL da seção
 * dos anéis. Ao voltar, recomeça pela foto.
 */
export function HeroMedia() {
  const mediaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const media = mediaRef.current;
    const video = videoRef.current;
    if (!media || !video) return;

    let cycleTimer = 0;

    const showVideo = () => {
      media.classList.add("is-video-active");
      video.currentTime = 0;
      video.play().catch(() => {});
    };

    const showImage = () => {
      media.classList.remove("is-video-active");
      cycleTimer = window.setTimeout(showVideo, 2000);
    };

    const startCycle = () => {
      window.clearTimeout(cycleTimer);
      cycleTimer = window.setTimeout(showVideo, 2000);
    };

    const stopCycle = () => {
      window.clearTimeout(cycleTimer);
      video.pause();
      media.classList.remove("is-video-active");
    };

    video.addEventListener("ended", showImage);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? startCycle() : stopCycle()));
      },
      { threshold: 0.01 }
    );
    observer.observe(media);

    return () => {
      window.clearTimeout(cycleTimer);
      video.removeEventListener("ended", showImage);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="hero__media" id="heroMedia" ref={mediaRef}>
      {/* A versão do celular não é a mesma foto encolhida — é um RECORTE
          RETRATO, e a diferença é o que resolvia a nitidez.

          herome.png é paisagem 16:9. O celular é retrato, e com `object-fit:
          cover` ele aproveitava só uma fatia vertical: num iPhone 15 sobravam
          286x619 px reais para preencher 1179x2556, ampliação de 4,13x. No
          notebook a mesma foto aparece a 0,96x — daí a hero do PC parecer de
          outra qualidade. Não era compressão, era geometria.

          O recorte 1:2 sai do PNG original (não do JPEG já degradado) na
          região que o celular mostra, e derruba a ampliação para 1,36x. O
          `object-position: 62% center` da media query de 860px continua
          valendo: com o quadro já retrato sobra tão pouco a deslocar que não
          precisou mudar uma linha de CSS.

          Os dois tamanhos com descritor `w` existem para o navegador escolher
          pelo DPR do aparelho — antes o `srcSet` sem descritor entregava o
          mesmo arquivo para tela 2x e 3x. Gerados por
          tools/preparar-imagens.py. */}
      <picture>
        <source
          media="(max-width: 860px)"
          srcSet="/herome-mobile.webp 940w, /herome-mobile-620.webp 620w"
          sizes="100vw"
          type="image/webp"
        />
        <img
          className="hero__img"
          src="/herome.png"
          alt="Mãos entrelaçadas de um casal usando alianças e anel de noivado Florenza, sobre terno marrom, com fundo de mármore escuro veios dourados"
          loading="eager"
          decoding="async"
        />
      </picture>
      <video
        className="hero__video"
        ref={videoRef}
        src="/joalheriaMelhor.mp4"
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      />
    </div>
  );
}
