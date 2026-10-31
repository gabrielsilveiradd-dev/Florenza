import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { rpcComSegredo } from "@/lib/pagamento/banco";
import { pagBankConfigurado } from "@/lib/pagamento/config";
import { reconciliarSeLivre } from "@/lib/pagamento/reconciliar";
import { processarEvento } from "@/lib/pagamento/webhook";

/**
 * O job: o pg_cron chama a cada 5 minutos, com `x-florenza-job` (PAGBANK_JOB_SECRET,
 * o mesmo valor do Vault). Migration 20261031130100.
 *
 * Roda enquanto o token existir, mesmo com a abertura de cobranças desligada: um
 * pedido em aberto ainda precisa ser conferido e expirado.
 *
 * Lote limitado e orçamento de tempo: o que não couber vai no próximo disparo, e a
 * fila começa por quem está há mais tempo sem conferência.
 */
export const maxDuration = 60;

const TAMANHO_DO_LOTE = 25;
const ORCAMENTO_MS = 45_000;
/** Entre duas conferências do mesmo pedido, feitas pelo job. */
const INTERVALO_SEGUNDOS = 60;

function autorizado(valor: string | null): boolean {
  const segredo = process.env.PAGBANK_JOB_SECRET;
  if (!segredo || !valor) return false;
  const a = Buffer.from(segredo);
  const b = Buffer.from(valor);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!autorizado(request.headers.get("x-florenza-job"))) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (!pagBankConfigurado()) {
    return NextResponse.json({ ignorado: "PagBank não configurado" });
  }

  const inicio = Date.now();
  const resumo = { eventos: 0, pedidos: 0, mudaram: 0, expiraram: 0, naoVerificados: 0, falhas: 0 };
  const dentroDoOrcamento = () => Date.now() - inicio < ORCAMENTO_MS;

  // 1) O que o webhook gravou e não conseguiu processar.
  const eventos = await rpcComSegredo<Array<{ evento_id: string; corpo: string | null }>>(
    "pagbank_eventos_a_processar",
    { p_limite: TAMANHO_DO_LOTE }
  );
  for (const evento of eventos ?? []) {
    if (!dentroDoOrcamento()) break;
    await processarEvento({ eventoId: evento.evento_id, corpoCru: evento.corpo ?? "", numero: null, checkoutId: null });
    resumo.eventos++;
  }

  // 2) A fila dos pedidos.
  const fila = await rpcComSegredo<Array<{ pedido_id: string }>>("pagbank_pedidos_a_reconciliar", {
    p_limite: TAMANHO_DO_LOTE,
  });
  for (const { pedido_id: pedidoId } of fila ?? []) {
    if (!dentroDoOrcamento()) break;
    try {
      const resultado = await reconciliarSeLivre(pedidoId, "job", INTERVALO_SEGUNDOS);
      if (!resultado) continue;

      resumo.pedidos++;
      if (resultado.mudou) resumo.mudaram++;
      if (resultado.expirou) resumo.expiraram++;
      if (!resultado.verificado) resumo.naoVerificados++;
    } catch (e) {
      console.error(`[job] pedido ${pedidoId}:`, e);
      resumo.falhas++;
    }
  }

  return NextResponse.json(resumo);
}
