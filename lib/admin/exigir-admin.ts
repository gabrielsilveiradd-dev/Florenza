import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * A porta das rotas do painel que falam com o PagBank ou mexem em dinheiro.
 *
 * As funções de pagamento rodam com o segredo, não com a sessão, então a RLS não as
 * protege: esta conferência é a proteção. `getUser` e não `getSession`, que só
 * acredita no cookie.
 */
export async function exigirAdmin(): Promise<
  | { admin: { id: string; email: string | null }; supabase: Awaited<ReturnType<typeof createClient>> }
  | { resposta: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { resposta: NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 }) };

  const { data: perfil } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (perfil?.role !== "admin") {
    return { resposta: NextResponse.json({ erro: "Área exclusiva da equipe." }, { status: 403 }) };
  }

  return { admin: { id: user.id, email: user.email ?? null }, supabase };
}

/** O id do pedido pelo número, lido com a sessão de quem pediu. */
export async function idDoPedido(
  supabase: Awaited<ReturnType<typeof createClient>>,
  numero: string
): Promise<string | null> {
  const n = Number(numero);
  if (!Number.isInteger(n)) return null;
  const { data } = await supabase.from("pedidos").select("id").eq("numero", n).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}
