/**
 * Gradientes do losango da marca (nav e footer). Sem estes defs o símbolo
 * renderiza sem preenchimento — por isso o SVG oculto ficava no topo do <body>
 * de todas as páginas antigas, e continua aqui, agora uma vez só no layout.
 */
export function GemDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="gemSilverGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f7f8" />
          <stop offset="0.55" stopColor="#c7ccd1" />
          <stop offset="1" stopColor="#888e94" />
        </linearGradient>
        <linearGradient id="gemGoldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2E4BF" />
          <stop offset="0.55" stopColor="#D4B973" />
          <stop offset="1" stopColor="#7D6330" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** O losango em si, usado pela nav e pelo footer com classes diferentes. */
export function Gem({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 78" aria-hidden="true">
      <path
        d="M20,8 L44,8 L58,27 L32,73 L6,27 Z"
        fill="url(#gemGoldGrad)"
        stroke="#B39A55"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M6,27 L58,27 M20,8 L32,73 M44,8 L32,73"
        fill="none"
        stroke="#B39A55"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        opacity="0.8"
      />
    </svg>
  );
}
