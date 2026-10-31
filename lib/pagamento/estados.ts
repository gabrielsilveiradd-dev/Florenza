/**
 * A MÁQUINA DE ESTADOS DO PAGAMENTO.
 *
 * Espelha `pagamento_transicao_valida()` (migration 20261031130100). Quem manda é
 * o banco, que recusa a transição inválida; a cópia existe para a reconciliação
 * decidir sem ida ao banco, e para os testes. Mudou lá, muda aqui.
 *
 * Sem `node:` nem `next/`: a página do cliente importa os rótulos daqui.
 */

export const ESTADOS_DE_PAGAMENTO = [
  "pending",
  "paid",
  "declined",
  "expired",
  "refunded",
  "partially_refunded",
  "in_dispute",
] as const;

export type EstadoDePagamento = (typeof ESTADOS_DE_PAGAMENTO)[number];

const TRANSICOES: Record<EstadoDePagamento, readonly EstadoDePagamento[]> = {
  pending: ["paid", "declined", "expired"],
  declined: ["pending", "paid", "expired"],
  expired: ["paid"],
  paid: ["partially_refunded", "refunded", "in_dispute"],
  partially_refunded: ["refunded", "in_dispute"],
  in_dispute: ["paid", "partially_refunded", "refunded"],
  refunded: ["in_dispute"],
};

export function transicaoValida(de: EstadoDePagamento | null, para: EstadoDePagamento): boolean {
  if (de === para) return true;
  // Nulo = pedido que ainda não tinha pagamento online.
  return de === null || TRANSICOES[de].includes(para);
}

/** O que o cliente lê. */
export const ROTULO_DO_ESTADO: Record<EstadoDePagamento, string> = {
  pending: "Aguardando confirmação",
  paid: "Pago",
  declined: "Recusado",
  expired: "Reserva expirada",
  refunded: "Estornado",
  partially_refunded: "Estornado em parte",
  in_dispute: "Em contestação",
};

/** Cobrança em andamento: enquanto houver uma, não se abre outra. */
export const STATUS_EM_ANDAMENTO = ["IN_ANALYSIS", "AUTHORIZED"] as const;

export type CobrancaParaDecidir = {
  /** Status vindo de `lib/pagamento/pagbank.ts`. */
  status: string;
  pagoCentavos: number;
  estornadoCentavos: number;
};

/** O que a contestação diz, quando há uma. */
export type SituacaoDaDisputa = "aberta" | "ganha" | "perdida" | null;

/**
 * reference/objeto-chargeback. DENIED (evidência rejeitada) ainda não encerra: o
 * fim do caso vem em CLOSED ou LOST. EXPIRED é sem resposta dentro do prazo, ou
 * seja, débito aceito.
 */
export function situacaoDaDisputa(status: string): Exclude<SituacaoDaDisputa, null> {
  if (status === "APPROVED" || status === "WON") return "ganha";
  if (status === "LOST" || status === "CLOSED" || status === "EXPIRED") return "perdida";
  return "aberta";
}

/** A pior situação entre as contestações de um pedido. */
export function situacaoDasDisputas(status: string[]): SituacaoDaDisputa {
  const situacoes = status.map(situacaoDaDisputa);
  if (situacoes.includes("aberta")) return "aberta";
  if (situacoes.includes("perdida")) return "perdida";
  return situacoes.length > 0 ? "ganha" : null;
}

/**
 * O estado a que as cobranças levam. Função pura: mesma resposta do PagBank, mesmo
 * estado — é isso que torna a reconciliação segura de rodar quantas vezes for.
 *
 * Só olha para dinheiro que entrou ou saiu. A falta de dinheiro nunca desfaz um
 * estado com dinheiro: uma consulta atrasada não transforma "pago" em "pendente".
 */
export function decidirEstado(e: {
  atual: EstadoDePagamento | null;
  cobrancas: CobrancaParaDecidir[];
  totalCentavos: number;
  disputa?: SituacaoDaDisputa;
}): { estado: EstadoDePagamento | null; estornadoCentavos: number } {
  const estornado = e.cobrancas.reduce((soma, c) => soma + c.estornadoCentavos, 0);
  const recebido = e.cobrancas.reduce(
    (soma, c) => soma + (c.pagoCentavos > 0 || c.estornadoCentavos > 0 ? Math.max(c.pagoCentavos, c.estornadoCentavos) : 0),
    0
  );

  if (e.disputa === "aberta") return { estado: "in_dispute", estornadoCentavos: estornado };
  if (e.disputa === "perdida") return { estado: "refunded", estornadoCentavos: Math.max(estornado, recebido) };

  if (recebido > 0) {
    if (estornado >= recebido) return { estado: "refunded", estornadoCentavos: estornado };
    if (estornado > 0) return { estado: "partially_refunded", estornadoCentavos: estornado };
    if (recebido >= e.totalCentavos) return { estado: "paid", estornadoCentavos: 0 };
    // Pago a menos vira pendência para a equipe, não venda.
    return { estado: e.atual ?? "pending", estornadoCentavos: 0 };
  }

  const semDinheiro = e.atual === null || e.atual === "pending" || e.atual === "declined";
  if (!semDinheiro || e.cobrancas.length === 0) return { estado: e.atual, estornadoCentavos: estornado };

  const todasFalharam = e.cobrancas.every((c) => c.status === "DECLINED" || c.status === "CANCELED");
  return { estado: todasFalharam ? "declined" : "pending", estornadoCentavos: estornado };
}
