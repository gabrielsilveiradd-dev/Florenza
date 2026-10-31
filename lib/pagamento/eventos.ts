/**
 * O QUE CHEGOU NO WEBHOOK: CLASSIFICAÇÃO PELA FORMA DO CORPO.
 *
 * Nada aqui é tomado como verdade sobre dinheiro: o parser só diz de que tipo é o
 * aviso e qual recurso consultar. Status e valor vêm da API.
 *
 * O que não se reconhece vira `unknown`, que gera alerta para a equipe. Nunca é
 * descartado em silêncio.
 */

export type EventoClassificado =
  /** reference/webhooks-checkout: objeto `ORDE_...` no corpo. */
  | { tipo: "pagamento" | "estorno"; recursoId: string }
  | { tipo: "unknown"; recursoId: string | null; motivo: string };

function reembolsouAlgo(cobrancas: unknown): boolean {
  if (!Array.isArray(cobrancas)) return false;
  return cobrancas.some((c) => Number(c?.amount?.summary?.refunded ?? 0) > 0);
}

export function classificarEvento(corpoCru: string): EventoClassificado {
  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return { tipo: "unknown", recursoId: null, motivo: "corpo fora do formato JSON" };
  }

  if (!corpo || typeof corpo !== "object") {
    return { tipo: "unknown", recursoId: null, motivo: "corpo sem objeto" };
  }

  const objeto = corpo as Record<string, unknown>;
  const id = typeof objeto.id === "string" ? objeto.id : null;

  if (id?.startsWith("ORDE_")) {
    return { tipo: reembolsouAlgo(objeto.charges) ? "estorno" : "pagamento", recursoId: id };
  }

  return { tipo: "unknown", recursoId: id, motivo: `corpo sem tipo reconhecido${id ? ` (id ${id})` : ""}` };
}
