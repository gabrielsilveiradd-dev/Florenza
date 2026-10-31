import { NextResponse } from "next/server";
import { pagBankConfigurado } from "@/lib/pagamento/config";
import { reconciliarSeLivre } from "@/lib/pagamento/reconciliar";
import { createClient } from "@/lib/supabase/server";

/**
 * O estado real do pagamento, para o acompanhamento da página do pedido.
 *
 * A página pergunta a cada 5 segundos, mas o PagBank é consultado no máximo a cada
 * 15 por pedido: o limite é do banco, então várias abas contam como uma só.
 *
 * O pedido é lido com a sessão de quem pede: a RLS garante que só o dono consulta.
 */
const INTERVALO_SEGUNDOS = 15;

type LinhaDoPedido = { id: string; status: string; pagamento_estado: string | null };

export async function GET(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  const numero = Number((await params).numero);
  if (!Number.isInteger(numero)) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  const supabase = await createClient();
  const ler = () =>
    supabase.from("pedidos").select("id, status, pagamento_estado").eq("numero", numero).maybeSingle<LinhaDoPedido>();

  const { data: pedido } = await ler();
  if (!pedido) return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });

  const pendente =
    pedido.status === "aguardando_pagamento" && (pedido.pagamento_estado === "pending" || pedido.pagamento_estado === "declined");
  if (!pendente || !pagBankConfigurado()) {
    return NextResponse.json({ estado: pedido.pagamento_estado, status: pedido.status });
  }

  try {
    await reconciliarSeLivre(pedido.id, "pagina", INTERVALO_SEGUNDOS);
  } catch (e) {
    // A pergunta seguinte tenta de novo, e o job também.
    console.error(`[pagamento] reconciliação do pedido #${numero} falhou:`, e);
  }

  const { data: atual } = await ler();
  return NextResponse.json({
    estado: atual?.pagamento_estado ?? pedido.pagamento_estado,
    status: atual?.status ?? pedido.status,
  });
}
