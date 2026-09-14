"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GuiaDeMedidas } from "@/components/GuiaDeMedidas";
import { NAO_SEI, TAMANHOS_DE_ARO, lerEscolha, paraEscolha } from "@/lib/aros";
import { chaveDoItem, type ItemCarrinho } from "@/lib/carrinho";

/**
 * A lista do carrinho e o painel de resumo.
 *
 * Adaptado do componente `interactive-checkout` — dele vêm o desenho e a
 * interação: cartão por peça, painel grudado ao lado, entrada e saída animadas
 * com AnimatePresence, `layout` para as linhas se reacomodarem sozinhas, e o
 * total que rola dígito a dígito com NumberFlow.
 *
 * O que NÃO veio, e por quê:
 *
 * - O carrinho em `useState` local. Aqui os itens vêm de `lib/carrinho`, que
 *   vive no localStorage e é a mesma fonte da contagem na nav. Um estado local
 *   faria a página discordar do resto do site.
 * - O `Button` da shadcn. As classes dele (`bg-primary`,
 *   `ring-offset-background`) apontam para tokens de um tema que este projeto
 *   não tem — renderizariam sem cor. E como o preflight do Tailwind está
 *   desligado de propósito, um `<button>` sem reset traz a borda e a fonte do
 *   navegador. Os botões daqui usam o vocabulário que o site já tem.
 * - A paleta zinc e os preços em dólar. Cor sai das variáveis da Florenza;
 *   preço é inteiro em centavos e formatado só na exibição.
 *
 * `useReducedMotion` desliga as animações para quem pediu menos movimento — é
 * regra do projeto, e o componente de origem não previa.
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatar = (centavos: number) => moeda.format(centavos / 100);

export function ListaDoCarrinho({
  itens,
  mudarQuantidade,
  mudarMedida,
  remover,
  quantidadeDaPeca,
}: {
  itens: ItemCarrinho[];
  mudarQuantidade: (chave: string, quantidade: number) => void;
  mudarMedida: (chave: string, tamanho: number | null, tamanhoPar: number | null) => void;
  remover: (chave: string) => void;
  quantidadeDaPeca: (sku: string) => number;
}) {
  const semMovimento = useReducedMotion();
  const animacao = semMovimento
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96 },
        transition: { opacity: { duration: 0.2 }, layout: { duration: 0.2 } },
      };

  // A linha e o seletor que abriram o guia de medidas. `par` = o segundo aro.
  const [guia, setGuia] = useState<{
    chave: string;
    par: boolean;
    destino?: string;
    peca: string;
  } | null>(null);

  return (
    <>
    <ul className="chk-lista">
      <AnimatePresence initial={false} mode="popLayout">
        {itens.map((item) => {
          const chave = chaveDoItem(item);
          const esgotado = item.estoque <= 0;
          // O teto é da peça, somando todas as medidas dela no carrinho.
          const noLimite = quantidadeDaPeca(item.sku) >= item.estoque;
          const faltaMedida = item.tamanho === null || (item.aros === 2 && item.tamanhoPar === null);

          const abrirGuia = (par: boolean, chaveDaLinha: string) =>
            setGuia({
              chave: chaveDaLinha,
              par,
              destino: item.aros === 2 ? (par ? "Aro 2" : "Aro 1") : undefined,
              peca: item.nome,
            });

          /* A medida pode ser trocada aqui mesmo. É o conserto para quem
             escolheu errado na página da peça, e é por onde carrinhos antigos
             — de antes de existir medida — ganham uma, começando em "não sei
             ainda". */
          const seletor = (rotulo: string, valor: number | null, par: boolean) => (
            <label className="chk-item__medida-campo">
              <span>{rotulo}</span>
              <select
                value={paraEscolha(valor)}
                onChange={(e) => {
                  const escolha = lerEscolha(e.target.value);
                  if (escolha === undefined) return;
                  const tamanho = par ? item.tamanho : escolha;
                  const tamanhoPar = par ? escolha : item.tamanhoPar;
                  mudarMedida(chave, tamanho, tamanhoPar);
                  // Trocar a medida troca a chave da linha: o guia guarda a nova.
                  if (escolha === null) abrirGuia(par, chaveDoItem({ sku: item.sku, tamanho, tamanhoPar }));
                }}
                aria-label={`${rotulo} de ${item.nome}`}
              >
                <option value={NAO_SEI}>Não sei ainda</option>
                {TAMANHOS_DE_ARO.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          );

          return (
            <motion.li
              key={chave}
              layout={!semMovimento}
              className={`chk-item${esgotado ? " is-esgotado" : ""}`}
              {...animacao}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="chk-item__foto" src={item.imagemUrl} alt="" />

              <div className="chk-item__corpo">
                <div className="chk-item__topo">
                  <Link href={`/produto/${item.slug}`} className="chk-item__nome">
                    {item.nome}
                  </Link>
                  <button
                    type="button"
                    className="chk-item__tirar"
                    aria-label={`Remover ${item.nome}`}
                    onClick={() => remover(chave)}
                  >
                    <X aria-hidden size={13} />
                  </button>
                </div>

                {/* Sem o código da peça: ele é chave de logística interna e não
                    diz nada a quem está comprando. Quem precisa de referência
                    usa o número do pedido. A linha só existe quando há aviso de
                    estoque para dar. */}
                {(esgotado || noLimite) && (
                  <p className="chk-item__sku">
                    {esgotado && <span className="chk-selo">esgotada</span>}
                    {!esgotado && noLimite && (
                      <span className="chk-selo">
                        {item.estoque === 1 ? "última peça" : `só há ${item.estoque}`}
                      </span>
                    )}
                  </p>
                )}

                {item.aros > 0 && (
                  <div className="chk-item__medida">
                    {seletor(item.aros === 2 ? "Aro 1" : "Aro", item.tamanho, false)}
                    {item.aros === 2 && seletor("Aro 2", item.tamanhoPar, true)}
                    {/* O select já parado em "Não sei ainda" não dispara onChange
                        ao escolher a mesma opção — daí o caminho de volta ao guia. */}
                    {faltaMedida && (
                      <button
                        type="button"
                        className="chk-item__medida-guia"
                        onClick={() => abrirGuia(item.aros === 2 && item.tamanho !== null, chave)}
                      >
                        Como medir
                      </button>
                    )}
                  </div>
                )}

                <div className="chk-item__base">
                  <div className="chk-qtd">
                    <button
                      type="button"
                      aria-label={`Menos um ${item.nome}`}
                      onClick={() => mudarQuantidade(chave, item.quantidade - 1)}
                    >
                      <Minus aria-hidden size={12} />
                    </button>
                    <motion.span layout={!semMovimento}>{item.quantidade}</motion.span>
                    <button
                      type="button"
                      aria-label={`Mais um ${item.nome}`}
                      disabled={noLimite}
                      onClick={() => mudarQuantidade(chave, item.quantidade + 1)}
                    >
                      <Plus aria-hidden size={12} />
                    </button>
                  </div>

                  <span className="chk-item__preco">
                    {formatar(item.precoCentavos * item.quantidade)}
                  </span>
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>

    <GuiaDeMedidas
      aberto={guia !== null}
      aoFechar={() => setGuia(null)}
      destino={guia?.destino}
      peca={guia?.peca}
      aoEscolher={
        guia
          ? (n) => {
              const linha = itens.find((i) => chaveDoItem(i) === guia.chave);
              if (!linha) return;
              mudarMedida(guia.chave, guia.par ? linha.tamanho : n, guia.par ? n : linha.tamanhoPar);
            }
          : undefined
      }
    />
    </>
  );
}

export function ResumoDoCarrinho({
  quantidadeTotal,
  subtotalCentavos,
  descontoCentavos,
  totalCentavos,
  cupom,
  children,
}: {
  quantidadeTotal: number;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  cupom: { codigo: string } | null;
  /** O campo de cupom e o botão de fechar, montados por quem chama. */
  children: React.ReactNode;
}) {
  const semMovimento = useReducedMotion();

  return (
    <motion.aside
      className="chk-resumo"
      initial={semMovimento ? undefined : { opacity: 0, x: 16 }}
      animate={semMovimento ? undefined : { opacity: 1, x: 0 }}
    >
      <h2 className="chk-resumo__titulo">
        <ShoppingCart aria-hidden size={15} />
        Seu carrinho
        <span className="chk-resumo__contagem">{quantidadeTotal}</span>
      </h2>

      <dl className="chk-contas">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatar(subtotalCentavos)}</dd>
        </div>

        {cupom && descontoCentavos > 0 && (
          <div className="chk-contas__desconto">
            <dt>Desconto · {cupom.codigo}</dt>
            <dd>− {formatar(descontoCentavos)}</dd>
          </div>
        )}

        <div className="chk-contas__total">
          <dt>Total</dt>
          <dd>
            {/* NumberFlow rola os dígitos em vez de trocar o número de uma vez.
                Ele respeita prefers-reduced-motion por conta própria. */}
            <NumberFlow
              value={totalCentavos / 100}
              format={{ style: "currency", currency: "BRL" }}
              locales="pt-BR"
            />
          </dd>
        </div>
      </dl>

      {children}
    </motion.aside>
  );
}
