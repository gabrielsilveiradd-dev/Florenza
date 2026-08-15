import { createClient } from "@/lib/supabase/server";
import type { PedidoDaConta, PerfilDaConta } from "@/lib/conta";

/**
 * As consultas da área da conta. Ficam separadas de `lib/conta.ts` porque este
 * arquivo importa `lib/supabase/server.ts`, que lê `next/headers` e só existe
 * no servidor — e `lib/conta.ts` é importado também pelo formulário, que é
 * componente de cliente. Juntos, o build quebra ao tentar levar `next/headers`
 * para o navegador.
 *
 * Aqui o cliente com cookie é o certo, ao contrário da vitrine: esta página é
 * sobre quem está olhando, então é dinâmica de qualquer jeito. O motivo de
 * `lib/supabase/publico.ts` existir — não estragar a pré-renderização das 23
 * páginas públicas — não se aplica a /conta.
 *
 * Nenhuma consulta filtra por `user_id`, e isso é de propósito: quem filtra é a
 * RLS ("Cliente lê os próprios pedidos"). Repetir o filtro aqui daria a
 * impressão de que ele é a proteção, e no dia em que alguém esquecesse de
 * escrevê-lo o vazamento seria silencioso. Deixando o banco decidir, esquecer
 * não é possível.
 */

export async function lerPerfil(): Promise<PerfilDaConta | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("nome, telefone, cep, cidade, uf, forma_pagamento_preferida")
    .single();

  if (!data) return null;
  return {
    nome: data.nome ?? "",
    telefone: data.telefone ?? "",
    cep: data.cep ?? "",
    cidade: data.cidade ?? "",
    uf: data.uf ?? "",
    formaPagamento: data.forma_pagamento_preferida ?? "",
  };
}

/**
 * A forma que o PostgREST devolve, para o cast logo abaixo.
 *
 * Sem os tipos gerados do banco, o TypeScript não sabe o formato de um select
 * com tabela aninhada e infere `GenericStringError` para cada campo. É o mesmo
 * cast documentado em lib/admin/listas.ts, e ele sai no dia em que rodarmos
 * `supabase gen types` (pendência conhecida no CLAUDE.md).
 */
type LinhaPedido = {
  id: string;
  numero: number;
  status: string;
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  cupom_codigo: string | null;
  created_at: string;
  pago_em: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  codigo_rastreio: string | null;
  transportadora: string | null;
  cidade: string | null;
  uf: string | null;
  pedido_itens: Array<{
    sku: string;
    nome: string;
    preco_centavos: number;
    quantidade: number;
  }> | null;
};

export async function listarMeusPedidos(): Promise<PedidoDaConta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "id, numero, status, subtotal_centavos, desconto_centavos, total_centavos, " +
        "cupom_codigo, created_at, pago_em, enviado_em, entregue_em, " +
        "codigo_rastreio, transportadora, cidade, uf, " +
        "pedido_itens (sku, nome, preco_centavos, quantidade)"
    )
    .order("created_at", { ascending: false });

  // Diferente da vitrine, aqui o erro NÃO sobe. Lá servir preço velho em
  // silêncio seria pior que a tela de erro; aqui derrubar a página inteira por
  // causa da lista de pedidos tiraria junto os dados da conta, que não têm nada
  // com isso. A lista vazia tem estado próprio na tela.
  if (error || !data) return [];

  return (data as unknown as LinhaPedido[]).map((p) => ({
    id: p.id,
    numero: p.numero,
    status: p.status,
    subtotalCentavos: p.subtotal_centavos,
    descontoCentavos: p.desconto_centavos,
    totalCentavos: p.total_centavos,
    cupomCodigo: p.cupom_codigo,
    criadoEm: p.created_at,
    pagoEm: p.pago_em,
    enviadoEm: p.enviado_em,
    entregueEm: p.entregue_em,
    codigoRastreio: p.codigo_rastreio,
    transportadora: p.transportadora,
    cidade: p.cidade,
    uf: p.uf,
    itens: (p.pedido_itens ?? []).map((i) => ({
      sku: i.sku,
      nome: i.nome,
      precoCentavos: i.preco_centavos,
      quantidade: i.quantidade,
    })),
  }));
}
