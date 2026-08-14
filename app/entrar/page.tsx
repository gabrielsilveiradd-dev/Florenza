import type { Metadata } from "next";
import { LoginForm, SmokeyBackground } from "@/components/ui/login-form";
import { supabaseConfigurado } from "@/lib/supabase/config";

import "./entrar.css";

export const metadata: Metadata = {
  title: "Entrar — Florenza",
  robots: { index: false, follow: false },
};

/**
 * Porta de entrada da conta.
 *
 * A autenticação é a mesma de /conta — mesmo Supabase, mesma `auth.users`,
 * mesma trigger que cria o perfil. O que muda é só o desenho: aqui a tela é
 * inteira, com o fundo animado; lá é a página de conta, que também cria
 * cadastro e mostra os pedidos.
 */
export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const pedido = (await searchParams).redirect;

  // Mesma checagem de /conta: só destino interno é aceito. Sem ela, um link
  // como /entrar?redirect=https://site-falso.com levaria a pessoa para fora
  // logo depois de digitar a senha — o padrão clássico de redirecionamento
  // aberto.
  const redirect = pedido && pedido.startsWith("/") && !pedido.startsWith("//") ? pedido : "/";

  return (
    <main className="entrar">
      <SmokeyBackground backdropBlurAmount="sm" />
      <LoginForm redirect={redirect} demo={!supabaseConfigurado()} />
    </main>
  );
}
