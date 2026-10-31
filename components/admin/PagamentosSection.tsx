"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, ChevronDown, CreditCard, Loader2, RefreshCw, Settings2, Undo2 } from "lucide-react";
import { IntegracaoStatus } from "@/components/admin/IntegracaoStatus";
import { SectionCard, Vazio } from "@/components/admin/Primitivos";
import { formatarPreco, reaisParaCentavos } from "@/lib/admin/format";
import { METODO_DE_PAGAMENTO, STATUS_DO_PAGAMENTO } from "@/lib/conta";
import { ROTULO_DO_ESTADO, ESTADOS_DE_PAGAMENTO, type EstadoDePagamento } from "@/lib/pagamento/estados";
import { createClient } from "@/lib/supabase/client";
import type { DadosDePagamentos, PedidoDePagamento, RegraDeEstoque } from "@/lib/admin/pagamentos";

// Fuso fixo: este componente também é renderizado no servidor (UTC na Vercel),
// e horário diferente entre servidor e navegador quebra a hidratação.
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});

const CLASSE_DO_ESTADO: Record<EstadoDePagamento, string> = {
  pending: "adm-tag--aguardando",
  paid: "adm-tag--pago",
  declined: "adm-tag--cancelado",
  expired: "adm-tag--cancelado",
  refunded: "adm-tag--estornado",
  partially_refunded: "adm-tag--estornado",
  in_dispute: "adm-tag--disputa",
};

type EventoDaFicha = {
  id: string;
  created_at: string;
  tipo: string;
  origem: string;
  detalhe: string | null;
  alerta: string | null;
  recurso_id: string | null;
  assinatura: string | null;
};

type EstornoDaFicha = {
  id: string;
  created_at: string;
  valor_centavos: number;
  status: string;
  motivo: string | null;
  admin_email: string | null;
};

const ROTULO_DO_ESTORNO: Record<string, string> = {
  solicitado: "em andamento",
  concluido: "concluído",
  falhou: "não realizado",
  incerto: "conferindo com o PagBank",
};

/**
 * A aba Pagamentos: tudo o que o PagBank disse, e o que a equipe pode fazer a respeito.
 *
 * Contestação e estorno saltam aos olhos de propósito: é onde se perde dinheiro ou
 * se despacha peça que não devia sair. Quem decide o estado é a reconciliação; os
 * botões daqui só pedem que ela rode, ou que o PagBank devolva um valor.
 */
export function PagamentosSection({ dados, demo }: { dados: DadosDePagamentos; demo: boolean }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<EstadoDePagamento | "todos">("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = dados.pedidos.filter((p) => filtro === "todos" || p.pagamento_estado === filtro);
  const contar = (estado: EstadoDePagamento) => dados.pedidos.filter((p) => p.pagamento_estado === estado).length;

  async function resolverAlerta(id: string) {
    setErro(null);
    const { error } = await createClient()
      .from("payment_events")
      .update({ alerta_resolvido_em: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) {
      setErro("Não foi possível marcar o alerta como resolvido.");
      return;
    }
    router.refresh();
  }

  async function mudarRegra(regra: RegraDeEstoque) {
    setErro(null);
    const { data, error } = await createClient()
      .from("configuracoes_loja")
      .update({ estoque_no_estorno: regra })
      .eq("id", true)
      .select("id");
    if (error || !data?.length) {
      setErro("Não foi possível mudar a regra de estoque.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-7">
      {erro && <div className="adm-erro" role="alert">{erro}</div>}

      <IntegracaoStatus status={dados.integracao} demo={demo} />

      <SectionCard icone={BellRing} titulo={`Alertas (${dados.alertas.length})`}>
        {dados.alertas.length === 0 ? (
          <Vazio>Nenhum alerta em aberto. Contestação e evento desconhecido aparecem aqui.</Vazio>
        ) : (
          dados.alertas.map((a) => (
            <div className="adm-alerta" key={a.id}>
              <span>
                <time className="adm-lista__meta" dateTime={a.created_at}>{dataHora.format(new Date(a.created_at))} · </time>
                {a.alerta}
              </span>
              <button
                type="button"
                className="adm-botao adm-botao--fantasma"
                disabled={demo}
                onClick={() => resolverAlerta(a.id)}
              >
                Marcar como resolvido
              </button>
            </div>
          ))
        )}
      </SectionCard>

      <SectionCard icone={Settings2} titulo="Estoque depois de um estorno total">
        <div className="adm-campo max-w-md">
          <label className="adm-campo__rotulo" htmlFor="pag-regra">Regra</label>
          <select
            className="adm-input"
            id="pag-regra"
            value={dados.regraDeEstoque}
            disabled={demo}
            onChange={(e) => mudarRegra(e.target.value as RegraDeEstoque)}
          >
            <option value="perguntar">Perguntar a cada estorno</option>
            <option value="devolver">Sempre devolver ao estoque</option>
            <option value="nao_devolver">Nunca devolver ao estoque</option>
          </select>
        </div>
        <p className="adm-mapa__dica-linha mt-3">
          Devolver o dinheiro não significa que a peça voltou. Vale para estorno feito fora do painel e como
          sugestão no formulário de estorno.
        </p>
      </SectionCard>

      <SectionCard icone={CreditCard} titulo="Pagamentos">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            className={`adm-botao adm-botao--fantasma${filtro === "todos" ? " is-active" : ""}`}
            onClick={() => setFiltro("todos")}
          >
            Todos ({dados.pedidos.length})
          </button>
          {ESTADOS_DE_PAGAMENTO.map((estado) => (
            <button
              key={estado}
              type="button"
              className={`adm-botao adm-botao--fantasma${filtro === estado ? " is-active" : ""}`}
              onClick={() => setFiltro(estado)}
            >
              {ROTULO_DO_ESTADO[estado]} ({contar(estado)})
            </button>
          ))}
        </div>

        {visiveis.length === 0 ? (
          <Vazio>
            {dados.pedidos.length === 0
              ? "Nenhum pagamento online ainda. Os pedidos aparecem aqui quando a cobrança é aberta no PagBank."
              : "Nenhum pagamento neste filtro."}
          </Vazio>
        ) : (
          visiveis.map((pedido) => (
            <LinhaDePagamento
              key={pedido.id}
              pedido={pedido}
              aberta={aberto === pedido.id}
              alternar={() => setAberto(aberto === pedido.id ? null : pedido.id)}
              regra={dados.regraDeEstoque}
              demo={demo}
            />
          ))
        )}
      </SectionCard>
    </div>
  );
}

function LinhaDePagamento({
  pedido,
  aberta,
  alternar,
  regra,
  demo,
}: {
  pedido: PedidoDePagamento;
  aberta: boolean;
  alternar: () => void;
  regra: RegraDeEstoque;
  demo: boolean;
}) {
  const destaque =
    pedido.pagamento_estado === "in_dispute"
      ? " adm-pag--disputa"
      : pedido.pagamento_estado === "refunded" || pedido.pagamento_estado === "partially_refunded"
        ? " adm-pag--estornado"
        : "";

  return (
    <div className={`adm-pag${destaque}`}>
      <button type="button" className="adm-pag__linha" aria-expanded={aberta} onClick={alternar}>
        <span className={`adm-tag ${CLASSE_DO_ESTADO[pedido.pagamento_estado]}`}>
          {ROTULO_DO_ESTADO[pedido.pagamento_estado]}
        </span>
        <span className="adm-lista__nome">#{pedido.numero} · {pedido.nome}</span>
        <span className="adm-lista__meta">{dataHora.format(new Date(pedido.created_at))}</span>
        <span className="adm-pag__valor">
          {formatarPreco(pedido.total_centavos)}
          {pedido.estornado_centavos > 0 && (
            <span className="adm-lista__meta"> · estornado {formatarPreco(pedido.estornado_centavos)}</span>
          )}
        </span>
        <ChevronDown aria-hidden size={14} />
      </button>

      {aberta && <FichaDePagamento pedido={pedido} regra={regra} demo={demo} />}
    </div>
  );
}

function FichaDePagamento({
  pedido,
  regra,
  demo,
}: {
  pedido: PedidoDePagamento;
  regra: RegraDeEstoque;
  demo: boolean;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [historico, setHistorico] = useState<{ eventos: EventoDaFicha[]; estornos: EstornoDaFicha[] } | null>(null);
  const [formEstorno, setFormEstorno] = useState(false);

  const carregarHistorico = useCallback(async () => {
    const supabase = createClient();
    const [eventos, estornos] = await Promise.all([
      supabase
        .from("payment_events")
        .select("id, created_at, tipo, origem, detalhe, alerta, recurso_id, assinatura")
        .eq("pedido_id", pedido.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("pagamento_estornos")
        .select("id, created_at, valor_centavos, status, motivo, admin_email")
        .eq("pedido_id", pedido.id)
        .order("created_at", { ascending: false }),
    ]);
    return {
      eventos: (eventos.data ?? []) as EventoDaFicha[],
      estornos: (estornos.data ?? []) as EstornoDaFicha[],
    };
  }, [pedido.id]);

  // A ficha abre e já busca o histórico.
  useEffect(() => {
    if (demo) return;
    let ativo = true;
    carregarHistorico().then((h) => {
      if (ativo) setHistorico(h);
    });
    return () => {
      ativo = false;
    };
  }, [carregarHistorico, demo]);

  async function chamar(acao: string, rota: string, corpo?: unknown) {
    setOcupado(acao);
    setRecado(null);
    const resposta = await fetch(`/api/admin/pagamentos/${pedido.numero}/${rota}`, {
      method: "POST",
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await resposta.json().catch(() => null);
    setOcupado(null);
    setRecado(
      resposta.ok
        ? { ok: true, texto: dados?.mensagem ?? "Feito." }
        : { ok: false, texto: dados?.erro ?? "Não foi possível concluir." }
    );
    router.refresh();
    setHistorico(await carregarHistorico());
    return resposta.ok;
  }

  const pagas = pedido.pagamentos.filter(
    (g) => (g.status === "PAID" || g.status === "PARTIALLY_REFUNDED") && g.valor_centavos > g.estornado_centavos
  );
  const estoqueEmAberto =
    !pedido.estoque_no_estorno &&
    pedido.status !== "cancelado" &&
    (pedido.pagamento_estado === "refunded" || pedido.pagamento_estado === "partially_refunded");

  return (
    <div className="adm-pag__corpo">
      <div className="adm-pag__acoes">
        <button
          type="button"
          className="adm-botao adm-botao--fantasma"
          disabled={demo || ocupado !== null}
          onClick={() => chamar("reconciliar", "reconciliar")}
        >
          {ocupado === "reconciliar" ? <Loader2 aria-hidden size={13} className="animate-spin" /> : <RefreshCw aria-hidden size={13} />}
          Reconciliar agora
        </button>
        {pagas.length > 0 && (
          <button
            type="button"
            className="adm-botao adm-botao--fantasma adm-botao--perigo"
            disabled={demo || ocupado !== null}
            aria-expanded={formEstorno}
            onClick={() => setFormEstorno(!formEstorno)}
          >
            <Undo2 aria-hidden size={13} />
            Estornar
          </button>
        )}
        {estoqueEmAberto && (
          <>
            <button
              type="button"
              className="adm-botao adm-botao--fantasma"
              disabled={demo || ocupado !== null}
              onClick={() => {
                if (window.confirm(`Devolver as peças do pedido #${pedido.numero} ao estoque?`)) {
                  void chamar("estoque", "estoque", { devolver: true });
                }
              }}
            >
              Devolver peça ao estoque
            </button>
            <button
              type="button"
              className="adm-botao adm-botao--fantasma"
              disabled={demo || ocupado !== null}
              onClick={() => {
                if (window.confirm(`Confirmar que as peças do pedido #${pedido.numero} NÃO voltam ao estoque?`)) {
                  void chamar("estoque", "estoque", { devolver: false });
                }
              }}
            >
              Peça não volta
            </button>
          </>
        )}
      </div>

      {recado && (
        <p className={recado.ok ? "adm-lista__meta" : "adm-ficha__alerta"} role="status">{recado.texto}</p>
      )}

      {formEstorno && pagas.length > 0 && (
        <FormularioDeEstorno
          pedido={pedido}
          pagas={pagas}
          regra={regra}
          ocupado={ocupado !== null}
          enviar={async (corpo) => {
            if (await chamar("estornar", "estornar", corpo)) setFormEstorno(false);
          }}
        />
      )}

      <div>
        <h4 className="adm-ficha__titulo">Cobranças</h4>
        {pedido.pagamentos.length === 0 ? (
          <p className="adm-lista__meta">Nenhuma cobrança registrada: a pessoa ainda não tentou pagar.</p>
        ) : (
          <ul className="adm-ficha__itens">
            {pedido.pagamentos.map((g) => (
              <li key={g.provedor_pagamento_id}>
                <span>
                  {STATUS_DO_PAGAMENTO[g.status] ?? g.status}
                  <span className="adm-lista__meta">
                    {g.metodo ? (METODO_DE_PAGAMENTO[g.metodo] ?? g.metodo) : "—"}
                    {g.parcelas && g.parcelas > 1 ? ` em ${g.parcelas}x` : ""} · {g.provedor_pagamento_id}
                  </span>
                </span>
                <span>
                  {formatarPreco(g.valor_centavos)}
                  {g.estornado_centavos > 0 && ` (−${formatarPreco(g.estornado_centavos)})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pedido.pagamento_disputas.length > 0 && (
        <div>
          <h4 className="adm-ficha__titulo">Contestações</h4>
          <ul className="adm-ficha__itens">
            {pedido.pagamento_disputas.map((d) => (
              <li key={d.id}>
                <span>
                  {d.status}
                  <span className="adm-lista__meta">
                    {d.classificacao ?? "—"} · {d.id}
                    {d.prazo && ` · responder até ${dataHora.format(new Date(d.prazo))}`}
                  </span>
                </span>
                <span>{formatarPreco(d.valor_centavos)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="adm-ficha__titulo">Histórico</h4>
        {!historico ? (
          <p className="adm-lista__meta">{demo ? "Sem histórico no modo demonstração." : "Carregando…"}</p>
        ) : historico.eventos.length === 0 && historico.estornos.length === 0 ? (
          <p className="adm-lista__meta">Nenhum evento registrado ainda.</p>
        ) : (
          <ul className="adm-pag__historico">
            {historico.estornos.map((e) => (
              <li key={e.id}>
                <time dateTime={e.created_at}>{dataHora.format(new Date(e.created_at))}</time>
                Estorno de {formatarPreco(e.valor_centavos)}, {ROTULO_DO_ESTORNO[e.status] ?? e.status}
                {e.admin_email && `, por ${e.admin_email}`}
                {e.motivo && ` · ${e.motivo}`}
              </li>
            ))}
            {historico.eventos.map((e) => (
              <li key={e.id}>
                <time dateTime={e.created_at}>{dataHora.format(new Date(e.created_at))}</time>
                {e.tipo} ({e.origem}){e.detalhe && ` · ${e.detalhe}`}
                {e.alerta && ` · ${e.alerta}`}
                {e.recurso_id && <span className="adm-lista__meta"> · {e.recurso_id}</span>}
                {e.assinatura && <span className="adm-lista__meta"> · prova: {e.assinatura}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FormularioDeEstorno({
  pedido,
  pagas,
  regra,
  ocupado,
  enviar,
}: {
  pedido: PedidoDePagamento;
  pagas: PedidoDePagamento["pagamentos"];
  regra: RegraDeEstoque;
  ocupado: boolean;
  enviar: (corpo: Record<string, unknown>) => Promise<void>;
}) {
  const [cobrancaId, setCobrancaId] = useState(pagas[0].provedor_pagamento_id);
  const cobranca = pagas.find((g) => g.provedor_pagamento_id === cobrancaId) ?? pagas[0];
  const disponivel = cobranca.valor_centavos - cobranca.estornado_centavos;
  const [valor, setValor] = useState((disponivel / 100).toFixed(2).replace(".", ","));
  const [devolver, setDevolver] = useState(regra === "devolver");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const centavos = reaisParaCentavos(valor);
  const total = centavos === disponivel;

  function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (centavos === null || centavos <= 0 || centavos > disponivel) {
      setErro(`Informe um valor entre R$ 0,01 e ${formatarPreco(disponivel)}.`);
      return;
    }
    const aviso =
      `Devolver ${formatarPreco(centavos)} do pedido #${pedido.numero} ao cliente?\n\n` +
      `${total ? "Estorno total" : "Estorno parcial"}, feito no PagBank agora. Não dá para desfazer.` +
      (total ? `\nA peça ${devolver ? "volta" : "não volta"} ao estoque.` : "");
    if (!window.confirm(aviso)) return;
    void enviar({
      cobrancaId,
      valorCentavos: centavos,
      // Parcial não decide estoque: a decisão fica para o botão da ficha.
      devolverEstoque: total ? devolver : null,
      motivo: motivo.trim() || null,
    });
  }

  return (
    <form className="adm-form" onSubmit={confirmar}>
      {pagas.length > 1 && (
        <div className="adm-campo">
          <label className="adm-campo__rotulo" htmlFor="est-cobranca">Cobrança</label>
          <select
            className="adm-input"
            id="est-cobranca"
            value={cobrancaId}
            onChange={(e) => setCobrancaId(e.target.value)}
          >
            {pagas.map((g) => (
              <option key={g.provedor_pagamento_id} value={g.provedor_pagamento_id}>
                {g.provedor_pagamento_id} · {formatarPreco(g.valor_centavos - g.estornado_centavos)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="adm-campo w-40">
        <label className="adm-campo__rotulo" htmlFor="est-valor">Valor (R$)</label>
        <input className="adm-input" id="est-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <div className="adm-campo grow min-w-44">
        <label className="adm-campo__rotulo" htmlFor="est-motivo">Motivo</label>
        <input className="adm-input" id="est-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Arrependimento, defeito… (opcional)" />
      </div>
      {total && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} />
          Devolver a peça ao estoque
        </label>
      )}
      <button type="submit" className="adm-botao adm-botao--perigo" disabled={ocupado}>
        Estornar{centavos !== null && centavos > 0 ? ` ${formatarPreco(centavos)}` : ""}
      </button>
      {erro && <p className="adm-ficha__alerta" role="alert">{erro}</p>}
    </form>
  );
}
