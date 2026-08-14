"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { criarConta, entrarComSenha, enviarLinkDeRecuperacao } from "@/lib/supabase/auth";

type Modo = "entrar" | "criar";

/**
 * Entrar e criar conta.
 *
 * É este cadastro que alimenta a aba Clientes do painel: o `signUp` cria a
 * linha em auth.users, a trigger `ao_criar_usuario` cria o perfil, e a view
 * vw_clientes já enxerga. Ninguém sincroniza nada.
 *
 * `nome` e `telefone` viajam em `options.data` e chegam no banco como
 * `raw_user_meta_data` — é de lá que a trigger os lê.
 */
export function ContaFormulario({ redirect, demo }: { redirect: string; demo: boolean }) {
  const [modo, setModo] = useState<Modo>("entrar");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (demo) return;
    setErro(null);
    setRecado(null);

    const dados = new FormData(evento.currentTarget);
    const email = String(dados.get("email") ?? "").trim();
    const senha = String(dados.get("senha") ?? "");

    setEnviando(true);

    if (modo === "entrar") {
      const { erro } = await entrarComSenha(email, senha);
      setEnviando(false);
      if (erro) {
        setErro(erro);
        return;
      }
      // `window.location.assign` e não `router.push`: a navegação do Next não
      // recarrega o documento, e o Server Component do destino poderia rodar
      // antes de o cookie de sessão existir — caindo de volta no login.
      window.location.assign(redirect);
      return;
    }

    const { erro } = await criarConta({
      email,
      senha,
      nome: String(dados.get("nome") ?? "").trim(),
      telefone: String(dados.get("telefone") ?? "").trim(),
    });
    setEnviando(false);

    if (erro) {
      setErro(erro);
      return;
    }
    setRecado("Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre por aqui.");
    setModo("entrar");
  }

  async function recuperarSenha() {
    if (demo) return;
    const campo = document.getElementById("conta-email") as HTMLInputElement | null;
    const email = campo?.value.trim();
    if (!email) {
      setErro("Escreva seu e-mail no campo acima para receber o link de recuperação.");
      return;
    }
    setErro(null);
    await enviarLinkDeRecuperacao(email);
    // Resposta igual dando certo ou errado, de propósito: dizer "esse e-mail
    // não existe" transforma o formulário num verificador de quem é cliente.
    setRecado("Se houver uma conta com esse e-mail, o link de recuperação chegou na caixa de entrada.");
  }

  return (
    <>
      <div className="conta__abas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={modo === "entrar"}
          className={`conta__aba${modo === "entrar" ? " is-active" : ""}`}
          onClick={() => { setModo("entrar"); setErro(null); setRecado(null); }}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={modo === "criar"}
          className={`conta__aba${modo === "criar" ? " is-active" : ""}`}
          onClick={() => { setModo("criar"); setErro(null); setRecado(null); }}
        >
          Criar conta
        </button>
      </div>

      <form className="conta__form" onSubmit={enviar}>
        {modo === "criar" && (
          <>
            <div className="conta__campo">
              <label className="conta__rotulo" htmlFor="conta-nome">Nome</label>
              <input className="conta__input" id="conta-nome" name="nome" required placeholder="Como devemos te chamar" />
            </div>
            <div className="conta__campo">
              <label className="conta__rotulo" htmlFor="conta-telefone">Telefone</label>
              <input className="conta__input" id="conta-telefone" name="telefone" type="tel" placeholder="(00) 00000-0000" />
            </div>
          </>
        )}

        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="conta-email">E-mail</label>
          <input
            className="conta__input"
            id="conta-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="voce@exemplo.com"
          />
        </div>

        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="conta-senha">Senha</label>
          <input
            className="conta__input"
            id="conta-senha"
            name="senha"
            type="password"
            required
            minLength={8}
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            placeholder={modo === "criar" ? "Ao menos 8 caracteres" : "Sua senha"}
          />
        </div>

        <button className="conta__botao" type="submit" disabled={enviando || demo}>
          {enviando && <Loader2 aria-hidden size={15} className="animate-spin" />}
          {modo === "entrar" ? "Entrar" : "Criar conta"}
        </button>

        {modo === "entrar" && (
          <button type="button" className="conta__link" onClick={recuperarSenha} disabled={demo}>
            Esqueci minha senha
          </button>
        )}
      </form>

      {recado && <p className="conta__recado" role="status">{recado}</p>}
      {erro && <p className="conta__erro" role="alert">{erro}</p>}
    </>
  );
}
