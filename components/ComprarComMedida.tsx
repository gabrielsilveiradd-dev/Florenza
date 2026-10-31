"use client";

import { useState } from "react";
import { BotaoComprar } from "@/components/BotaoComprar";
import { SeletorDeAro } from "@/components/SeletorDeAro";
import type { ItemCarrinho } from "@/lib/carrinho";

/**
 * O "Comprar" da página da peça, com a medida do aro ao lado.
 *
 * A medida é obrigatória: o botão só adiciona depois de escolhida, e o banco
 * recusa pedido de peça com aro sem ela.
 *
 * Até 14/09/2026 havia "Não sei ainda", e a Florenza confirmava a medida pelo
 * WhatsApp depois do pedido. Saiu por decisão da loja: a peça precisa sair com a
 * medida certa, e a conversa depois da compra atrasava o envio.
 *
 * Aliança em par tem dois seletores, um para cada pessoa.
 */
export function ComprarComMedida({
  produto,
  className,
}: {
  produto: Omit<ItemCarrinho, "quantidade" | "tamanho" | "tamanhoPar">;
  className: string;
}) {
  const [aro, setAro] = useState<number | null>(null);
  const [aroPar, setAroPar] = useState<number | null>(null);
  const [avisar, setAvisar] = useState(false);

  const par = produto.aros === 2;
  const falta = produto.aros >= 1 && (aro === null || (par && aroPar === null));

  return (
    <>
      {produto.aros > 0 && produto.estoque > 0 && (
        <fieldset className="pdp__medida" id="medida">
          <legend className="pdp__medida-titulo">{par ? "Tamanho dos aros" : "Tamanho do aro"}</legend>
          <div className="pdp__medida-campos">
            <SeletorDeAro
              variante="pagina"
              rotulo={par ? "Aro 1" : "Aro"}
              valor={aro}
              aoMudar={setAro}
              invalido={avisar && aro === null}
            />
            {par && (
              <SeletorDeAro
                variante="pagina"
                rotulo="Aro 2"
                valor={aroPar}
                aoMudar={setAroPar}
                invalido={avisar && aroPar === null}
              />
            )}
          </div>
          {avisar && falta && (
            <p className="pdp__medida-erro" role="alert">
              Escolha o tamanho {par ? "dos dois aros" : "do aro"} para continuar.
            </p>
          )}
        </fieldset>
      )}

      <BotaoComprar
        className={className}
        modo="pagina"
        bloqueado={falta}
        aoBloquear={() => setAvisar(true)}
        produto={{ ...produto, tamanho: aro, tamanhoPar: par ? aroPar : null }}
      />
    </>
  );
}
