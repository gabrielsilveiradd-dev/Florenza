import Link from "next/link";
import { Gem } from "@/components/GemDefs";

/**
 * A lista "Coleções" era diferente na home e nas páginas de categoria — na home
 * eram cinco rótulos genéricos, nas categorias os nomes das três categorias com
 * link de verdade. As duas versões estão preservadas aqui em vez de unificadas,
 * para nenhuma página trocar de conteúdo na migração.
 */
const COLECOES = {
  home: [
    { rotulo: "Anéis", href: "#" },
    { rotulo: "Alianças", href: "/#categoryShowcase" },
    { rotulo: "Colares", href: "#" },
    { rotulo: "Pulseiras", href: "#" },
    { rotulo: "Brincos", href: "#" },
  ],
  categoria: [
    { rotulo: "Anéis de Formatura", href: "/aneis-formatura" },
    { rotulo: "Alianças de Ouro", href: "/aliancas-ouro" },
    { rotulo: "Alianças de Prata", href: "/aliancas-prata" },
    { rotulo: "Colares", href: "#" },
    { rotulo: "Brincos", href: "#" },
  ],
} as const;

export function Footer({ colecoes = "home" }: { colecoes?: keyof typeof COLECOES }) {
  return (
    <footer className="footer" id="contato">
      <div className="footer__grid">
        <div className="footer__brand">
          <span className="footer__mark">
            <Gem className="footer__gem" />
            <span className="footer__word">Florenza</span>
          </span>
          <p className="footer__tagline">
            Joias que eternizam histórias e celebram o que realmente importa.
          </p>
        </div>
        <div className="footer__col">
          <h4 className="footer__heading">Coleções</h4>
          <ul className="footer__list">
            {COLECOES[colecoes].map((item) => (
              <li key={item.rotulo}>
                <Link href={item.href}>{item.rotulo}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="footer__col">
          <h4 className="footer__heading">Informações</h4>
          <ul className="footer__list">
            <li><a href="#">Sobre</a></li>
            <li><a href="#">Materiais</a></li>
            <li><a href="#">Garantia</a></li>
            <li><a href="#">Entrega</a></li>
            <li><a href="#">Trocas e devoluções</a></li>
          </ul>
        </div>
        <div className="footer__col">
          <h4 className="footer__heading">Atendimento</h4>
          <ul className="footer__list">
            <li><a href="#">WhatsApp</a></li>
            <li><a href="#">E-mail</a></li>
            <li><a href="#">Perguntas frequentes</a></li>
            {/* Único caminho para a conta no celular, onde o botão da nav não
                cabe — ver o cálculo em globals.css. Aqui é acréscimo puro: um
                item a mais numa lista que já se empilha, sem mexer no que
                existe. */}
            <li><Link href="/entrar">Minha conta</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer__inner">
        <p>&copy; 2026 Florenza Joalheria. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
