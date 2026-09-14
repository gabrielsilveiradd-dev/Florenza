/**
 * MEDIDA DO ARO — o vocabulário que a vitrine, o carrinho, a conta e o painel
 * compartilham.
 *
 * `aros` vem da ficha da peça (0 sem aro, 1 um tamanho, 2 par). No carrinho e
 * no pedido, tamanho `null` numa peça com aro é a escolha "não sei ainda": a
 * Florenza confirma a medida pelo WhatsApp. Não é um campo esquecido — a tela
 * obriga a escolher uma das opções, e esta é uma delas.
 */

/**
 * Numeração brasileira de aro. A faixa cobre o que se vende em anel adulto; o
 * banco aceita de 1 a 40, então alargar aqui não exige migration.
 */
export const TAMANHOS_DE_ARO: number[] = Array.from({ length: 27 }, (_, i) => i + 8);

/** O valor do `<select>`: número, "nao-sei" ou "" (ainda não escolhido). */
export type EscolhaDeAro = string;

export const NAO_SEI = "nao-sei";

/** "" -> undefined (falta escolher) · "nao-sei" -> null · "18" -> 18 */
export function lerEscolha(valor: EscolhaDeAro): number | null | undefined {
  if (valor === "") return undefined;
  if (valor === NAO_SEI) return null;
  const numero = Number(valor);
  return Number.isInteger(numero) ? numero : undefined;
}

export function paraEscolha(tamanho: number | null): EscolhaDeAro {
  return tamanho === null ? NAO_SEI : String(tamanho);
}

/** "Aro 18", "Aros 16 e 20", "Aro a combinar" — ou `null` para peça sem aro. */
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
