import Link from "next/link";
import { Gem } from "@/components/GemDefs";
import { CATEGORIAS_NAV } from "@/lib/navegacao";

/**
 * O rodapé — fechamento da página e segunda porta para as três categorias.
 *
 * O QUE SAIU, E POR QUÊ
 *
 * Havia duas listas de "Coleções": na home, cinco rótulos genéricos (Anéis,
 * Alianças, Colares, Pulseiras, Brincos) com `href="#"` em quatro deles; nas
 * páginas de categoria, as três de verdade mais Colares e Brincos, também
 * mortos. Fora isso, a coluna "Informações" tinha cinco links `#` (Sobre,
 * Materiais, Garantia, Entrega, Trocas) e "Atendimento" mais três.
 *
 * Onze links que não iam a lugar nenhum. Um rodapé assim custa confiança
 * justamente onde ela é decidida: quem clica em "Garantia" e não sai do lugar
 * aprende que o site promete o que não tem. Todos foram removidos, e o rodapé
 * ficou com o que existe.
 *
 * A prop `colecoes` também saiu. Ela servia para o rodapé mudar de conteúdo
 * entre a home e as categorias — agora a lista é a mesma em todo lugar, que é
 * o ponto de ter uma lista só (`lib/navegacao.ts`).
 *
 * O `id="contato"` fica: é o destino de "Atendimento" na barra do topo e no
 * menu do celular.
 */
export function Footer() {
  return (
    <footer className="footer" id="contato">
      <div className="footer__grid">
        <div className="footer__brand">
          <span className="footer__mark">
            <Gem className="footer__gem" />
            <span className="footer__word">Florenza</span>
          </span>
          <p className="footer__tagline">
            Joias que contam histórias que duram para sempre.
          </p>
        </div>

        <div className="footer__col">
          <h4 className="footer__heading">Categorias</h4>
          <ul className="footer__list">
            {CATEGORIAS_NAV.map(({ href, rotulo }) => (
              <li key={href}>
                <Link href={href}>{rotulo}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col">
          <h4 className="footer__heading">A Florenza</h4>
          <ul className="footer__list">
            {/* Âncoras para seções que existem nesta página, e nada além. Uma
                página "Sobre" ainda não existe; quando existir, entra aqui. */}
            <li><Link href="/#como-funciona">Como funciona</Link></li>
            <li><Link href="/#categoryShowcase">Descubra sua joia</Link></li>
          </ul>
        </div>

        <div className="footer__col">
          <h4 className="footer__heading">Atendimento</h4>
          <ul className="footer__list">
            <li><Link href="/conta">Minha conta</Link></li>
            <li><Link href="/carrinho">Meu carrinho</Link></li>
          </ul>
          {/* O acerto por WhatsApp é o que o site já diz na página da peça e na
              confirmação do pedido. Não há número publicado no projeto, então
              aqui vai a informação sem o link — dizer "WhatsApp" e não levar a
              lugar nenhum seria o mesmo problema que este rodapé acabou de
              resolver. */}
          <p className="footer__nota">
            O pagamento é combinado por WhatsApp depois que o pedido chega.
          </p>
        </div>
      </div>

      <div className="footer__inner">
        <p>&copy; 2026 Florenza Joalheria. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
