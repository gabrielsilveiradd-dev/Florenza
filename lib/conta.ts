/**
 * Vocabulário da área da conta — tipos e rótulos, sem nenhuma consulta.
 *
 * Este arquivo é importado dos dois lados: pela página, que roda no servidor, e
 * pelo formulário de dados, que é componente de cliente. Por isso ele não pode
 * importar `lib/supabase/server.ts` — aquele lê `next/headers`, que não existe
 * no navegador, e o build quebra ao tentar empacotar. As consultas moram em
 * `lib/conta-servidor.ts`.
 */

export type ItemDoPedido = {
  sku: string;
  nome: string;
  precoCentavos: number;
  quantidade: number;
  /** Cópia da ficha no momento da compra: 0 sem aro, 1 um tamanho, 2 par. */
  aros: number | null;
  /**
   * Nulo numa peça com aro só em pedido de antes de 14/09/2026, quando havia
   * "não sei ainda" e a medida era combinada pelo WhatsApp. Hoje o banco exige.
   */
  tamanho: number | null;
  tamanhoPar: number | null;
};

export type PedidoDaConta = {
  id: string;
  numero: number;
  status: string;
  subtotalCentavos: number;
  descontoCentavos: number;
  /** 0 e sem nome em pedido de antes do frete existir. */
  freteCentavos: number;
  freteNome: string | null;
  fretePrazoMinDias: number | null;
  fretePrazoMaxDias: number | null;
  totalCentavos: number;
  cupomCodigo: string | null;
  criadoEm: string;
  /** Carimbadas pelo banco na troca de status, não digitadas no painel. */
  pagoEm: string | null;
  enviadoEm: string | null;
  entregueEm: string | null;
  /** Até quando a peça fica reservada sem pagamento. Nulo = não expira. */
  expiraEm: string | null;
  motivoCancelamento: string | null;
  codigoRastreio: string | null;
  transportadora: string | null;
  cidade: string | null;
  uf: string | null;
  itens: ItemDoPedido[];
};

export type PagamentoDoPedido = {
  id: string;
  status: string;
  metodo: string | null;
  valorCentavos: number;
  criadoEm: string;
};

/** O pedido inteiro, para a página de acompanhamento. */
export type PedidoDetalhado = PedidoDaConta & {
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  cep: string | null;
  logradouro: string | null;
  enderecoNumero: string | null;
  complemento: string | null;
  bairro: string | null;
  presente: boolean;
  mensagemPresente: string | null;
  observacoes: string | null;
  pagamentos: PagamentoDoPedido[];
};

export type PerfilDaConta = {
  nome: string;
  telefone: string;
  cpf: string;
  cep: string;
  logradouro: string;
  enderecoNumero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  formaPagamento: string;
};

/** Rótulos que o cliente entende — o banco guarda o valor cru do `check`. */
export const STATUS_DO_PEDIDO: Record<string, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago",
  em_producao: "Em produção",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

/** O status cru do Mercado Pago, dito em português. */
export const STATUS_DO_PAGAMENTO: Record<string, string> = {
  approved: "Aprovado",
  pending: "Aguardando pagamento",
  in_process: "Em análise",
  authorized: "Autorizado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  refunded: "Estornado",
  charged_back: "Contestado",
};

/** "Avenida Paulista, 1000, apto 12 — Bela Vista, São Paulo/SP · 01310-100" */
export function enderecoEmUmaLinha(e: {
  logradouro: string | null;
  enderecoNumero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}): string | null {
  if (!e.logradouro) return null;
  const rua = [e.logradouro, e.enderecoNumero, e.complemento].filter(Boolean).join(", ");
  const lugar = [e.bairro, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(", ");
  const cep = e.cep ? ` · ${e.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : "";
  return `${rua}${lugar ? ` — ${lugar}` : ""}${cep}`;
}

/**
 * Preferência declarada, NÃO cartão salvo.
 *
 * Número de cartão não entra neste banco: guardar cartão exige cofre de PSP e
 * certificação PCI, e uma joalheria não tem por que carregar esse risco. Com o
 * Mercado Pago ligado, o cartão é digitado na página deles e fica lá.
 */
export const FORMAS_DE_PAGAMENTO = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "combinar", rotulo: "Prefiro combinar" },
] as const;
