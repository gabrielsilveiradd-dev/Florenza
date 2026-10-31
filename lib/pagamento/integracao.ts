import {
  criarChavePublicaDoWebhook, criarPreferencia, chamadaCrua, inativarCheckout, listarPreferencias,
  temChavePublicaDoWebhook,
} from "@/lib/pagamento/pagbank";

/**
 * OS TESTES DA PÁGINA "STATUS DA INTEGRAÇÃO". Cada um responde em português o que o
 * código HTTP quer dizer para quem está tentando pôr a loja no ar.
 */

export type ResultadoDoTeste = { ok: boolean; http: number | null; mensagem: string };

/** docs/codigos-de-status. O texto do 403 também cobre o `allowlist_access_required`, relatado na comunidade. */
function explicar(http: number, corpo: unknown): string {
  if (http === 401) return "401: o PagBank não reconheceu o token. Confira PAGBANK_TOKEN e se ele é deste ambiente.";
  if (http === 403) {
    const lista = JSON.stringify(corpo ?? "").includes("allowlist");
    return (
      `403: o token foi aceito, mas esta conta não tem permissão para este recurso. ` +
      (lista
        ? "O PagBank respondeu allowlist_access_required: peça a liberação da conta (docs/pagbank-homologacao.md)."
        : "A produção só libera depois da homologação (docs/pagbank-homologacao.md).")
    );
  }
  if (http === 429) return "429: limite de requisições da conta atingido.";
  if (http >= 500) return `${http}: erro nos servidores do PagBank. Tente de novo em instantes.`;
  return `${http}: resposta inesperada. Veja o log desta chamada.`;
}

/**
 * Teste leve, sem efeito: consulta uma order que não existe.
 *
 * SUPOSIÇÃO – validar no sandbox: não há endpoint de "quem sou eu" documentado, e
 * docs/codigos-de-status descreve 404 como identificador inexistente. Assume-se que
 * 400 ou 404 aqui provam que o token passou pela autenticação.
 */
export async function testarToken(): Promise<ResultadoDoTeste> {
  try {
    const { status, dados } = await chamadaCrua("GET", "/orders/ORDE_00000000-0000-0000-0000-000000000000");
    if (status === 400 || status === 404 || status === 200) {
      return { ok: true, http: status, mensagem: `OK: o token foi aceito (a consulta de teste respondeu ${status}).` };
    }
    return { ok: false, http: status, mensagem: explicar(status, dados) };
  } catch (erro) {
    return { ok: false, http: null, mensagem: `Sem resposta do PagBank: ${erro instanceof Error ? erro.message : erro}` };
  }
}

/**
 * Teste completo, porque o 403 de homologação aparece ao CRIAR: cria um checkout de
 * R$ 1,00, sem notificação, com 10 minutos de validade, e o inativa em seguida.
 */
export async function testarCriacaoDeCheckout(): Promise<ResultadoDoTeste> {
  try {
    const { status, dados } = await chamadaCrua("POST", "/checkouts", {
      reference_id: "teste-de-integracao",
      expiration_date: new Date(Date.now() + 10 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      items: [{ reference_id: "teste", name: "Teste de integração", quantity: 1, unit_amount: 100 }],
    });

    if (status < 200 || status >= 300) return { ok: false, http: status, mensagem: explicar(status, dados) };

    if (typeof dados?.id === "string") {
      await inativarCheckout(dados.id).catch((falha) => console.error("[integração] checkout de teste ativo:", falha));
    }
    return { ok: true, http: status, mensagem: `OK: o checkout de teste foi criado (${status}) e inativado.` };
  } catch (erro) {
    return { ok: false, http: null, mensagem: `Sem resposta do PagBank: ${erro instanceof Error ? erro.message : erro}` };
  }
}

/**
 * Liga os avisos de contestação e cancelamento (reference/criar-preferencia), que
 * pedem antes uma chave pública do tipo `webhook`. Pode rodar de novo: se a preferência
 * já existir para este endereço, nada é criado.
 */
export async function ativarAvisosDePosVenda(target: string): Promise<ResultadoDoTeste> {
  try {
    if (!(await temChavePublicaDoWebhook())) await criarChavePublicaDoWebhook();

    const existentes = await listarPreferencias();
    const eventos = ["CHARGEBACK", "CANCELLATION"];
    const jaLigada = existentes.some(
      (p) => p.target === target && eventos.every((e) => p.events.some((evento) => evento.startsWith(e)))
    );
    if (jaLigada) return { ok: true, http: 200, mensagem: "Os avisos de contestação e cancelamento já estavam ligados." };

    await criarPreferencia(target, eventos);
    return { ok: true, http: 200, mensagem: "Avisos de contestação e cancelamento ligados." };
  } catch (erro) {
    return { ok: false, http: null, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}
