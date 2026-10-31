import { urlDeNotificacao, urlDeRetorno } from "@/lib/pagamento/assinatura-url";
import { vincularCheckout } from "@/lib/pagamento/banco";
import { criarCheckout, inativarCheckout, type EntradaDoCheckout } from "@/lib/pagamento/pagbank";

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
