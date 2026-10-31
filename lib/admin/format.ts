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

/**
 * Reais digitados → centavos. Aceita o jeito brasileiro ("2.420,00", "2420,5")
 * e o do teclado numérico ("2420.50"). "2.420" sem vírgula é dois mil
 * quatrocentos e vinte: ninguém digita preço de joia com três casas decimais.
 * `null` quando não é um valor positivo — e o valor nunca passa por float
 * guardado, só pelo arredondamento final.
 */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/R\$|\s/g, "");
  let normal = limpo;
  if (limpo.includes(",")) normal = limpo.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normal = limpo.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const centavos = Math.round(Number(normal) * 100);
  return centavos > 0 ? centavos : null;
}

/** "31/12/2026" a partir de uma coluna `date` ("2026-12-31"), sem passar por fuso. */
export const formatarDia = (dia: string) => dia.split("-").reverse().join("/");

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
 * Cor única dos gráficos de uma série só (faturamento por mês, peças mais
 * vendidas). Série única não precisa de paleta nem de legenda — o
 * título já diz o que a barra mede. É o dourado da marca.
 */
export const COR_SERIE = "#7D6330";
