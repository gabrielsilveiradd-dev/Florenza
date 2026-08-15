/**
 * COMO FUNCIONA — as quatro etapas reais da compra.
 *
 * A copy NÃO é genérica de e-commerce. Cada linha aqui descreve o que este
 * código faz, e foi conferida contra ele:
 *
 *   1. escolher      → a vitrine e a página da peça, que existem;
 *   2. pedir         → `criar_pedido()`, carrinho e checkout, que existem;
 *   3. pagamento     → "combinado por WhatsApp, não há cobrança automática
 *                       neste site" é o texto que a própria página de produto
 *                       já mostra (app/produto/[slug]/page.tsx). Mercado Pago
 *                       é Módulo 2 e não está ligado;
 *   4. acompanhar    → `StatusDoPedido`, as cinco etapas carimbadas pela
 *                       trigger `pedidos_carimba_etapas`, e a aba de pedidos
 *                       de /conta.
 *
 * O QUE FICOU DE FORA, E POR QUÊ
 *
 * A etapa "encontre sua medida" foi pedida, e não entrou: não existe guia de
 * medidas, tabela de aros nem campo de tamanho em lugar nenhum do projeto.
 * Prometer no passo 2 uma orientação que a pessoa não vai achar é pior do que
 * quatro passos que se cumprem. Quando o guia existir, ele entra aqui.
 *
 * ANIMAÇÃO: reaproveita `.js-reveal-stagger`, que já é do site e já roda em
 * `components/Reveal.tsx`. As etapas entram uma depois da outra conforme a
 * seção aparece — nenhum ouvinte de scroll novo, nada de `sticky`, nada que
 * prenda a rolagem. Reveal.tsx desiste sozinho quando `prefers-reduced-motion`
 * está ligado, e aí as quatro simplesmente já estão lá, legíveis.
 */

const ETAPAS = [
  {
    numero: "01",
    titulo: "Escolha sua joia",
    texto: "Encontre o anel que representa a sua história.",
  },
  {
    numero: "02",
    titulo: "Faça seu pedido",
    texto: "Adicione ao carrinho e finalize com seus dados de entrega.",
  },
  {
    numero: "03",
    titulo: "Combine o pagamento",
    texto: "A Florenza fala com você por WhatsApp. Não há cobrança automática neste site.",
  },
  {
    numero: "04",
    titulo: "Acompanhe e receba",
    texto: "A peça é preparada à mão, e cada etapa aparece na sua conta.",
  },
];

export function ComoFunciona() {
  return (
    <section className="fluxo" id="como-funciona" aria-labelledby="fluxo-titulo">
      <div className="fluxo__cabeca js-reveal">
        <p className="section-eyebrow">Como funciona</p>
        <h2 className="fluxo__titulo" id="fluxo-titulo">
          Da escolha da joia ao momento de recebê-la.
        </h2>
      </div>

      {/* A linha é irmã das etapas, não pai: assim ela atravessa o bloco inteiro
          sem depender de onde cada etapa começa, e no celular vira vertical
          trocando duas propriedades. `aria-hidden` porque é ornamento — a
          sequência já está dita pelos números e pela ordem da lista. */}
      <div className="fluxo__trilha">
        <span className="fluxo__linha" aria-hidden="true" />
        <ol className="fluxo__etapas js-reveal-stagger">
          {ETAPAS.map(({ numero, titulo, texto }) => (
            <li className="fluxo__etapa" key={numero}>
              <span className="fluxo__marco" aria-hidden="true" />
              <span className="fluxo__numero">{numero}</span>
              <h3 className="fluxo__etapa-titulo">{titulo}</h3>
              <p className="fluxo__etapa-texto">{texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
