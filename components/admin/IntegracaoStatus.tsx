"use client";

import { useState } from "react";
import { Download, Loader2, PlugZap } from "lucide-react";
import { MiniStat, SectionCard } from "@/components/admin/Primitivos";
import type { StatusDaIntegracao } from "@/lib/admin/pagamentos";

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});

type Resultado = { ok: boolean; mensagem: string };

/**
 * Status da integração: em que ambiente a loja está e se o PagBank está respondendo.
 * É o que se confere antes de ligar a produção, e o que se manda para o suporte.
 * Nenhum valor de variável de ambiente chega aqui, só booleanos e o nome do ambiente.
 */
export function IntegracaoStatus({ status, demo }: { status: StatusDaIntegracao; demo: boolean }) {
  const [testando, setTestando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function testar(acao: "token" | "checkout" | "preferencias") {
    if (
      acao === "checkout" &&
      !window.confirm("Cria e inativa em seguida um checkout de R$ 1,00. Nada é cobrado. Continuar?")
    ) {
      return;
    }
    setTestando(acao);
    setResultado(null);
    const resposta = await fetch("/api/admin/pagbank/integracao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    });
    const dados = await resposta.json().catch(() => null);
    setTestando(null);
    setResultado({ ok: Boolean(dados?.ok), mensagem: dados?.mensagem ?? dados?.erro ?? "Sem resposta do servidor." });
  }

  const situacao = !status.configurado
    ? "Faltam variáveis: o checkout usa o acerto por WhatsApp."
    : !status.ligado
      ? "PAGBANK_ENABLED desligada: o checkout usa o acerto por WhatsApp."
      : status.ambiente === "sandbox"
        ? "Ligado no sandbox: nenhum pagamento é real."
        : "Ligado em produção: os pagamentos são reais.";

  const botao = (acao: "token" | "checkout" | "preferencias", rotulo: string) => (
    <button
      type="button"
      className="adm-botao adm-botao--fantasma"
      disabled={demo || testando !== null}
      onClick={() => testar(acao)}
    >
      {testando === acao && <Loader2 aria-hidden size={13} className="animate-spin" />}
      {rotulo}
    </button>
  );

  return (
    <SectionCard icone={PlugZap} titulo="Status da integração">
      <p className="adm-lista__nome mb-3">{situacao}</p>

      <div className="adm-integracao">
        <MiniStat rotulo="Ambiente" valor={status.ambiente === "production" ? "Produção" : "Sandbox"} />
        <MiniStat rotulo="Pedidos pendentes" valor={String(status.pendentes)} />
        <MiniStat
          rotulo="Último webhook"
          valor={status.ultimoWebhook ? dataHora.format(new Date(status.ultimoWebhook)) : "Nenhum recebido"}
        />
        <MiniStat
          rotulo="Última conferência"
          valor={status.ultimaReconciliacao ? dataHora.format(new Date(status.ultimaReconciliacao)) : "Nenhuma"}
        />
      </div>

      <div className="adm-pag__acoes mt-4">
        {botao("token", "Testar token")}
        {botao("checkout", "Testar criação de checkout")}
        {botao("preferencias", "Ligar avisos de contestação")}
        {/* Download, não navegação: <Link> tentaria abrir a rota como página. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="adm-botao adm-botao--fantasma" href="/api/admin/pagbank/logs?formato=csv&dias=30">
          <Download aria-hidden size={13} />
          Exportar logs (CSV)
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="adm-botao adm-botao--fantasma" href="/api/admin/pagbank/logs?formato=json&dias=30">
          <Download aria-hidden size={13} />
          Exportar logs (JSON)
        </a>
      </div>

      {resultado && (
        <p className={`adm-integracao__resultado${resultado.ok ? "" : " adm-ficha__alerta"}`} role="status">
          {resultado.mensagem}
        </p>
      )}
    </SectionCard>
  );
}
