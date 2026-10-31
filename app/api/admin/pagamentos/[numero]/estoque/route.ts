import { NextResponse } from "next/server";
import { exigirAdmin, idDoPedido } from "@/lib/admin/exigir-admin";
import { rpcComSegredo } from "@/lib/pagamento/banco";

/** A peça de um pedido estornado volta ao estoque? Decisão de uma vez só. */
export async function POST(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const acesso = await exigirAdmin();
  if ("resposta" in acesso) return acesso.resposta;

  const pedidoId = await idDoPedido(acesso.supabase, (await params).numero);
  if (!pedidoId) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });

  const corpo = (await request.json().catch(() => null)) as { devolver?: unknown } | null;
  if (typeof corpo?.devolver !== "boolean") {
    return NextResponse.json({ erro: "Diga se a peça volta ao estoque." }, { status: 400 });
  }

  try {
    const decisao = await rpcComSegredo<string>("pagbank_decidir_estoque", {
      p_pedido_id: pedidoId,
      p_devolver: corpo.devolver,
    });
    return NextResponse.json({ decisao });
  } catch (e) {
    console.error(`[admin] estoque do pedido ${pedidoId}:`, e);
    return NextResponse.json({ erro: "Não foi possível registrar a decisão." }, { status: 500 });
  }
}
