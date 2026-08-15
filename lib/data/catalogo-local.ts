/* CATÁLOGO LOCAL — as fichas que hoje moram no repositório.
 *
 * Este arquivo substitui js/data/aneis-formatura.js e os cards que estavam
 * escritos à mão em aliancas-ouro.html / aliancas-prata.html. Os campos já
 * estão no formato que as tabelas do Supabase vão ter (ver
 * supabase/migrations), com um motivo prático: `tools/seed-catalogo.mjs` lê
 * daqui para popular o banco, e quando `lib/catalogo.ts` passar a consultar o
 * Supabase os tipos continuam os mesmos.
 *
 * De onde vêm os campos:
 *   sku            nome do arquivo original em aneisFormatura/ (CODIGO_R$PRECO)
 *   precoCentavos  o mesmo preço, em centavos (ver "por que centavos" no fim)
 *   imagemUrl      gerada por tools/importar-aneis-formatura.py
 *   demais campos  descrição comercial da peça, escrita a partir da foto
 */

export type Produto = {
  sku: string;
  slug: string;
  categoriaSlug: string;
  nome: string;
  metal: string | null;
  pedra: string | null;
  corPedra: string | null;
  lapidacao: string | null;
  larguraMm: number | null;
  material: string | null;
  descricao: string;
  precoCentavos: number;
  imagemUrl: string;
  imagemSmUrl: string | null;
  /**
   * Texto alternativo da foto. As alianças traziam um alt escrito à mão em cada
   * card do HTML; os anéis de formatura montavam o deles a partir de metal,
   * pedra e lapidação. Quando é `null`, o card compõe — ver RingCard.
   */
  alt: string | null;
  estoque: number;
  ativo: boolean;
};

export type OpcaoFiltro = {
  slug: string;
  nome: string;
  /** Hex do círculo de amostra; alimenta a variável --swatch em categoria.css. */
  amostra: string | null;
};

export type Categoria = {
  slug: string;
  nome: string;
  descricao: string;
  imagemUrl: string;
  /** Qual campo do produto o filtro da vitrine usa. */
  filtroCampo: "corPedra" | "material" | null;
  /**
   * Como a foto se comporta no card. `produto` são as fotos recortadas com
   * fundo transparente (deitadas: 5/4 + contain + drop-shadow); `foto` são as
   * fotos de aliança, em pé (4/5 + cover). Trocar isso corta o aro do anel.
   */
  variante: "produto" | "foto";
  rotuloFiltro: string;
  /** Linhas do parágrafo de rodapé da vitrine (eram separadas por <br>). */
  nota: string[];
  opcoes: OpcaoFiltro[];
};

const OURO_18K = "Ouro 18K (750)";

// O filtro da vitrine de formatura é pela cor da pedra, não pelo metal: em anel
// de formatura a cor é o que identifica o curso, e todas as peças da categoria
// são do mesmo metal. A ordem aqui é a ordem dos botões na página.
const CORES_DE_PEDRA: OpcaoFiltro[] = [
  { slug: "vermelha", nome: "Vermelha", amostra: "#b3102b" },
  { slug: "rosa", nome: "Rosa", amostra: "#d4276e" },
  { slug: "azul", nome: "Azul", amostra: "#1b4fb0" },
  { slug: "verde", nome: "Verde", amostra: "#0f8a4e" },
  { slug: "amarela", nome: "Amarela", amostra: "#e3a516" },
  { slug: "negra", nome: "Negra", amostra: "#24211f" },
];

export const categorias: Categoria[] = [
  {
    slug: "aneis-formatura",
    nome: "Anéis de Formatura",
    descricao:
      "Celebre uma conquista com uma joia que marca o início de uma nova história. Cada anel carrega o símbolo da sua profissão e os anos que levaram até ele.",
    imagemUrl: "/categorias/anelformatura.png",
    filtroCampo: "corPedra",
    variante: "produto",
    rotuloFiltro: "Filtrar por cor da pedra",
    nota: [
      "Todas as peças são ouro 18K (750); o filtro é pela cor da pedra, que é o que identifica o curso na tradição do anel de formatura.",
    ],
    opcoes: CORES_DE_PEDRA,
  },
  {
    slug: "aliancas-ouro",
    nome: "Alianças de Ouro",
    descricao:
      "Peças atemporais, lapidadas à mão para selar promessas que atravessam gerações. O ouro 18K é sinônimo de nobreza, beleza e eternidade.",
    imagemUrl: "/categorias/aliançaouro.png",
    // Sem filtro de propósito: as páginas de aliança nunca tiveram a barra de
    // botões. Os cards já carregam `data-material`, mas nada os acionava — e
    // fazer a barra aparecer agora seria mudar a página, não migrá-la. Ligar
    // isso depois é trocar `null` por `"material"`.
    filtroCampo: null,
    variante: "foto",
    rotuloFiltro: "Filtrar por material",
    nota: [],
    opcoes: [
      { slug: "ouro", nome: "Ouro 18K", amostra: "#b3854e" },
      { slug: "ouro-diamantes", nome: "Ouro + Diamantes", amostra: "#e3c692" },
    ],
  },
  {
    slug: "aliancas-prata",
    nome: "Alianças de Prata",
    descricao:
      "Elegância discreta em prata, para quem escolhe simplicidade com sofisticação. A prata 925 oferece beleza e qualidade em cada detalhe, com um brilho que atravessa o tempo.",
    imagemUrl: "/categorias/alliançaprata.png",
    filtroCampo: null,
    // Passou de `foto` para `produto` quando as 14 peças de prata 950 entraram.
    // Não é preferência: `foto` é 4/5 + object-fit:cover, e cover corta as
    // laterais — exatamente onde está o aro. As 14 fotos novas são recortadas
    // com fundo transparente, como as de formatura, e pedem 5/4 + contain.
    //
    // O preço disso são as duas peças antigas (P301 e P601), que são cenas em
    // mármore e não recortes: com `contain` elas aparecem inteiras dentro da
    // moldura, com o próprio fundo à mostra, em vez de preencherem o card. O
    // fundo delas é quase o marfim do site, então destoa pouco — e é bem menos
    // grave que cortar o aro de 14 peças. A saída definitiva é `variante` virar
    // campo do produto, não da categoria.
    variante: "produto",
    rotuloFiltro: "Filtrar por material",
    nota: [],
    // O teor deixou de ser um só: P301 e P601 são 925, as 14 novas são 950. O
    // rótulo do filtro deixa de afirmar um número que vale para 2 de 16 peças.
    // (A barra não aparece hoje — `filtroCampo` é null —, mas o dado fica certo.)
    opcoes: [{ slug: "prata", nome: "Prata", amostra: "#cfd3d6" }],
  },
];

/** Caminho das fotos de formatura: segue do SKU, mesma convenção do script Python. */
const fotoFormatura = (sku: string) => ({
  imagemUrl: `/produtos/formatura/${sku}.webp`,
  imagemSmUrl: `/produtos/formatura/${sku}-sm.webp`,
});

const formatura = (
  sku: string,
  slug: string,
  nome: string,
  pedra: string,
  corPedra: string,
  lapidacao: string,
  descricao: string,
  precoCentavos: number
): Produto => ({
  sku,
  slug,
  categoriaSlug: "aneis-formatura",
  nome,
  metal: OURO_18K,
  pedra,
  corPedra,
  lapidacao,
  larguraMm: null,
  material: null,
  descricao,
  precoCentavos,
  ...fotoFormatura(sku),
  alt: null,
  estoque: 5,
  ativo: true,
});

/**
 * As 14 alianças de prata que entraram pela pasta `alianças de prata/`.
 *
 * Mesma ideia do `formatura()` acima: a ficha é sempre a mesma forma, então o
 * que varia entra por parâmetro. Aqui as colunas de pedra são nulas e quem
 * carrega a diferença é `larguraMm` — é assim que o card monta a linha
 * "PRATA 950 · 4MM" (ver `linhaDoMaterial` em lib/catalogo.ts).
 *
 * PRATA 950, e não 925: o teor está no nome de todos os arquivos de origem, e
 * é maior que o das duas peças antigas (P301 e P601, que são 925). As duas
 * convivem na mesma categoria porque teor é dado da peça, não da vitrine.
 *
 * `material: "prata"` continua sendo o valor do filtro, e não o teor —
 * `aliancas-prata` tem `filtroCampo: null`, então nada é filtrado por ele
 * hoje; a coluna existe para o dia em que for.
 */
const fotoPrata = (sku: string) => ({
  imagemUrl: `/produtos/prata/${sku}.webp`,
  imagemSmUrl: `/produtos/prata/${sku}-sm.webp`,
});

const prata = (
  sku: string,
  slug: string,
  nome: string,
  larguraMm: number,
  descricao: string,
  precoCentavos: number,
  metal = "Prata 950"
): Produto => ({
  sku,
  slug,
  categoriaSlug: "aliancas-prata",
  nome,
  metal,
  pedra: null,
  corPedra: null,
  lapidacao: null,
  larguraMm,
  material: "prata",
  descricao,
  precoCentavos,
  ...fotoPrata(sku),
  // Nulo de propósito: o RingCard compõe o alt de metal + largura, como já faz
  // para os anéis de formatura. Escrever à mão 14 vezes só criaria divergência.
  alt: null,
  estoque: 5,
  ativo: true,
});

export const produtos: Produto[] = [
  formatura("3001", "anel-citrino-arabesco", "Anel Citrino Arabesco", "Citrino", "amarela", "Redonda",
    "Citrino redondo cercado por um halo de diamantes, sobre um aro largo com arabescos em alto relevo.", 349000),
  formatura("3002", "anel-rubi-bicolor", "Anel Rubi Bicolor", "Rubi", "vermelha", "Oval",
    "Rubi oval em halo de diamantes, com ombros em ouro branco cravejado que abrem contraste sobre o aro amarelo.", 349000),
  formatura("3003", "anel-esmeralda-leque", "Anel Esmeralda Leque", "Esmeralda", "verde", "Redonda",
    "Esmeralda redonda sustentada por garras altas, com diamantes abertos em leque sobre um aro largo e polido.", 349000),
  formatura("3004", "anel-safira-floral", "Anel Safira Floral", "Safira azul", "azul", "Redonda",
    "Safira azul em halo margarida, com folhas gravadas à mão nas laterais do aro.", 349000),
  formatura("3005", "anel-safira-negra-arabesco", "Anel Safira Negra", "Safira negra", "negra", "Oval",
    "Pedra negra oval em halo de diamantes, entre arabescos vazados nas laterais do aro.", 299000),
  formatura("3010", "anel-safira-navete", "Anel Safira Navete", "Safira azul", "azul", "Navete",
    "Safira em lapidação navete, contornada por diamantes, sobre aro duplo que se abre em V.", 210000),
  formatura("3184", "anel-esmeralda-navete", "Anel Esmeralda Navete", "Esmeralda", "verde", "Navete",
    "Esmeralda navete em halo de diamantes, sobre aro duplo em V — o desenho mais leve da linha.", 226000),
  formatura("3185", "anel-safira-oval", "Anel Safira Oval", "Safira azul", "azul", "Oval",
    "Safira oval em halo cravejado, com galeria vazada que deixa a luz atravessar a pedra.", 242000),
  formatura("3187", "anel-rubi-classico", "Anel Rubi Clássico", "Rubi", "vermelha", "Oval",
    "Rubi oval em halo de diamantes sobre aro fino e liso: o desenho clássico do anel de formatura.", 242000),
  formatura("3514", "anel-topazio-princesa", "Anel Topázio Princesa", "Topázio azul-londres", "azul", "Princesa",
    "Topázio azul em lapidação princesa, com halo quadrado de diamantes sobre aro duplo.", 226000),
  formatura("3517", "anel-rubi-aro-duplo", "Anel Rubi Aro Duplo", "Rubi", "vermelha", "Redonda",
    "Rubi redondo em halo de diamantes, elevado por uma galeria de garras sobre aro duplo.", 242000),
  formatura("3537", "anel-turmalina-navete", "Anel Turmalina Navete", "Turmalina rosa", "rosa", "Navete",
    "Turmalina rosa navete em halo de diamantes, com ombros cravejados que seguem até a base do aro.", 314000),
  formatura("3538", "anel-topazio-oval", "Anel Topázio Oval", "Topázio azul", "azul", "Oval",
    "Topázio azul oval em halo de diamantes, sobre aro com frisos gravados nas laterais.", 317900),
  formatura("3539", "anel-agua-marinha-halo", "Anel Água-marinha", "Água-marinha", "azul", "Redonda",
    "Água-marinha redonda em halo de diamantes, sobre aro com frisos gravados nas laterais.", 317900),
  formatura("3555", "anel-turmalina-princesa", "Anel Turmalina Princesa", "Turmalina rosa", "rosa", "Princesa",
    "Turmalina rosa em lapidação princesa, com halo quadrado de diamantes e aro cravejado.", 290000),
  formatura("9257", "anel-rubi-entrelacado", "Anel Rubi Entrelaçado", "Rubi", "vermelha", "Oval",
    "Rubi oval em halo de diamantes, sobre aro entrelaçado — a peça mais imponente da categoria.", 418000),

  // ---------- Alianças ----------
  // Estavam escritas à mão no HTML, sem SKU. Os códigos abaixo foram criados
  // agora seguindo o padrão da casa (número curto), porque a chave de negócio
  // passa a valer também para elas quando o pedido existir.
  {
    sku: "A301",
    slug: "alianca-essence",
    categoriaSlug: "aliancas-ouro",
    nome: "Aliança Essence",
    metal: "Ouro 18K",
    pedra: null,
    corPedra: null,
    lapidacao: null,
    larguraMm: 3,
    material: "ouro",
    descricao: "Acabamento polido, linhas puras e atemporais.",
    precoCentavos: 289000,
    imagemUrl: "/modelosalianca/3mm.png",
    imagemSmUrl: null,
    alt: "Aliança Essence, ouro 18K, 3mm, acabamento polido",
    estoque: 5,
    ativo: true,
  },
  {
    sku: "A501",
    slug: "alianca-aurea",
    categoriaSlug: "aliancas-ouro",
    nome: "Aliança Aurea",
    metal: "Ouro 18K + Diamantes",
    pedra: null,
    corPedra: null,
    lapidacao: null,
    larguraMm: 5,
    material: "ouro-diamantes",
    descricao: "Detalhe de coração cravejado, brilho que eterniza.",
    precoCentavos: 469000,
    imagemUrl: "/modelosalianca/5mm.png",
    imagemSmUrl: null,
    alt: "Aliança Aurea, ouro 18K, 5mm, detalhe de coração cravejado",
    estoque: 5,
    ativo: true,
  },
  {
    sku: "P301",
    slug: "alianca-elo",
    categoriaSlug: "aliancas-prata",
    nome: "Aliança Elo",
    metal: "Prata 925",
    pedra: null,
    corPedra: null,
    lapidacao: null,
    larguraMm: 3,
    material: "prata",
    descricao: "Design minimalista com acabamento diagonal texturizado.",
    precoCentavos: 34900,
    imagemUrl: "/modelosalianca/3mmprata.png",
    imagemSmUrl: null,
    alt: "Aliança Elo, prata 925, 3mm, acabamento diagonal texturizado",
    estoque: 5,
    ativo: true,
  },
  {
    sku: "P601",
    slug: "alianca-eter",
    categoriaSlug: "aliancas-prata",
    nome: "Aliança Éter",
    metal: "Prata 925",
    pedra: null,
    corPedra: null,
    lapidacao: null,
    larguraMm: 6,
    material: "prata",
    descricao: "Friso dourado e detalhe de coração ao centro.",
    precoCentavos: 54900,
    imagemUrl: "/modelosalianca/6mmprata.png",
    imagemSmUrl: null,
    alt: "Aliança Éter, prata 925, 6mm, friso dourado e detalhe de coração",
    estoque: 5,
    ativo: true,
  },

  // ---------- Prata 950 ----------
  // Descrições escritas a partir da foto, uma a uma. O que o nome do arquivo
  // não dizia (o desenho da peça) foi olhado; o que ele dizia (código, teor,
  // largura, preço) foi lido pelo importador e não redigitado aqui.
  prata("9001", "alianca-lumen", "Aliança Lumen", 4,
    "Friso em banho dourado sobre aro polido, com coração vazado em uma das peças.", 27900),
  prata("9002", "alianca-vertice", "Aliança Vértice", 8,
    "Oito milímetros de prata polida, riscada por dois frisos paralelos.", 69000),
  prata("9003", "alianca-enlace", "Aliança Enlace", 5,
    "Bordas diamantadas e centro polido, com coração vazado em uma das peças.", 39000),
  prata("9004", "alianca-solar", "Aliança Solar", 4,
    "Aro diamantado cortado por friso dourado, com coração em banho dourado.", 29900),
  prata("9005", "alianca-aurora", "Aliança Aurora", 4,
    "Textura diamantada intensa, friso dourado ao centro e coração vazado.", 39900),
  prata("9006", "alianca-meridiano", "Aliança Meridiano", 6,
    "Seis milímetros polidos, com friso em banho dourado percorrendo o centro.", 39900),
  prata("9007", "alianca-duo", "Aliança Duo", 6,
    "Par em contraste: um aro diamantado, outro polido, ambos com borda fosca.", 36900),
  prata("9008", "alianca-chanfro", "Aliança Chanfro", 3,
    "Aro chanfrado que alterna prata polida e banho rosé.", 15900),
  prata("9009", "alianca-cintila", "Aliança Cintila", 3,
    "Par fino inteiramente diamantado, com um friso polido ao centro.", 22000),
  prata("9010", "alianca-rose", "Aliança Rosé", 3,
    "Chanfro bicolor: prata polida de um lado, banho rosé do outro.", 14900),
  prata("9011", "alianca-nevoa", "Aliança Névoa", 3,
    "Superfície diamantada com um friso polido correndo ao centro.", 15900),
  prata("9012", "alianca-sol-e-lua", "Aliança Sol e Lua", 4,
    "Par com sol e lua gravados, um símbolo em cada aliança.", 39000),
  prata("9013", "alianca-serena", "Aliança Serena", 5,
    "Aro abaulado e polido, sem relevo — o desenho mais simples da linha.", 11500),
  prata("9014", "alianca-martelada", "Aliança Martelada", 4,
    "Superfície martelada, com brilho irregular que muda conforme a luz.", 14900),
];

/* ---------- Por que preço em centavos ----------
 * R$ 3.179,00 vira 317900, um inteiro. Ponto flutuante erra em somas de
 * dinheiro (0.1 + 0.2 !== 0.3), e o mesmo vale do lado do banco: a coluna
 * correspondente no Supabase é `integer`, nunca `float`/`real`. A formatação
 * para "R$ 3.179,00" acontece só na exibição, em components/RingCard.tsx. */
