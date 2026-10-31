/**
 * MEDIDA DO ARO — o vocabulário que a vitrine, o carrinho, a conta e o painel
 * compartilham.
 *
 * `aros` vem da ficha da peça (0 sem aro, 1 um tamanho, 2 par, que também se
 * vende por unidade; na linha de uma unidade, `aros` é 1). A medida é
 * OBRIGATÓRIA para fechar o pedido: no carrinho, tamanho `null` numa peça com
 * aro quer dizer "ainda não escolhido", e `criar_pedido()` recusa.
 *
 * Até 14/09/2026 havia a opção "Não sei ainda", gravada como tamanho nulo. Os
 * pedidos daquela época continuam no banco, e `descreverMedida` ainda sabe
 * chamá-los de "a combinar".
 */

/**
 * Numeração brasileira de aro. A faixa cobre o que se vende em anel adulto; o
 * banco aceita de 1 a 40, então alargar aqui não exige migration.
 */
export const TAMANHOS_DE_ARO: number[] = Array.from({ length: 27 }, (_, i) => i + 8);

/**
 * Regra brasileira: o número do aro é a circunferência interna em milímetros
 * menos 40 (aro 10 = 50 mm, aro 18 = 58 mm). O diâmetro sai da circunferência.
 */
export function medidasDoAro(aro: number): { circunferencia: number; diametro: string } {
  const circunferencia = aro + 40;
  return { circunferencia, diametro: (circunferencia / Math.PI).toFixed(1).replace(".", ",") };
}

/**
 * Preço de UMA aliança de uma peça vendida em par: metade do preço do par.
 * Centavo ímpar arredonda para cima, para duas unidades nunca saírem mais baratas
 * que o par. É cortesia para a tela: quem cobra é `criar_pedido()`, com a mesma conta.
 */
export function precoDaUnidade(precoDoPar: number): number {
  return Math.ceil(precoDoPar / 2);
}

/**
 * Quanto uma linha tira do estoque. Peça em par conta alianças: a linha do par
 * tem `aros` 2 e baixa 2; a da unidade tem `aros` 1 e baixa 1. Mesma conta de
 * `aliancas_da_linha()` no banco, que é quem decide.
 */
export function aliancasDaLinha(quantidade: number, aros: number): number {
  return quantidade * (aros === 2 ? 2 : 1);
}

/** Falta escolher alguma medida desta linha do carrinho? */
export function faltaMedida(item: { aros: number; tamanho: number | null; tamanhoPar: number | null }): boolean {
  return (item.aros >= 1 && item.tamanho === null) || (item.aros === 2 && item.tamanhoPar === null);
}

/** "Aro 18", "Aros 16 e 20" — ou `null` para peça sem aro. "A combinar" só aparece em pedido antigo. */
export function descreverMedida(
  aros: number | null | undefined,
  tamanho: number | null,
  tamanhoPar: number | null
): string | null {
  if (!aros) return null;
  if (aros === 2) {
    if (tamanho === null && tamanhoPar === null) return "Aros a combinar";
    return `Aros ${tamanho ?? "a combinar"} e ${tamanhoPar ?? "a combinar"}`;
  }
  return tamanho === null ? "Aro a combinar" : `Aro ${tamanho}`;
}
