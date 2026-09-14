import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { BotaoPagar } from "@/components/pedido/BotaoPagar";
import { StatusDoPedido } from "@/components/pedido/StatusDoPedido";
import { descreverMedida } from "@/lib/aros";
import { formatarPreco } from "@/lib/catalogo";
import { STATUS_DO_PAGAMENTO, STATUS_DO_PEDIDO, enderecoEmUmaLinha } from "@/lib/conta";
import { buscarMeuPedido } from "@/lib/conta-servidor";
import { formatarCpf } from "@/lib/documentos";
import { linkWhatsApp } from "@/lib/loja";
import { pagamentoOnlineAtivo } from "@/lib/pagamento/config";
import { sincronizarPagamento } from "@/lib/pagamento/sincronizar";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { urlDoSite } from "@/lib/url-do-site";

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
 * A página de um pedido — o link do e-mail, o destino da volta do Mercado Pago
 * e o "ver pedido" da conta.
 *
 * VOLTA DO PAGAMENTO: o Mercado Pago devolve a pessoa com `payment_id` na URL.
 * O webhook costuma chegar antes, mas não há garantia — e no localhost ele nem
 * chega. Por isso a página também sincroniza: busca o pagamento na API e
 * registra. É idempotente; se o webhook já tiver feito, nada muda.
 */
export default async function PaginaDoPedido({
  params,
  searchParams,
}: {
  params: Promise<{ numero: string }>;
  searchParams: Promise<{ payment_id?: string; collection_id?: string; status?: string }>;
}) {
  const numero = Number((await params).numero);
  if (!supabaseConfigurado() || !Number.isInteger(numero)) notFound();

  const usuario = (await (await createClient()).auth.getUser()).data.user;
  if (!usuario) redirect(`/entrar?redirect=${encodeURIComponent(`/conta/pedido/${numero}`)}`);

  const online = pagamentoOnlineAtivo();
  const busca = await searchParams;
  const pagamentoId = busca.payment_id ?? busca.collection_id;

  if (online && pagamentoId && /^\d+$/.test(pagamentoId)) {
    try {
      await sincronizarPagamento(pagamentoId, await urlDoSite());
    } catch (e) {
      // A página abre mesmo assim: o webhook ainda vai trazer o pagamento.
      console.error(`[pedido #${numero}] sincronização na volta do pagamento falhou:`, e);
    }
  }

  // Lido DEPOIS de sincronizar, para a tela já mostrar o status novo.
  const pedido = await buscarMeuPedido({ numero });
  if (!pedido) notFound();

  const aguardando = pedido.status === "aguardando_pagamento";
  const reservaVencida = Boolean(pedido.expiraEm && new Date(pedido.expiraEm) <= new Date());
  const recusado = aguardando && (busca.status === "rejected" || busca.status === "failure");
  const endereco = enderecoEmUmaLinha(pedido);
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
              <div className="ped-contas__total">
                <dt>Total</dt>
                <dd>{formatarPreco(pedido.totalCentavos)}</dd>
              </div>
            </dl>

            <div className="ped-bloco">
              <p className="ped-bloco__titulo">Entrega</p>
              <p>{pedido.nome}{pedido.cpf && ` · CPF ${formatarCpf(pedido.cpf)}`}</p>
              {endereco && <p>{endereco}</p>}
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
                        {g.metodo && <span className="ped-itens__medida">{g.metodo === "pix" ? "Pix" : g.metodo}</span>}
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
