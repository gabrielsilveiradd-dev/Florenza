import { rpcComSegredo } from "@/lib/pagamento/banco";
import { cancelarCobranca } from "@/lib/pagamento/pagbank";
import { reconcileOrder } from "@/lib/pagamento/reconciliar";

/**
 * O estorno pedido pelo painel.
 *
 * Grava o pedido de estorno ANTES de chamar o PagBank, com quem pediu: se o servidor
 * cair no meio, sobra o registro, e o índice do banco impede um segundo estorno.
 * Sem resposta conclusiva vira 'incerto', sem reenvio: reenviar poderia devolver o
 * dinheiro duas vezes, e a documentação não cita chave de idempotência aqui.
 */
export type ResultadoDoPedidoDeEstorno =
  | { ok: true; mensagem: string }
  | { ok: false; mensagem: string; http: number };

export async function estornarPeloPainel(e: {
  pedidoId: string;
  cobrancaId: string;
  valorCentavos: number;
  devolverEstoque: boolean | null;
  motivo: string | null;
  admin: { id: string; email: string | null };
}): Promise<ResultadoDoPedidoDeEstorno> {
  let estornoId: string;
  try {
    estornoId = await rpcComSegredo<string>("pagbank_iniciar_estorno", {
      p_pedido_id: e.pedidoId,
      p_cobranca_id: e.cobrancaId,
      p_valor: e.valorCentavos,
      p_devolver: e.devolverEstoque,
      p_motivo: e.motivo,
      p_admin_id: e.admin.id,
      p_admin_email: e.admin.email,
    });
  } catch (erro) {
    // P0001: mensagens escritas na própria função, já para gente ler.
    const { codigo, message } = erro as Error & { codigo?: string };
    if (codigo === "P0001") return { ok: false, http: 409, mensagem: message.replace(/^[^:]+:\s*/, "") };
    throw erro;
  }

  const resposta = await cancelarCobranca(e.cobrancaId, e.valorCentavos);
  const concluir = (status: string, texto: string) =>
    rpcComSegredo("pagbank_concluir_estorno", { p_id: estornoId, p_status: status, p_resposta: texto });

  if (resposta.resultado === "recusado") {
    await concluir("falhou", `HTTP ${resposta.http}: ${resposta.mensagem}`);
    return { ok: false, http: 502, mensagem: `O PagBank recusou o estorno (HTTP ${resposta.http}). Nada foi devolvido.` };
  }

  if (resposta.resultado === "incerto") {
    await concluir("incerto", `Sem resposta conclusiva: ${resposta.mensagem}`);
    return {
      ok: false,
      http: 504,
      mensagem:
        "O PagBank não respondeu de forma conclusiva. Não repita o estorno: o site confere nos próximos minutos e mostra o resultado aqui.",
    };
  }

  await concluir("concluido", `HTTP ${resposta.http}`);
  await reconcileOrder(e.pedidoId, "painel");
  return { ok: true, mensagem: "Estorno feito." };
}
