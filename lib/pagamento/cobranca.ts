import { urlDeNotificacao, urlDeRetorno } from "@/lib/pagamento/assinatura-url";
import { rpcComSegredo, vincularCheckout } from "@/lib/pagamento/banco";
import { STATUS_EM_ANDAMENTO } from "@/lib/pagamento/estados";
import { urlPublicaDoSite } from "@/lib/pagamento/config";
import { ErroDoPagBank, criarCheckout, inativarCheckout, type EntradaDoCheckout } from "@/lib/pagamento/pagbank";
import { reconcileOrder, registrarAlerta, type ContextoDoPedido } from "@/lib/pagamento/reconciliar";

type EntradaDaCobranca = Omit<EntradaDoCheckout, "urlRetorno" | "urlNotificacao"> & { urlBase: string };

/**
 * Abre a cobrança de um pedido e devolve o link de pagamento.
 *
 * O vínculo é gravado ANTES de a pessoa ir pagar. Se não der para gravar, o
 * checkout é inativado e a pessoa não é mandada para lá: um pagamento sem vínculo
 * é justamente o que este arquivo existe para impedir.
 */
export async function abrirCobranca({ urlBase, ...e }: EntradaDaCobranca): Promise<string> {
  const webhook = process.env.PAGBANK_WEBHOOK_URL ?? `${urlBase}/api/pagbank/webhook`;

  const { checkoutId, payUrl } = await criarCheckout({
    ...e,
    urlRetorno: urlDeRetorno(urlBase, e.numero, e.pedidoId),
    // O PagBank só avisa endereço HTTPS público; no localhost, sem aviso.
    urlNotificacao: webhook.startsWith("https://") ? urlDeNotificacao(webhook, e.numero) : null,
  }).catch(async (erro) => {
    // Token recusado ou conta sem liberação derrubam toda venda: a equipe precisa
    // saber na primeira. Uma vez por dia, para não virar ruído.
    if (erro instanceof ErroDoPagBank && (erro.http === 401 || erro.http === 403)) {
      await registrarAlerta(
        null,
        `alerta:checkout-${erro.http}:${new Date().toISOString().slice(0, 10)}`,
        `O PagBank recusou a abertura de cobrança (${erro.http}). Os clientes não conseguem pagar online: veja o Status da integração, ou desligue PAGBANK_ENABLED.`,
        urlPublicaDoSite()
      ).catch((falha) => console.error("[pagamento] alerta não gravado:", falha));
    }
    throw erro;
  });

  try {
    await vincularCheckout({ pedidoId: e.pedidoId, checkoutId, payUrl, expiraEm: e.expiraEm });
  } catch (erro) {
    await inativarCheckout(checkoutId).catch((falha) =>
      console.error(`[pagamento] checkout ${checkoutId} sem vínculo e não inativado:`, falha)
    );
    throw erro;
  }

  return payUrl;
}

export type RespostaDoPagarDeNovo = { url: string } | { bloqueado: string };

/**
 * "Pagar agora" de um pedido que já existe, sem nunca permitir pagar duas vezes:
 *
 *   - antes de tudo, confere com o PagBank: pode já estar pago;
 *   - cartão em análise: bloqueado, a resposta ainda vai chegar;
 *   - checkout ativo: reabre o mesmo link, sem cobrança nova;
 *   - recusado com checkout ativo: inativa o anterior e abre outro.
 *
 * Duas abas ao mesmo tempo esbarram no índice de um checkout ativo por pedido, e a
 * segunda recebe o link da primeira.
 */
export async function pagarDeNovo(e: EntradaDaCobranca): Promise<RespostaDoPagarDeNovo> {
  await reconcileOrder(e.pedidoId, "pagina");

  const ler = () => rpcComSegredo<ContextoDoPedido | null>("pagbank_contexto_pedido", { p_pedido_id: e.pedidoId });
  const pedido = await ler();
  if (!pedido) return { bloqueado: "Pedido não encontrado." };

  if (pedido.status !== "aguardando_pagamento") {
    return { bloqueado: "Este pedido não está mais aguardando pagamento." };
  }
  if (pedido.cobrancas.some((c) => (STATUS_EM_ANDAMENTO as readonly string[]).includes(c.status))) {
    return { bloqueado: "O pagamento está em análise. Assim que o PagBank responder, esta página mostra o resultado." };
  }

  const ativo = pedido.checkouts.find((c) => c.status === "ACTIVE");
  if (ativo && pedido.estado !== "declined") return { url: ativo.payUrl };

  if (ativo) {
    await inativarCheckout(ativo.checkoutId);
    await rpcComSegredo("pagbank_atualizar_checkout", { p_checkout_id: ativo.checkoutId, p_status: "INACTIVE" });
  }

  try {
    return { url: await abrirCobranca(e) };
  } catch (erro) {
    if ((erro as { codigo?: string }).codigo !== "23505") throw erro;
    const atual = await ler();
    const venceu = atual?.checkouts.find((c) => c.status === "ACTIVE");
    if (venceu) return { url: venceu.payUrl };
    throw erro;
  }
}
