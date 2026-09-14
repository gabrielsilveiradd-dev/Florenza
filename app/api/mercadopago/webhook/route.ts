import { NextResponse, type NextRequest } from "next/server";
import { pagamentoOnlineAtivo } from "@/lib/pagamento/config";
import { assinaturaDoWebhook } from "@/lib/pagamento/mercado-pago";
import { sincronizarPagamento } from "@/lib/pagamento/sincronizar";
import { urlDoSite } from "@/lib/url-do-site";

/**
 * Aviso de pagamento do Mercado Pago.
 *
 * O corpo do aviso NÃO é tomado como verdade — só o id do pagamento sai dele. O
 * resto (status, valor, a qual pedido pertence) vem da API do Mercado Pago,
 * consultada com o token da loja em `sincronizarPagamento`.
 *
 * Os códigos de resposta importam: o Mercado Pago reenvia enquanto não recebe
 * 2xx. Falha do banco ou da API responde 500 de propósito, para o aviso voltar
 * mais tarde. Aviso que não interessa (outro tipo de evento, pagamento de fora
 * do site) responde 200, senão ele insistiria para sempre.
 *
 * Aceita os dois formatos que o Mercado Pago usa: Webhooks
 * (`?type=payment&data.id=`, ou o mesmo no corpo) e o IPN antigo
 * (`?topic=payment&id=`).
 */
export async function POST(request: NextRequest) {
  if (!pagamentoOnlineAtivo()) {
    return NextResponse.json({ ignorado: "pagamento online desligado" });
  }

  const url = request.nextUrl;
  const corpo = (await request.json().catch(() => null)) as
    | { type?: string; topic?: string; action?: string; data?: { id?: string | number } }
    | null;

  const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? corpo?.type ?? corpo?.topic;
  const id = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? corpo?.data?.id;

  if (tipo !== "payment" || !id) {
    return NextResponse.json({ ignorado: `evento ${tipo ?? "sem tipo"}` });
  }

  if (assinaturaDoWebhook(request.headers, String(id)) === "invalida") {
    return NextResponse.json({ erro: "assinatura inválida" }, { status: 401 });
  }

  try {
    const resultado = await sincronizarPagamento(String(id), await urlDoSite());
    return NextResponse.json(resultado);
  } catch (e) {
    console.error(`[webhook] pagamento ${id}:`, e);
    return NextResponse.json({ erro: "falha ao registrar" }, { status: 500 });
  }
}
