import { createClient } from "@/lib/supabase/server";
import type { ItemDoPedido, PedidoDaConta, PedidoDetalhado, PerfilDaConta } from "@/lib/conta";

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
    .select(
      "nome, telefone, cpf, cep, logradouro, endereco_numero, complemento, bairro, cidade, uf, " +
        "forma_pagamento_preferida"
    )
    .single();

  if (!data) return null;
  const perfil = data as unknown as Record<string, string | null>;
  return {
    nome: perfil.nome ?? "",
    telefone: perfil.telefone ?? "",
    cpf: perfil.cpf ?? "",
    cep: perfil.cep ?? "",
    logradouro: perfil.logradouro ?? "",
    enderecoNumero: perfil.endereco_numero ?? "",
    complemento: perfil.complemento ?? "",
    bairro: perfil.bairro ?? "",
    cidade: perfil.cidade ?? "",
    uf: (perfil.uf ?? "").trim(),
    formaPagamento: perfil.forma_pagamento_preferida ?? "",
  };
}

/**
 * As formas que o PostgREST devolve, para o cast logo abaixo.
 *
 * Sem os tipos gerados do banco, o TypeScript não sabe o formato de um select
 * com tabela aninhada e infere `GenericStringError` para cada campo. É o mesmo
 * cast documentado em lib/admin/listas.ts, e ele sai no dia em que rodarmos
 * `supabase gen types` (pendência conhecida no CLAUDE.md).
 */
type LinhaItem = {
  sku: string;
  nome: string;
  preco_centavos: number;
  quantidade: number;
  aros: number | null;
  tamanho: number | null;
  tamanho_par: number | null;
};

type LinhaResumo = {
  id: string;
  numero: number;
  status: string;
  subtotal_centavos: number;
  desconto_centavos: number;
  frete_centavos: number;
  frete_nome: string | null;
  frete_prazo_min_dias: number | null;
  frete_prazo_max_dias: number | null;
  total_centavos: number;
  cupom_codigo: string | null;
  created_at: string;
  pago_em: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  expira_em: string | null;
  motivo_cancelamento: string | null;
  codigo_rastreio: string | null;
  transportadora: string | null;
  cidade: string | null;
  uf: string | null;
  pedido_itens: LinhaItem[] | null;
};

type LinhaDetalhe = LinhaResumo & {
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  cep: string | null;
  logradouro: string | null;
  endereco_numero: string | null;
  complemento: string | null;
  bairro: string | null;
  presente: boolean;
  mensagem_presente: string | null;
  observacoes: string | null;
  pagamentos: Array<{
    provedor_pagamento_id: string;
    status: string;
    metodo: string | null;
    valor_centavos: number;
    created_at: string;
  }> | null;
};

const COLUNAS_RESUMO =
  "id, numero, status, subtotal_centavos, desconto_centavos, total_centavos, " +
  "frete_centavos, frete_nome, frete_prazo_min_dias, frete_prazo_max_dias, " +
  "cupom_codigo, created_at, pago_em, enviado_em, entregue_em, expira_em, motivo_cancelamento, " +
  "codigo_rastreio, transportadora, cidade, uf, " +
  "pedido_itens (sku, nome, preco_centavos, quantidade, aros, tamanho, tamanho_par)";

const COLUNAS_DETALHE =
  COLUNAS_RESUMO +
  ", nome, email, telefone, cpf, cep, logradouro, endereco_numero, complemento, bairro, " +
  "presente, mensagem_presente, observacoes, " +
  "pagamentos (provedor_pagamento_id, status, metodo, valor_centavos, created_at)";

const paraItem = (i: LinhaItem): ItemDoPedido => ({
  sku: i.sku,
  nome: i.nome,
  precoCentavos: i.preco_centavos,
  quantidade: i.quantidade,
  aros: i.aros,
  tamanho: i.tamanho,
  tamanhoPar: i.tamanho_par,
});

function paraResumo(p: LinhaResumo): PedidoDaConta {
  return {
    id: p.id,
    numero: p.numero,
    status: p.status,
    subtotalCentavos: p.subtotal_centavos,
    descontoCentavos: p.desconto_centavos,
    freteCentavos: p.frete_centavos,
    freteNome: p.frete_nome,
    fretePrazoMinDias: p.frete_prazo_min_dias,
    fretePrazoMaxDias: p.frete_prazo_max_dias,
    totalCentavos: p.total_centavos,
    cupomCodigo: p.cupom_codigo,
    criadoEm: p.created_at,
    pagoEm: p.pago_em,
    enviadoEm: p.enviado_em,
    entregueEm: p.entregue_em,
    expiraEm: p.expira_em,
    motivoCancelamento: p.motivo_cancelamento,
    codigoRastreio: p.codigo_rastreio,
    transportadora: p.transportadora,
    cidade: p.cidade,
    uf: p.uf,
    itens: (p.pedido_itens ?? []).map(paraItem),
  };
}

export async function listarMeusPedidos(): Promise<PedidoDaConta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(COLUNAS_RESUMO)
    .order("created_at", { ascending: false });

  // Diferente da vitrine, aqui o erro NÃO sobe. Lá servir preço velho em
  // silêncio seria pior que a tela de erro; aqui derrubar a página inteira por
  // causa da lista de pedidos tiraria junto os dados da conta, que não têm nada
  // com isso. A lista vazia tem estado próprio na tela.
  if (error || !data) return [];

  return (data as unknown as LinhaResumo[]).map(paraResumo);
}

/**
 * Um pedido inteiro, pelo id ou pelo número. `null` quando não existe OU não é
 * de quem pergunta — a RLS não distingue os dois casos, e a página também não
 * deve: dizer "esse pedido existe, mas não é seu" ajudaria a adivinhar números.
 */
export async function buscarMeuPedido(
  filtro: { id: string } | { numero: number }
): Promise<PedidoDetalhado | null> {
  const supabase = await createClient();
  const consulta = supabase.from("pedidos").select(COLUNAS_DETALHE);
  const { data, error } = await ("id" in filtro
    ? consulta.eq("id", filtro.id)
    : consulta.eq("numero", filtro.numero)
  ).maybeSingle();

  if (error || !data) return null;
  const p = data as unknown as LinhaDetalhe;

  return {
    ...paraResumo(p),
    nome: p.nome,
    email: p.email,
    telefone: p.telefone,
    cpf: p.cpf,
    cep: p.cep,
    logradouro: p.logradouro,
    enderecoNumero: p.endereco_numero,
    complemento: p.complemento,
    bairro: p.bairro,
    presente: p.presente,
    mensagemPresente: p.mensagem_presente,
    observacoes: p.observacoes,
    pagamentos: (p.pagamentos ?? [])
      .map((g) => ({
        id: g.provedor_pagamento_id,
        status: g.status,
        metodo: g.metodo,
        valorCentavos: g.valor_centavos,
        criadoEm: g.created_at,
      }))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
  };
}
