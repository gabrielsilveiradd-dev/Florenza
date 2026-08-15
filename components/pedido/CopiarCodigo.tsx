"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Copia o código de rastreio.
 *
 * É o único pedaço interativo da linha do tempo, e por isso está separado: o
 * `StatusDoPedido` continua sendo componente de servidor, e só este botão vai
 * para o navegador.
 *
 * `navigator.clipboard` não existe fora de HTTPS (ou localhost) e pode ser
 * negado pelo navegador. Falhando, o botão avisa em vez de fingir que copiou —
 * a pessoa ainda pode selecionar o código na tela, que é texto de verdade.
 */
export function CopiarCodigo({ valor }: { valor: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");

  return (
    <button
      type="button"
      className="ped-rastreio__copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valor);
          setEstado("copiado");
        } catch {
          setEstado("falhou");
        }
        window.setTimeout(() => setEstado("parado"), 2200);
      }}
    >
      {estado === "copiado" ? <Check aria-hidden size={13} /> : <Copy aria-hidden size={13} />}
      {estado === "copiado" ? "Copiado" : estado === "falhou" ? "Copie à mão" : "Copiar"}
    </button>
  );
}
