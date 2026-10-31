import { avisarPagamentoConfirmado } from "@/lib/avisos";
import { buscarOrder } from "@/lib/pagamento/pagbank";
import { createClientePublico } from "@/lib/supabase/publico";

/**
 * Traz o que o PagBank sabe sobre um pedido dele para dentro do banco.
 *
 * Quem chama é o webhook, quando o PagBank avisa. O aviso pode se repetir, e
 * tudo bem — `registrar_pagamento()` é idempotente.
 *
 * A ordem é a proteção: primeiro BUSCAR na API com o token da loja (a verdade),
 * depois registrar. O id que chegou no aviso só diz onde procurar.
 *
 * Uma order pode ter várias cobranças (cartão recusado, depois Pix), e cada uma
 * vira uma linha em `pagamentos`.
 *
 * O cliente é o público, sem sessão, de propósito. O webhook não tem sessão de
 * ninguém: quem autoriza a escrita é o segredo que só o servidor tem, conferido
 * dentro da função.
 */

type LinhaRegistrada = {
  pedido_numero: number;
  pedido_status: string;
  pedido_nome: string;
  pedido_email: string | null;
  pedido_telefone: string | null;
  pedido_total_centavos: number;
  promovido: boolean;
  pendencia: string | null;
};

export type Sincronizacao =
  | { ignorado: string }
  | { pedidoNumero: number; pedidoStatus: string; promovido: boolean };

export async function sincronizarPagamento(orderId: string, urlBase: string): Promise<Sincronizacao> {
  const order = await buscarOrder(orderId);

  if (!order.pedidoId) {
    return { ignorado: `order ${order.id} não pertence a um pedido do site` };
  }
  if (order.cobrancas.length === 0) {
    return { ignorado: `order ${order.id} ainda não tem cobrança` };
  }

  let ultima: LinhaRegistrada | null = null;
  let promovido = false;

  for (const cobranca of order.cobrancas) {
    const { data, error } = await createClientePublico().rpc("registrar_pagamento", {
      p_segredo: process.env.PAGAMENTO_SEGREDO_BANCO,
      p_pedido_id: order.pedidoId,
      p_provedor_pagamento_id: cobranca.id,
      p_status: cobranca.status,
      p_valor_centavos: cobranca.valorCentavos,
      p_status_detalhe: cobranca.statusDetalhe,
      p_metodo: cobranca.metodo,
      p_parcelas: cobranca.parcelas,
      p_aprovado_em: cobranca.pagoEm,
    });

    if (error) {
      throw new Error(`registrar_pagamento recusou a cobrança ${cobranca.id}: ${error.message}`);
    }

    const linha = (Array.isArray(data) ? data[0] : data) as LinhaRegistrada | null;
    if (!linha) throw new Error(`registrar_pagamento não devolveu nada para a cobrança ${cobranca.id}.`);

    if (linha.pendencia) {
      console.warn(`[pagamentos] pedido #${linha.pedido_numero}: ${linha.pendencia}`);
    }

    if (linha.promovido) {
      promovido = true;
      await avisarPagamentoConfirmado(
        {
          numero: linha.pedido_numero,
          nome: linha.pedido_nome,
          email: linha.pedido_email,
          telefone: linha.pedido_telefone,
          totalCentavos: linha.pedido_total_centavos,
        },
        urlBase
      );
    }

    ultima = linha;
  }

  return {
    pedidoNumero: ultima!.pedido_numero,
    pedidoStatus: ultima!.pedido_status,
    promovido,
  };
}
