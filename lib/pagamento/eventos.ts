/**
 * O QUE CHEGOU NO WEBHOOK: UM PARSER POR TIPO, E "UNKNOWN" PARA O RESTO.
 *
 * Nada aqui é tomado como verdade sobre dinheiro: o parser só diz de que tipo é o
 * aviso e qual recurso consultar. Status e valor vêm da API.
 *
 * O que não se reconhece vira `unknown`, que gera alerta para a equipe. Nunca é
 * descartado em silêncio.
 */

export type EventoClassificado =
  /** reference/webhooks-checkout: objeto `ORDE_...` no corpo. */
  | { tipo: "pagamento" | "estorno"; recurso: "order"; recursoId: string }
  /**
   * reference/criar-preferencia: evento CANCELLATION.
   * SUPOSIÇÃO – validar no sandbox: a documentação não mostra o corpo; assume-se o
   * id da cobrança (`CHAR_...`). A order sai de GET /orders?charge_id=.
   */
  | { tipo: "estorno"; recurso: "cobranca"; recursoId: string }
  /**
   * docs/chargeback e reference/objeto-chargeback: id `CBKS_...`, evento CHARGEBACK.
   * SUPOSIÇÃO – validar no sandbox: a documentação não mostra o corpo do aviso;
   * assume-se o objeto chargeback, direto ou dentro de `data`/`chargeback`.
   */
  | { tipo: "contestacao"; recurso: "chargeback"; recursoId: string }
  /**
   * reference/webhooks: eventos de pós-transação vêm como formulário, com
   * `notificationCode` e `notificationType`.
   */
  | { tipo: "pos_transacao"; recurso: "notificacao"; recursoId: string }
  | { tipo: "unknown"; recurso: null; recursoId: string | null; motivo: string };

function reembolsouAlgo(cobrancas: unknown): boolean {
  if (!Array.isArray(cobrancas)) return false;
  return cobrancas.some((c) => Number(c?.amount?.summary?.refunded ?? 0) > 0);
}

function classificarFormulario(corpoCru: string): EventoClassificado | null {
  const campos = new URLSearchParams(corpoCru);
  const codigo = campos.get("notificationCode");
  if (!codigo) return null;
  // reference/webhooks: até 36 caracteres. O código entra na URL da consulta.
  if (!/^[A-Za-z0-9-]{1,36}$/.test(codigo)) {
    return { tipo: "unknown", recurso: null, recursoId: null, motivo: "notificationCode fora do formato" };
  }
  return { tipo: "pos_transacao", recurso: "notificacao", recursoId: codigo };
}

export function classificarEvento(corpoCru: string): EventoClassificado {
  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return (
      classificarFormulario(corpoCru) ?? {
        tipo: "unknown",
        recurso: null,
        recursoId: null,
        motivo: "corpo fora do formato JSON",
      }
    );
  }

  if (!corpo || typeof corpo !== "object") {
    return { tipo: "unknown", recurso: null, recursoId: null, motivo: "corpo sem objeto" };
  }

  const raiz = corpo as Record<string, unknown>;
  const objeto = (
    [raiz, raiz.data, raiz.chargeback].find((o) => {
      const id = (o as { id?: unknown } | null | undefined)?.id;
      return typeof id === "string" && /^(ORDE|CHAR|CBKS)_/.test(id);
    }) ?? raiz
  ) as Record<string, unknown>;
  const id = typeof objeto.id === "string" ? objeto.id : null;

  if (id?.startsWith("ORDE_")) {
    return { tipo: reembolsouAlgo(objeto.charges) ? "estorno" : "pagamento", recurso: "order", recursoId: id };
  }
  if (id?.startsWith("CBKS_")) return { tipo: "contestacao", recurso: "chargeback", recursoId: id };
  if (id?.startsWith("CHAR_")) return { tipo: "estorno", recurso: "cobranca", recursoId: id };

  return {
    tipo: "unknown",
    recurso: null,
    recursoId: id,
    motivo: `corpo sem tipo reconhecido${id ? ` (id ${id})` : ""}`,
  };
}

/**
 * O que os status numéricos da consulta antiga querem dizer.
 *
 * SUPOSIÇÃO – validar no sandbox: reference/webhooks mostra `<status>` numérico sem
 * tabela, e v1.0/docs/api-notificacao-funcionalidades lista os nomes nesta ordem
 * (Aguardando pagamento, Em análise, Paga, Disponível, Em disputa, Devolvida,
 * Cancelada, Debitado, Retenção temporária). Assume-se a numeração de 1 a 9.
 */
export function efeitoDoStatusLegado(status: string | null): "disputa" | "estorno" | "nenhum" | "desconhecido" {
  switch (status) {
    case "5":
    case "9":
      return "disputa";
    case "6":
    case "7":
    case "8":
      return "estorno";
    case "1":
    case "2":
    case "3":
    case "4":
      return "nenhum";
    default:
      return "desconhecido";
  }
}
