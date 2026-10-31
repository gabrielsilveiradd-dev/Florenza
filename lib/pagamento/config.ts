/**
 * O pagamento online está ligado?
 *
 * Duas chaves, e as duas precisam existir: o token do PagBank (para criar a
 * cobrança e conferir o pagamento na API deles) e o segredo que o banco exige
 * em `registrar_pagamento()`. Com uma só, o site cobraria e não conseguiria
 * marcar o pedido como pago — pior do que não cobrar.
 *
 * Enquanto não estiver ligado, o site inteiro fala a língua do acerto por
 * WhatsApp: vitrine, checkout, confirmação e conta. Nada precisa ser mudado à
 * mão no dia de ligar; basta pôr as variáveis na Vercel.
 *
 * Só para código de servidor. Num componente de cliente `process.env` não tem
 * estas variáveis e a resposta seria sempre "não" — passe o valor por prop.
 */
export function pagamentoOnlineAtivo(): boolean {
  return Boolean(process.env.PAGBANK_TOKEN && process.env.PAGAMENTO_SEGREDO_BANCO);
}

/**
 * O token do PagBank não diz de qual ambiente é, então o ambiente é declarado.
 * Só `producao` cobra de verdade: esquecer a variável aponta para o sandbox, e
 * um token de produção lá é recusado, em vez de virar cobrança real sem querer.
 */
export function pagBankEmTeste(): boolean {
  return process.env.PAGBANK_AMBIENTE !== "producao";
}
