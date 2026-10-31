"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { ROTULO_DO_ESTADO, type EstadoDePagamento } from "@/lib/pagamento/estados";

const INTERVALO_MS = 5_000;
const DURACAO_MS = 2 * 60 * 1000;

const EM_ABERTO = (estado: EstadoDePagamento | null) => estado === "pending";

/**
 * O estado real do pagamento na página do pedido.
 *
 * Enquanto estiver em aberto, pergunta ao servidor a cada 5 segundos, por até 2
 * minutos. Quando o estado muda, a página inteira se atualiza sozinha: etapas,
 * botões e valores vêm do servidor.
 *
 * Passados os 2 minutos ela para de perguntar, mas o pedido continua sendo
 * conferido pelo servidor, e a frase diz isso. Quem voltar depois vê o estado novo.
 */
export function AcompanharPagamento({
  numero,
  estadoInicial,
}: {
  numero: number;
  estadoInicial: EstadoDePagamento | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState(estadoInicial);
  const [esgotou, setEsgotou] = useState(false);
  const ultimo = useRef(estadoInicial);

  useEffect(() => {
    if (!EM_ABERTO(estadoInicial)) return;

    const inicio = Date.now();
    let ativo = true;
    let espera: ReturnType<typeof setTimeout>;

    async function perguntar() {
      try {
        const resposta = await fetch(`/api/pedidos/${numero}/pagamento/status`, { cache: "no-store" });
        const dados = resposta.ok ? ((await resposta.json()) as { estado: EstadoDePagamento | null }) : null;
        if (!ativo) return;

        if (dados && dados.estado !== ultimo.current) {
          ultimo.current = dados.estado;
          setEstado(dados.estado);
          router.refresh();
          if (!EM_ABERTO(dados.estado)) return;
        }
      } catch {
        // Falhou a rede: a próxima pergunta tenta de novo.
        if (!ativo) return;
      }

      if (Date.now() - inicio >= DURACAO_MS) {
        setEsgotou(true);
        return;
      }
      espera = setTimeout(perguntar, INTERVALO_MS);
    }

    espera = setTimeout(perguntar, INTERVALO_MS);
    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [numero, estadoInicial, router]);

  if (!estado) return null;

  const positivo = estado === "paid";
  const negativo = estado === "declined" || estado === "expired" || estado === "in_dispute";

  return (
    <p className={`ped-pagamento${negativo ? " ped-pagamento--alerta" : ""}`} role="status" aria-live="polite">
      {EM_ABERTO(estado) && !esgotou && <Loader2 aria-hidden size={14} className="animate-spin" />}
      {positivo && <Check aria-hidden size={14} />}
      {negativo && <TriangleAlert aria-hidden size={14} />}
      <span>
        <strong>{ROTULO_DO_ESTADO[estado]}</strong>
        {FRASE[estado] && ` · ${FRASE[estado]}`}
        {EM_ABERTO(estado) && esgotou &&
          " A confirmação pode levar mais alguns minutos. Pode sair desta página: seguimos conferindo com o PagBank."}
      </span>
    </p>
  );
}

const FRASE: Partial<Record<EstadoDePagamento, string>> = {
  pending: "conferindo com o PagBank.",
  paid: "o PagBank confirmou o seu pagamento.",
  declined: "o pagamento não foi aprovado. Você pode tentar de novo com outro cartão ou pelo Pix.",
  expired: "o prazo de pagamento venceu, e o pedido foi cancelado.",
  refunded: "o valor foi devolvido pelo mesmo meio do pagamento.",
  partially_refunded: "parte do valor foi devolvida pelo mesmo meio do pagamento.",
  in_dispute: "a operadora do cartão abriu uma contestação. A Florenza acompanha o caso.",
};
