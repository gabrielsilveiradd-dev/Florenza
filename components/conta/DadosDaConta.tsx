"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FORMAS_DE_PAGAMENTO, type PerfilDaConta } from "@/lib/conta";
import { UFS } from "@/lib/geo/ufs";

/**
 * Dados da conta e forma de pagamento preferida.
 *
 * O update não manda `id` nem `role`. Não é confiança no formulário: desde a
 * migration do estoque, `role` não é escrevível pela API por papel nenhum
 * (privilégio de coluna), e a policy só deixa a pessoa tocar na própria linha.
 * São duas travas no banco; o formulário é só a terceira, e a menos importante.
 */
export function DadosDaConta({ perfil }: { perfil: PerfilDaConta }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [uf, setUf] = useState(perfil.uf);
  const [forma, setForma] = useState(perfil.formaPagamento);

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setSalvo(false);
    setSalvando(true);

    const dados = new FormData(evento.currentTarget);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setSalvando(false);
      setErro("Sua sessão expirou. Entre de novo para salvar.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        nome: String(dados.get("nome") ?? "").trim() || null,
        telefone: String(dados.get("telefone") ?? "").trim() || null,
        cep: String(dados.get("cep") ?? "").trim() || null,
        cidade: String(dados.get("cidade") ?? "").trim() || null,
        uf: uf || null,
        forma_pagamento_preferida: forma || null,
      })
      .eq("id", user.id);

    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Tente de novo em instantes.");
      return;
    }
    setSalvo(true);
    // O nome aparece no cabeçalho da página, que é renderizado no servidor.
    // Sem isto ele só mudaria no próximo carregamento.
    router.refresh();
  }

  return (
    <form className="conta__form" onSubmit={salvar}>
      <div className="conta__campo">
        <label className="conta__rotulo" htmlFor="cd-nome">Nome</label>
        <input className="conta__input" id="cd-nome" name="nome" defaultValue={perfil.nome} required />
      </div>

      <div className="conta__campo">
        <label className="conta__rotulo" htmlFor="cd-telefone">Telefone</label>
        <input
          className="conta__input"
          id="cd-telefone"
          name="telefone"
          type="tel"
          defaultValue={perfil.telefone}
          placeholder="(00) 00000-0000"
        />
      </div>

      <div className="conta__linha">
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-cep">CEP</label>
          <input className="conta__input" id="cd-cep" name="cep" defaultValue={perfil.cep} placeholder="00000-000" />
        </div>
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-cidade">Cidade</label>
          <input className="conta__input" id="cd-cidade" name="cidade" defaultValue={perfil.cidade} />
        </div>
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-uf">Estado</label>
          <select className="conta__input" id="cd-uf" value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u.uf} value={u.uf}>{u.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="conta__pagamento">
        <legend className="conta__rotulo">Como prefere pagar</legend>
        <div className="conta__opcoes">
          {FORMAS_DE_PAGAMENTO.map((f) => (
            <label className={`conta__opcao${forma === f.valor ? " is-active" : ""}`} key={f.valor}>
              <input
                type="radio"
                name="forma_pagamento"
                value={f.valor}
                checked={forma === f.valor}
                onChange={() => setForma(f.valor)}
              />
              {f.rotulo}
            </label>
          ))}
        </div>
        {/* Dito na cara, porque a diferença importa para quem lê. */}
        <p className="conta__nota">
          Isto é só a sua preferência, para a Florenza já saber o que oferecer no contato.
          Nenhum dado de cartão é guardado aqui — e não será: cartão fica no cofre do meio
          de pagamento, nunca no banco da loja.
        </p>
      </fieldset>

      <button className="conta__botao" type="submit" disabled={salvando}>
        {salvando && <Loader2 aria-hidden size={15} className="animate-spin" />}
        Salvar
      </button>

      {salvo && <p className="conta__recado" role="status">Dados atualizados.</p>}
      {erro && <p className="conta__erro" role="alert">{erro}</p>}
    </form>
  );
}
