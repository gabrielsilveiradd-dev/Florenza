import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * O PEDIDO NAS URLS QUE NÓS CONTROLAMOS, ASSINADO.
 *
 * Volta do pagamento e aviso do webhook carregam o nosso identificador, com HMAC
 * feito com um segredo só nosso. Assim ninguém troca o pedido da URL, e não
 * dependemos de o PagBank devolver o `reference_id`.
 *
 * DUAS FORMAS, por causa de um limite documentado: `payment_notification_urls`
 * aceita no máximo 100 caracteres (reference/criar-checkout), e `redirect_url`
 * aceita 255. Na notificação não cabe uuid mais HMAC inteiro, então vão o número
 * do pedido e o HMAC cortado em 22 caracteres (132 bits, ainda infalsificável).
 */

const TAMANHO_MAXIMO_DA_NOTIFICACAO = 100;
const TAMANHO_DA_ASSINATURA_CURTA = 22;

function assinar(texto: string): string {
  const segredo = process.env.PAGBANK_URL_SECRET;
  if (!segredo) throw new Error("PAGBANK_URL_SECRET não está configurado.");
  return createHmac("sha256", segredo).update(texto).digest("base64url");
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function urlDeRetorno(urlBase: string, numero: number, pedidoId: string): string {
  return `${urlBase}/conta/pedido/${numero}?pedido=${pedidoId}&sig=${assinar(`retorno:${pedidoId}`)}`;
}

export function retornoValido(pedidoId: string | undefined, sig: string | undefined): boolean {
  if (!pedidoId || !sig) return false;
  return iguais(sig, assinar(`retorno:${pedidoId}`));
}

/**
 * O endereço do aviso, com o pedido. `null` se nem o endereço puro couber no
 * limite do PagBank; se só o pedido não couber (domínio muito longo), vai sem
 * ele, e o vínculo fica pelo id do checkout e pelo `reference_id`.
 */
export function urlDeNotificacao(webhookUrl: string, numero: number): string | null {
  const assinatura = assinar(`aviso:${numero}`).slice(0, TAMANHO_DA_ASSINATURA_CURTA);
  const completa = `${webhookUrl}?p=${numero}&s=${assinatura}`;
  if (completa.length <= TAMANHO_MAXIMO_DA_NOTIFICACAO) return completa;
  return webhookUrl.length <= TAMANHO_MAXIMO_DA_NOTIFICACAO ? webhookUrl : null;
}

/** O número do pedido que veio assinado na URL do aviso, ou `null`. */
export function pedidoDaNotificacao(p: string | null, s: string | null): number | null {
  if (!p || !s || !/^\d{1,18}$/.test(p)) return null;
  const esperado = assinar(`aviso:${p}`).slice(0, TAMANHO_DA_ASSINATURA_CURTA);
  return iguais(s, esperado) ? Number(p) : null;
}
