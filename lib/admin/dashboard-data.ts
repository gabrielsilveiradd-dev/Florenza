/* Toda a agregação do dashboard num lugar só.
 *
 * Com o Supabase plugado, quem soma é o Postgres: as visões
 * vw_vendas_por_uf / _regiao / _mes / vw_produtos_vendidos já chegam
 * prontas, e o painel só desenha. Somar no banco evita trazer milhares de
 * linhas de pedido pela rede para descobrir um total.
 *
 * Sem chaves configuradas, as mesmas contas rodam em JavaScript sobre os dados
 * de exemplo de dados-demo.ts. O formato de saída é idêntico nos dois caminhos,
 * então nenhum componente sabe em qual modo está — só o aviso no topo sabe.
 */
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { produtos as produtosLocais } from "@/lib/data/catalogo-local";
import { PEDIDOS_DEMO, CLIENTES_DEMO, type PedidoDemo } from "@/lib/admin/dados-demo";
import { REGIOES, UFS } from "@/lib/geo/ufs";

/** Status que contam como venda — mesma regra de vw_pedidos_confirmados. */
const CONFIRMADOS = new Set(["pago", "em_producao", "enviado", "entregue"]);

export type LinhaUF = {
  uf: string;
  ufNome: string;
  regiao: string;
  pedidos: number;
  totalCentavos: number;
};

export type DashboardData = {
  demo: boolean;
  cards: {
    faturamentoMes: number;
    pedidosMes: number;
    ticketMedio: number;
    clientesNovosMes: number;
    pecasAtivas: number;
    regiaoLider: { regiao: string; totalCentavos: number } | null;
  };
  mapa: LinhaUF[];
  regioes: { regiao: string; pedidos: number; totalCentavos: number }[];
  meses: { rotulo: string; pedidos: number; totalCentavos: number }[];
  maisVendidos: { sku: string; nome: string; unidades: number; totalCentavos: number }[];
};

const inicioDoMes = () => {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
};

/** Ordena por faturamento e corta. */
const topN = <T extends { totalCentavos: number }>(lista: T[], n: number) =>
  [...lista].sort((a, b) => b.totalCentavos - a.totalCentavos).slice(0, n);

// ---------------------------------------------------------------------------
// Modo demonstração — as mesmas contas, em JavaScript
// ---------------------------------------------------------------------------
function agregarDemo(): DashboardData {
  const confirmados = PEDIDOS_DEMO.filter((p) => CONFIRMADOS.has(p.status));
  const desde = inicioDoMes();
  const doMes = confirmados.filter((p) => new Date(p.created_at) >= desde);

  const somar = (lista: PedidoDemo[]) => lista.reduce((s, p) => s + p.total_centavos, 0);

  // Mapa: parte das 27 UFs para nenhum estado sumir por não ter venda.
  const porUF = new Map<string, { pedidos: number; totalCentavos: number }>();
  for (const p of confirmados) {
    if (!p.uf) continue;
    const atual = porUF.get(p.uf) ?? { pedidos: 0, totalCentavos: 0 };
    atual.pedidos += 1;
    atual.totalCentavos += p.total_centavos;
    porUF.set(p.uf, atual);
  }
  const mapa: LinhaUF[] = UFS.map((u) => ({
    uf: u.uf,
    ufNome: u.nome,
    regiao: u.regiao,
    pedidos: porUF.get(u.uf)?.pedidos ?? 0,
    totalCentavos: porUF.get(u.uf)?.totalCentavos ?? 0,
  }));

  const regioes = REGIOES.map((regiao) => {
    const linhas = mapa.filter((l) => l.regiao === regiao);
    return {
      regiao,
      pedidos: linhas.reduce((s, l) => s + l.pedidos, 0),
      totalCentavos: linhas.reduce((s, l) => s + l.totalCentavos, 0),
    };
  });

  // 12 meses, inclusive os vazios — um mês faltando faria a linha "pular".
  const agora = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - (11 - i), 1);
    const doMesI = confirmados.filter((p) => {
      const pd = new Date(p.created_at);
      return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
    });
    return {
      rotulo: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`,
      pedidos: doMesI.length,
      totalCentavos: somar(doMesI),
    };
  });

  const porSku = new Map<string, { sku: string; nome: string; unidades: number; totalCentavos: number }>();
  for (const p of confirmados) {
    for (const item of p.itens) {
      const atual = porSku.get(item.sku) ?? { sku: item.sku, nome: item.nome, unidades: 0, totalCentavos: 0 };
      atual.unidades += item.quantidade;
      atual.totalCentavos += item.preco_centavos * item.quantidade;
      porSku.set(item.sku, atual);
    }
  }

  const lider = [...regioes].sort((a, b) => b.totalCentavos - a.totalCentavos)[0];

  return {
    demo: true,
    cards: {
      faturamentoMes: somar(doMes),
      pedidosMes: doMes.length,
      ticketMedio: doMes.length ? Math.round(somar(doMes) / doMes.length) : 0,
      clientesNovosMes: CLIENTES_DEMO.filter((c) => new Date(c.created_at) >= desde).length,
      pecasAtivas: produtosLocais.filter((p) => p.ativo).length,
      regiaoLider: lider && lider.totalCentavos > 0 ? lider : null,
    },
    mapa,
    regioes,
    meses,
    maisVendidos: topN([...porSku.values()], 8),
  };
}

// ---------------------------------------------------------------------------
// Modo real — o Postgres já entrega somado
// ---------------------------------------------------------------------------
async function agregarSupabase(): Promise<DashboardData> {
  const supabase = await createClient();
  const desde = inicioDoMes().toISOString();

  const [porUF, porRegiao, porMes, maisVendidos, doMes, clientesNovos, pecas] =
    await Promise.all([
      supabase.from("vw_vendas_por_uf").select("uf, uf_nome, regiao, pedidos, total_centavos"),
      supabase.from("vw_vendas_por_regiao").select("regiao, pedidos, total_centavos"),
      supabase.from("vw_vendas_por_mes").select("rotulo, pedidos, total_centavos"),
      supabase
        .from("vw_produtos_vendidos")
        .select("sku, nome, unidades, total_centavos")
        .order("total_centavos", { ascending: false })
        .limit(8),
      supabase.from("vw_pedidos_confirmados").select("id, total_centavos").gte("created_at", desde),
      supabase.from("vw_clientes").select("id", { count: "exact", head: true }).gte("created_at", desde),
      supabase.from("produtos").select("id", { count: "exact", head: true }).eq("ativo", true),
    ]);

  const pedidosMes = doMes.data ?? [];
  const faturamentoMes = pedidosMes.reduce((s, p) => s + (p.total_centavos ?? 0), 0);

  const regioes = (porRegiao.data ?? []).map((r) => ({
    regiao: r.regiao as string,
    pedidos: Number(r.pedidos),
    totalCentavos: Number(r.total_centavos),
  }));
  const lider = [...regioes].sort((a, b) => b.totalCentavos - a.totalCentavos)[0];

  return {
    demo: false,
    cards: {
      faturamentoMes,
      pedidosMes: pedidosMes.length,
      ticketMedio: pedidosMes.length ? Math.round(faturamentoMes / pedidosMes.length) : 0,
      clientesNovosMes: clientesNovos.count ?? 0,
      pecasAtivas: pecas.count ?? 0,
      regiaoLider: lider && lider.totalCentavos > 0 ? lider : null,
    },
    mapa: (porUF.data ?? []).map((l) => ({
      uf: l.uf as string,
      ufNome: l.uf_nome as string,
      regiao: l.regiao as string,
      pedidos: Number(l.pedidos),
      totalCentavos: Number(l.total_centavos),
    })),
    regioes,
    meses: (porMes.data ?? []).map((m) => ({
      rotulo: m.rotulo as string,
      pedidos: Number(m.pedidos),
      totalCentavos: Number(m.total_centavos),
    })),
    maisVendidos: (maisVendidos.data ?? []).map((p) => ({
      sku: p.sku as string,
      nome: p.nome as string,
      unidades: Number(p.unidades),
      totalCentavos: Number(p.total_centavos),
    })),
  };
}

export async function carregarDashboard(): Promise<DashboardData> {
  return supabaseConfigurado() ? agregarSupabase() : agregarDemo();
}
