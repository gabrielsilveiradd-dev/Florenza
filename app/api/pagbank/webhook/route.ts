import { NextResponse, type NextRequest } from "next/server";
import { pagamentoOnlineAtivo } from "@/lib/pagamento/config";
import { assinaturaDoWebhook } from "@/lib/pagamento/pagbank";
import { sincronizarPagamento } from "@/lib/pagamento/sincronizar";
import { urlDoSite } from "@/lib/url-do-site";

/**
 * Aviso de pagamento do PagBank.
 *
 * O corpo do aviso NÃO é tomado como verdade — só o id da order (`ORDE_…`) sai
 * dele. O resto (status, valor, a qual pedido pertence) vem da API do PagBank,
 * consultada com o token da loja em `sincronizarPagamento`.
 *
 * Falha do banco ou da API responde 500 de propósito, para o aviso poder voltar
 * mais tarde. Aviso que não interessa responde 200.
 *
 * O corpo é lido cru, e não com `request.json()`: a assinatura é calculada sobre
 * os bytes exatos, e reformatar o JSON a invalidaria.
 *
 * EVENTOS DEPOIS DA VENDA (devolução, contestação) o PagBank manda em outro
 * formato — formulário com `notificationCode`, não JSON. Ainda não são tratados:
 * ficam só no log, e a contestação precisa ser acompanhada no painel do PagBank.
 */
export async function POST(request: NextRequest) {
  if (!pagamentoOnlineAtivo()) {
    return NextResponse.json({ ignorado: "pagamento online desligado" });
  }

  const corpoCru = await request.text();

  if (assinaturaDoWebhook(request.headers, corpoCru) === "invalida") {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  let id: unknown = null;
  try {
    id = (JSON.parse(corpoCru) as { id?: unknown } | null)?.id;
  } catch {
    console.warn(`[webhook] aviso do PagBank fora do formato JSON, não tratado: ${corpoCru.slice(0, 200)}`);
    return NextResponse.json({ ignorado: "aviso fora do formato JSON" });
  }

  if (typeof id !== "string" || !id.startsWith("ORDE_")) {
    return NextResponse.json({ ignorado: "aviso sem order" });
  }

  try {
    const resultado = await sincronizarPagamento(id, await urlDoSite());
    return NextResponse.json(resultado);
  } catch (e) {
    console.error(`[webhook] order ${id}:`, e);
    return NextResponse.json({ erro: "falha ao registrar" }, { status: 500 });
  }
}
