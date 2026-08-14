import { createClient } from "@/lib/supabase/client";

/**
 * As quatro ações de conta, num lugar só.
 *
 * Existem duas telas de entrada — /entrar, de tela cheia, e /conta, que também
 * lista pedidos. Elas têm marcação e visual próprios, mas a conversa com o
 * Supabase é idêntica, e é justamente a parte onde errar é caro: o
 * `emailRedirectTo` decide se o link de confirmação leva a pessoa ao site
 * publicado ou a um localhost que só existe na máquina de quem programou.
 * Escrito duas vezes, um dia os dois divergem e ninguém percebe até um cliente
 * reclamar. Aqui é um só.
 *
 * As funções devolvem `erro` já traduzido em vez do erro do Supabase: a
 * mensagem crua vem em inglês e às vezes entrega detalhe demais sobre quem tem
 * conta no site.
 */

export type Resultado = { erro: string | null };

/**
 * `window.location.origin` e não uma variável de ambiente: devolve a pessoa
 * para o mesmo endereço onde ela estava, seja produção, preview da Vercel ou
 * localhost. Uma URL fixa acerta um dos três e erra os outros dois.
 */
function retornoPara(destino: string) {
  return `${window.location.origin}/auth/callback?next=${destino}`;
}

export async function entrarComSenha(email: string, senha: string): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  return { erro: error ? "E-mail ou senha incorretos." : null };
}

export async function criarConta(dados: {
  email: string;
  senha: string;
  nome: string;
  telefone: string;
}): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: dados.email,
    password: dados.senha,
    options: {
      emailRedirectTo: retornoPara("/conta"),
      // `nome` e `telefone` viajam aqui e chegam no banco como
      // `raw_user_meta_data`. É de lá que a trigger `ao_criar_usuario` os lê
      // para montar a linha em `profiles` — ninguém sincroniza nada depois.
      data: { nome: dados.nome, telefone: dados.telefone },
    },
  });

  if (!error) return { erro: null };

  /* Cada motivo tem um recado próprio, e não é preciosismo.
   *
   * A versão anterior devolvia "confira os dados" para tudo. Para o limite de
   * envio de e-mail isso é falso: os dados estão certos, o servidor é que está
   * estrangulado — e a pessoa redigita o cadastro inteiro para falhar de novo.
   * Descoberto testando: o mailer embutido do Supabase corta em poucas
   * mensagens por hora, então esse caso vai acontecer de verdade enquanto não
   * houver um SMTP de produção (ver DEPLOY.md).
   *
   * `error.code` é o campo estável do GoTrue; a mensagem é só a rede de
   * segurança, porque texto de terceiro muda sem aviso. */
  const codigo = error.code ?? "";
  const texto = error.message.toLowerCase();

  if (codigo === "user_already_exists" || texto.includes("already")) {
    return { erro: "Já existe uma conta com esse e-mail. Tente entrar." };
  }
  if (codigo === "email_address_invalid" || texto.includes("invalid")) {
    return { erro: "Esse e-mail não parece válido. Confira o endereço." };
  }
  if (codigo === "over_email_send_rate_limit" || texto.includes("rate limit")) {
    return {
      erro: "Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo — seus dados estão certos.",
    };
  }
  if (codigo === "weak_password" || texto.includes("password")) {
    return { erro: "A senha precisa de ao menos 8 caracteres." };
  }
  return { erro: "Não foi possível criar a conta. Confira os dados e tente de novo." };
}

export async function entrarComGoogle(destino: string): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: retornoPara(destino) },
  });

  if (!error) return { erro: null };
  // O provedor precisa ser ligado em Authentication -> Providers no painel do
  // Supabase. Enquanto não estiver, dizer "erro" seco faz a pessoa tentar de
  // novo à toa.
  return {
    erro: error.message.toLowerCase().includes("provider")
      ? "Entrada com Google ainda não está disponível. Use e-mail e senha."
      : "Não foi possível abrir a entrada com Google. Tente por e-mail e senha.",
  };
}

export async function enviarLinkDeRecuperacao(email: string): Promise<void> {
  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: retornoPara("/conta") });
  // Sem retorno de propósito: quem chama responde a mesma coisa dando certo ou
  // errado. Dizer "esse e-mail não existe" transformaria o formulário num
  // verificador de quem é cliente da joalheria.
}
