import { createHash } from "node:crypto";
import { pedidoDaNotificacao } from "@/lib/pagamento/assinatura-url";
import { rpcComSegredo } from "@/lib/pagamento/banco";
import { urlPublicaDoSite } from "@/lib/pagamento/config";
import { classificarEvento, efeitoDoStatusLegado } from "@/lib/pagamento/eventos";
import {
  assinaturaDoWebhook, buscarOrder, consultarChargeback, consultarNotificacaoLegada, orderDaCobranca,
  type AutenticidadeDoAviso, type ContestacaoDoPagBank, type NotificacaoLegada,
} from "@/lib/pagamento/pagbank";
import { reconcileOrder, registrarAlerta, registrarDisputa } from "@/lib/pagamento/reconciliar";

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
  autenticidade: (cabecalhos: Headers, corpoCru: string) => Promise<AutenticidadeDoAviso>;
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
  orderDaCobranca: (cobrancaId: string) => Promise<string | null>;
  vincularOrder: (pedidoId: string, orderId: string, checkoutId: string | null) => Promise<void>;
  consultarChargeback: (id: string) => Promise<ContestacaoDoPagBank>;
  registrarDisputa: (pedidoId: string | null, c: ContestacaoDoPagBank) => Promise<void>;
  consultarNotificacaoLegada: (codigo: string) => Promise<NotificacaoLegada | null>;
  reconciliar: (pedidoId: string) => Promise<unknown>;
  alertar: (pedidoId: string | null, chave: string, alerta: string) => Promise<void>;
};

export type ResultadoDoAviso =
  | { http: 401; corpo: { erro: string } }
  | { http: 200; corpo: { recebido: true; repetido: boolean }; depois?: () => Promise<void> };

function chaveDoCorpo(corpoCru: string): string {
  return `webhook:${createHash("sha256").update(corpoCru).digest("hex")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reais = (centavos: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);

export async function receberAviso(
  aviso: AvisoRecebido,
  dep: DependenciasDoWebhook = dependenciasReais()
): Promise<ResultadoDoAviso> {
  const numero = pedidoDaNotificacao(aviso.numeroAssinado.p, aviso.numeroAssinado.s);
  const autenticidade = await dep.autenticidade(aviso.cabecalhos, aviso.corpoCru);
  const classificado = classificarEvento(aviso.corpoCru);

  /* Prova de origem, qualquer uma destas:
   *   - assinatura do PagBank que confere;
   *   - a nossa URL assinada, que só o PagBank recebeu. Ela vale mesmo se a
   *     assinatura não bater, porque perder um aviso de pagamento é pior: fica
   *     registrado em `assinatura`, e a homologação tira a dúvida;
   *   - no formulário de pós-transação, que não documenta assinatura: o código
   *     precisa existir na API.
   * Sem nenhuma, nada é gravado: um corpo qualquer não pode encher a tabela. */
  let assinatura: string;
  if (autenticidade === "ecdsa" || autenticidade === "token") {
    assinatura = autenticidade;
  } else if (numero !== null) {
    assinatura = autenticidade === "invalida" ? "url (assinatura não conferiu)" : "url";
  } else if (classificado.tipo === "pos_transacao" && autenticidade === "ausente") {
    const existe = await dep.consultarNotificacaoLegada(classificado.recursoId).catch(() => null);
    if (!existe) return { http: 401, corpo: { erro: "aviso sem autenticidade" } };
    assinatura = "consulta";
  } else {
    return { http: 401, corpo: { erro: "aviso sem autenticidade" } };
  }

  const { eventoId, novo, processado } = await dep.registrarEvento({
    chave: chaveDoCorpo(aviso.corpoCru),
    tipo: classificado.tipo,
    recursoId: classificado.recursoId,
    assinatura,
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

    switch (classificado.recurso) {
      case "order":
        await processarOrder(e, classificado.recursoId, dep);
        return;

      case "cobranca": {
        const orderId = await dep.orderDaCobranca(classificado.recursoId);
        if (orderId) {
          await processarOrder(e, orderId, dep);
          return;
        }
        const alerta = `O PagBank avisou da cobrança ${classificado.recursoId}, e nenhuma order corresponde a ela.`;
        await dep.alertar(null, `alerta:cobranca-sem-order:${classificado.recursoId}`, alerta);
        await dep.concluirEvento(e.eventoId, { alerta });
        return;
      }

      case "chargeback":
        await processarContestacao(e.eventoId, classificado.recursoId, dep);
        return;

      case "notificacao":
        await processarPosTransacao(e.eventoId, classificado.recursoId, dep);
        return;

      default: {
        const alerta = `Aviso do PagBank de um tipo desconhecido: ${classificado.motivo}.`;
        await dep.alertar(null, `alerta:evento:${e.eventoId}`, alerta);
        await dep.concluirEvento(e.eventoId, { alerta });
      }
    }
  } catch (erro) {
    console.error(`[webhook] evento ${e.eventoId}:`, erro);
    await dep
      .concluirEvento(e.eventoId, { erro: erro instanceof Error ? erro.message : String(erro) })
      .catch((falha) => console.error(`[webhook] evento ${e.eventoId} não marcado:`, falha));
  }
}

async function processarOrder(
  e: { eventoId: string; numero: number | null; checkoutId: string | null },
  orderId: string,
  dep: DependenciasDoWebhook
): Promise<void> {
  // A ordem é de confiança: o que já está salvo, o que nós assinamos, e por último
  // o que a API diz. Cabeçalho não é assinado, mas só serve para achar: a
  // reconciliação confere a order contra o pedido.
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
}

async function processarContestacao(eventoId: string, id: string, dep: DependenciasDoWebhook): Promise<void> {
  const contestacao = await dep.consultarChargeback(id);
  const prazo = contestacao.prazo
    ? ` Prazo para responder: ${new Date(contestacao.prazo).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
    : "";

  // O `reference_id` da transação é o único caminho documentado até o pedido, e o
  // exemplo da consulta o traz nulo. Sem ele, o caso não some: fica no alerta, com o
  // que ajuda a equipe a achar o pedido à mão.
  if (!contestacao.pedidoId) {
    await dep.registrarDisputa(null, contestacao);
    const alerta =
      `Contestação ${id} de ${reais(contestacao.valorCentavos)} sem pedido identificado` +
      `${contestacao.cliente ? ` (cliente ${contestacao.cliente})` : ""}.${prazo} Confira no painel do PagBank.`;
    await dep.alertar(null, `alerta:contestacao:${id}:${contestacao.status}`, alerta);
    await dep.concluirEvento(eventoId, { alerta });
    return;
  }

  await dep.registrarDisputa(contestacao.pedidoId, contestacao);
  await dep.alertar(
    contestacao.pedidoId,
    `alerta:contestacao:${id}:${contestacao.status}`,
    `Contestação de ${reais(contestacao.valorCentavos)} (${contestacao.status}).${prazo} Não envie a peça antes de resolver.`
  );
  await dep.reconciliar(contestacao.pedidoId);
  await dep.concluirEvento(eventoId, { pedidoId: contestacao.pedidoId });
}

async function processarPosTransacao(eventoId: string, codigo: string, dep: DependenciasDoWebhook): Promise<void> {
  const notificacao = await dep.consultarNotificacaoLegada(codigo);

  if (!notificacao) {
    const alerta = `Aviso de pós-transação ${codigo} não consultado: configure PAGBANK_LEGACY_API_URL e PAGBANK_EMAIL.`;
    await dep.alertar(null, `alerta:pos-transacao:${codigo}`, alerta);
    await dep.concluirEvento(eventoId, { alerta });
    return;
  }

  const efeito = efeitoDoStatusLegado(notificacao.status);
  if (efeito === "nenhum") {
    await dep.concluirEvento(eventoId, {});
    return;
  }

  const pedidoId = notificacao.referencia && UUID.test(notificacao.referencia) ? notificacao.referencia : null;
  if (efeito === "desconhecido" || !pedidoId) {
    const alerta =
      `Aviso de pós-transação com status ${notificacao.status ?? "vazio"}` +
      `${pedidoId ? "" : ", sem pedido identificado"}` +
      `, transação ${notificacao.codigo ?? codigo}, ${reais(notificacao.valorCentavos)}. Confira no painel do PagBank.`;
    await dep.alertar(pedidoId, `alerta:pos-transacao:${codigo}`, alerta);
    await dep.concluirEvento(eventoId, { alerta, pedidoId });
    return;
  }

  if (efeito === "disputa") {
    await dep.registrarDisputa(pedidoId, {
      id: `LEGADO_${notificacao.codigo ?? codigo}`,
      status: "AWAITING_EVIDENCE",
      valorCentavos: notificacao.valorCentavos,
      prazo: null,
      classificacao: null,
      codigoMotivo: notificacao.status,
      pedidoId,
      cliente: null,
    });
    await dep.alertar(
      pedidoId,
      `alerta:pos-transacao:${codigo}`,
      `Contestação de ${reais(notificacao.valorCentavos)} aberta. Não envie a peça antes de resolver.`
    );
  }

  await dep.reconciliar(pedidoId);
  await dep.concluirEvento(eventoId, { pedidoId, tipo: efeito === "disputa" ? "contestacao" : "estorno" });
}

function primeira<T>(dados: T | T[] | null): T | null {
  return Array.isArray(dados) ? dados[0] ?? null : dados;
}

export function dependenciasReais(urlBase = urlPublicaDoSite()): DependenciasDoWebhook {
  return {
    autenticidade: assinaturaDoWebhook,
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
    orderDaCobranca,
    vincularOrder: (pedidoId, orderId, checkoutId) =>
      rpcComSegredo("pagbank_vincular_order", { p_pedido_id: pedidoId, p_order_id: orderId, p_checkout_id: checkoutId }),
    consultarChargeback,
    registrarDisputa,
    consultarNotificacaoLegada,
    reconciliar: (pedidoId) => reconcileOrder(pedidoId, "webhook"),
    alertar: (pedidoId, chave, alerta) => registrarAlerta(pedidoId, chave, alerta, urlBase),
  };
}
