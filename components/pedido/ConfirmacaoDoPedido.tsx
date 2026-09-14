"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { BotaoPagar } from "@/components/pedido/BotaoPagar";
import { StatusDoPedido } from "@/components/pedido/StatusDoPedido";
import { descreverMedida } from "@/lib/aros";
import { linkWhatsApp } from "@/lib/loja";

export type PedidoConfirmado = {
  numero: number;
  itens: Array<{
    chave: string;
    nome: string;
    precoCentavos: number;
    quantidade: number;
    aros: number;
    tamanho: number | null;
    tamanhoPar: number | null;
  }>;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  cupomCodigo: string | null;
  criadoEm: string;
  expiraEm: string | null;
  /** O pedido nasceu, mas a cobrança no Mercado Pago não abriu. */
  erroPagamento: string | null;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatar = (centavos: number) => moeda.format(centavos / 100);
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
});

/**
 * A tela logo depois de fechar o pedido — quando ela aparece.
 *
 * Com o Mercado Pago ligado e a cobrança aberta, a pessoa vai direto para a
 * página de pagamento e volta em /conta/pedido/[numero]; esta tela só aparece
 * se a cobrança não abriu. Sem o Mercado Pago, é aqui que ela termina.
 *
 * Mantém o vocabulário visual do carrinho de propósito — cartão de canto
 * arredondado, mesma paleta, mesma tipografia. A pessoa acabou de sair de lá, e
 * uma tela de confirmação que parece de outro site faz duvidar se a compra
 * passou.
 *
 * O que ela NÃO promete: nada de "pagamento aprovado". O pedido nasce em
 * 'aguardando pagamento', e dizer o contrário seria mentir para o cliente na
 * tela mais importante da compra.
 */
export function ConfirmacaoDoPedido({
  pedido,
  pagamentoOnline,
}: {
  pedido: PedidoConfirmado;
  pagamentoOnline: boolean;
}) {
  const semMovimento = useReducedMotion();
  const whatsapp = linkWhatsApp(`Olá! Acabei de fazer o pedido #${pedido.numero} no site.`);

  return (
    <motion.div
      className="chk__grade"
      initial={semMovimento ? undefined : { opacity: 0, y: 12 }}
      animate={semMovimento ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="chk__coluna">
        <div className="ped-cartao">
          <div className="ped-cabecalho">
            <div>
              <p className="ped-rotulo">Código do pedido</p>
              <p className="ped-numero">#{pedido.numero}</p>
            </div>
            <p className="ped-rotulo">Guarde este número</p>
          </div>

          <StatusDoPedido
            pagamentoOnline={pagamentoOnline}
            pedido={{
              numero: pedido.numero,
              status: "aguardando_pagamento",
              criadoEm: pedido.criadoEm,
              pagoEm: null,
              enviadoEm: null,
              entregueEm: null,
              codigoRastreio: null,
              transportadora: null,
              motivoCancelamento: null,
            }}
          />

          <ul className="ped-itens">
            {pedido.itens.map((i) => {
              const medida = descreverMedida(i.aros, i.tamanho, i.tamanhoPar);
              return (
                <li key={i.chave}>
                  <span>
                    {i.quantidade > 1 && `${i.quantidade}× `}{i.nome}
                    {medida && <span className="ped-itens__medida">{medida}</span>}
                  </span>
                  <span>{formatar(i.precoCentavos * i.quantidade)}</span>
                </li>
              );
            })}
          </ul>

          <dl className="ped-contas">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatar(pedido.subtotalCentavos)}</dd>
            </div>
            {pedido.descontoCentavos > 0 && (
              <div>
                <dt>Desconto{pedido.cupomCodigo && ` · ${pedido.cupomCodigo}`}</dt>
                <dd>− {formatar(pedido.descontoCentavos)}</dd>
              </div>
            )}
            <div className="ped-contas__total">
              <dt>Total</dt>
              <dd>{formatar(pedido.totalCentavos)}</dd>
            </div>
          </dl>

          <div className="ped-acoes">
            <Link className="ped-acao ped-acao--principal" href={`/conta/pedido/${pedido.numero}`}>
              Acompanhar o pedido
              <ArrowRight aria-hidden size={14} />
            </Link>
            <Link className="ped-acao" href="/aneis-formatura">Continuar vendo peças</Link>
          </div>
        </div>
      </div>

      <aside className="chk-resumo">
        <h2 className="chk-resumo__titulo">
          <MessageCircle aria-hidden size={15} />
          O próximo passo
        </h2>

        {pedido.erroPagamento ? (
          <>
            <p className="chk-erro" role="alert">{pedido.erroPagamento}</p>
            <div className="ped-acoes" style={{ marginTop: 14 }}>
              <BotaoPagar numero={pedido.numero} />
            </div>
          </>
        ) : (
          <p className="chk-nota" style={{ marginTop: 14 }}>
            A Florenza entra em contato pelo <strong>WhatsApp</strong> para combinar a forma de
            pagamento. Guarde o número <strong>#{pedido.numero}</strong> — é por ele que o pedido é
            encontrado.
          </p>
        )}

        {pedido.expiraEm && (
          <p className="chk-nota">
            As peças ficam reservadas para você até <strong>{dataHora.format(new Date(pedido.expiraEm))}</strong>.
            Sem pagamento até lá, elas voltam para a vitrine.
          </p>
        )}

        <p className="chk-nota">
          Quando o pagamento for confirmado, o status muda sozinho na página do pedido. O código de
          rastreio aparece no mesmo lugar quando a peça for despachada.
        </p>

        {whatsapp && (
          <div className="ped-acoes" style={{ marginTop: 16 }}>
            <a className="ped-acao" href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden size={14} />
              Falar com a Florenza
            </a>
          </div>
        )}
      </aside>
    </motion.div>
  );
}
