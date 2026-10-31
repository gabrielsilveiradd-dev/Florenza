import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Footer } from "@/components/Footer";
import { AcompanharPagamento } from "@/components/pedido/AcompanharPagamento";
import { BotaoPagar } from "@/components/pedido/BotaoPagar";
import { StatusDoPedido } from "@/components/pedido/StatusDoPedido";
import { descreverMedida } from "@/lib/aros";
import { formatarPreco } from "@/lib/catalogo";
import { METODO_DE_PAGAMENTO, STATUS_DO_PAGAMENTO, STATUS_DO_PEDIDO, enderecoEmUmaLinha } from "@/lib/conta";
import { buscarMeuPedido } from "@/lib/conta-servidor";
import { formatarCpf } from "@/lib/documentos";
import { descreverPrazo, valorDoFrete } from "@/lib/frete";
import { linkWhatsApp } from "@/lib/loja";
import { pagBankConfigurado, pagamentoOnlineAtivo } from "@/lib/pagamento/config";
import { STATUS_EM_ANDAMENTO } from "@/lib/pagamento/estados";
import { reconciliarSeLivre } from "@/lib/pagamento/reconciliar";
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
 * VOLTA DO PAGAMENTO: o pedido em aberto é conferido com o PagBank ao abrir, pelo
 * id salvo, sem depender de identificador na URL nem do webhook. Depois disso o
 * `AcompanharPagamento` segue perguntando, e a pessoa vê o estado real sem
 * precisar fazer nada. A reconciliação falhar não impede a página de abrir: o job
 * também confere.
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

  let pedido = await buscarMeuPedido({ numero });
  if (!pedido) notFound();

  if (pagBankConfigurado() && pedido.status === "aguardando_pagamento" && pedido.pagamentoEstado) {
    try {
      await reconciliarSeLivre(pedido.id, "pagina", 15);
      // Lido de novo, para a tela já nascer com o estado novo.
      pedido = (await buscarMeuPedido({ numero })) ?? pedido;
    } catch (e) {
      console.error(`[pedido #${numero}] reconciliação ao abrir falhou:`, e);
    }
  }

  const aguardando = pedido.status === "aguardando_pagamento";
  const reservaVencida = Boolean(pedido.expiraEm && new Date(pedido.expiraEm) <= new Date());
  // Com cobrança em análise não se abre outra: o resultado ainda vai chegar.
  const emAnalise = pedido.pagamentos.some((g) => (STATUS_EM_ANDAMENTO as readonly string[]).includes(g.status));
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

            <AcompanharPagamento numero={pedido.numero} estadoInicial={pedido.pagamentoEstado} />

            <StatusDoPedido pagamentoOnline={online} pedido={pedido} />

            {aguardando && pedido.expiraEm && (
              <p className="ped-reserva">
                {reservaVencida
                  ? "O prazo de pagamento venceu. Se o pagamento já foi feito, ele ainda será reconhecido; se não, fale com a Florenza."
                  : `Pague até ${dataHora.format(new Date(pedido.expiraEm))}. Depois disso, o pedido é cancelado automaticamente.`}
              </p>
            )}

            {(aguardando && online && !reservaVencida && !emAnalise) || whatsapp ? (
              <div className="ped-acoes">
                {aguardando && online && !reservaVencida && !emAnalise && <BotaoPagar numero={pedido.numero} />}
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
