import { NextResponse } from "next/server";
import { buscarMeuPedido } from "@/lib/conta-servidor";
import { pagamentoOnlineAtivo } from "@/lib/pagamento/config";
import { criarPreferencia } from "@/lib/pagamento/mercado-pago";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { urlDoSite } from "@/lib/url-do-site";

/**
 * "Pagar agora" de um pedido que já existe — o cartão recusado, o Pix que a
 * pessoa fechou sem pagar, a cobrança que não abriu no fechamento.
 *
 * O pedido é lido com a sessão de quem pede, então a RLS garante que só o dono
 * consegue gerar cobrança dele. O valor é o do banco, como sempre.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ numero: string }> }) {
  if (!supabaseConfigurado() || !pagamentoOnlineAtivo()) {
    return NextResponse.json({ erro: "O pagamento online ainda não está ligado." }, { status: 409 });
  }

  const numero = Number((await params).numero);
  if (!Number.isInteger(numero)) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "Entre na sua conta para pagar." }, { status: 401 });
  }

  const pedido = await buscarMeuPedido({ numero });
  if (!pedido) {
    return NextResponse.json({ erro: "Pedido não encontrado." }, { status: 404 });
  }
  if (pedido.status !== "aguardando_pagamento") {
    return NextResponse.json({ erro: "Este pedido não está aguardando pagamento." }, { status: 409 });
  }
  if (pedido.expiraEm && new Date(pedido.expiraEm) <= new Date()) {
    return NextResponse.json(
      { erro: "A reserva deste pedido venceu e as peças voltaram para a vitrine." },
      { status: 409 }
    );
  }

  try {
    const url = await criarPreferencia({
      pedidoId: pedido.id,
      numero: pedido.numero,
      totalCentavos: pedido.totalCentavos,
      expiraEm: pedido.expiraEm,
      itens: pedido.itens,
      comprador: { nome: pedido.nome, email: pedido.email, cpf: pedido.cpf },
      urlBase: await urlDoSite(),
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error(`[pagamento] preferência do pedido #${pedido.numero} falhou:`, e);
    return NextResponse.json(
      { erro: "O Mercado Pago não respondeu agora. Tente de novo em instantes." },
      { status: 502 }
    );
  }
}
