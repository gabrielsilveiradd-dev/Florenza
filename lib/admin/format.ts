/** Formatadores do painel. Tudo em pt-BR, dinheiro sempre a partir de centavos. */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCurta = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const formatarPreco = (centavos: number) => moeda.format(centavos / 100);

/** "R$ 3.179" — para onde cabe o símbolo, como legendas curtas. */
export function formatarPrecoCurto(centavos: number): string {
  const reais = centavos / 100;
  if (reais >= 1000) return `${moedaCurta.format(Math.round(reais / 1000))} mil`.replace(",00", "");
  return moedaCurta.format(reais);
}

/**
 * Rótulo de eixo: "28 mil", "1,2 mi", "850". Sem "R$" de propósito — o título
 * da seção já diz que a medida é faturamento, e repetir o símbolo em cada marca
 * do eixo engorda o rótulo até ele quebrar em duas linhas ou ser cortado. Eixo
 * é informação de apoio; quem precisa do valor exato tem a dica ao passar o
 * mouse.
 */
export function formatarEixoValor(centavos: number): string {
  const reais = centavos / 100;
  if (reais >= 1_000_000) return `${(reais / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (reais >= 1000) return `${Math.round(reais / 1000)} mil`;
  return String(Math.round(reais));
}

export const formatarData = (iso: string) => data.format(new Date(iso));

export const formatarPercentual = (valor: number) => `${Math.round(valor)}%`;

/** Plural sem gambiarra de "(s)". */
export const plural = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

export const ROTULO_STATUS: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  em_producao: "Em produção",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const CLASSE_STATUS: Record<string, string> = {
  aguardando_pagamento: "adm-tag adm-tag--aguardando",
  pago: "adm-tag adm-tag--pago",
  em_producao: "adm-tag adm-tag--producao",
  enviado: "adm-tag adm-tag--enviado",
  entregue: "adm-tag adm-tag--entregue",
  cancelado: "adm-tag adm-tag--cancelado",
};

export const ROTULO_ORIGEM: Record<string, string> = {
  site: "Site",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  loja: "Loja",
  indicacao: "Indicação",
  outro: "Outro",
};

/**
 * Cores da rosca de origem.
 *
 * Ordem fixa e cor fixa por origem: se a paleta fosse atribuída na hora, filtrar
 * o período recoloriria o gráfico inteiro e comparar dois meses viraria
 * adivinhação. A cor pertence à origem, não à posição dela no ranking.
 *
 * A sequência abaixo foi CONFERIDA por script, não escolhida no olho — a
 * primeira tentativa usava os tons quentes do site (dourado, verde, vermelho) e
 * reprovou em três critérios: dourado e marrom liam como cinza, e verde contra
 * vermelho ficava a ΔE 4,8 sob deuteranopia, ou seja, a mesma cor para quem tem
 * a forma mais comum de daltonismo.
 *
 * O que resolveu foi separar os pares críticos por LUMINOSIDADE e não por
 * matiz: sob daltonismo a matiz colapsa, a luminosidade sobrevive. Verde e
 * vinho, os dois últimos, saíram de ΔE 5,8 para 17,4 só por um ficar claro e o
 * outro escuro. Vermelho e verde nunca ficam lado a lado.
 *
 * Para reconferir depois de mexer em qualquer valor:
 *   node <skill dataviz>/scripts/validate_palette.js \
 *     "#a3123a,#1b4fb0,#b5701a,#6b3fa0,#2f9e6b,#8f2765" --mode light --surface "#E8DFCD"
 *
 * Sobra um aviso: o verde tem contraste 2,63 contra o bege do cartão, abaixo de
 * 3:1. É aceitável aqui porque a legenda ao lado da rosca traz o nome e o
 * número de cada origem — a cor nunca é a única forma de ler o gráfico.
 */
export const ORDEM_ORIGEM = ["site", "whatsapp", "instagram", "loja", "indicacao", "outro"] as const;

export const COR_ORIGEM: Record<string, string> = {
  site: "#a3123a",
  whatsapp: "#1b4fb0",
  instagram: "#b5701a",
  loja: "#6b3fa0",
  indicacao: "#2f9e6b",
  outro: "#8f2765",
};

/**
 * Cor única dos gráficos de uma série só (faturamento por mês, peças mais
 * vendidas, regiões). Série única não precisa de paleta nem de legenda — o
 * título já diz o que a barra mede. É o dourado da marca.
 */
export const COR_SERIE = "#7D6330";
