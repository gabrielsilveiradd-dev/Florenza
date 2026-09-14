"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Ticket, Trash2 } from "lucide-react";
import { SectionCard, Vazio } from "@/components/admin/Primitivos";
import { createClient } from "@/lib/supabase/client";
import { formatarDia, formatarPreco, reaisParaCentavos } from "@/lib/admin/format";
import type { CupomAdmin } from "@/lib/admin/listas";

// "YYYY-MM-DD" no fuso da loja — o mesmo critério de validade que `avaliar_cupom` usa.
const hojeEmSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function descreverRegra(c: CupomAdmin): string {
  return [
    c.tipo === "percentual" ? `${c.valor}% de desconto` : `${formatarPreco(c.valor)} de desconto`,
    c.minimo_centavos > 0 && `pedido mínimo ${formatarPreco(c.minimo_centavos)}`,
    c.validade_ate && `até ${formatarDia(c.validade_ate)}`,
    c.limite_usos ? `${c.usos} de ${c.limite_usos} usos` : `${c.usos} ${c.usos === 1 ? "uso" : "usos"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Cupons de desconto.
 *
 * O painel só ESCREVE a regra; quem aplica é o banco (`avaliar_cupom`, chamado
 * por `criar_pedido`). Por isso não há conta de desconto aqui: mudar um cupom
 * vale para o próximo pedido, e os pedidos já feitos guardam o desconto que
 * tiveram.
 *
 * "Só na primeira compra" e "um por cliente" são conferidos pela conta E pelo
 * CPF — outra conta com o mesmo CPF não reabre o cupom. O uso é contado ao
 * fechar o pedido e devolvido se ele for cancelado.
 *
 * Apagar só existe para cupom nunca usado. Usado, ele fica ligado aos pedidos
 * que o usaram, e o caminho é desativar.
 */
export function CuponsSection({ cupons, demo }: { cupons: CupomAdmin[]; demo: boolean }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"percentual" | "valor">("percentual");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const hoje = hojeEmSaoPaulo();

  async function atualizar(codigo: string, campos: Partial<CupomAdmin>, falha: string) {
    if (demo) return;
    setErro(null);
    setSalvando(codigo);
    const { data, error } = await createClient().from("cupons").update(campos).eq("codigo", codigo).select("codigo");
    setSalvando(null);
    if (error || !data?.length) {
      setErro(falha);
      return;
    }
    router.refresh();
  }

  async function excluir(cupom: CupomAdmin) {
    if (demo || cupom.usos > 0) return;
    if (!window.confirm(`Apagar o cupom ${cupom.codigo}?`)) return;
    setErro(null);
    setSalvando(cupom.codigo);
    const { error } = await createClient().from("cupons").delete().eq("codigo", cupom.codigo);
    setSalvando(null);
    if (error) {
      setErro("Não foi possível apagar. Se o cupom já foi usado em algum pedido, desative-o.");
      return;
    }
    router.refresh();
  }

  async function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (demo) return;
    setErroForm(null);

    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const texto = (campo: string) => String(dados.get(campo) ?? "").trim();

    const codigo = texto("codigo").toUpperCase().replace(/\s+/g, "");
    const valor = tipo === "percentual" ? Number(texto("valor").replace(",", ".")) : reaisParaCentavos(texto("valor"));
    const minimo = texto("minimo") ? reaisParaCentavos(texto("minimo")) : 0;
    const limite = texto("limite") ? Number(texto("limite")) : null;

    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) {
      setErroForm("O código precisa ter de 3 a 30 letras ou números, sem espaço nem acento.");
      return;
    }
    if (tipo === "percentual" ? !(Number.isInteger(valor) && Number(valor) >= 1 && Number(valor) <= 100) : valor === null) {
      setErroForm(tipo === "percentual" ? "O percentual vai de 1 a 100, sem casas decimais." : "Informe um valor de desconto válido.");
      return;
    }
    if (minimo === null) {
      setErroForm("O pedido mínimo não é um valor válido.");
      return;
    }
    if (limite !== null && !(Number.isInteger(limite) && limite > 0)) {
      setErroForm("O limite de usos precisa ser um número inteiro maior que zero.");
      return;
    }

    setEnviando(true);
    const { error } = await createClient().from("cupons").insert({
      codigo,
      descricao: texto("descricao") || null,
      tipo,
      valor,
      minimo_centavos: minimo,
      validade_ate: texto("validade") || null,
      limite_usos: limite,
      so_primeira_compra: dados.get("so_primeira_compra") === "on",
      um_por_cliente: dados.get("um_por_cliente") === "on",
      ativo: true,
    });
    setEnviando(false);

    if (error) {
      setErroForm(error.code === "23505" ? "Já existe um cupom com esse código." : "Não foi possível criar o cupom. Confira os dados.");
      return;
    }
    formulario.reset();
    setTipo("percentual");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-7">
      <SectionCard icone={Plus} titulo="Criar cupom">
        <p className="adm-mapa__dica-linha mb-4">
          O cliente digita o código no carrinho. O desconto é calculado sobre o valor das peças e
          conferido de novo pelo banco ao fechar o pedido.
        </p>
        <form className="adm-form" onSubmit={criar}>
          <div className="adm-campo w-40">
            <label className="adm-campo__rotulo" htmlFor="cp-codigo">Código</label>
            <input className="adm-input" id="cp-codigo" name="codigo" required placeholder="FORMATURA10" autoComplete="off" />
          </div>
          <div className="adm-campo w-36">
            <label className="adm-campo__rotulo" htmlFor="cp-tipo">Tipo</label>
            <select
              className="adm-input"
              id="cp-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "percentual" | "valor")}
            >
              <option value="percentual">Percentual</option>
              <option value="valor">Valor fixo</option>
            </select>
          </div>
          <div className="adm-campo w-28">
            <label className="adm-campo__rotulo" htmlFor="cp-valor">{tipo === "percentual" ? "Desconto (%)" : "Desconto (R$)"}</label>
            <input
              className="adm-input"
              id="cp-valor"
              name="valor"
              required
              inputMode="decimal"
              placeholder={tipo === "percentual" ? "10" : "150,00"}
            />
          </div>
          <div className="adm-campo w-32">
            <label className="adm-campo__rotulo" htmlFor="cp-minimo">Mínimo (R$)</label>
            <input className="adm-input" id="cp-minimo" name="minimo" inputMode="decimal" placeholder="opcional" />
          </div>
          <div className="adm-campo w-40">
            <label className="adm-campo__rotulo" htmlFor="cp-validade">Válido até</label>
            <input className="adm-input" id="cp-validade" name="validade" type="date" />
          </div>
          <div className="adm-campo w-28">
            <label className="adm-campo__rotulo" htmlFor="cp-limite">Limite de usos</label>
            <input className="adm-input" id="cp-limite" name="limite" type="number" min={1} placeholder="sem" />
          </div>
          <div className="adm-campo grow min-w-52">
            <label className="adm-campo__rotulo" htmlFor="cp-desc">Descrição (só a equipe vê)</label>
            <input className="adm-input" id="cp-desc" name="descricao" placeholder="Campanha de formatura" />
          </div>
          <label className="adm-check">
            <input type="checkbox" name="so_primeira_compra" />
            só na primeira compra
          </label>
          <label className="adm-check">
            <input type="checkbox" name="um_por_cliente" defaultChecked />
            um por cliente
          </label>
          <button className="adm-botao" type="submit" disabled={enviando || demo}>
            {enviando && <Loader2 aria-hidden size={14} className="animate-spin" />}
            Criar cupom
          </button>
        </form>
        {erroForm && <p className="adm-erro" role="alert">{erroForm}</p>}
      </SectionCard>

      <SectionCard icone={Ticket} titulo={`Cupons (${cupons.length})`}>
        {erro && <p className="adm-erro" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{erro}</p>}
        {cupons.length === 0 ? (
          <Vazio>Nenhum cupom criado ainda.</Vazio>
        ) : (
          <ul className="adm-lista">
            {cupons.map((c) => {
              const vencido = Boolean(c.validade_ate && c.validade_ate < hoje);
              const esgotado = Boolean(c.limite_usos && c.usos >= c.limite_usos);
              const ocupado = salvando === c.codigo || demo;
              return (
                <li className="adm-lista__item" key={c.codigo} style={{ opacity: c.ativo ? 1 : 0.6 }}>
                  <div className="min-w-52 grow">
                    <span className="adm-lista__nome">{c.codigo}</span>
                    <p className="adm-lista__meta">{descreverRegra(c)}</p>
                    {c.descricao && <p className="adm-lista__meta">{c.descricao}</p>}
                  </div>

                  <label className="adm-check">
                    <input
                      type="checkbox"
                      checked={c.so_primeira_compra}
                      disabled={ocupado}
                      onChange={(e) =>
                        atualizar(c.codigo, { so_primeira_compra: e.target.checked }, "Não foi possível salvar o cupom.")
                      }
                    />
                    só na 1ª compra
                  </label>
                  <label className="adm-check">
                    <input
                      type="checkbox"
                      checked={c.um_por_cliente}
                      disabled={ocupado}
                      onChange={(e) =>
                        atualizar(c.codigo, { um_por_cliente: e.target.checked }, "Não foi possível salvar o cupom.")
                      }
                    />
                    um por cliente
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    {vencido && <span className="adm-tag adm-tag--cancelado">Vencido</span>}
                    {esgotado && <span className="adm-tag adm-tag--aguardando">Esgotado</span>}
                    <span className={c.ativo ? "adm-tag adm-tag--pago" : "adm-tag"}>{c.ativo ? "Ativo" : "Desativado"}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="adm-botao adm-botao--fantasma"
                      disabled={ocupado}
                      onClick={() =>
                        atualizar(c.codigo, { ativo: !c.ativo }, "Não foi possível mudar o cupom.")
                      }
                    >
                      {c.ativo ? "Desativar" : "Ativar"}
                    </button>
                    {c.usos === 0 && (
                      <button
                        type="button"
                        className="adm-icone"
                        aria-label={`Apagar o cupom ${c.codigo}`}
                        disabled={ocupado}
                        onClick={() => excluir(c)}
                      >
                        <Trash2 aria-hidden size={15} strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
