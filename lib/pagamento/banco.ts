import { createClientePublico } from "@/lib/supabase/publico";

/**
 * AS FUNÇÕES DE PAGAMENTO NO BANCO — só servidor.
 *
 * O cliente é o público, sem sessão, de propósito: webhook e job não têm sessão
 * de ninguém. Quem autoriza a escrita é o segredo, conferido dentro de cada
 * função. Nenhuma service-role key entra no projeto.
 */

export async function rpcComSegredo<T>(funcao: string, argumentos: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClientePublico().rpc(funcao, {
    p_segredo: process.env.PAGAMENTO_SEGREDO_BANCO,
    ...argumentos,
  });
  if (error) {
    const erro = new Error(`${funcao}: ${error.message}`) as Error & { codigo?: string };
    erro.codigo = error.code;
    throw erro;
  }
  return data as T;
}

export function vincularCheckout(e: {
  pedidoId: string;
  checkoutId: string;
  payUrl: string;
  expiraEm: string | null;
}): Promise<void> {
  return rpcComSegredo("pagbank_vincular_checkout", {
    p_pedido_id: e.pedidoId,
    p_checkout_id: e.checkoutId,
    p_pay_url: e.payUrl,
    p_expira_em: e.expiraEm,
  });
}
