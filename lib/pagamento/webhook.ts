import { createHash } from "node:crypto";
import { pedidoDaNotificacao } from "@/lib/pagamento/assinatura-url";
import { rpcComSegredo } from "@/lib/pagamento/banco";
import { urlPublicaDoSite } from "@/lib/pagamento/config";
import { classificarEvento } from "@/lib/pagamento/eventos";
import { assinaturaDoWebhook, buscarOrder } from "@/lib/pagamento/pagbank";
import { reconcileOrder, registrarAlerta } from "@/lib/pagamento/reconciliar";

/**
 * O AVISO DO PAGBANK, DA PORTA ATÉ A RECONCILIAÇÃO.
 *
 * Em duas partes, de propósito: `receberAviso` confere a autenticidade e grava o
 * corpo cru, e é só isso que segura a resposta; `processarEvento` roda depois.
 * Se ele falhar, o evento fica sem `processado_em` e o job tenta de novo.
 */

export type AvisoRecebido = {
  corpoCru: string;
  cabecalhos: Headers;
  /** `p` e `s` da URL de aviso. */
  numeroAssinado: { p: string | null; s: string | null };
};

export type DependenciasDoWebhook = {
  registrarEvento: (e: {
    chave: string;
    tipo: string;
    recursoId: string | null;
    assinatura: string;
    corpo: string;
    detalhe: string | null;
  }) => Promise<{ eventoId: string; novo: boolean; processado: boolean }>;
  concluirEvento: (
    eventoId: string,
    e: { pedidoId?: string | null; erro?: string | null; alerta?: string | null; tipo?: string | null }
  ) => Promise<void>;
  acharPedido: (e: { numero?: number | null; checkoutId?: string | null; orderId?: string | null }) => Promise<string | null>;
  pedidoDaApi: (orderId: string) => Promise<string | null>;
  vincularOrder: (pedidoId: string, orderId: string, checkoutId: string | null) => Promise<void>;
  reconciliar: (pedidoId: string) => Promise<unknown>;
  alertar: (pedidoId: string | null, chave: string, alerta: string) => Promise<void>;
};

export type ResultadoDoAviso =
  | { http: 401; corpo: { erro: string } }
  | { http: 200; corpo: { recebido: true; repetido: boolean }; depois?: () => Promise<void> };

function chaveDoCorpo(corpoCru: string): string {
  return `webhook:${createHash("sha256").update(corpoCru).digest("hex")}`;
}

export async function receberAviso(
  aviso: AvisoRecebido,
  dep: DependenciasDoWebhook = dependenciasReais()
): Promise<ResultadoDoAviso> {
  const numero = pedidoDaNotificacao(aviso.numeroAssinado.p, aviso.numeroAssinado.s);
  const assinatura = assinaturaDoWebhook(aviso.cabecalhos, aviso.corpoCru);

  // Assinatura errada é recusada mesmo com a URL certa. Sem assinatura nenhuma, a
  // URL assinada por nós é a prova; sem nenhuma das duas, nada é gravado: um
  // corpo qualquer não pode encher a tabela.
  if (assinatura === "invalida" || (assinatura === "ausente" && numero === null)) {
    return { http: 401, corpo: { erro: "aviso sem autenticidade" } };
  }

  const classificado = classificarEvento(aviso.corpoCru);
  const { eventoId, novo, processado } = await dep.registrarEvento({
    chave: chaveDoCorpo(aviso.corpoCru),
    tipo: classificado.tipo,
    recursoId: classificado.recursoId,
    assinatura: assinatura === "valida" ? "token" : "url",
    corpo: aviso.corpoCru,
    detalhe: classificado.tipo === "unknown" ? classificado.motivo : null,
  });

  // Mesmo aviso de novo, já tratado: nada muda.
  if (!novo && processado) return { http: 200, corpo: { recebido: true, repetido: true } };

  return {
    http: 200,
    corpo: { recebido: true, repetido: !novo },
    depois: () =>
      processarEvento(
        {
          eventoId,
          corpoCru: aviso.corpoCru,
          numero,
          checkoutId: checkoutDoCabecalho(aviso.cabecalhos),
        },
        dep
      ),
  };
}

/** reference/webhooks: `x-product-origin` e `x-product-id` (ORDE_... ou CHEC_...). */
function checkoutDoCabecalho(cabecalhos: Headers): string | null {
  const id = cabecalhos.get("x-product-id");
  return id?.startsWith("CHEC_") ? id : null;
}

export async function processarEvento(
  e: { eventoId: string; corpoCru: string; numero: number | null; checkoutId: string | null },
  dep: DependenciasDoWebhook = dependenciasReais()
): Promise<void> {
  try {
    const classificado = classificarEvento(e.corpoCru);

    if (classificado.tipo === "unknown") {
      const alerta = `Aviso do PagBank de um tipo desconhecido: ${classificado.motivo}.`;
      await dep.alertar(null, `alerta:evento:${e.eventoId}`, alerta);
      await dep.concluirEvento(e.eventoId, { alerta });
      return;
    }

    const orderId = classificado.recursoId;

    // A ordem é de confiança: o que já está salvo, o que nós assinamos, e por
    // último o que a API diz. Cabeçalho não é assinado, mas só serve para achar:
    // a reconciliação confere a order contra o pedido.
    const pedidoId =
      (await dep.acharPedido({ orderId })) ??
      (await dep.acharPedido({ checkoutId: e.checkoutId })) ??
      (await dep.acharPedido({ numero: e.numero })) ??
      (await dep.pedidoDaApi(orderId));

    if (!pedidoId) {
      const alerta = `O PagBank avisou da order ${orderId}, e nenhum pedido do site corresponde a ela.`;
      await dep.alertar(null, `alerta:order-sem-pedido:${orderId}`, alerta);
      await dep.concluirEvento(e.eventoId, { alerta });
      return;
    }

    await dep.vincularOrder(pedidoId, orderId, e.checkoutId);
    await dep.reconciliar(pedidoId);
    await dep.concluirEvento(e.eventoId, { pedidoId });
  } catch (erro) {
    console.error(`[webhook] evento ${e.eventoId}:`, erro);
    await dep
      .concluirEvento(e.eventoId, { erro: erro instanceof Error ? erro.message : String(erro) })
      .catch((falha) => console.error(`[webhook] evento ${e.eventoId} não marcado:`, falha));
  }
}

function primeira<T>(dados: T | T[] | null): T | null {
  return Array.isArray(dados) ? dados[0] ?? null : dados;
}

export function dependenciasReais(urlBase = urlPublicaDoSite()): DependenciasDoWebhook {
  return {
    registrarEvento: async (e) => {
      const dados = await rpcComSegredo<
        { evento_id: string; novo: boolean; processado: boolean } | Array<{ evento_id: string; novo: boolean; processado: boolean }>
      >("pagbank_registrar_evento", {
        p_chave: e.chave,
        p_origem: "webhook",
        p_tipo: e.tipo,
        p_recurso_id: e.recursoId,
        p_assinatura: e.assinatura,
        p_corpo: e.corpo,
        p_detalhe: e.detalhe,
      });
      const linha = primeira(dados);
      if (!linha) throw new Error("pagbank_registrar_evento não devolveu nada.");
      return { eventoId: linha.evento_id, novo: linha.novo, processado: linha.processado };
    },
    concluirEvento: (eventoId, e) =>
      rpcComSegredo("pagbank_concluir_evento", {
        p_evento_id: eventoId,
        p_pedido_id: e.pedidoId ?? null,
        p_tipo: e.tipo ?? null,
        p_erro: e.erro ?? null,
        p_alerta: e.alerta ?? null,
      }),
    acharPedido: async ({ numero, checkoutId, orderId }) => {
      if (!numero && !checkoutId && !orderId) return null;
      return rpcComSegredo<string | null>("pagbank_achar_pedido", {
        p_numero: numero ?? null,
        p_checkout_id: checkoutId ?? null,
        p_order_id: orderId ?? null,
      });
    },
    pedidoDaApi: async (orderId) => (await buscarOrder(orderId)).pedidoId,
    vincularOrder: (pedidoId, orderId, checkoutId) =>
      rpcComSegredo("pagbank_vincular_order", { p_pedido_id: pedidoId, p_order_id: orderId, p_checkout_id: checkoutId }),
    reconciliar: (pedidoId) => reconcileOrder(pedidoId, "webhook"),
    alertar: (pedidoId, chave, alerta) => registrarAlerta(pedidoId, chave, alerta, urlBase),
  };
}
