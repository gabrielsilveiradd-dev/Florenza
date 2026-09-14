"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { TAMANHOS_DE_ARO } from "@/lib/aros";
import { linkWhatsApp } from "@/lib/loja";

/**
 * GUIA DE MEDIDAS — abre quando alguém escolhe "Não sei ainda" (na página da
 * peça ou na linha do carrinho) e pelo "Veja como medir".
 *
 * "Não sei ainda" continua sendo resposta válida: fechar o guia sem escolher
 * mantém essa opção. O guia existe para que menos gente precise dela — cada
 * medida a combinar é uma conversa a mais antes de a peça sair.
 *
 * É um `<dialog>` nativo com `showModal()`: o navegador cuida de prender o
 * foco, fechar no Esc, pôr o popup acima da nav e devolver o foco ao seletor
 * que o abriu. Nada disso precisa de biblioteca.
 *
 * Vai para o `<body>` por portal. Dentro de `.chk` ou `.pdp`, os resets de lá
 * (`.chk :where(ul)`, `.chk :where(button)`) empatam com as classes do guia e,
 * importados depois, vencem — no carrinho sumiam a numeração, o recuo das
 * listas e o fundo do botão.
 */

const semAssinatura = () => () => {};

/**
 * Numeração brasileira: o número do aro é a circunferência interna em
 * milímetros menos 40 (aro 10 = 50 mm, aro 18 = 58 mm). O diâmetro sai da
 * circunferência — é ele que se mede com a régua num anel que já serve.
 */
const MEDIDAS = TAMANHOS_DE_ARO.map((aro) => {
  const circunferencia = aro + 40;
  return {
    aro,
    circunferencia,
    diametro: (circunferencia / Math.PI).toFixed(1).replace(".", ","),
  };
});

export function GuiaDeMedidas({
  aberto,
  aoFechar,
  aoEscolher,
  destino,
  peca,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** Presente: tocar numa linha da tabela escolhe aquele aro e fecha o guia. */
  aoEscolher?: (aro: number) => void;
  /** Em aliança em par, qual dos seletores a escolha preenche ("Aro 2"). */
  destino?: string;
  /** Nome da peça, para a mensagem do WhatsApp chegar com contexto. */
  peca?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // No servidor não há `document.body`; o popup passa a existir na hidratação,
  // antes de qualquer clique que possa abri-lo.
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto, noNavegador]);

  // Fechar pelo próprio <dialog> some da tela na hora; o `onClose` avisa quem
  // abriu. Assim a troca de estado acontece com o popup já fechado.
  const fechar = () => ref.current?.close();

  const whatsapp = linkWhatsApp(
    `Olá! Quero ajuda para descobrir a medida do aro${peca ? ` — ${peca}` : ""}.`
  );

  if (!noNavegador) return null;

  return createPortal(
    <dialog
      ref={ref}
      className="guia"
      aria-labelledby="guia-titulo"
      onClose={aoFechar}
      onClick={(evento) => {
        // O clique só tem o próprio <dialog> como alvo fora da caixa: é o fundo escurecido.
        if (evento.target === evento.currentTarget) fechar();
      }}
    >
      <div className="guia__caixa">
        <header className="guia__topo">
          <div>
            <p className="guia__eyebrow">Guia de medidas</p>
            <h2 className="guia__titulo" id="guia-titulo">
              Como descobrir o tamanho do aro
            </h2>
          </div>
          <button type="button" className="guia__fechar" onClick={fechar} aria-label="Fechar o guia">
            <X aria-hidden size={16} />
          </button>
        </header>

        <div className="guia__corpo">
          <section className="guia__secao">
            <h3 className="guia__subtitulo">Duas formas de medir em casa</h3>
            <ol className="guia__passos">
              <li>
                <strong>Com um anel que já serve.</strong> Apoie o anel sobre uma régua e meça, por
                dentro, de uma borda à outra. Esse é o diâmetro — procure o valor na tabela.
              </li>
              <li>
                <strong>Com barbante ou tira de papel.</strong> Dê uma volta na base do dedo, sem
                apertar, e marque onde as pontas se encontram. Estique sobre a régua: os milímetros
                até a marca são a circunferência.
              </li>
            </ol>

            <h3 className="guia__subtitulo guia__subtitulo--dicas">Para acertar</h3>
            <ul className="guia__dicas">
              <li>Meça no fim do dia, com a mão aquecida. De manhã e no frio o dedo fica mais fino.</li>
              <li>O anel precisa passar pela junta. Se ela for mais grossa que a base do dedo, meça nela.</li>
              <li>Ficou entre dois números? Fique com o maior.</li>
              <li>Aliança larga, a partir de 6 mm, veste mais justa: considere um número acima.</li>
              <li>Meça o dedo e a mão em que a peça vai ficar — a mão com que se escreve costuma ser maior.</li>
              <li>É presente? Pegue emprestado um anel que a pessoa usa no mesmo dedo e meça o diâmetro.</li>
            </ul>
          </section>

          <section className="guia__secao guia__secao--tabela">
            <h3 className="guia__subtitulo">Tabela de aros</h3>
            {aoEscolher && (
              <p className="guia__nota">
                Toque em uma linha para escolher a medida{destino ? ` do ${destino.toLowerCase()}` : ""}.
              </p>
            )}
            <div className="guia__rolagem">
              <table className="guia__tabela">
                <thead>
                  <tr>
                    <th scope="col">Aro</th>
                    <th scope="col">Diâmetro</th>
                    <th scope="col">Circunferência</th>
                  </tr>
                </thead>
                <tbody>
                  {MEDIDAS.map((m) => (
                    <tr key={m.aro}>
                      <th scope="row">
                        {aoEscolher ? (
                          <button
                            type="button"
                            className="guia__escolher"
                            aria-label={`Escolher aro ${m.aro}`}
                            onClick={() => {
                              aoEscolher(m.aro);
                              fechar();
                            }}
                          >
                            {m.aro}
                          </button>
                        ) : (
                          m.aro
                        )}
                      </th>
                      <td>{m.diametro} mm</td>
                      <td>{m.circunferencia} mm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="guia__nota">
              Numeração brasileira. Pode variar alguns décimos de milímetro de uma joalheria para outra.
            </p>
          </section>
        </div>

        <footer className="guia__rodape">
          <p>
            Ainda sem certeza? Siga com “Não sei ainda”: a Florenza confirma a medida com você pelo
            WhatsApp antes de enviar.
          </p>
          <div className="guia__acoes">
            {whatsapp && (
              <a className="guia__acao" href={whatsapp} target="_blank" rel="noopener noreferrer">
                Tirar dúvida no WhatsApp
              </a>
            )}
            <button type="button" className="guia__acao guia__acao--principal" onClick={fechar}>
              {aoEscolher ? "Continuar com “Não sei ainda”" : "Entendi"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>,
    document.body
  );
}
