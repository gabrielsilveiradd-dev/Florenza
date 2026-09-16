"use client";

import { useState } from "react";
import { BotaoComprar } from "@/components/BotaoComprar";
import { GuiaDeMedidas } from "@/components/GuiaDeMedidas";
import { SeletorDeAro } from "@/components/SeletorDeAro";
import type { ItemCarrinho } from "@/lib/carrinho";

/**
 * O "Comprar" da página da peça, com a medida do aro ao lado.
 *
 * A medida é obrigatória: o botão só adiciona depois de escolhida, e o banco
 * recusa pedido de peça com aro sem ela. Quem não sabe medir tem o guia — pelo
 * link embaixo dos seletores ou pelo rodapé da lista de números —, e tocar numa
 * linha da tabela preenche o seletor.
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
  // Qual seletor a tabela do guia preenche; `null` = guia fechado.
  const [guia, setGuia] = useState<"aro-1" | "aro-2" | null>(null);

  const par = produto.aros === 2;
  const falta = produto.aros >= 1 && (aro === null || (par && aroPar === null));

  return (
    <>
      {produto.aros > 0 && produto.estoque > 0 && (
        <>
          <fieldset className="pdp__medida" id="medida">
            <legend className="pdp__medida-titulo">{par ? "Tamanho dos aros" : "Tamanho do aro"}</legend>
            <div className="pdp__medida-campos">
              <SeletorDeAro
                variante="pagina"
                rotulo={par ? "Aro 1" : "Aro"}
                valor={aro}
                aoMudar={setAro}
                aoPedirGuia={() => setGuia("aro-1")}
                invalido={avisar && aro === null}
              />
              {par && (
                <SeletorDeAro
                  variante="pagina"
                  rotulo="Aro 2"
                  valor={aroPar}
                  aoMudar={setAroPar}
                  aoPedirGuia={() => setGuia("aro-2")}
                  invalido={avisar && aroPar === null}
                />
              )}
            </div>
            <p className="pdp__medida-dica">
              Não sabe a medida?{" "}
              {/* No par, o link aponta para o aro que ainda falta. */}
              <button
                type="button"
                className="pdp__medida-guia"
                onClick={() => setGuia(par && aro !== null && aroPar === null ? "aro-2" : "aro-1")}
              >
                Veja como medir
              </button>{" "}
              — dá para descobrir em casa, com um anel que já serve ou uma tira de papel.
            </p>
            {avisar && falta && (
              <p className="pdp__medida-erro" role="alert">
                Escolha o tamanho {par ? "dos dois aros" : "do aro"} para continuar.
              </p>
            )}
          </fieldset>

          <GuiaDeMedidas
            aberto={guia !== null}
            aoFechar={() => setGuia(null)}
            peca={produto.nome}
            destino={par ? (guia === "aro-2" ? "Aro 2" : "Aro 1") : undefined}
            aoEscolher={guia ? (n) => (guia === "aro-2" ? setAroPar : setAro)(n) : undefined}
          />
        </>
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
