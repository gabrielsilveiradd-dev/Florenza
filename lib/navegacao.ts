/* AS TRÊS CATEGORIAS, ESCRITAS UMA VEZ SÓ.
 *
 * Antes cada lugar tinha a sua lista: a nav apontava para âncoras de seção
 * (`/#aliancas`, `/#categorias`), o rodapé tinha duas listas diferentes — uma
 * com cinco rótulos genéricos e outra com as categorias —, e a vitrine da home
 * tinha a terceira. Três listas para o mesmo catálogo é uma divergência
 * esperando acontecer: bastava renomear uma categoria para o site passar a
 * chamá-la de dois jeitos.
 *
 * Isto NÃO substitui `lib/catalogo.ts`. O catálogo é o dado do banco (preço,
 * estoque, foto) e continua sendo a fonte de verdade da vitrine. Aqui mora só
 * o que a navegação precisa saber e o que não vem do banco: o rótulo curto da
 * régua e a frase de descoberta. São conteúdo editorial, não dado de produto.
 *
 * SOBRE O SLUG: as rotas continuam `/aliancas-ouro` e `/aliancas-prata`. O
 * nome que a pessoa lê mudou para "Anéis de Ouro"/"Anéis de Prata", mas trocar
 * o slug quebraria todo link já compartilhado e obrigaria a redirecionar — e
 * o endereço não é o que comunica a categoria, o rótulo é.
 */

export type CategoriaNav = {
  /** Rota real, que já existe em `app/[categoria]`. */
  href: string;
  /** Como a Florenza chama a categoria. Único nome, em todo lugar. */
  rotulo: string;
  /** Versão curta, para réguas e barras estreitas. */
  curto: string;
  /** Uma frase de descoberta. Curta de propósito. */
  frase: string;
  img: string;
  alt: string;
};

export const CATEGORIAS_NAV: CategoriaNav[] = [
  {
    href: "/aliancas-ouro",
    rotulo: "Anéis de Ouro",
    curto: "Ouro",
    frase: "Promessas que atravessam gerações.",
    img: "/categorias/aliançaouro.png",
    alt: "Anel de ouro Florenza",
  },
  {
    href: "/aliancas-prata",
    rotulo: "Anéis de Prata",
    curto: "Prata",
    frase: "Elegância discreta, para todos os dias.",
    img: "/categorias/alliançaprata.png",
    alt: "Anel de prata Florenza",
  },
  {
    href: "/aneis-formatura",
    rotulo: "Anéis de Formatura",
    curto: "Formatura",
    frase: "Uma conquista merece ser eternizada.",
    img: "/categorias/anelformatura.png",
    alt: "Anel de formatura Florenza",
  },
];

/**
 * Atendimento é a única seção institucional que existe de verdade: é o rodapé,
 * que tem `id="contato"` desde sempre. "Sobre" ficou de fora de propósito —
 * não há página nem seção de Sobre no projeto, e a regra aqui é não criar link
 * para o que não existe. Quando a página nascer, ela entra nesta lista.
 */
export const SECOES_INSTITUCIONAIS = [
  { href: "/#contato", rotulo: "Atendimento", curto: "Atendimento" },
];

/** A categoria a que uma rota pertence — usado pelo estado ativo da nav. */
export function categoriaAtiva(caminho: string): string | null {
  const casa = CATEGORIAS_NAV.find((c) => c.href === caminho);
  return casa ? casa.href : null;
}
