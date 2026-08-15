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
};

export type PedidoDaConta = {
  id: string;
  numero: number;
  status: string;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  cupomCodigo: string | null;
  criadoEm: string;
  /** Carimbadas pelo banco na troca de status, não digitadas no painel. */
  pagoEm: string | null;
  enviadoEm: string | null;
  entregueEm: string | null;
  codigoRastreio: string | null;
  transportadora: string | null;
  cidade: string | null;
  uf: string | null;
  itens: ItemDoPedido[];
};

export type PerfilDaConta = {
  nome: string;
  telefone: string;
  cep: string;
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

/**
 * Preferência declarada, NÃO cartão salvo.
 *
 * Número de cartão não entra neste banco: guardar cartão exige cofre de PSP e
 * certificação PCI, e uma joalheria não tem por que carregar esse risco. Quando
 * o Mercado Pago entrar (Módulo 2), o que se guarda é o token dele.
 */
export const FORMAS_DE_PAGAMENTO = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "cartao", rotulo: "Cartão" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "combinar", rotulo: "Prefiro combinar" },
] as const;
