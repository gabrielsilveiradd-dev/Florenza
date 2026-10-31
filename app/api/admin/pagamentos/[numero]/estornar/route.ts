import { NextResponse } from "next/server";
import { exigirAdmin, idDoPedido } from "@/lib/admin/exigir-admin";
import { pagBankConfigurado } from "@/lib/pagamento/config";
import { estornarPeloPainel } from "@/lib/pagamento/estorno";

/**
 * Estorno total ou parcial, pedido por um admin. Quem confere valor, cobrança e
 * estorno concorrente é `pagbank_iniciar_estorno()`, no banco.
 */
export async function POST(request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const acesso = await exigirAdmin();
  if ("resposta" in acesso) return acesso.resposta;

  if (!pagBankConfigurado()) {
    return NextResponse.json({ erro: "O PagBank não está configurado." }, { status: 409 });
  }

  const pedidoId = await idDoPedido(acesso.supabase, (await params).numero);
  if (!pedidoId) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });

  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const valorCentavos = corpo?.valorCentavos;
  if (typeof corpo?.cobrancaId !== "string" || typeof valorCentavos !== "number" || !Number.isInteger(valorCentavos)) {
    return NextResponse.json({ erro: "Informe a cobrança e o valor." }, { status: 400 });
  }

  try {
    const resultado = await estornarPeloPainel({
      pedidoId,
      cobrancaId: corpo.cobrancaId,
      valorCentavos,
      devolverEstoque: typeof corpo.devolverEstoque === "boolean" ? corpo.devolverEstoque : null,
      motivo: typeof corpo.motivo === "string" ? corpo.motivo : null,
      admin: acesso.admin,
    });
    return resultado.ok
      ? NextResponse.json({ mensagem: resultado.mensagem })
      : NextResponse.json({ erro: resultado.mensagem }, { status: resultado.http });
  } catch (e) {
    console.error(`[admin] estorno do pedido ${pedidoId} falhou:`, e);
    return NextResponse.json(
      { erro: "Não foi possível concluir. Reconcilie o pedido antes de tentar de novo." },
      { status: 500 }
    );
  }
}
