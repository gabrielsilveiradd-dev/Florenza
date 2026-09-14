import { descreverMedida } from "@/lib/aros";
import { enderecoEmUmaLinha, type PedidoDetalhado } from "@/lib/conta";
import { LOJA, linkWhatsAppDoCliente } from "@/lib/loja";

/**
 * AVISOS DE PEDIDO — só servidor.
 *
 * Antes, pedido novo não avisava ninguém: a Florenza só descobria abrindo o
 * painel. Numa loja onde o próximo passo é justamente ela chamar o cliente no
 * WhatsApp, isso é venda esfriando.
 *
 * Dois canais, cada um ligado pela própria variável de ambiente e
 * independentes entre si:
 *
 *   - E-MAIL (Resend): para a loja, com a ficha do pedido e o botão de WhatsApp
 *     do cliente; e para o cliente, com o resumo. Precisa de RESEND_API_KEY,
 *     AVISO_EMAIL_REMETENTE (domínio verificado no Resend) e, para o da loja,
 *     AVISO_PEDIDO_EMAIL.
 *   - WEBHOOK: um POST com o pedido em JSON para AVISO_PEDIDO_WEBHOOK_URL —
 *     serve para um fluxo no n8n mandar a mensagem no WhatsApp da loja.
 *
 * NUNCA DERRUBA O PEDIDO. Aviso que falha vai para o log; o pedido já existe
 * no banco e o painel mostra. Por isso nada aqui lança erro para fora.
 */

export type PedidoParaAviso = {
  numero: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  totalCentavos: number;
  descontoCentavos: number;
  cupomCodigo: string | null;
  itens: Array<{
    nome: string;
    quantidade: number;
    precoCentavos: number;
    aros: number | null;
    tamanho: number | null;
    tamanhoPar: number | null;
  }>;
  endereco: string | null;
  presente: boolean;
  mensagemPresente: string | null;
  observacoes: string | null;
  expiraEm: string | null;
};

export type PagamentoParaAviso = {
  numero: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  totalCentavos: number;
};

/** O pedido como a conta o lê, no formato que os avisos usam. */
export function pedidoParaAviso(p: PedidoDetalhado): PedidoParaAviso {
  return {
    numero: p.numero,
    nome: p.nome,
    email: p.email,
    telefone: p.telefone,
    totalCentavos: p.totalCentavos,
    descontoCentavos: p.descontoCentavos,
    cupomCodigo: p.cupomCodigo,
    itens: p.itens,
    endereco: enderecoEmUmaLinha(p),
    presente: p.presente,
    mensagemPresente: p.mensagemPresente,
    observacoes: p.observacoes,
    expiraEm: p.expiraEm,
  };
}

export function avisosConfigurados() {
  const email = Boolean(process.env.RESEND_API_KEY && process.env.AVISO_EMAIL_REMETENTE);
  return {
    emailParaLoja: email && Boolean(process.env.AVISO_PEDIDO_EMAIL),
    emailParaCliente: email,
    webhook: Boolean(process.env.AVISO_PEDIDO_WEBHOOK_URL),
  };
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (centavos: number) => moeda.format(centavos / 100);
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
});

/** Observação e mensagem de presente são texto do cliente: escapar antes de pôr em HTML. */
function esc(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function enviarEmail(para: string, assunto: string, html: string, texto: string) {
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: process.env.AVISO_EMAIL_REMETENTE, to: [para], subject: assunto, html, text: texto }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resposta.ok) {
    throw new Error(`Resend recusou o e-mail para ${para} (${resposta.status}): ${await resposta.text()}`);
  }
}

async function chamarWebhook(evento: string, dados: unknown) {
  const cabecalhos: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.AVISO_WEBHOOK_SEGREDO) cabecalhos["X-Florenza-Segredo"] = process.env.AVISO_WEBHOOK_SEGREDO;

  const resposta = await fetch(process.env.AVISO_PEDIDO_WEBHOOK_URL!, {
    method: "POST",
    headers: cabecalhos,
    body: JSON.stringify({ evento, ...(dados as object) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!resposta.ok) throw new Error(`Webhook de aviso respondeu ${resposta.status}.`);
}

async function registrarFalhas(rotulo: string, tarefas: Array<Promise<unknown>>) {
  const resultados = await Promise.allSettled(tarefas);
  for (const r of resultados) {
    if (r.status === "rejected") console.error(`[avisos] ${rotulo}:`, r.reason);
  }
}

/*
 * As cores do e-mail são as da marca escritas por extenso. É a única exceção à
 * regra dos tokens: cliente de e-mail não entende `var(--gold)`. Os valores são
 * os de app/estilos/style.css — mudou lá, muda aqui.
 */
const COR = { fundo: "#F0EADE", cartao: "#E8DFCD", tinta: "#15130E", apagada: "#726348", ouro: "#7D6330" };

function moldura(titulo: string, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:${COR.fundo};font-family:Georgia,serif;color:${COR.tinta}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:${COR.cartao};border:1px solid rgba(125,99,48,.26)" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:${COR.ouro}">${esc(LOJA.nomeFantasia)}</td></tr>
<tr><td style="padding:0 28px 8px;font-size:26px">${titulo}</td></tr>
<tr><td style="padding:8px 28px 28px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:${COR.tinta}">${corpo}</td></tr>
</table></td></tr></table></body></html>`;
}

function linhasDosItens(pedido: PedidoParaAviso): { html: string; texto: string } {
  const linhas = pedido.itens.map((i) => {
    const medida = descreverMedida(i.aros, i.tamanho, i.tamanhoPar);
    return {
      html: `<tr><td style="padding:6px 0">${i.quantidade > 1 ? `${i.quantidade}× ` : ""}${esc(i.nome)}${medida ? `<br><span style="color:${COR.apagada};font-size:12px">${medida}</span>` : ""}</td><td align="right" style="padding:6px 0;white-space:nowrap">${reais(i.precoCentavos * i.quantidade)}</td></tr>`,
      texto: `- ${i.quantidade}x ${i.nome}${medida ? ` (${medida})` : ""}: ${reais(i.precoCentavos * i.quantidade)}`,
    };
  });
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;border-top:1px solid rgba(125,99,48,.26)">${linhas.map((l) => l.html).join("")}
<tr><td style="padding:10px 0 0;border-top:1px solid rgba(125,99,48,.26)"><strong>Total</strong>${pedido.descontoCentavos > 0 ? ` <span style="color:${COR.apagada};font-size:12px">(desconto ${esc(pedido.cupomCodigo ?? "")}: −${reais(pedido.descontoCentavos)})</span>` : ""}</td><td align="right" style="padding:10px 0 0;border-top:1px solid rgba(125,99,48,.26)"><strong>${reais(pedido.totalCentavos)}</strong></td></tr></table>`,
    texto: linhas.map((l) => l.texto).join("\n") + `\nTotal: ${reais(pedido.totalCentavos)}`,
  };
}

/** Pedido acabou de ser fechado no site. */
export async function avisarPedidoNovo(pedido: PedidoParaAviso, urlBase: string): Promise<void> {
  const config = avisosConfigurados();
  const itens = linhasDosItens(pedido);
  const tarefas: Array<Promise<unknown>> = [];

  if (config.emailParaLoja) {
    const whats = linkWhatsAppDoCliente(
      pedido.telefone,
      `Olá, ${pedido.nome.split(" ")[0]}! Aqui é da Florenza, sobre o seu pedido #${pedido.numero}.`
    );
    const html = moldura(
      `Pedido #${pedido.numero}`,
      `<p style="margin:0 0 6px"><strong>${esc(pedido.nome)}</strong><br>${esc(pedido.telefone ?? "sem telefone")} · ${esc(pedido.email ?? "")}</p>
${pedido.endereco ? `<p style="margin:0 0 6px;color:${COR.apagada}">${esc(pedido.endereco)}</p>` : ""}
${itens.html}
${pedido.presente ? `<p style="margin:0 0 6px"><strong>Para presente.</strong>${pedido.mensagemPresente ? ` Cartão: “${esc(pedido.mensagemPresente)}”` : ""}</p>` : ""}
${pedido.observacoes ? `<p style="margin:0 0 6px">Observações: ${esc(pedido.observacoes)}</p>` : ""}
${pedido.expiraEm ? `<p style="margin:0 0 16px;color:${COR.apagada}">Reserva até ${dataHora.format(new Date(pedido.expiraEm))}.</p>` : ""}
${whats ? `<p style="margin:0 0 10px"><a href="${whats}" style="display:inline-block;padding:12px 20px;background:#D4B973;color:${COR.tinta};text-decoration:none;font-size:12px;letter-spacing:.12em;text-transform:uppercase">Chamar no WhatsApp</a></p>` : ""}
<p style="margin:0"><a href="${urlBase}/admin?aba=pedidos" style="color:${COR.ouro}">Abrir no painel</a></p>`
    );
    const texto = `Pedido #${pedido.numero}\n${pedido.nome} · ${pedido.telefone ?? "sem telefone"} · ${pedido.email ?? ""}\n${pedido.endereco ?? ""}\n\n${itens.texto}\n${pedido.observacoes ? `\nObservações: ${pedido.observacoes}` : ""}\n\nPainel: ${urlBase}/admin?aba=pedidos`;
    tarefas.push(enviarEmail(process.env.AVISO_PEDIDO_EMAIL!, `Pedido novo #${pedido.numero} · ${pedido.nome}`, html, texto));
  }

  if (config.emailParaCliente && pedido.email) {
    // Não promete o que não acontece: nada de "pagamento aprovado" — este
    // e-mail sai quando o pedido nasce, antes de qualquer pagamento.
    const html = moldura(
      `Recebemos seu pedido #${pedido.numero}`,
      `<p style="margin:0 0 6px">Olá, ${esc(pedido.nome.split(" ")[0])}. Seu pedido chegou para a Florenza.</p>
${itens.html}
${pedido.expiraEm ? `<p style="margin:0 0 16px;color:${COR.apagada}">As peças ficam reservadas para você até ${dataHora.format(new Date(pedido.expiraEm))}. Depois disso, sem pagamento, voltam para a vitrine.</p>` : ""}
<p style="margin:0"><a href="${urlBase}/conta/pedido/${pedido.numero}" style="color:${COR.ouro}">Acompanhar o pedido</a></p>`
    );
    const texto = `Recebemos seu pedido #${pedido.numero}.\n\n${itens.texto}\n\nAcompanhe: ${urlBase}/conta/pedido/${pedido.numero}`;
    tarefas.push(enviarEmail(pedido.email, `Recebemos seu pedido #${pedido.numero}`, html, texto));
  }

  if (config.webhook) {
    tarefas.push(chamarWebhook("pedido_novo", { pedido, linkPainel: `${urlBase}/admin?aba=pedidos` }));
  }

  await registrarFalhas(`pedido #${pedido.numero}`, tarefas);
}

/** O Mercado Pago confirmou o pagamento e o banco promoveu o pedido a pago. */
export async function avisarPagamentoConfirmado(pedido: PagamentoParaAviso, urlBase: string): Promise<void> {
  const config = avisosConfigurados();
  const tarefas: Array<Promise<unknown>> = [];

  if (config.emailParaLoja) {
    const html = moldura(
      `Pagamento confirmado · #${pedido.numero}`,
      `<p style="margin:0 0 12px"><strong>${esc(pedido.nome)}</strong> pagou ${reais(pedido.totalCentavos)} pelo Mercado Pago.</p>
<p style="margin:0"><a href="${urlBase}/admin?aba=pedidos" style="color:${COR.ouro}">Abrir no painel</a></p>`
    );
    tarefas.push(
      enviarEmail(
        process.env.AVISO_PEDIDO_EMAIL!,
        `Pago: pedido #${pedido.numero} · ${reais(pedido.totalCentavos)}`,
        html,
        `${pedido.nome} pagou ${reais(pedido.totalCentavos)} pelo pedido #${pedido.numero}.`
      )
    );
  }

  if (config.emailParaCliente && pedido.email) {
    const html = moldura(
      `Pagamento confirmado`,
      `<p style="margin:0 0 12px">Olá, ${esc(pedido.nome.split(" ")[0])}. O pagamento do pedido #${pedido.numero} foi confirmado, e a Florenza já começou a preparar a sua peça.</p>
<p style="margin:0"><a href="${urlBase}/conta/pedido/${pedido.numero}" style="color:${COR.ouro}">Acompanhar o pedido</a></p>`
    );
    tarefas.push(
      enviarEmail(
        pedido.email,
        `Pagamento confirmado · pedido #${pedido.numero}`,
        html,
        `O pagamento do pedido #${pedido.numero} foi confirmado. Acompanhe: ${urlBase}/conta/pedido/${pedido.numero}`
      )
    );
  }

  if (config.webhook) {
    tarefas.push(chamarWebhook("pagamento_confirmado", { pedido, linkPainel: `${urlBase}/admin?aba=pedidos` }));
  }

  await registrarFalhas(`pagamento do pedido #${pedido.numero}`, tarefas);
}
