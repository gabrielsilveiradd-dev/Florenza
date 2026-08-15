/**
 * ÁREA DE CONFIANÇA — quatro pilares, todos conferíveis no próprio site.
 *
 * A regra que desenhou esta seção: nenhuma afirmação que o projeto não possa
 * sustentar. Nada de "garantia de X anos", "certificado de autenticidade",
 * "frete grátis", "troca em 30 dias", "embalagem especial" ou prazo de entrega
 * — nenhuma dessas coisas existe no código, no banco ou no fluxo do pedido, e
 * escrever qualquer uma delas seria a marca prometendo o que não combinou.
 *
 * DOIS PILARES PEDIDOS QUE VIRARAM OUTROS DOIS
 *
 * O pedido original era: Ouro 18K / Prata 925 / Garantia Florenza / Envio
 * Seguro. Os dois primeiros são verdade e ficaram. Os dois últimos não existem
 * em lugar nenhum do projeto: não há termo de garantia escrito, e o envio não
 * tem transportadora, prazo nem sequer campo de rastreio no painel (a coluna
 * está prevista, o formulário ainda não). Um selo "Envio Seguro" ali seria
 * exatamente o tipo de promessa vazia de marketplace que esta seção existe
 * para evitar.
 *
 * No lugar entraram dois fatos que o site cumpre hoje: a peça é preparada à
 * mão (é o que a etapa `em_producao` diz) e o pedido é acompanhável do começo
 * ao fim (é o que `StatusDoPedido` faz, com as datas carimbadas pela trigger,
 * na conta do cliente). Quando a garantia e o envio estiverem definidos, eles
 * substituem estes dois — a estrutura já está pronta.
 *
 * O teor da prata diz 925 E 950 porque as duas coisas são verdade: as duas
 * peças antigas são 925 e as quatorze novas são 950.
 */

const PILARES = [
  {
    numero: "01",
    titulo: "Ouro 18K",
    texto: "Toda peça de ouro da casa é 18K (750) — o teor está na ficha de cada uma.",
  },
  {
    numero: "02",
    titulo: "Prata 925 e 950",
    texto: "A prata vem nos dois teores, e qual deles é a peça aparece antes de você comprar.",
  },
  {
    numero: "03",
    titulo: "Preparada à mão",
    texto: "Cada pedido entra em produção depois de confirmado, e a peça é preparada uma a uma.",
  },
  {
    numero: "04",
    titulo: "Pedido acompanhado",
    texto: "Da confirmação à entrega, cada etapa fica registrada e visível na sua conta.",
  },
];

export function Confianca() {
  return (
    <section className="confianca" aria-labelledby="confianca-titulo">
      <div className="confianca__cabeca js-reveal">
        <span className="confianca__risco" aria-hidden="true" />
        <h2 className="confianca__titulo" id="confianca-titulo">
          Sua joia, com o cuidado que ela merece.
        </h2>
      </div>

      <ul className="confianca__grade js-reveal-stagger">
        {PILARES.map(({ numero, titulo, texto }) => (
          <li className="confianca__pilar" key={numero}>
            <span className="confianca__numero">{numero}</span>
            <h3 className="confianca__pilar-titulo">{titulo}</h3>
            <p className="confianca__pilar-texto">{texto}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
