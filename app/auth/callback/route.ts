import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Retorno dos links que o Supabase manda por e-mail (confirmação de cadastro e
 * recuperação de senha) e da entrada com Google. Troca o que veio na URL por
 * uma sessão de verdade e devolve a pessoa para dentro do site.
 *
 * Chegam dois formatos:
 *
 * - `token_hash` + `type`: os links de e-mail. O template do Supabase monta o
 *   endereço com `{{ .TokenHash }}`, e o `verifyOtp` confere o token direto no
 *   servidor. Funciona em qualquer navegador — a pessoa pede a senha nova no
 *   computador e abre o e-mail no celular, ou em outro perfil do Chrome.
 * - `code`: o fluxo PKCE, que o Google usa. Só funciona no navegador que
 *   começou o fluxo, porque a outra metade da troca (o code verifier) ficou
 *   num cookie de lá. No Google não há problema: o vaivém acontece na mesma
 *   aba. Nos e-mails era exatamente o problema — e, enquanto um template ainda
 *   usar `{{ .ConfirmationURL }}`, é por aqui que o link dele volta.
 */

// Só os tipos que o site manda por e-mail. `signup` é o nome antigo de `email`;
// fica para links enviados antes da troca do template.
const TIPOS_DE_LINK = new Set<EmailOtpType>(["recovery", "email", "signup"]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const proximo = searchParams.get("next");

  // Mesmo cuidado da página de conta: só destino interno.
  const destino = proximo && proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : "/conta";

  // Quando o próprio Supabase recusa o link (vencido, já usado), ele volta
  // sem token e com `error_code` na URL.
  let motivo = searchParams.get("error_code") ?? "link sem token nem código";

  if (tokenHash && tipo && TIPOS_DE_LINK.has(tipo)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    // Link de recuperação vai sempre para a tela de nova senha, com ou sem
    // `next`: a sessão que ele abre existe para isso, e cair em /conta faria a
    // pessoa entrar sem trocar a senha esquecida.
    if (!error) return NextResponse.redirect(`${origin}${tipo === "recovery" ? "/conta/nova-senha" : destino}`);
    motivo = `token_hash/${tipo}: ${error.code ?? error.message}`;
  } else if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
    // `pkce_code_verifier_not_found` = link aberto num navegador diferente do
    // que pediu.
    motivo = `code: ${error.code ?? error.message}`;
  }

  // Só o motivo, nunca o token ou o e-mail. Sem esta linha, descobrir por que
  // um link falhou exigia o log do painel do Supabase.
  console.warn(`[auth/callback] link recusado (${motivo})`);
  return NextResponse.redirect(`${origin}/conta?erro=link_invalido`);
}
