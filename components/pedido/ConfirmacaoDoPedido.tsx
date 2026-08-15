"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { StatusDoPedido } from "@/components/pedido/StatusDoPedido";

export type PedidoConfirmado = {
  numero: number;
  itens: Array<{ sku: string; nome: string; precoCentavos: number; quantidade: number }>;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  cupomCodigo: string | null;
  criadoEm: string;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatar = (centavos: number) => moeda.format(centavos / 100);

/**
 * A tela logo depois de fechar o pedido.
 *
 * Mantém o vocabulário visual do carrinho de propósito — cartão de canto
 * arredondado, mesma paleta, mesma tipografia. A pessoa acabou de sair de lá, e
 * uma tela de confirmação que parece de outro site faz duvidar se a compra
 * passou.
 *
 * A linha do tempo é o MESMO componente da aba de pedidos da conta. Quem voltar
 * dias depois para conferir a entrega reencontra exatamente esta tela, com uma
 * etapa a mais acesa.
 *
 * O que ela NÃO promete: nada de "pagamento aprovado". O pedido nasce em
 * 'aguardando pagamento' e o acerto é por WhatsApp — dizer o contrário aqui
 * seria mentir para o cliente na tela mais importante da compra.
 */
export function ConfirmacaoDoPedido({ pedido }: { pedido: PedidoConfirmado }) {
  const semMovimento = useReducedMotion();

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
            {/* Não diz "confirmação enviada para o seu e-mail": este sistema
                não manda e-mail de pedido. Prometer na tela o que não acontece
                faz o cliente esperar por uma mensagem que nunca chega, e
                depois desconfiar do resto. */}
            <p className="ped-rotulo">Guarde este número</p>
          </div>

          <StatusDoPedido
            pedido={{
              numero: pedido.numero,
              status: "aguardando_pagamento",
              criadoEm: pedido.criadoEm,
              pagoEm: null,
              enviadoEm: null,
              entregueEm: null,
              codigoRastreio: null,
              transportadora: null,
            }}
          />

          <ul className="ped-itens">
            {pedido.itens.map((i) => (
              <li key={i.sku}>
                <span>{i.quantidade > 1 && `${i.quantidade}× `}{i.nome}</span>
                <span>{formatar(i.precoCentavos * i.quantidade)}</span>
              </li>
            ))}
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
            <Link className="ped-acao ped-acao--principal" href="/conta">
              Acompanhar na minha conta
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

        <p className="chk-nota" style={{ marginTop: 14 }}>
          A Florenza entra em contato pelo <strong>WhatsApp</strong> para combinar a forma de
          pagamento e o prazo de produção da peça. Guarde o número{" "}
          <strong>#{pedido.numero}</strong> — é por ele que o pedido é encontrado.
        </p>

        <p className="chk-nota">
          Assim que o pagamento for confirmado, o status muda sozinho aqui e na sua conta. O
          código de rastreio aparece na mesma tela quando a peça for despachada.
        </p>

        <p className="chk-nota">
          Se você criou conta, pode acompanhar tudo em <Link href="/conta" style={{ color: "var(--gold-ink)" }}>Minha conta</Link> a
          qualquer momento.
        </p>
      </aside>
    </motion.div>
  );
}
