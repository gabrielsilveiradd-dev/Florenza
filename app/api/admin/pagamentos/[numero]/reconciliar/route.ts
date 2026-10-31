import { NextResponse } from "next/server";
import { exigirAdmin, idDoPedido } from "@/lib/admin/exigir-admin";
import { pagBankConfigurado } from "@/lib/pagamento/config";
import { reconcileOrder } from "@/lib/pagamento/reconciliar";

/** O botão "Reconciliar agora". Sem limite de intervalo: é uma pessoa pedindo. */
export async function POST(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const acesso = await exigirAdmin();
  if ("resposta" in acesso) return acesso.resposta;

  if (!pagBankConfigurado()) {
    return NextResponse.json({ erro: "O PagBank não está configurado." }, { status: 409 });
  }

  const pedidoId = await idDoPedido(acesso.supabase, (await params).numero);
  if (!pedidoId) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });

  try {
    const resultado = await reconcileOrder(pedidoId, "painel");
    return NextResponse.json(resultado);
  } catch (e) {
    console.error(`[admin] reconciliação do pedido ${pedidoId} falhou:`, e);
    return NextResponse.json({ erro: "Não foi possível reconciliar agora." }, { status: 502 });
  }
}
