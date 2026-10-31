import { avisarAlertaDePagamento, avisarPagamentoConfirmado, type PagamentoParaAviso } from "@/lib/avisos";
import { rpcComSegredo } from "@/lib/pagamento/banco";
import { urlPublicaDoSite } from "@/lib/pagamento/config";
import { STATUS_EM_ANDAMENTO, decidirEstado, type EstadoDePagamento } from "@/lib/pagamento/estados";
import {
  buscarOrder, consultarCheckout, inativarCheckout, type ChecagemDoCheckout, type OrderDoPagBank,
} from "@/lib/pagamento/pagbank";

/**
 * A RECONCILIAÇÃO — o único lugar que muda o estado de um pagamento.
 *
 * Webhook, página do pedido, job e o botão do painel chamam `reconcileOrder`, que
 * pergunta ao PagBank pelo id salvo e leva o pedido até onde a resposta manda. A
 * função pode rodar quantas vezes for: a mesma resposta dá o mesmo estado.
 *
 * NUNCA EXPIRA NA DÚVIDA. Só expira com reserva vencida, todo checkout vencido e
 * sem pagamento na resposta. Falha de API ou resposta ambígua deixa o pedido como
 * está e gera alerta — segurar a peça custa menos que cancelar uma venda paga.
 */

/** O PagBank pode demorar a virar o status do checkout depois do vencimento. */
const CARENCIA_PARA_EXPIRAR_MS = 10 * 60 * 1000;

export type ContextoDoPedido = {
  id: string;
  numero: number;
  status: string;
  estado: EstadoDePagamento | null;
  totalCentavos: number;
  estornadoCentavos: number;
  expiraEm: string | null;
  checkouts: Array<{ checkoutId: string; status: string; payUrl: string; expiraEm: string | null }>;
  orders: string[];
  cobrancas: Array<{ id: string; status: string }>;
};

export type DependenciasDaReconciliacao = {
  contexto: (pedidoId: string) => Promise<ContextoDoPedido | null>;
  consultarCheckout: (checkoutId: string) => Promise<ChecagemDoCheckout>;
  buscarOrder: (orderId: string) => Promise<OrderDoPagBank>;
  inativarCheckout: (checkoutId: string) => Promise<void>;
  atualizarCheckout: (checkoutId: string, status: string) => Promise<void>;
  vincularOrder: (pedidoId: string, orderId: string, checkoutId: string | null) => Promise<void>;
  registrarCobranca: (
    pedidoId: string,
    orderId: string,
    c: OrderDoPagBank["cobrancas"][number]
  ) => Promise<{ promovido: boolean; pendencia: string | null; aviso: PagamentoParaAviso }>;
  aplicarEstado: (
    pedidoId: string,
    estado: EstadoDePagamento,
    estornado: number,
    origem: OrigemDaReconciliacao
  ) => Promise<{ mudou: boolean; rejeitada: boolean; anterior: string | null }>;
  expirar: (pedidoId: string) => Promise<boolean>;
  alertar: (pedidoId: string | null, chave: string, alerta: string) => Promise<void>;
  avisarPago: (aviso: PagamentoParaAviso) => Promise<void>;
  agora: () => Date;
};

export type OrigemDaReconciliacao = "webhook" | "job" | "pagina" | "painel";

export type ResultadoDaReconciliacao = {
  pedidoId: string;
  estado: EstadoDePagamento | null;
  mudou: boolean;
  expirou: boolean;
  /** `false`: alguma consulta falhou ou não respondeu o que se precisava saber. */
  verificado: boolean;
};

export async function reconcileOrder(
  pedidoId: string,
  origem: OrigemDaReconciliacao,
  dep: DependenciasDaReconciliacao = dependenciasReais()
): Promise<ResultadoDaReconciliacao | null> {
  const pedido = await dep.contexto(pedidoId);
  if (!pedido) return null;

  let verificado = true;
  let provaDeSemPagamento = pedido.checkouts.length > 0;
  const orders = new Map<string, string | null>(pedido.orders.map((o) => [o, null]));

  // 1) O que cada checkout gerou. Falhar aqui não impede de olhar as orders já conhecidas.
  const checkoutsVivos: string[] = [];
  for (const checkout of pedido.checkouts) {
    try {
      const checagem = await dep.consultarCheckout(checkout.checkoutId);
      if (checagem.status && checagem.status !== checkout.status) {
        await dep.atualizarCheckout(checkout.checkoutId, checagem.status);
      }
      if (checagem.status === "ACTIVE") checkoutsVivos.push(checkout.checkoutId);
      if (!checagem.conheceOrders) provaDeSemPagamento = false;
      for (const orderId of checagem.orderIds) {
        if (!orders.has(orderId)) orders.set(orderId, checkout.checkoutId);
        else if (orders.get(orderId) === null) orders.set(orderId, checkout.checkoutId);
      }
    } catch (erro) {
      console.error(`[reconciliar] checkout ${checkout.checkoutId}:`, erro);
      verificado = false;
      provaDeSemPagamento = false;
    }
  }

  // 2) O que o PagBank diz de cada order, registrado cobrança a cobrança.
  const cobrancas: OrderDoPagBank["cobrancas"] = [];
  for (const [orderId, checkoutId] of orders) {
    try {
      const order = await dep.buscarOrder(orderId);

      // O id salvo é a chave; o `reference_id` só confere. Divergir é suspeito:
      // o dinheiro não entra neste pedido sem alguém olhar.
      if (order.pedidoId && order.pedidoId !== pedidoId) {
        await dep.alertar(
          pedidoId,
          `alerta:order-de-outro-pedido:${orderId}`,
          `A order ${orderId} está vinculada a este pedido, mas o PagBank a associa a ${order.pedidoId}.`
        );
        verificado = false;
        continue;
      }

      await dep.vincularOrder(pedidoId, orderId, checkoutId);

      for (const cobranca of order.cobrancas) {
        const registro = await dep.registrarCobranca(pedidoId, orderId, cobranca);
        cobrancas.push(cobranca);
        if (registro.promovido) await dep.avisarPago(registro.aviso);
        if (registro.pendencia) {
          await dep.alertar(pedidoId, `alerta:pendencia:${cobranca.id}:${cobranca.status}`, registro.pendencia);
        }
      }
    } catch (erro) {
      console.error(`[reconciliar] order ${orderId}:`, erro);
      verificado = false;
      provaDeSemPagamento = false;
    }
  }

  // 3) O estado a que isso leva.
  const decisao = decidirEstado({
    atual: pedido.estado,
    cobrancas: cobrancas.map((c) => ({
      status: c.status,
      pagoCentavos: c.pagoCentavos,
      estornadoCentavos: c.estornadoCentavos,
    })),
    totalCentavos: pedido.totalCentavos,
  });

  let estado = pedido.estado;
  let mudou = false;
  // Com consulta falhando, as cobranças podem estar pela metade: refletir só o que
  // tem dinheiro, nunca concluir "recusado" por falta de resposta.
  const confiavel = verificado || (decisao.estado !== "declined" && decisao.estado !== "pending");

  if (decisao.estado && confiavel) {
    const aplicado = await dep.aplicarEstado(pedidoId, decisao.estado, decisao.estornadoCentavos, origem);
    if (aplicado.rejeitada) {
      await dep.alertar(
        pedidoId,
        `alerta:transicao:${pedidoId}:${aplicado.anterior}:${decisao.estado}`,
        `O PagBank levaria o pedido de ${aplicado.anterior} para ${decisao.estado}, transição recusada. Conferir.`
      );
    } else {
      estado = decisao.estado;
      mudou = aplicado.mudou;
    }
  }

  // 4) Expirar, só com prova.
  let expirou = false;
  const vencida =
    pedido.expiraEm !== null &&
    new Date(pedido.expiraEm).getTime() + CARENCIA_PARA_EXPIRAR_MS < dep.agora().getTime();
  const semDinheiro = estado === "pending" || estado === "declined" || estado === null;

  if (pedido.status === "aguardando_pagamento" && vencida && semDinheiro && pedido.checkouts.length > 0) {
    if (provaDeSemPagamento && verificado && decisaoSemCobrancaEmAndamento(cobrancas)) {
      // Checkout ainda ativo depois da reserva: fecha a porta antes de expirar,
      // senão a pessoa pagaria uma peça que voltou para a vitrine.
      for (const checkoutId of checkoutsVivos) {
        await dep.inativarCheckout(checkoutId);
        await dep.atualizarCheckout(checkoutId, "INACTIVE");
      }
      expirou = await dep.expirar(pedidoId);
      if (expirou) estado = "expired";
    } else if (!decisaoSemCobrancaEmAndamento(cobrancas)) {
      // Cartão em análise segura a reserva: comportamento esperado, sem alerta.
    } else {
      await dep.alertar(
        pedidoId,
        `alerta:nao-verificavel:${pedidoId}`,
        "A reserva venceu, mas o PagBank não confirmou que este pedido está sem pagamento. O pedido não foi expirado: confira no painel do PagBank."
      );
    }
  }

  return { pedidoId, estado, mudou: mudou || expirou, expirou, verificado };
}

/** Só cartão em análise segura a reserva. O checkout vence junto com ela, e o resto não vira dinheiro depois. */
function decisaoSemCobrancaEmAndamento(cobrancas: OrderDoPagBank["cobrancas"]): boolean {
  return !cobrancas.some((c) => (STATUS_EM_ANDAMENTO as readonly string[]).includes(c.status));
}

/**
 * Reconcilia se ninguém o fez há pouco. O limite mora no banco, então várias abas
 * e o job contam como um só e não multiplicam as consultas ao PagBank.
 */
export async function reconciliarSeLivre(
  pedidoId: string,
  origem: OrigemDaReconciliacao,
  intervaloSegundos: number
): Promise<ResultadoDaReconciliacao | null> {
  const livre = await rpcComSegredo<boolean>("pagbank_reservar_reconciliacao", {
    p_pedido_id: pedidoId,
    p_segundos: intervaloSegundos,
  });
  return livre ? reconcileOrder(pedidoId, origem) : null;
}

/* ---- As dependências de verdade. Os testes trocam tudo isto. ---- */

type LinhaRegistrada = {
  pedido_numero: number;
  pedido_nome: string;
  pedido_email: string | null;
  pedido_telefone: string | null;
  pedido_total_centavos: number;
  promovido: boolean;
  pendencia: string | null;
};

function primeira<T>(dados: T | T[] | null): T | null {
  return Array.isArray(dados) ? dados[0] ?? null : dados;
}

export function dependenciasReais(urlBase = urlPublicaDoSite()): DependenciasDaReconciliacao {
  return {
    contexto: (pedidoId) =>
      rpcComSegredo<ContextoDoPedido | null>("pagbank_contexto_pedido", { p_pedido_id: pedidoId }),
    consultarCheckout,
    buscarOrder,
    inativarCheckout,
    atualizarCheckout: (checkoutId, status) =>
      rpcComSegredo("pagbank_atualizar_checkout", { p_checkout_id: checkoutId, p_status: status }),
    vincularOrder: (pedidoId, orderId, checkoutId) =>
      rpcComSegredo("pagbank_vincular_order", { p_pedido_id: pedidoId, p_order_id: orderId, p_checkout_id: checkoutId }),
    registrarCobranca: async (pedidoId, orderId, c) => {
      const dados = await rpcComSegredo<LinhaRegistrada | LinhaRegistrada[]>("registrar_pagamento", {
        p_pedido_id: pedidoId,
        p_provedor_pagamento_id: c.id,
        p_status: c.status,
        p_valor_centavos: c.valorCentavos,
        p_status_detalhe: c.statusDetalhe,
        p_metodo: c.metodo,
        p_parcelas: c.parcelas,
        p_aprovado_em: c.pagoEm,
        p_estornado_centavos: c.estornadoCentavos,
        p_order_id: orderId,
      });
      const linha = primeira(dados);
      if (!linha) throw new Error(`registrar_pagamento não devolveu nada para a cobrança ${c.id}.`);
      return {
        promovido: linha.promovido,
        pendencia: linha.pendencia,
        aviso: {
          numero: linha.pedido_numero,
          nome: linha.pedido_nome,
          email: linha.pedido_email,
          telefone: linha.pedido_telefone,
          totalCentavos: linha.pedido_total_centavos,
        },
      };
    },
    aplicarEstado: async (pedidoId, estado, estornado, origem) => {
      const dados = await rpcComSegredo<
        { mudou: boolean; rejeitada: boolean; anterior: string | null } | Array<{ mudou: boolean; rejeitada: boolean; anterior: string | null }>
      >("pagbank_aplicar_estado", {
        p_pedido_id: pedidoId,
        p_estado: estado,
        p_estornado: estornado,
        p_origem: origem,
      });
      return primeira(dados) ?? { mudou: false, rejeitada: false, anterior: null };
    },
    expirar: (pedidoId) => rpcComSegredo<boolean>("pagbank_expirar_pedido", { p_pedido_id: pedidoId }),
    alertar: (pedidoId, chave, alerta) => registrarAlerta(pedidoId, chave, alerta, urlBase),
    avisarPago: (aviso) => avisarPagamentoConfirmado(aviso, urlBase),
    agora: () => new Date(),
  };
}

/** Grava o alerta e avisa a equipe uma vez só: a mesma chave não avisa de novo. */
export async function registrarAlerta(
  pedidoId: string | null,
  chave: string,
  alerta: string,
  urlBase: string
): Promise<void> {
  const dados = await rpcComSegredo<{ novo: boolean } | Array<{ novo: boolean }>>("pagbank_registrar_evento", {
    p_chave: chave,
    p_origem: "sistema",
    p_tipo: "alerta",
    p_pedido_id: pedidoId,
    p_alerta: alerta,
    p_processado: true,
  });
  if (primeira(dados)?.novo) await avisarAlertaDePagamento(alerta, urlBase);
}
