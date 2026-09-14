import type { Metadata } from "next";
import Link from "next/link";
import { ComoFalar, DadosDaLoja, PaginaInstitucional } from "@/components/institucional/PaginaInstitucional";
import { LOJA, RESERVA_HORAS } from "@/lib/loja";
import { pagamentoOnlineAtivo } from "@/lib/pagamento/config";

import "../institucional.css";

export const metadata: Metadata = {
  title: "Termos de compra — Florenza",
  description: "Como funcionam a compra, a reserva, o pagamento e a entrega das peças Florenza.",
};

/* Texto-base: revisar com advogado ou contador antes de abrir a loja (ver
 * components/institucional/PaginaInstitucional.tsx). Cada regra aqui tem
 * correspondente no código — mudou a regra, muda o texto. */
export default function TermosDeCompra() {
  const online = pagamentoOnlineAtivo();

  return (
    <PaginaInstitucional caminho="/termos-de-compra" titulo="Termos de compra" atualizadoEm="14 de setembro de 2026">
      <p>
        Estes termos valem para as compras feitas neste site. Ao fechar um pedido, você declara
        que leu e concorda com eles, com a <Link href="/trocas-e-devolucoes">política de trocas e
        devoluções</Link> e com a <Link href="/privacidade">política de privacidade</Link>.
      </p>

      <h2>Quem vende</h2>
      <DadosDaLoja />

      <h2>Conta e dados do comprador</h2>
      <p>
        As compras são feitas com conta. É nela que você acompanha o pagamento, o preparo e o envio.
        Para fechar o pedido pedimos nome, WhatsApp, CPF e endereço de entrega — o CPF é usado na
        nota fiscal e na etiqueta de envio. Os dados precisam ser verdadeiros e seus.
      </p>

      <h2>Preço, estoque e medida</h2>
      <ul>
        <li>Os preços estão em reais e são os da página no momento em que o pedido é fechado.</li>
        <li>
          O estoque é real e conferido no fechamento. Se a última unidade for vendida enquanto você
          preenche o pedido, o site avisa antes de concluir.
        </li>
        <li>
          Para anéis e alianças, a medida do aro é escolhida na página da peça. Quem ainda não sabe a
          medida pode escolher “Não sei ainda”: a Florenza confirma com você antes de enviar.
        </li>
        <li>Há um limite de 10 unidades por peça em cada pedido.</li>
      </ul>

      <h2>Reserva e pagamento</h2>
      <p>
        Ao fechar o pedido, as peças ficam <strong>reservadas para você por {RESERVA_HORAS} horas</strong>.
        {online
          ? " O pagamento é feito com Pix ou cartão na página do Mercado Pago, logo depois do fechamento."
          : " A Florenza entra em contato pelo WhatsApp para combinar a forma de pagamento."}
      </p>
      <ul>
        <li>
          Sem pagamento confirmado dentro da reserva, o pedido é cancelado automaticamente e as peças
          voltam para a vitrine. Pagamento com cartão em análise mantém a reserva até a resposta.
        </li>
        <li>Cada conta pode ter até 3 pedidos aguardando pagamento ao mesmo tempo.</li>
        {online && (
          <li>
            Os dados do cartão são digitados no ambiente do Mercado Pago. A Florenza não recebe nem
            guarda número de cartão.
          </li>
        )}
        <li>O pedido só entra em preparo depois que o pagamento é confirmado.</li>
      </ul>

      <h2>Cupons de desconto</h2>
      <ul>
        <li>Vale um cupom por pedido, e o desconto é calculado sobre o valor das peças.</li>
        <li>
          Cupons de primeira compra valem uma única vez por cliente — a conferência é feita pela conta
          e pelo CPF.
        </li>
        <li>Se o pedido for cancelado, o uso do cupom é devolvido.</li>
      </ul>

      <h2>Preparo e entrega</h2>
      {LOJA.entrega ? (
        <p>{LOJA.entrega}</p>
      ) : (
        <p><span className="inst__pendente">a preencher: prazos de preparo, formas de envio e frete</span></p>
      )}
      <p>
        Cada etapa aparece na página do pedido, em <Link href="/conta">Minha conta</Link>, e o código
        de rastreio é publicado lá assim que a peça é postada.
      </p>

      <h2>Cancelamento pela loja</h2>
      <p>
        A Florenza pode cancelar um pedido quando o pagamento não for confirmado, quando houver erro
        evidente nos dados ou indício de fraude. Nesses casos, qualquer valor pago é devolvido
        integralmente, pelo mesmo meio de pagamento.
      </p>

      <h2>Arrependimento, troca e garantia</h2>
      <p>
        Você pode desistir da compra em até 7 dias depois de receber a peça, e toda peça tem a
        garantia legal contra defeitos. Os detalhes estão na{" "}
        <Link href="/trocas-e-devolucoes">política de trocas e devoluções</Link>.
      </p>

      <h2>Atendimento</h2>
      <p>
        Dúvidas, reclamações e pedidos de cancelamento são atendidos <ComoFalar />. Toda mensagem é
        respondida em até 5 dias. Tenha em mãos o número do pedido.
      </p>
    </PaginaInstitucional>
  );
}
