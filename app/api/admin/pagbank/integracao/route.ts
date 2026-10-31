import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/admin/exigir-admin";
import { pagBankApiUrl, urlPublicaDoSite } from "@/lib/pagamento/config";
import { ativarAvisosDePosVenda, testarCriacaoDeCheckout, testarToken } from "@/lib/pagamento/integracao";

/**
 * Os testes da homologação, chamados pelo console do navegador (DEPLOY.md, passo 5).
 * Precisa de token e URL, não da flag: é justamente com a loja desligada que se
 * testa antes de ligar.
 */
export async function POST(request: Request) {
  const acesso = await exigirAdmin();
  if ("resposta" in acesso) return acesso.resposta;

  if (!process.env.PAGBANK_TOKEN || !process.env.PAGBANK_API_URL) {
    return NextResponse.json({ ok: false, http: null, mensagem: "Faltam PAGBANK_TOKEN ou PAGBANK_API_URL na Vercel." });
  }
  try {
    pagBankApiUrl();
  } catch (erro) {
    return NextResponse.json({ ok: false, http: null, mensagem: erro instanceof Error ? erro.message : String(erro) });
  }

  const corpo = (await request.json().catch(() => null)) as { acao?: unknown } | null;

  switch (corpo?.acao) {
    case "token":
      return NextResponse.json(await testarToken());
    case "checkout":
      return NextResponse.json(await testarCriacaoDeCheckout());
    case "preferencias": {
      const webhook = process.env.PAGBANK_WEBHOOK_URL ?? `${urlPublicaDoSite()}/api/pagbank/webhook`;
      if (!webhook.startsWith("https://")) {
        return NextResponse.json({ ok: false, http: null, mensagem: "O aviso precisa de endereço HTTPS público (PAGBANK_WEBHOOK_URL)." });
      }
      return NextResponse.json(await ativarAvisosDePosVenda(webhook));
    }
    default:
      return NextResponse.json({ erro: "Ação desconhecida." }, { status: 400 });
  }
}
