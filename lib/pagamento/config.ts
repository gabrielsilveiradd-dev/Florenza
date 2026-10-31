/**
 * O PAGBANK ESTÁ LIGADO, E EM QUE AMBIENTE?
 *
 * Tudo vem de variável de ambiente, nenhuma URL ou token no código:
 *
 *   PAGBANK_ENV          `production` cobra de verdade; qualquer outro valor é sandbox.
 *   PAGBANK_TOKEN        token da conta, de um ambiente só.
 *   PAGBANK_API_URL      base da API do ambiente (ver docs/ambientes-disponiveis).
 *   PAGBANK_WEBHOOK_URL  o endereço público de /api/pagbank/webhook.
 *   PAGBANK_URL_SECRET   assina o pedido nas URLs que nós controlamos.
 *
 * E o PAGAMENTO_SEGREDO_BANCO, que o banco exige nas funções de pagamento. Sem
 * ele o site cobraria e não conseguiria marcar o pedido como pago — pior do que
 * não cobrar.
 *
 * Enquanto não estiver ligado, o site inteiro fala a língua do acerto por
 * WhatsApp: vitrine, checkout, confirmação e conta.
 *
 * Só para código de servidor. Num componente de cliente `process.env` não tem
 * estas variáveis e a resposta seria sempre "não" — passe o valor por prop.
 */

export type AmbientePagBank = "sandbox" | "production";

export function ambientePagBank(): AmbientePagBank {
  return process.env.PAGBANK_ENV === "production" ? "production" : "sandbox";
}

export function pagBankEmTeste(): boolean {
  return ambientePagBank() === "sandbox";
}

/** A URL precisa bater com o ambiente: token de um lado e URL de outro só dá erro confuso. */
export function urlDaApiCoerente(url: string, ambiente: AmbientePagBank): boolean {
  return ambiente === "sandbox" ? url.includes("sandbox") : !url.includes("sandbox");
}

export function pagBankApiUrl(): string {
  const url = process.env.PAGBANK_API_URL;
  if (!url) throw new Error("PAGBANK_API_URL não está configurada.");
  return url.replace(/\/$/, "");
}

/** O endereço do site para link em aviso, onde não há requisição de onde deduzir (job, webhook). */
export function urlPublicaDoSite(): string {
  const fixa = process.env.NEXT_PUBLIC_SITE_URL;
  if (fixa) return fixa.replace(/\/$/, "");
  const webhook = process.env.PAGBANK_WEBHOOK_URL;
  return webhook ? new URL(webhook).origin : "";
}

/** Dá para conversar com o PagBank e gravar o que ele disser? */
export function pagBankConfigurado(): boolean {
  const url = process.env.PAGBANK_API_URL;
  return Boolean(
    url &&
      urlDaApiCoerente(url, ambientePagBank()) &&
      process.env.PAGBANK_TOKEN &&
      process.env.PAGBANK_URL_SECRET &&
      process.env.PAGAMENTO_SEGREDO_BANCO
  );
}

/** O site abre cobrança nova? */
export function pagamentoOnlineAtivo(): boolean {
  return pagBankConfigurado();
}
