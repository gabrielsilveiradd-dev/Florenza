import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BotaoPagar } from "@/components/pedido/BotaoPagar";
import { StatusDoPedido } from "@/components/pedido/StatusDoPedido";
import { descreverMedida } from "@/lib/aros";
import { formatarPreco } from "@/lib/catalogo";
import { METODO_DE_PAGAMENTO, STATUS_DO_PAGAMENTO, STATUS_DO_PEDIDO, enderecoEmUmaLinha } from "@/lib/conta";
import { buscarMeuPedido } from "@/lib/conta-servidor";
import { formatarCpf } from "@/lib/documentos";
import { descreverPrazo, valorDoFrete } from "@/lib/frete";
import { linkWhatsApp } from "@/lib/loja";
import { pagamentoOnlineAtivo } from "@/lib/pagamento/config";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import "../../../carrinho/checkout.css";
import "../../conta.css";

export const metadata: Metadata = {
  title: "Pedido — Florenza",
  robots: { index: false, follow: false },
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
});

/**
 * A página de um pedido — o link do e-mail, o destino da volta do PagBank e o
 * "ver pedido" da conta.
 *
 * VOLTA DO PAGAMENTO: o PagBank não documenta nenhum identificador na URL de
 * volta, então a página não tem o que consultar e só lê o banco. Quem traz o
 * pagamento é o webhook — e por isso a tela não diz que o pagamento falhou só
 * porque ele ainda não chegou.
 */
export default async function PaginaDoPedido({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const numero = Number((await params).numero);
  if (!supabaseConfigurado() || !Number.isInteger(numero)) notFound();

  const usuario = (await (await createClient()).auth.getUser()).data.user;
  if (!usuario) redirect(`/entrar?redirect=${encodeURIComponent(`/conta/pedido/${numero}`)}`);

  const online = pagamentoOnlineAtivo();

  const pedido = await buscarMeuPedido({ numero });
  if (!pedido) notFound();

  const aguardando = pedido.status === "aguardando_pagamento";
  const reservaVencida = Boolean(pedido.expiraEm && new Date(pedido.expiraEm) <= new Date());
  // Toda tentativa falhou. Com uma ainda em aberto, não é hora de dizer isso.
  const recusado =
    aguardando &&
    pedido.pagamentos.length > 0 &&
    pedido.pagamentos.every((g) => g.status === "DECLINED" || g.status === "CANCELED");
  const endereco = enderecoEmUmaLinha(pedido);
  const prazo = descreverPrazo(pedido.fretePrazoMinDias, pedido.fretePrazoMaxDias);
  const whatsapp = linkWhatsApp(`Olá! Quero falar sobre o meu pedido #${pedido.numero}.`);

  return (
    <>
      <main className="conta conta--painel">
        <div className="conta__painel">
          <Link className="conta__voltar" href="/conta">← Minha conta</Link>

          <div className="ped-cartao" style={{ marginTop: 22 }}>
            <div className="ped-cabecalho">
              <div>
                <p className="ped-rotulo">Código do pedido</p>
                <p className="ped-numero">#{pedido.numero}</p>
              </div>
              <span className={`conta__selo conta__selo--${pedido.status}`}>
                {STATUS_DO_PEDIDO[pedido.status] ?? pedido.status}
              </span>
            </div>

            {recusado && (
              <p className="chk-erro" role="alert">
                O pagamento não foi aprovado. Você pode tentar de novo com outro cartão ou pelo Pix.
              </p>
            )}

            <StatusDoPedido pagamentoOnline={online} pedido={pedido} />

            {aguardando && pedido.expiraEm && (
              <p className="ped-reserva">
                {reservaVencida
                  ? "A reserva venceu. Se o pagamento já foi feito, ele ainda será reconhecido; se não, fale com a Florenza."
                  : `As peças estão reservadas para você até ${dataHora.format(new Date(pedido.expiraEm))}.`}
                {online && !reservaVencida &&
                  " Se você acabou de pagar, a confirmação do PagBank chega em instantes: recarregue a página antes de pagar de novo."}
              </p>
            )}

            {(aguardando && online && !reservaVencida) || whatsapp ? (
              <div className="ped-acoes">
                {aguardando && online && !reservaVencida && <BotaoPagar numero={pedido.numero} />}
                {whatsapp && (
                  <a className="ped-acao" href={whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden size={14} />
                    Falar com a Florenza
                  </a>
                )}
              </div>
            ) : null}

            <ul className="ped-itens">
              {pedido.itens.map((i, indice) => {
                const medida = descreverMedida(i.aros, i.tamanho, i.tamanhoPar);
                return (
                  <li key={`${i.sku}-${indice}`}>
                    <span>
                      {i.quantidade > 1 && `${i.quantidade}× `}{i.nome}
                      {medida && <span className="ped-itens__medida">{medida}</span>}
                    </span>
                    <span>{formatarPreco(i.precoCentavos * i.quantidade)}</span>
                  </li>
                );
              })}
            </ul>

            <dl className="ped-contas">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatarPreco(pedido.subtotalCentavos)}</dd>
              </div>
              {pedido.descontoCentavos > 0 && (
                <div>
                  <dt>Desconto{pedido.cupomCodigo && ` · ${pedido.cupomCodigo}`}</dt>
                  <dd>− {formatarPreco(pedido.descontoCentavos)}</dd>
                </div>
              )}
              {pedido.freteNome && (
                <div>
                  <dt>Frete · {pedido.freteNome}</dt>
                  <dd>{valorDoFrete(pedido.freteCentavos)}</dd>
                </div>
              )}
              <div className="ped-contas__total">
                <dt>Total</dt>
                <dd>{formatarPreco(pedido.totalCentavos)}</dd>
              </div>
            </dl>

            <div className="ped-bloco">
              <p className="ped-bloco__titulo">Entrega</p>
              <p>{pedido.nome}{pedido.cpf && ` · CPF ${formatarCpf(pedido.cpf)}`}</p>
              {endereco && <p>{endereco}</p>}
              {pedido.freteNome && (
                <p className="ped-status__dica">
                  Envio {pedido.freteNome.toLowerCase()}
                  {prazo && ` · chega em ${prazo} depois da postagem`}
                </p>
              )}
              {pedido.presente && (
                <p className="ped-status__dica">
                  Para presente, sem valores na embalagem
                  {pedido.mensagemPresente && ` · cartão: “${pedido.mensagemPresente}”`}
                </p>
              )}
              {pedido.observacoes && <p className="ped-status__dica">Observações: {pedido.observacoes}</p>}
            </div>

            {pedido.pagamentos.length > 0 && (
              <div className="ped-bloco">
                <p className="ped-bloco__titulo">Pagamentos</p>
                <ul className="ped-itens" style={{ margin: 0, padding: 0, border: 0 }}>
                  {pedido.pagamentos.map((g) => (
                    <li key={g.id}>
                      <span>
                        {STATUS_DO_PAGAMENTO[g.status] ?? g.status}
                        {g.metodo && <span className="ped-itens__medida">{METODO_DE_PAGAMENTO[g.metodo] ?? g.metodo}</span>}
                      </span>
                      <span>{formatarPreco(g.valorCentavos)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
