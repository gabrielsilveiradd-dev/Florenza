import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClientePublico } from "@/lib/supabase/publico";

/**
 * O plano gratuito do Supabase pausa o projeto com poucas consultas em 7 dias, e
 * a documentação fala em "alguns pedidos por dia". O Vercel Cron chama esta rota
 * uma vez por dia (vercel.json), o limite do plano Hobby, por isso são três
 * leituras na mesma chamada. É só o que qualquer visitante já lê, como `anon`.
 *
 * A Vercel manda `Authorization: Bearer CRON_SECRET` sozinha quando a variável
 * existe. Sem ela, ninguém entra: a rota não pode virar consulta grátis para bot.
 */
export const dynamic = "force-dynamic";

function autorizado(valor: string | null): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || !valor) return false;
  const a = Buffer.from(`Bearer ${segredo}`);
  const b = Buffer.from(valor);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const supabase = createClientePublico();
  const leituras = await Promise.all(
    ["categorias", "produtos", "fretes"].map((tabela) => supabase.from(tabela).select("*", { head: true, count: "exact" }))
  );

  const falha = leituras.find((leitura) => leitura.error);
  if (falha) {
    // Status de erro para aparecer nos logs do Cron, em vez de falhar em silêncio.
    console.error("[manter-ativo]", falha.error);
    return NextResponse.json({ erro: "banco não respondeu" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
