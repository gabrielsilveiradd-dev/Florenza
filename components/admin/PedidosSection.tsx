"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Mail, MessageCircle, Plus, ReceiptText, Search } from "lucide-react";
import { SectionCard, Vazio } from "@/components/admin/Primitivos";
import { createClient } from "@/lib/supabase/client";
import {
  CLASSE_STATUS, ROTULO_ORIGEM, ROTULO_STATUS, formatarData, formatarPreco, reaisParaCentavos,
} from "@/lib/admin/format";
import { descreverMedida } from "@/lib/aros";
import { STATUS_DO_PAGAMENTO, enderecoEmUmaLinha } from "@/lib/conta";
import { formatarCpf, somenteDigitos } from "@/lib/documentos";
import { UFS } from "@/lib/geo/ufs";
import { RESERVA_HORAS, linkWhatsAppDoCliente } from "@/lib/loja";
import type { PedidoAdmin } from "@/lib/admin/listas";

const STATUS = ["aguardando_pagamento", "pago", "em_producao", "enviado", "entregue", "cancelado"] as const;

// Fuso fixo: este componente também é renderizado no servidor (UTC na Vercel),
// e horário diferente entre servidor e navegador quebra a hidratação.
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});

type Atualizar = (id: string, campos: Record<string, unknown>, falha: string) => Promise<boolean>;

/** Pagamento com algo que só uma pessoa resolve: valor a menor, estorno, estoque que não voltou. */
const precisaAtencao = (p: PedidoAdmin) => p.pagamentos.some((g) => g.pendencia);

/**
 * A aba de pedidos.
 *
 * Cada pedido abre uma FICHA com tudo o que é preciso para atender e despachar
 * sem ir ao SQL Editor: WhatsApp e e-mail do cliente, CPF, endereço completo,
 * medida de cada aro, presente e mensagem, observações, pagamentos, reserva,
 * rastreio e cancelamento com motivo.
 *
 * Nenhuma data de etapa é escrita daqui — `pago_em`, `enviado_em`, `cancelado_em`
 * são carimbadas pela trigger quando o status muda. E mudar o status para
 * cancelado devolve o estoque e o uso do cupom, também no banco.
 */
export function PedidosSection({ pedidos, demo }: { pedidos: PedidoAdmin[]; demo: boolean }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const termo = busca.trim().toLowerCase().replace(/^#/, "");
  const digitos = somenteDigitos(termo);
  const visiveis = pedidos
    .filter((p) => filtro === "todos" || (filtro === "atencao" ? precisaAtencao(p) : p.status === filtro))
    .filter(
      (p) =>
        !termo ||
        String(p.numero) === termo ||
        p.nome.toLowerCase().includes(termo) ||
        (p.email ?? "").toLowerCase().includes(termo) ||
        (digitos.length >= 4 &&
          (somenteDigitos(p.telefone ?? "").includes(digitos) || (p.cpf ?? "").includes(digitos)))
    );
  const contar = (status: string) => pedidos.filter((p) => p.status === status).length;
  const emAtencao = pedidos.filter(precisaAtencao).length;

  const atualizar: Atualizar = async (id, campos, falha) => {
    if (demo) return false;
    setErro(null);
    setSalvando(id);
    const { data, error } = await createClient().from("pedidos").update(campos).eq("id", id).select("id");
    setSalvando(null);
    // Conferir as linhas devolvidas, e não só o erro: se a RLS barrar, o
    // Supabase responde sucesso com zero linhas e a mudança some sem aviso.
    if (error || !data?.length) {
      // P0001 é o `raise exception` das triggers (por exemplo, estoque que
      // acabou ao reativar um cancelado) — a mensagem já vem escrita para gente.
      setErro(error?.code === "P0001" ? error.message : falha);
      return false;
    }
    router.refresh();
    return true;
  };

  async function lancarPedido(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (demo) return;
    setErroForm(null);

    const formulario = evento.currentTarget;
    const dados = new FormData(formulario);
    const nome = String(dados.get("nome") ?? "").trim();
    const totalCentavos = reaisParaCentavos(String(dados.get("valor") ?? ""));
    if (!nome || totalCentavos === null) {
      setErroForm("Informe ao menos o nome do cliente e um valor válido.");
      return;
    }

    setEnviando(true);
    const supabase = createClient();
    const { error } = await supabase.from("pedidos").insert({
      nome,
      telefone: String(dados.get("telefone") ?? "").trim() || null,
      cidade: String(dados.get("cidade") ?? "").trim() || null,
      uf: String(dados.get("uf") ?? "") || null,
      origem: String(dados.get("origem") ?? "loja"),
      status: String(dados.get("status") ?? "pago"),
      total_centavos: totalCentavos,
    });
    setEnviando(false);

    if (error) {
      setErroForm("Não foi possível lançar o pedido. Confira os dados e tente de novo.");
      return;
    }
    formulario.reset();
    router.refresh();
  }

  const botaoFiltro = (valor: string, rotulo: string, quantidade: number) => (
    <button
      key={valor}
      type="button"
      className={`adm-botao adm-botao--fantasma${filtro === valor ? " is-active" : ""}`}
      onClick={() => setFiltro(valor)}
    >
      {rotulo} ({quantidade})
    </button>
  );

  return (
    <div className="flex flex-col gap-7">
      <SectionCard icone={Plus} titulo="Lançar venda feita fora do site">
        <p className="adm-mapa__dica-linha mb-4">
          Venda fechada por WhatsApp, Instagram ou no balcão. O estado é o que acende o mapa —
          sem ele o pedido entra no faturamento, mas não aparece na distribuição por região.
        </p>
        <form className="adm-form" onSubmit={lancarPedido}>
          <div className="adm-campo grow min-w-44">
            <label className="adm-campo__rotulo" htmlFor="ped-nome">Cliente</label>
            <input className="adm-input" id="ped-nome" name="nome" required placeholder="Nome de quem comprou" />
          </div>
          <div className="adm-campo w-40">
            <label className="adm-campo__rotulo" htmlFor="ped-tel">Telefone</label>
            <input className="adm-input" id="ped-tel" name="telefone" type="tel" placeholder="(00) 00000-0000" />
          </div>
          <div className="adm-campo w-40">
            <label className="adm-campo__rotulo" htmlFor="ped-cidade">Cidade</label>
            <input className="adm-input" id="ped-cidade" name="cidade" placeholder="Cidade" />
          </div>
          <div className="adm-campo w-28">
            <label className="adm-campo__rotulo" htmlFor="ped-uf">Estado</label>
            <select className="adm-input" id="ped-uf" name="uf" defaultValue="">
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u.uf} value={u.uf}>{u.uf}</option>
              ))}
            </select>
          </div>
          <div className="adm-campo w-36">
            <label className="adm-campo__rotulo" htmlFor="ped-valor">Valor (R$)</label>
            <input className="adm-input" id="ped-valor" name="valor" required inputMode="decimal" placeholder="2.890,00" />
          </div>
          <div className="adm-campo w-36">
            <label className="adm-campo__rotulo" htmlFor="ped-origem">Origem</label>
            <select className="adm-input" id="ped-origem" name="origem" defaultValue="whatsapp">
              {Object.entries(ROTULO_ORIGEM).map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </select>
          </div>
          <div className="adm-campo w-44">
            <label className="adm-campo__rotulo" htmlFor="ped-status">Situação</label>
            <select className="adm-input" id="ped-status" name="status" defaultValue="pago">
              {STATUS.map((s) => (
                <option key={s} value={s}>{ROTULO_STATUS[s]}</option>
              ))}
            </select>
          </div>
          <button className="adm-botao" type="submit" disabled={enviando || demo}>
            {enviando && <Loader2 aria-hidden size={14} className="animate-spin" />}
            Lançar pedido
          </button>
        </form>
        {erroForm && <p className="adm-erro" role="alert">{erroForm}</p>}
      </SectionCard>

      <SectionCard
        icone={ReceiptText}
        titulo={`Pedidos (${pedidos.length})`}
        acao={
          <div className="flex flex-wrap items-center gap-2">
            <div className="adm-busca">
              <Search aria-hidden size={13} />
              <input
                className="adm-input"
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Número, nome, e-mail, telefone, CPF"
                aria-label="Buscar pedido"
              />
            </div>
            {botaoFiltro("todos", "Todos", pedidos.length)}
            {emAtencao > 0 && botaoFiltro("atencao", "Conferir pagamento", emAtencao)}
            {STATUS.filter((s) => contar(s) > 0).map((s) => botaoFiltro(s, ROTULO_STATUS[s], contar(s)))}
          </div>
        }
      >
        {erro && <p className="adm-erro" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{erro}</p>}

        {visiveis.length === 0 ? (
          <Vazio>{termo ? "Nenhum pedido encontrado para essa busca." : "Nenhum pedido nesta situação."}</Vazio>
        ) : (
          <ul className="adm-lista">
            {visiveis.map((pedido) => {
              const abertoAqui = aberto === pedido.id;
              return (
                <li className="adm-lista__item" key={pedido.id}>
                  <div className="min-w-52 grow">
                    <span className="adm-lista__nome">
                      #{pedido.numero} · {pedido.nome}
                    </span>
                    <p className="adm-lista__meta">
                      {formatarData(pedido.created_at)}
                      {pedido.cidade ? ` · ${pedido.cidade}` : ""}
                      {pedido.uf ? `/${pedido.uf}` : ""}
                      {` · ${ROTULO_ORIGEM[pedido.origem] ?? pedido.origem}`}
                    </p>
                    {pedido.itens.length > 0 && (
                      <p className="adm-lista__meta">
                        {pedido.itens
                          .map((i) => {
                            const medida = descreverMedida(i.aros ?? 0, i.tamanho, i.tamanho_par);
                            return `${i.quantidade}× ${i.nome}${medida ? ` (${medida})` : ""}`;
                          })
                          .join(", ")}
                      </p>
                    )}
                  </div>

                  <span className="adm-lista__nome">{formatarPreco(pedido.total_centavos)}</span>

                  <div className="flex flex-wrap items-center gap-3">
                    {precisaAtencao(pedido) && (
                      <span className="adm-tag adm-tag--cancelado">Conferir pagamento</span>
                    )}
                    <span className={CLASSE_STATUS[pedido.status]}>{ROTULO_STATUS[pedido.status]}</span>
                    <select
                      className="adm-input w-44"
                      aria-label={`Mudar situação do pedido ${pedido.numero}`}
                      value={pedido.status}
                      disabled={salvando === pedido.id || demo}
                      onChange={(e) =>
                        atualizar(pedido.id, { status: e.target.value }, "Não foi possível mudar o status. Tente de novo.")
                      }
                    >
                      {STATUS.map((s) => (
                        <option key={s} value={s}>{ROTULO_STATUS[s]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`adm-botao adm-botao--fantasma${abertoAqui ? " is-active" : ""}`}
                      aria-expanded={abertoAqui}
                      aria-controls={`ficha-${pedido.id}`}
                      onClick={() => setAberto(abertoAqui ? null : pedido.id)}
                    >
                      Ficha
                      <ChevronDown aria-hidden size={13} className={`adm-seta${abertoAqui ? " is-aberta" : ""}`} />
                    </button>
                  </div>

                  {abertoAqui && (
                    <FichaDoPedido
                      pedido={pedido}
                      demo={demo}
                      ocupado={salvando === pedido.id}
                      atualizar={atualizar}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function FichaDoPedido({
  pedido,
  demo,
  ocupado,
  atualizar,
}: {
  pedido: PedidoAdmin;
  demo: boolean;
  ocupado: boolean;
  atualizar: Atualizar;
}) {
  const primeiroNome = pedido.nome.trim().split(" ")[0];
  const whatsapp = linkWhatsAppDoCliente(
    pedido.telefone,
    `Olá, ${primeiroNome}! Aqui é da Florenza, sobre o seu pedido #${pedido.numero}.`
  );
  const endereco = enderecoEmUmaLinha({
    logradouro: pedido.logradouro,
    enderecoNumero: pedido.endereco_numero,
    complemento: pedido.complemento,
    bairro: pedido.bairro,
    cidade: pedido.cidade,
    uf: pedido.uf,
    cep: pedido.cep,
  });
  const aguardando = pedido.status === "aguardando_pagamento";
  const podeDespachar = ["pago", "em_producao", "enviado"].includes(pedido.status);
  const encerrado = pedido.status === "cancelado" || pedido.status === "entregue";
  const semMedida = pedido.itens.some((i) => (i.aros ?? 0) >= 1 && (i.tamanho === null || (i.aros === 2 && i.tamanho_par === null)));
  const bloqueado = ocupado || demo;

  async function salvarEnvio(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const codigo = String(dados.get("codigo") ?? "").trim().toUpperCase() || null;
    const transportadora = String(dados.get("transportadora") ?? "").trim() || null;
    // Com código na mão, o normal é a peça já ter sido postada: marcar como
    // enviado carimba `enviado_em` e acende a etapa "A caminho" para o cliente.
    const marcarEnviado = dados.get("marcar_enviado") === "on" && codigo !== null;
    await atualizar(
      pedido.id,
      { codigo_rastreio: codigo, transportadora, ...(marcarEnviado ? { status: "enviado" } : {}) },
      "Não foi possível salvar o envio."
    );
  }

  async function cancelar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const motivo = String(new FormData(evento.currentTarget).get("motivo") ?? "").trim() || null;
    if (!window.confirm(`Cancelar o pedido #${pedido.numero}? As peças voltam para o estoque.`)) return;
    await atualizar(pedido.id, { status: "cancelado", motivo_cancelamento: motivo }, "Não foi possível cancelar o pedido.");
  }

  return (
    <div className="adm-ficha" id={`ficha-${pedido.id}`}>
      <div className="adm-ficha__grade">
        <section className="adm-ficha__bloco">
          <h4 className="adm-ficha__titulo">Cliente</h4>
          <p>{pedido.nome}</p>
          {pedido.cpf && <p className="adm-lista__meta">CPF {formatarCpf(pedido.cpf)}</p>}
          {pedido.telefone && <p className="adm-lista__meta">{pedido.telefone}</p>}
          {pedido.email && <p className="adm-lista__meta">{pedido.email}</p>}
          {(whatsapp || pedido.email) && (
            <div className="adm-ficha__acoes">
              {whatsapp && (
                <a className="adm-botao" href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden size={14} />
                  WhatsApp
                </a>
              )}
              {pedido.email && (
                <a
                  className="adm-botao adm-botao--fantasma"
                  href={`mailto:${pedido.email}?subject=${encodeURIComponent(`Pedido #${pedido.numero} — Florenza`)}`}
                >
                  <Mail aria-hidden size={13} />
                  E-mail
                </a>
              )}
            </div>
          )}
        </section>

        <section className="adm-ficha__bloco">
          <h4 className="adm-ficha__titulo">Entrega</h4>
          <p>
            {endereco ??
              (pedido.cidade ? `${pedido.cidade}${pedido.uf ? `/${pedido.uf}` : ""} — sem endereço completo` : "Sem endereço")}
          </p>
          {pedido.presente && (
            <p className="adm-ficha__destaque">
              Para presente — sem valores na embalagem.
              {pedido.mensagem_presente && <> Cartão: “{pedido.mensagem_presente}”</>}
            </p>
          )}
          {pedido.observacoes && <p className="adm-ficha__destaque">Observações: {pedido.observacoes}</p>}
          {pedido.codigo_rastreio && (
            <p className="adm-lista__meta" style={{ marginTop: 8 }}>
              Rastreio {pedido.codigo_rastreio}
              {pedido.transportadora && ` · ${pedido.transportadora}`}
            </p>
          )}
          {pedido.motivo_cancelamento && (
            <p className="adm-lista__meta" style={{ marginTop: 8 }}>
              Cancelado: {pedido.motivo_cancelamento}
            </p>
          )}
        </section>

        <section className="adm-ficha__bloco">
          <h4 className="adm-ficha__titulo">Peças</h4>
          <ul className="adm-ficha__itens">
            {pedido.itens.map((i, indice) => {
              const medida = descreverMedida(i.aros ?? 0, i.tamanho, i.tamanho_par);
              return (
                <li key={`${i.sku}-${indice}`}>
                  <span>
                    {i.quantidade}× {i.nome}
                    <span className="adm-lista__meta">
                      cód. {i.sku}
                      {medida && ` · ${medida}`}
                    </span>
                  </span>
                  <span>{formatarPreco(i.preco_centavos * i.quantidade)}</span>
                </li>
              );
            })}
          </ul>
          {semMedida && !encerrado && (
            <p className="adm-ficha__alerta">Há aro sem medida: confirme com o cliente antes de despachar.</p>
          )}
          <dl className="adm-ficha__contas">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatarPreco(pedido.subtotal_centavos)}</dd>
            </div>
            {pedido.desconto_centavos > 0 && (
              <div>
                <dt>Desconto{pedido.cupom_codigo ? ` · ${pedido.cupom_codigo}` : ""}</dt>
                <dd>− {formatarPreco(pedido.desconto_centavos)}</dd>
              </div>
            )}
            <div className="is-total">
              <dt>Total</dt>
              <dd>{formatarPreco(pedido.total_centavos)}</dd>
            </div>
          </dl>
        </section>

        <section className="adm-ficha__bloco">
          <h4 className="adm-ficha__titulo">Pagamento</h4>
          {pedido.pagamentos.length === 0 ? (
            <p className="adm-lista__meta">Nenhum pagamento online registrado.</p>
          ) : (
            <ul className="adm-ficha__itens">
              {pedido.pagamentos.map((g) => (
                <li key={g.provedor_pagamento_id}>
                  <span>
                    {STATUS_DO_PAGAMENTO[g.status] ?? g.status}
                    <span className="adm-lista__meta">
                      {g.metodo ?? "—"}
                      {g.parcelas && g.parcelas > 1 ? ` em ${g.parcelas}x` : ""} · Mercado Pago {g.provedor_pagamento_id}
                    </span>
                    {g.pendencia && <span className="adm-ficha__alerta">{g.pendencia}</span>}
                  </span>
                  <span>{formatarPreco(g.valor_centavos)}</span>
                </li>
              ))}
            </ul>
          )}

          {aguardando && (
            <div className="adm-ficha__reserva">
              {pedido.expira_em ? (
                <>
                  <p className="adm-lista__meta">
                    Reserva até {dataHora.format(new Date(pedido.expira_em))}. Sem pagamento até lá, o
                    pedido cancela sozinho e as peças voltam ao estoque.
                  </p>
                  <button
                    type="button"
                    className="adm-botao adm-botao--fantasma"
                    disabled={bloqueado}
                    onClick={() => atualizar(pedido.id, { expira_em: null }, "Não foi possível segurar a reserva.")}
                  >
                    Segurar reserva
                  </button>
                </>
              ) : (
                <>
                  <p className="adm-lista__meta">Reserva segurada: este pedido não cancela sozinho.</p>
                  <button
                    type="button"
                    className="adm-botao adm-botao--fantasma"
                    disabled={bloqueado}
                    onClick={() =>
                      atualizar(
                        pedido.id,
                        { expira_em: new Date(Date.now() + RESERVA_HORAS * 3600_000).toISOString() },
                        "Não foi possível devolver o prazo."
                      )
                    }
                  >
                    Voltar a vencer em {RESERVA_HORAS}h
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {(podeDespachar || !encerrado) && (
        <div className="adm-ficha__rodape">
          {podeDespachar && (
            <form className="adm-form" onSubmit={salvarEnvio}>
              <div className="adm-campo w-52">
                <label className="adm-campo__rotulo" htmlFor={`rastreio-${pedido.id}`}>Código de rastreio</label>
                <input
                  className="adm-input"
                  id={`rastreio-${pedido.id}`}
                  name="codigo"
                  defaultValue={pedido.codigo_rastreio ?? ""}
                  placeholder="QB123456789BR"
                  autoComplete="off"
                />
              </div>
              <div className="adm-campo w-44">
                <label className="adm-campo__rotulo" htmlFor={`transp-${pedido.id}`}>Transportadora</label>
                <input
                  className="adm-input"
                  id={`transp-${pedido.id}`}
                  name="transportadora"
                  defaultValue={pedido.transportadora ?? ""}
                  placeholder="Correios"
                />
              </div>
              {pedido.status !== "enviado" && (
                <label className="adm-check">
                  <input type="checkbox" name="marcar_enviado" defaultChecked />
                  marcar como enviado
                </label>
              )}
              <button className="adm-botao" type="submit" disabled={bloqueado}>
                {ocupado && <Loader2 aria-hidden size={14} className="animate-spin" />}
                Salvar envio
              </button>
            </form>
          )}

          {!encerrado && (
            <form className="adm-form" onSubmit={cancelar}>
              <div className="adm-campo grow min-w-52">
                <label className="adm-campo__rotulo" htmlFor={`motivo-${pedido.id}`}>
                  Motivo do cancelamento — o cliente vê
                </label>
                <input
                  className="adm-input"
                  id={`motivo-${pedido.id}`}
                  name="motivo"
                  placeholder="Ex.: a pedido do cliente."
                />
              </div>
              <button className="adm-botao adm-botao--fantasma adm-botao--perigo" type="submit" disabled={bloqueado}>
                Cancelar pedido
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
