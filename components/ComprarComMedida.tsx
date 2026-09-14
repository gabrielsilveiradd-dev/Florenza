"use client";

import { useState } from "react";
import { BotaoComprar } from "@/components/BotaoComprar";
import { GuiaDeMedidas } from "@/components/GuiaDeMedidas";
import { NAO_SEI, TAMANHOS_DE_ARO, lerEscolha, type EscolhaDeAro } from "@/lib/aros";
import type { ItemCarrinho } from "@/lib/carrinho";

/**
 * O "Comprar" da página da peça, com a medida do aro ao lado.
 *
 * A escolha é obrigatória, mas "Não sei ainda" é uma resposta válida — boa
 * parte de quem compra anel de formatura ou aliança para presente não sabe a
 * medida, e barrar essa pessoa é perder a venda. O que não pode é a medida
 * ficar esquecida: o botão só adiciona depois de uma das opções ser escolhida.
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
  const [aro, setAro] = useState<EscolhaDeAro>("");
  const [aroPar, setAroPar] = useState<EscolhaDeAro>("");
  const [avisar, setAvisar] = useState(false);
  // Quem abriu o guia de medidas: um dos seletores (a tabela escolhe por ele),
  // o link "Veja como medir" (só consulta) ou ninguém (fechado).
  const [guia, setGuia] = useState<"aro-1" | "aro-2" | "consulta" | null>(null);

  const tamanho = lerEscolha(aro);
  const tamanhoPar = lerEscolha(aroPar);
  const falta =
    produto.aros >= 1 && (tamanho === undefined || (produto.aros === 2 && tamanhoPar === undefined));

  const seletor = (
    id: "aro-1" | "aro-2",
    rotulo: string,
    valor: EscolhaDeAro,
    mudar: (v: EscolhaDeAro) => void
  ) => (
    <div className="pdp__medida-campo">
      <label className="pdp__medida-rotulo" htmlFor={id}>{rotulo}</label>
      <select
        className="pdp__medida-select"
        id={id}
        value={valor}
        onChange={(e) => {
          mudar(e.target.value);
          if (e.target.value === NAO_SEI) setGuia(id);
        }}
        aria-invalid={avisar && valor === "" ? true : undefined}
      >
        <option value="">Escolha</option>
        <option value={NAO_SEI}>Não sei ainda</option>
        {TAMANHOS_DE_ARO.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  );

  return (
    <>
      {produto.aros > 0 && produto.estoque > 0 && (
        <>
          <fieldset className="pdp__medida" id="medida">
            <legend className="pdp__medida-titulo">
              {produto.aros === 2 ? "Tamanho dos aros" : "Tamanho do aro"}
            </legend>
            <div className="pdp__medida-campos">
              {seletor("aro-1", produto.aros === 2 ? "Aro 1" : "Aro", aro, setAro)}
              {produto.aros === 2 && seletor("aro-2", "Aro 2", aroPar, setAroPar)}
            </div>
            <p className="pdp__medida-dica">
              Não sabe a medida?{" "}
              <button type="button" className="pdp__medida-guia" onClick={() => setGuia("consulta")}>
                Veja como medir
              </button>{" "}
              ou escolha “Não sei ainda” — a Florenza confirma com você pelo WhatsApp antes de enviar.
            </p>
            {avisar && falta && (
              <p className="pdp__medida-erro" role="alert">
                Escolha o tamanho {produto.aros === 2 ? "dos dois aros" : "do aro"} para continuar.
              </p>
            )}
          </fieldset>

          <GuiaDeMedidas
            aberto={guia !== null}
            aoFechar={() => setGuia(null)}
            peca={produto.nome}
            destino={produto.aros === 2 ? (guia === "aro-2" ? "Aro 2" : "Aro 1") : undefined}
            aoEscolher={
              guia === "aro-1" || guia === "aro-2"
                ? (n) => (guia === "aro-1" ? setAro : setAroPar)(String(n))
                : undefined
            }
          />
        </>
      )}

      <BotaoComprar
        className={className}
        modo="pagina"
        bloqueado={falta}
        aoBloquear={() => setAvisar(true)}
        produto={{ ...produto, tamanho: tamanho ?? null, tamanhoPar: tamanhoPar ?? null }}
      />
    </>
  );
}
