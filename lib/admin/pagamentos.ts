import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { EstadoDePagamento } from "@/lib/pagamento/estados";

/* A aba Pagamentos. Quem filtra é a RLS: as tabelas só abrem para admin. */

export type PagamentoDaFicha = {
  provedor_pagamento_id: string;
  status: string;
  metodo: string | null;
  valor_centavos: number;
  estornado_centavos: number;
  parcelas: number | null;
};

export type DisputaDaFicha = {
  id: string;
  status: string;
  valor_centavos: number;
  prazo: string | null;
  classificacao: string | null;
};

export type PedidoDePagamento = {
  numero: number;
  nome: string;
  status: string;
  pagamento_estado: EstadoDePagamento;
  total_centavos: number;
  estornado_centavos: number;
  estornado_em: string | null;
  estoque_no_estorno: string | null;
  created_at: string;
  id: string;
  pagamentos: PagamentoDaFicha[];
  pagamento_disputas: DisputaDaFicha[];
};

export type AlertaDePagamento = {
  id: string;
  alerta: string;
  created_at: string;
  pedido_id: string | null;
  tipo: string;
};

export type RegraDeEstoque = "perguntar" | "devolver" | "nao_devolver";

export type DadosDePagamentos = {
  pedidos: PedidoDePagamento[];
  alertas: AlertaDePagamento[];
  regraDeEstoque: RegraDeEstoque;
};

export async function carregarPagamentosAdmin(): Promise<DadosDePagamentos> {
  const vazio: DadosDePagamentos = { pedidos: [], alertas: [], regraDeEstoque: "perguntar" };
  if (!supabaseConfigurado()) return vazio;

  const supabase = await createClient();
  const [pedidos, alertas, regra] = await Promise.all([
    supabase
      .from("pedidos")
      .select(
        "id, numero, nome, status, pagamento_estado, total_centavos, estornado_centavos, estornado_em, estoque_no_estorno, created_at, " +
          "pagamentos(provedor_pagamento_id, status, metodo, valor_centavos, estornado_centavos, parcelas), " +
          "pagamento_disputas(id, status, valor_centavos, prazo, classificacao)"
      )
      .not("pagamento_estado", "is", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("payment_events")
      .select("id, alerta, created_at, pedido_id, tipo")
      .not("alerta", "is", null)
      .is("alerta_resolvido_em", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("configuracoes_loja").select("estoque_no_estorno").maybeSingle<{ estoque_no_estorno: RegraDeEstoque }>(),
  ]);

  return {
    pedidos: (pedidos.data ?? []) as unknown as PedidoDePagamento[],
    alertas: (alertas.data ?? []) as AlertaDePagamento[],
    regraDeEstoque: regra.data?.estoque_no_estorno ?? "perguntar",
  };
}
