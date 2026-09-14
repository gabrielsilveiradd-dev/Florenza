import type { Metadata } from "next";
import Link from "next/link";
import { ComoFalar, DadosDaLoja, PaginaInstitucional } from "@/components/institucional/PaginaInstitucional";

import "../institucional.css";

export const metadata: Metadata = {
  title: "Trocas e devoluções — Florenza",
  description: "Direito de arrependimento, troca de medida e garantia das peças Florenza.",
};

/* Texto-base: revisar com advogado ou contador antes de abrir a loja.
 *
 * O arrependimento de 7 dias (CDC art. 49) vale para toda compra feita fora do
 * estabelecimento, sem exceção prevista em lei — por isso não há aqui nenhuma
 * "peça que não pode ser devolvida". Se a loja quiser tratar de modo diferente
 * peças gravadas ou ajustadas sob medida, é conversa para o advogado antes, e
 * não uma linha escrita por conta própria nesta página. */
export default function TrocasEDevolucoes() {
  return (
    <PaginaInstitucional caminho="/trocas-e-devolucoes" titulo="Trocas e devoluções" atualizadoEm="14 de setembro de 2026">
      <div className="inst__destaque">
        <p>
          <strong>Você tem 7 dias corridos, contados do recebimento da peça, para desistir da compra</strong> —
          sem precisar dizer o motivo. O valor é devolvido por inteiro, incluindo o frete.
        </p>
      </div>

      <h2>Desistir da compra (direito de arrependimento)</h2>
      <ul>
        <li>
          Avise a Florenza <ComoFalar /> dentro dos 7 dias, informando o número do pedido.
        </li>
        <li>
          Combinamos com você a devolução da peça, com o envio por nossa conta. Ela deve voltar sem
          sinais de uso e, se possível, na embalagem original.
        </li>
        <li>
          Assim que a peça chega e é conferida, o reembolso é feito pelo mesmo meio do pagamento: Pix
          devolvido na conta de origem; no cartão, estorno na fatura — o prazo para aparecer depende
          da operadora do cartão.
        </li>
      </ul>

      <h2>A medida não serviu</h2>
      <p>
        Fale com a Florenza com o número do pedido e a medida certa. Dentro dos 7 dias você pode
        simplesmente devolver; depois disso, a troca de medida é combinada com você, peça a peça.
      </p>

      <h2>Defeito (garantia)</h2>
      <ul>
        <li>
          Toda peça tem a garantia legal de 90 dias contra defeitos, contada da entrega (Código de
          Defesa do Consumidor, art. 26). Defeito que só aparece com o tempo é contado a partir de
          quando ele é percebido.
        </li>
        <li>
          Constatado o defeito, a Florenza tem até 30 dias para resolver. Se não resolver, você
          escolhe entre a troca por outra peça igual, a devolução do valor pago ou um abatimento
          proporcional no preço (art. 18).
        </li>
        <li>O frete de envio e de volta de uma peça com defeito é por conta da Florenza.</li>
        <li>
          Não são defeito o desgaste natural do uso, riscos, amassados e danos causados por impacto
          ou por contato com produtos químicos.
        </li>
      </ul>

      <h2>Pedido ainda não enviado</h2>
      <p>
        Antes da postagem, o cancelamento é imediato: fale com a Florenza e o valor pago é devolvido
        por inteiro. Pedido que ainda não foi pago é cancelado sozinho quando a reserva vence — veja
        os <Link href="/termos-de-compra">termos de compra</Link>.
      </p>

      <h2>Quem atende</h2>
      <DadosDaLoja />
    </PaginaInstitucional>
  );
}
