"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

/**
 * "Pagar agora" de um pedido que já existe.
 *
 * Pede ao servidor uma cobrança nova no Mercado Pago e manda a pessoa para lá.
 * Não guarda link de pagamento antigo: a cobrança vence com a reserva, e um
 * link de ontem pode já não abrir.
 */
export function BotaoPagar({
  numero,
  className = "ped-acao ped-acao--principal",
}: {
  numero: number;
  className?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pagar() {
    setEnviando(true);
    setErro(null);
    const resposta = await fetch(`/api/pedidos/${numero}/pagamento`, { method: "POST" });
    const dados = await resposta.json().catch(() => null);
    if (resposta.ok && dados?.url) {
      window.location.assign(dados.url);
      return;
    }
    setEnviando(false);
    setErro(dados?.erro ?? "Não foi possível abrir o pagamento agora. Tente de novo em instantes.");
  }

  return (
    <>
      <button type="button" className={className} onClick={pagar} disabled={enviando}>
        {enviando ? <Loader2 aria-hidden size={14} className="animate-spin" /> : <CreditCard aria-hidden size={14} />}
        Pagar agora
      </button>
      {erro && <p className="chk-erro" role="alert" style={{ flexBasis: "100%" }}>{erro}</p>}
    </>
  );
}
