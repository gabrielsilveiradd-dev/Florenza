import Link from "next/link";
import { BotaoCarrinho } from "@/components/BotaoCarrinho";
import { BotaoConta } from "@/components/BotaoConta";
import { Gem } from "@/components/GemDefs";
import {
  IconeAliancas,
  IconeCategorias,
  IconeColecao,
  IconeContato,
} from "@/components/IconesNav";

/**
 * A barra do topo, agora com um vocabulário só.
 *
 * Antes eram duas linguagens na mesma faixa: quatro links de texto puro à
 * esquerda e uma cápsula com ícones à direita. Agora tudo é pílula com ícone e
 * rótulo, dentro de dois grupos com a mesma borda e o mesmo canto — o desenho
 * dos cartões do carrinho, aplicado à navegação.
 *
 * O ganho não é só estético: com ícone, a pílula continua legível quando o
 * rótulo some no celular. É o que permite a barra caber em uma linha de novo
 * em telas estreitas, sem esconder seção nenhuma atrás de menu.
 *
 * A nav segue sendo componente de servidor: só o carrinho e a conta hidratam,
 * porque só eles dependem de estado do navegador.
 */

const SECOES = [
  { href: "/#aliancas", rotulo: "Alianças", Icone: IconeAliancas },
  { href: "/#categoryShowcase", rotulo: "Coleção", Icone: IconeColecao },
  { href: "/#categorias", rotulo: "Categorias", Icone: IconeCategorias },
  { href: "/#contato", rotulo: "Contato", Icone: IconeContato },
] as const;

export function Navbar() {
  return (
    <header className="nav">
      <div className="nav__inner">
        <Link className="nav__logo" href="/#top" aria-label="Florenza — início">
          <Gem className="nav__gem" />
          <span className="nav__word">Florenza</span>
        </Link>

        <nav className="nav__links" aria-label="Seções do site">
          {SECOES.map(({ href, rotulo, Icone }) => (
            <Link className="nav__pilula" href={href} key={rotulo}>
              <Icone className="nav__pilula-icone" />
              <span className="nav__pilula-texto">{rotulo}</span>
            </Link>
          ))}
        </nav>

        <div className="nav__acoes">
          <BotaoCarrinho />
          <BotaoConta />
        </div>
      </div>
    </header>
  );
}
