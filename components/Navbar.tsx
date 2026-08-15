import Link from "next/link";
import { BotaoCarrinho } from "@/components/BotaoCarrinho";
import { BotaoConta } from "@/components/BotaoConta";
import { Gem } from "@/components/GemDefs";
import { MenuMobile } from "@/components/MenuMobile";
import { NavCategorias } from "@/components/NavCategorias";

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
 * A nav segue sendo componente de servidor: só o carrinho, a conta, as pílulas
 * de categoria e o menu do celular hidratam, porque só eles dependem de estado
 * do navegador (carrinho e conta) ou da rota atual (as outras duas).
 *
 * O QUE A BARRA LISTA MUDOU
 *
 * Eram quatro seções da home — "Alianças", "Coleção", "Categorias", "Contato".
 * Nenhuma dizia o que a loja vende, e "Categorias" existia só para guardar as
 * três atrás de mais um clique. Agora as três categorias estão na barra, e a
 * única seção institucional que sobrou é a que existe de verdade: o rodapé de
 * atendimento. A lista mora em `lib/navegacao.ts`, escrita uma vez.
 */

export function Navbar() {
  return (
    <header className="nav">
      <div className="nav__inner">
        {/* O hambúrguer vem ANTES da marca no HTML e só aparece abaixo de
            860px: é a ordem `☰ FLORENZA ações` que o celular espera, e ela sai
            de graça do fluxo, sem `order` no CSS. */}
        <MenuMobile />

        <Link className="nav__logo" href="/#top" aria-label="Florenza — início">
          <Gem className="nav__gem" />
          <span className="nav__word">Florenza</span>
        </Link>

        <NavCategorias />

        <div className="nav__acoes">
          <BotaoCarrinho />
          <BotaoConta />
        </div>
      </div>
    </header>
  );
}
