import Link from "next/link";
import { BotaoCarrinho } from "@/components/BotaoCarrinho";
import { BotaoConta } from "@/components/BotaoConta";
import { Gem } from "@/components/GemDefs";

/**
 * Mesma marcação da nav das quatro páginas antigas. Lá os links mudavam de
 * `#aliancas` (na home) para `index.html#aliancas` (nas categorias); com
 * roteamento de verdade, `/#aliancas` cobre os dois casos.
 */
export function Navbar() {
  return (
    <header className="nav">
      <div className="nav__inner">
        <Link className="nav__logo" href="/#top" aria-label="Florenza — início">
          <Gem className="nav__gem" />
          <span className="nav__word">Florenza</span>
        </Link>
        <nav className="nav__links">
          <Link href="/#aliancas">Alianças</Link>
          <Link href="/#categoryShowcase">Coleção</Link>
          <Link href="/#categorias">Categorias</Link>
          <Link href="/#contato">Contato</Link>
        </nav>

        {/* Terceiro filho de .nav__inner, separado dos links de seção porque as
            duas coisas se comportam diferente no celular: os links descem para
            uma segunda linha e estes dois ficam sempre à vista, junto da marca.
            No desktop nada muda de lugar — `.nav__links` ganha `margin-left:auto`
            no globals.css para links e ações continuarem encostados à direita,
            exatamente como antes de existirem.
            A nav segue sendo componente de servidor: só os dois botões hidratam. */}
        <div className="nav__acoes">
          <BotaoCarrinho />
          <BotaoConta />
        </div>
      </div>
    </header>
  );
}
