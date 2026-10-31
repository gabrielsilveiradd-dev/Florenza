import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  ambientePagBank, pagBankConfigurado, pagamentoOnlineAtivo, type AmbientePagBank,
} from "@/lib/pagamento/config";
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

export type StatusDaIntegracao = {
  ambiente: AmbientePagBank;
  configurado: boolean;
  ligado: boolean;
  ultimoWebhook: string | null;
  ultimaReconciliacao: string | null;
  pendentes: number;
};

export type DadosDePagamentos = {
  pedidos: PedidoDePagamento[];
  alertas: AlertaDePagamento[];
  regraDeEstoque: RegraDeEstoque;
  integracao: StatusDaIntegracao;
};

export async function carregarPagamentosAdmin(): Promise<DadosDePagamentos> {
  // Só booleanos e o nome do ambiente: nenhum valor de variável vai para a tela.
  const integracao: StatusDaIntegracao = {
    ambiente: ambientePagBank(),
    configurado: pagBankConfigurado(),
    ligado: pagamentoOnlineAtivo(),
    ultimoWebhook: null,
    ultimaReconciliacao: null,
    pendentes: 0,
  };
  const vazio: DadosDePagamentos = { pedidos: [], alertas: [], regraDeEstoque: "perguntar", integracao };
  if (!supabaseConfigurado()) return vazio;

  const supabase = await createClient();
  const [pedidos, alertas, regra, webhook, conferencia, pendentes] = await Promise.all([
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
    supabase
      .from("payment_events")
      .select("created_at")
      .eq("origem", "webhook")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
    supabase
      .from("pedidos")
      .select("reconciliado_em")
      .not("reconciliado_em", "is", null)
      .order("reconciliado_em", { ascending: false })
      .limit(1)
      .maybeSingle<{ reconciliado_em: string }>(),
    supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("status", "aguardando_pagamento")
      .in("pagamento_estado", ["pending", "declined"]),
  ]);

  return {
    pedidos: (pedidos.data ?? []) as unknown as PedidoDePagamento[],
    alertas: (alertas.data ?? []) as AlertaDePagamento[],
    regraDeEstoque: regra.data?.estoque_no_estorno ?? "perguntar",
    integracao: {
      ...integracao,
      ultimoWebhook: webhook.data?.created_at ?? null,
      ultimaReconciliacao: conferencia.data?.reconciliado_em ?? null,
      pendentes: pendentes.count ?? 0,
    },
  };
}
