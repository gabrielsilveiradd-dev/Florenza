import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeDollarSign, Gem, LayoutDashboard, MapPin, Package, PlugZap, ReceiptText,
  ShieldAlert, Ticket, TriangleAlert, Users, Wallet,
} from "lucide-react";
import { SectionCard, StatCard } from "@/components/admin/Primitivos";
import { VendasSection } from "@/components/admin/VendasSection";
import { PedidosSection } from "@/components/admin/PedidosSection";
import { ClientesSection } from "@/components/admin/ClientesSection";
import { CatalogoSection } from "@/components/admin/CatalogoSection";
import { CuponsSection } from "@/components/admin/CuponsSection";
import { carregarDashboard } from "@/lib/admin/dashboard-data";
import {
  listarCategoriasAdmin, listarClientesAdmin, listarCuponsAdmin, listarPedidosAdmin, listarProdutosAdmin,
} from "@/lib/admin/listas";
import { formatarPreco } from "@/lib/admin/format";
import { avisosConfigurados } from "@/lib/avisos";
import { camposDaLojaPendentes } from "@/lib/loja";
import { mercadoPagoEmTeste, pagamentoOnlineAtivo } from "@/lib/pagamento/config";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import "./admin.css";

export const metadata: Metadata = {
  title: "Painel — Florenza",
  // Painel administrativo não entra em busca.
  robots: { index: false, follow: false },
};

const ABAS = [
  { id: "vendas", rotulo: "Vendas", icone: LayoutDashboard },
  { id: "pedidos", rotulo: "Pedidos", icone: ReceiptText },
  { id: "catalogo", rotulo: "Catálogo", icone: Gem },
  { id: "cupons", rotulo: "Cupons", icone: Ticket },
  { id: "clientes", rotulo: "Clientes", icone: Users },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

/**
 * O que está ligado e o que não está, dito na aba onde faz diferença.
 *
 * Só booleanos saem daqui — nenhum valor de variável de ambiente chega à tela.
 * Serve para a equipe não descobrir pelo cliente que o aviso de pedido não
 * chegava, ou que o Mercado Pago ainda estava com a credencial de teste.
 */
function LigacoesDaLoja() {
  const avisos = avisosConfigurados();
  const online = pagamentoOnlineAtivo();
  const faltam = camposDaLojaPendentes();

  const itens = [
    {
      rotulo: "Pagamento online",
      ok: online && !mercadoPagoEmTeste(),
      selo: online ? (mercadoPagoEmTeste() ? "Teste" : "Ligado") : "Desligado",
      detalhe: online
        ? mercadoPagoEmTeste()
          ? "Mercado Pago com credencial de TESTE — nenhum pagamento é real."
          : "Mercado Pago recebendo Pix e cartão."
        : "Pedidos ficam aguardando pagamento e o acerto é por WhatsApp.",
    },
    {
      rotulo: "Aviso de pedido novo (e-mail)",
      ok: avisos.emailParaLoja,
      selo: avisos.emailParaLoja ? "Ligado" : "Desligado",
      detalhe: avisos.emailParaLoja
        ? "A loja recebe um e-mail a cada pedido e a cada pagamento confirmado."
        : "Sem aviso: confira esta aba para ver pedidos novos.",
    },
    {
      rotulo: "E-mail para o cliente",
      ok: avisos.emailParaCliente,
      selo: avisos.emailParaCliente ? "Ligado" : "Desligado",
      detalhe: avisos.emailParaCliente
        ? "O cliente recebe o resumo do pedido e a confirmação do pagamento."
        : "O cliente acompanha só pela página do pedido.",
    },
    {
      rotulo: "Webhook (n8n / WhatsApp)",
      ok: avisos.webhook,
      selo: avisos.webhook ? "Ligado" : "Desligado",
      detalhe: avisos.webhook ? "Cada pedido novo é enviado ao fluxo configurado." : "Nenhum fluxo externo recebe os pedidos.",
    },
    {
      rotulo: "Dados da loja",
      ok: faltam.length === 0,
      selo: faltam.length === 0 ? "Completos" : "Incompletos",
      detalhe:
        faltam.length === 0
          ? "CNPJ, endereço e contatos à vista no rodapé e nas políticas."
          : `Faltam em lib/loja.ts: ${faltam.join(", ")}. Sem eles o site não publica em produção.`,
    },
  ];

  return (
    <SectionCard icone={PlugZap} titulo="Ligações da loja">
      <ul className="adm-ligacoes">
        {itens.map((i) => (
          <li className="adm-ligacao" key={i.rotulo}>
            <span className={`adm-tag ${i.ok ? "adm-tag--pago" : "adm-tag--aguardando"}`}>{i.selo}</span>
            <div>
              <p className="adm-lista__nome">{i.rotulo}</p>
              <p className="adm-lista__meta">{i.detalhe}</p>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export default async function PaginaAdmin({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const demo = !supabaseConfigurado();

  // Segunda das três camadas de proteção. O proxy já redirecionou quem não é
  // admin, mas confiar só nele é confiar em quem chamou a rota — e a checagem
  // aqui custa uma consulta. A terceira camada, a que realmente vale, é a RLS.
  if (!demo) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/conta?redirect=%2Fadmin");

    const { data: perfil } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (perfil?.role !== "admin") {
      return (
        <main className="adm">
          <div className="adm-secao" style={{ maxWidth: 460, margin: "0 auto", textAlign: "center" }}>
            <ShieldAlert aria-hidden size={34} strokeWidth={1.3} style={{ color: "var(--gold)", margin: "0 auto" }} />
            <h1 className="adm__titulo" style={{ fontSize: 26 }}>Acesso restrito</h1>
            <p className="adm__sub">Esta área é exclusiva da equipe Florenza.</p>
          </div>
        </main>
      );
    }
  }

  const pedida = (await searchParams).aba;
  const aba: AbaId = ABAS.some((a) => a.id === pedida) ? (pedida as AbaId) : "vendas";

  const [dados, pedidos, clientes, produtos, categorias, cupons] = await Promise.all([
    carregarDashboard(),
    listarPedidosAdmin(),
    listarClientesAdmin(),
    listarProdutosAdmin(),
    listarCategoriasAdmin(),
    listarCuponsAdmin(),
  ]);

  const aguardando = pedidos.filter((p) => p.status === "aguardando_pagamento").length;

  return (
    <main className="adm">
      <p className="adm__eyebrow">Equipe Florenza</p>
      <h1 className="adm__titulo">Painel</h1>
      <p className="adm__sub">
        Os números da loja, o que está à venda e quem está comprando.
      </p>

      {demo && (
        <div className="adm-aviso" style={{ marginTop: 28 }}>
          <TriangleAlert aria-hidden size={18} strokeWidth={1.6} style={{ color: "var(--gold-ink)", flexShrink: 0 }} />
          <span>
            <strong>Modo demonstração.</strong> O Supabase ainda não está conectado, então tudo
            nesta tela são <strong>dados de exemplo</strong> — servem para conferir o layout, não
            para tomar decisão. Assim que as chaves entrarem em <code>.env.local</code>, o painel
            passa a ler o banco de verdade e os botões de salvar ficam ativos.
          </span>
        </div>
      )}

      <nav className="adm__abas" aria-label="Seções do painel">
        {ABAS.map((item) => {
          const Icone = item.icone;
          const ativa = aba === item.id;
          const conta = item.id === "pedidos" ? aguardando : 0;
          return (
            <Link
              key={item.id}
              href={item.id === "vendas" ? "/admin" : `/admin?aba=${item.id}`}
              className={`adm__aba${ativa ? " is-active" : ""}`}
              aria-current={ativa ? "page" : undefined}
            >
              <Icone aria-hidden size={14} strokeWidth={1.75} />
              {item.rotulo}
              {conta > 0 && (
                <span className="adm__aba-conta" aria-label={`${conta} aguardando pagamento`}>
                  {conta}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {aba === "vendas" && (
        <div className="flex flex-col gap-7">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              icone={Wallet}
              rotulo="Faturamento do mês"
              valor={formatarPreco(dados.cards.faturamentoMes)}
            />
            <StatCard icone={ReceiptText} rotulo="Pedidos do mês" valor={String(dados.cards.pedidosMes)} />
            <StatCard
              icone={BadgeDollarSign}
              rotulo="Ticket médio"
              valor={formatarPreco(dados.cards.ticketMedio)}
            />
            <StatCard icone={Users} rotulo="Clientes novos" valor={String(dados.cards.clientesNovosMes)} />
            <StatCard icone={Package} rotulo="Peças à venda" valor={String(dados.cards.pecasAtivas)} />
            <StatCard
              icone={MapPin}
              rotulo="Região líder"
              valor={dados.cards.regiaoLider?.regiao ?? "—"}
              nota={
                dados.cards.regiaoLider
                  ? formatarPreco(dados.cards.regiaoLider.totalCentavos)
                  : "Ainda sem vendas"
              }
            />
          </div>

          <VendasSection dados={dados} />
        </div>
      )}

      {aba === "pedidos" && (
        <div className="flex flex-col gap-7">
          <LigacoesDaLoja />
          <PedidosSection pedidos={pedidos} demo={demo} />
        </div>
      )}
      {aba === "catalogo" && <CatalogoSection produtos={produtos} categorias={categorias} demo={demo} />}
      {aba === "cupons" && <CuponsSection cupons={cupons} demo={demo} />}
      {aba === "clientes" && <ClientesSection clientes={clientes} demo={demo} />}
    </main>
  );
}
