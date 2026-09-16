"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { trocarSenha } from "@/lib/supabase/auth";

/**
 * Nova senha, depois do link de "Esqueci minha senha".
 *
 * Quem chega aqui já está com a sessão aberta — foi o link do e-mail que a abriu
 * no /auth/callback. Por isso não se pede a senha antiga: esquecê-la é o motivo
 * de a pessoa estar nesta tela.
 *
 * Campos e botão são os de /entrar (`.entrar__*`): linha embaixo, rótulo que
 * sobe, botão dourado com seta.
 */
export function NovaSenhaFormulario({ email, demo }: { email: string; demo: boolean }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salva, setSalva] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (demo) return;

    const dados = new FormData(evento.currentTarget);
    const senha = String(dados.get("senha") ?? "");
    if (senha !== String(dados.get("repetida") ?? "")) {
      setErro("As duas senhas não são iguais. Digite a mesma nos dois campos.");
      return;
    }

    setErro(null);
    setEnviando(true);
    const { erro } = await trocarSenha(senha);
    setEnviando(false);

    if (erro) {
      setErro(erro);
      return;
    }
    setSalva(true);
  }

  if (salva) {
    return (
      <>
        <p className="entrar__recado" role="status">
          Senha alterada. Da próxima vez, entre com o seu e-mail e a senha nova.
        </p>
        <Link className="entrar__botao entrar__botao--link" href="/conta">
          Ir para minha conta
          <ArrowRight aria-hidden size={16} className="entrar__seta" />
        </Link>
      </>
    );
  }

  return (
    <>
      <form className="entrar__form" onSubmit={enviar}>
        {/* Não aparece na tela: diz ao gerenciador de senhas do navegador a
            qual conta a senha nova pertence, para ele atualizar a guardada em
            vez de criar uma entrada solta. */}
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />

        <div className="entrar__campo">
          <input
            className="entrar__input"
            type="password"
            id="nova-senha"
            name="senha"
            placeholder=" "
            autoComplete="new-password"
            minLength={8}
            required
          />
          <label className="entrar__rotulo" htmlFor="nova-senha">
            <Lock aria-hidden size={14} />
            Nova senha (ao menos 8 caracteres)
          </label>
        </div>

        <div className="entrar__campo">
          <input
            className="entrar__input"
            type="password"
            id="nova-senha-repetida"
            name="repetida"
            placeholder=" "
            autoComplete="new-password"
            minLength={8}
            required
          />
          <label className="entrar__rotulo" htmlFor="nova-senha-repetida">
            <Lock aria-hidden size={14} />
            Repita a nova senha
          </label>
        </div>

        <button className="entrar__botao" type="submit" disabled={enviando || demo}>
          {enviando && <Loader2 aria-hidden size={15} className="animate-spin" />}
          Salvar nova senha
          <ArrowRight aria-hidden size={16} className="entrar__seta" />
        </button>
      </form>

      {erro && <p className="entrar__erro" role="alert">{erro}</p>}
    </>
  );
}
