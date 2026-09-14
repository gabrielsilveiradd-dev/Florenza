"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FORMAS_DE_PAGAMENTO, type PerfilDaConta } from "@/lib/conta";
import { buscarCep, cpfValido, formatarCep, formatarCpf, somenteDigitos } from "@/lib/documentos";
import { UFS } from "@/lib/geo/ufs";

/**
 * Dados da conta, endereço de entrega e forma de pagamento preferida.
 *
 * O update não manda `id` nem `role`. Não é confiança no formulário: `role` não
 * é escrevível pela API por papel nenhum (privilégio de coluna), e a policy só
 * deixa a pessoa tocar na própria linha. São duas travas no banco; o formulário
 * é só a terceira, e a menos importante.
 *
 * O CPF é conferido aqui por cortesia e no banco por obrigação — a CHECK
 * constraint `profiles_cpf_valido` recusa o que passar desta tela.
 */
export function DadosDaConta({ perfil }: { perfil: PerfilDaConta }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [forma, setForma] = useState(perfil.formaPagamento);

  const [cpf, setCpf] = useState(formatarCpf(perfil.cpf));
  const [cep, setCep] = useState(formatarCep(perfil.cep));
  const [logradouro, setLogradouro] = useState(perfil.logradouro);
  const [bairro, setBairro] = useState(perfil.bairro);
  const [cidade, setCidade] = useState(perfil.cidade);
  const [uf, setUf] = useState(perfil.uf);

  async function aoMudarCep(valor: string) {
    setCep(formatarCep(valor));
    const endereco = await buscarCep(valor);
    if (!endereco) return;
    if (endereco.logradouro) setLogradouro(endereco.logradouro);
    if (endereco.bairro) setBairro(endereco.bairro);
    setCidade(endereco.cidade);
    setUf(endereco.uf);
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setSalvo(false);

    if (cpf && !cpfValido(cpf)) {
      setErro("Confira o CPF: os dígitos não batem.");
      return;
    }

    setSalvando(true);
    const dados = new FormData(evento.currentTarget);
    const texto = (campo: string) => String(dados.get(campo) ?? "").trim() || null;
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
        nome: texto("nome"),
        telefone: texto("telefone"),
        cpf: somenteDigitos(cpf) || null,
        cep: somenteDigitos(cep) || null,
        logradouro: logradouro.trim() || null,
        endereco_numero: texto("endereco_numero"),
        complemento: texto("complemento"),
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf || null,
        forma_pagamento_preferida: forma || null,
      })
      .eq("id", user.id);

    setSalvando(false);
    if (error) {
      setErro(
        error.message.includes("cpf")
          ? "O CPF não é válido."
          : "Não foi possível salvar. Tente de novo em instantes."
      );
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
        <input className="conta__input" id="cd-nome" name="nome" defaultValue={perfil.nome} required autoComplete="name" />
      </div>

      <div className="conta__linha">
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-telefone">WhatsApp</label>
          <input
            className="conta__input" id="cd-telefone" name="telefone" type="tel" autoComplete="tel"
            defaultValue={perfil.telefone} placeholder="(00) 00000-0000"
          />
        </div>
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-cpf">CPF</label>
          <input
            className="conta__input" id="cd-cpf" inputMode="numeric" placeholder="000.000.000-00"
            value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))}
          />
        </div>
      </div>

      <div className="conta__linha">
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-cep">CEP</label>
          <input
            className="conta__input" id="cd-cep" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000"
            value={cep} onChange={(e) => aoMudarCep(e.target.value)}
          />
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

      <div className="conta__campo">
        <label className="conta__rotulo" htmlFor="cd-rua">Rua</label>
        <input
          className="conta__input" id="cd-rua" autoComplete="address-line1"
          value={logradouro} onChange={(e) => setLogradouro(e.target.value)}
        />
      </div>

      <div className="conta__linha">
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-numero">Número</label>
          <input className="conta__input" id="cd-numero" name="endereco_numero" defaultValue={perfil.enderecoNumero} />
        </div>
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-complemento">Complemento</label>
          <input
            className="conta__input" id="cd-complemento" name="complemento" autoComplete="address-line2"
            defaultValue={perfil.complemento}
          />
        </div>
      </div>

      <div className="conta__linha">
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-bairro">Bairro</label>
          <input className="conta__input" id="cd-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
        </div>
        <div className="conta__campo">
          <label className="conta__rotulo" htmlFor="cd-cidade">Cidade</label>
          <input
            className="conta__input" id="cd-cidade" autoComplete="address-level2"
            value={cidade} onChange={(e) => setCidade(e.target.value)}
          />
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
