"use client";

import { useState } from "react";
import { BotaoComprar } from "@/components/BotaoComprar";
import { SeletorDeAro } from "@/components/SeletorDeAro";
import { formatarPreco } from "@/lib/admin/format";
import { precoDaUnidade } from "@/lib/aros";
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
 * Aliança tem a escolha entre o par, com dois seletores, um para cada pessoa, e
 * uma aliança só, com um seletor e metade do preço. O preço aqui é só para a
 * tela: quem cobra é `criar_pedido()`.
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
  // O estoque conta alianças: com uma só, não há par para vender.
  const semPar = produto.estoque < 2;
  const [unidade, setUnidade] = useState(semPar);

  const vendidaEmPar = produto.aros === 2;
  const par = vendidaEmPar && !unidade;
  const falta = produto.aros >= 1 && (aro === null || (par && aroPar === null));

  return (
    <>
      {vendidaEmPar && produto.estoque > 0 && (
        <fieldset className="pdp__medida pdp__venda">
          <legend className="pdp__medida-titulo">Como comprar</legend>
          <div className="pdp__venda-opcoes">
            <label className="pdp__venda-opcao">
              <input type="radio" name="venda" checked={!unidade} disabled={semPar} onChange={() => setUnidade(false)} />
              <span>O par</span>
              <strong>{formatarPreco(produto.precoCentavos)}</strong>
            </label>
            <label className="pdp__venda-opcao">
              <input type="radio" name="venda" checked={unidade} onChange={() => setUnidade(true)} />
              <span>Uma aliança</span>
              <strong>{formatarPreco(precoDaUnidade(produto.precoCentavos))}</strong>
            </label>
          </div>
        </fieldset>
      )}

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
        produto={
          vendidaEmPar && unidade
            ? {
                ...produto,
                nome: `${produto.nome} (unidade)`,
                precoCentavos: precoDaUnidade(produto.precoCentavos),
                aros: 1,
                avulsa: true,
                tamanho: aro,
                tamanhoPar: null,
              }
            : { ...produto, tamanho: aro, tamanhoPar: par ? aroPar : null }
        }
      />
    </>
  );
}
