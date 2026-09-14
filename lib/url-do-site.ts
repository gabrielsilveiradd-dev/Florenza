import { headers } from "next/headers";

/**
 * O endereço público do site, para montar link que sai daqui: retorno do
 * pagamento, webhook, link do pedido no e-mail.
 *
 * `NEXT_PUBLIC_SITE_URL` vence quando existe — em produção, com domínio
 * próprio, é o certo, porque não depende de cabeçalho de requisição. Sem ela,
 * vale o host de quem pediu: localhost, preview da Vercel ou produção, cada um
 * devolvendo a pessoa para o mesmo lugar de onde veio.
 */
export async function urlDoSite(): Promise<string> {
  const fixa = process.env.NEXT_PUBLIC_SITE_URL;
  if (fixa) return fixa.replace(/\/$/, "");

  const cabecalhos = await headers();
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host") ?? "localhost:3000";
  const protocolo =
    cabecalhos.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocolo}://${host}`;
}
