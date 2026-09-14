import { avisarPagamentoConfirmado } from "@/lib/avisos";
import { buscarPagamento } from "@/lib/pagamento/mercado-pago";
import { createClientePublico } from "@/lib/supabase/publico";

/**
 * Traz o que o Mercado Pago sabe sobre um pagamento para dentro do banco.
 *
 * Dois caminhos chamam isto: o webhook, quando o Mercado Pago avisa, e a página
 * do pedido, quando a pessoa volta do pagamento. Os dois podem chegar juntos, e
 * tudo bem — `registrar_pagamento()` é idempotente.
 *
 * A ordem é a proteção: primeiro BUSCAR o pagamento na API com o token da loja
 * (a verdade), depois registrar. O id que chegou no aviso só diz onde procurar.
 *
 * O cliente é o público, sem sessão, de propósito. O webhook não tem sessão de
 * ninguém, e a página de retorno não deve registrar pagamento "como o cliente":
 * quem autoriza a escrita é o segredo que só o servidor tem, conferido dentro
 * da função.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  | { pedidoNumero: number; pedidoStatus: string; promovido: boolean; pendencia: string | null };

export async function sincronizarPagamento(pagamentoId: string, urlBase: string): Promise<Sincronizacao> {
  const pagamento = await buscarPagamento(pagamentoId);

  // Pagamento de outra origem na mesma conta do Mercado Pago (link avulso,
  // maquininha) não tem pedido deste site para atualizar.
  if (!pagamento.pedidoId || !UUID.test(pagamento.pedidoId)) {
    return { ignorado: `pagamento ${pagamento.id} não pertence a um pedido do site` };
  }

  const { data, error } = await createClientePublico().rpc("registrar_pagamento", {
    p_segredo: process.env.PAGAMENTO_SEGREDO_BANCO,
    p_pedido_id: pagamento.pedidoId,
    p_provedor_pagamento_id: pagamento.id,
    p_status: pagamento.status,
    p_valor_centavos: pagamento.valorCentavos,
    p_status_detalhe: pagamento.statusDetalhe,
    p_metodo: pagamento.metodo,
    p_parcelas: pagamento.parcelas,
    p_aprovado_em: pagamento.aprovadoEm,
  });

  if (error) {
    throw new Error(`registrar_pagamento recusou o pagamento ${pagamento.id}: ${error.message}`);
  }

  const linha = (Array.isArray(data) ? data[0] : data) as LinhaRegistrada | null;
  if (!linha) throw new Error(`registrar_pagamento não devolveu nada para o pagamento ${pagamento.id}.`);

  if (linha.pendencia) {
    console.warn(`[pagamentos] pedido #${linha.pedido_numero}: ${linha.pendencia}`);
  }

  if (linha.promovido) {
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

  return {
    pedidoNumero: linha.pedido_numero,
    pedidoStatus: linha.pedido_status,
    promovido: linha.promovido,
    pendencia: linha.pendencia,
  };
}
