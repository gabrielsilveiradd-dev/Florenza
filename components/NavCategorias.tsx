"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconeAnelFormatura,
  IconeAnelOuro,
  IconeAnelPrata,
  IconeContato,
} from "@/components/IconesNav";
import { CATEGORIAS_NAV, SECOES_INSTITUCIONAIS } from "@/lib/navegacao";

/**
 * As pílulas da barra do topo — agora as três categorias, direto.
 *
 * Antes a barra listava seções da home ("Alianças", "Coleção", "Categorias",
 * "Contato"): quatro rótulos que não diziam o que a loja vende e um deles,
 * "Categorias", existia só para esconder as três atrás de um clique. Como são
 * três, cabem inteiras.
 *
 * POR QUE ESTE PEDAÇO É CLIENTE, E A NAV NÃO
 *
 * O estado ativo precisa saber em que rota a pessoa está, e `usePathname` é
 * hook de cliente. Isso NÃO é o mesmo que ler cookie: pathname é resolvido no
 * navegador e não marca a página como dinâmica — as 23 páginas pré-renderizadas
 * continuam pré-renderizadas. É a mesma razão pela qual `BotaoConta` já era
 * cliente enquanto a `Navbar` seguia sendo servidor.
 */

const ICONES = {
  "/aliancas-ouro": IconeAnelOuro,
  "/aliancas-prata": IconeAnelPrata,
  "/aneis-formatura": IconeAnelFormatura,
} as const;

export function NavCategorias() {
  const caminho = usePathname();

  return (
    <nav className="nav__links" aria-label="Categorias e atendimento">
      {CATEGORIAS_NAV.map(({ href, rotulo, curto }) => {
        const Icone = ICONES[href as keyof typeof ICONES];
        const ativa = caminho === href;
        return (
          <Link
            className={`nav__pilula${ativa ? " is-ativa" : ""}`}
            href={href}
            key={href}
            aria-current={ativa ? "page" : undefined}
          >
            <Icone className="nav__pilula-icone" />
            {/* O rótulo curto é o que aparece na faixa intermediária, onde
                "Anéis de Formatura" por extenso estouraria a barra. O nome
                completo continua no HTML, para o leitor de tela. */}
            <span className="nav__pilula-texto">
              <span className="nav__pilula-longo">{rotulo}</span>
              <span className="nav__pilula-curto" aria-hidden="true">{curto}</span>
            </span>
          </Link>
        );
      })}

      {SECOES_INSTITUCIONAIS.map(({ href, rotulo }) => (
        <Link className="nav__pilula" href={href} key={href}>
          <IconeContato className="nav__pilula-icone" />
          <span className="nav__pilula-texto">
            <span className="nav__pilula-longo">{rotulo}</span>
            <span className="nav__pilula-curto" aria-hidden="true">{rotulo}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
