/**
 * MEDIDA DO ARO — o vocabulário que a vitrine, o carrinho, a conta e o painel
 * compartilham.
 *
 * `aros` vem da ficha da peça (0 sem aro, 1 um tamanho, 2 par). A medida é
 * OBRIGATÓRIA para fechar o pedido: no carrinho, tamanho `null` numa peça com
 * aro quer dizer "ainda não escolhido", e `criar_pedido()` recusa. Quem não sabe
 * medir tem o guia de medidas.
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
 * menos 40 (aro 10 = 50 mm, aro 18 = 58 mm). O diâmetro sai da circunferência —
 * é ele que se mede com a régua num anel que já serve.
 */
export function medidasDoAro(aro: number): { circunferencia: number; diametro: string } {
  const circunferencia = aro + 40;
  return { circunferencia, diametro: (circunferencia / Math.PI).toFixed(1).replace(".", ",") };
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
