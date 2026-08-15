/**
 * Os ícones da nav, desenhados para este site.
 *
 * Não vieram de biblioteca de propósito. O losango da marca (`GemDefs`) tem
 * traço fino, canto reto e nenhum preenchimento chapado — colar ao lado dele um
 * conjunto de ícones genéricos, de traço mais grosso e cantos arredondados,
 * deixaria a barra com duas caligrafias. Todos aqui seguem a mesma régua:
 * viewBox 24, traço 1.3, sem preenchimento, `currentColor` para herdarem a cor
 * do estado (normal, hover, ativo) sem uma linha de CSS extra.
 *
 * `vector-effect: non-scaling-stroke` é o que mantém a espessura igual quando o
 * ícone encolhe no celular — sem isso um ícone de 15px fica com o traço mais
 * fino que o de 18px, e a barra parece desalinhada sem que se saiba por quê.
 */

type Props = { className?: string; size?: number };

function base(size: number, className?: string) {
  return {
    className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
    "aria-hidden": true,
  };
}

/** Alianças: dois aros entrelaçados — o símbolo da categoria, não uma metáfora. */
export function IconeAliancas({ className, size = 16 }: Props) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="14" r="6" />
      <circle cx="15" cy="10" r="6" />
    </svg>
  );
}

/** Coleção: a pedra lapidada vista de cima, com as facetas. */
export function IconeColecao({ className, size = 16 }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 4h10l4 5-9 11L3 9z" />
      <path d="M3 9h18" />
      <path d="M7 4l5 16M17 4l-5 16" />
    </svg>
  );
}

/** Categorias: as gavetas do mostruário. */
export function IconeCategorias({ className, size = 16 }: Props) {
  return (
    <svg {...base(size, className)}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

/** Contato: o balão de conversa — o atendimento da casa é por mensagem. */
export function IconeContato({ className, size = 16 }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-5.2A7.5 7.5 0 1 1 20.5 11.5z" />
      <path d="M9 11h6M9 14h3.5" />
    </svg>
  );
}

/** Sacola: a compra, não um carrinho de mercado. */
export function IconeSacola({ className, size = 18 }: Props) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 7h14l-1.1 12.2a1.8 1.8 0 0 1-1.8 1.6H7.9a1.8 1.8 0 0 1-1.8-1.6z" />
      <path d="M9 9.5V6.2a3 3 0 0 1 6 0v3.3" />
    </svg>
  );
}

/** Conta: a pessoa, em traço só. */
export function IconeConta({ className, size = 16 }: Props) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}
