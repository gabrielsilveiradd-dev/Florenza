import Link from "next/link";
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
          {/* Dentro de .nav__links de propósito, e não como terceiro filho de
              .nav__inner: ali o `space-between` redistribuiria os links que já
              existem, e mexer na posição deles seria mexer na estética pronta.
              Aqui a nav só ganha mais um item no fim.
              A nav segue sendo componente de servidor: só o botão hidrata. */}
          <BotaoConta />
        </nav>
      </div>
    </header>
  );
}
