import Link from "next/link";
import { LOJA, linkWhatsApp } from "@/lib/loja";
import { CATEGORIAS_NAV } from "@/lib/navegacao";
import { pagamentoOnlineAtivo } from "@/lib/pagamento/config";

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
 * O QUE VOLTOU: termos, trocas e privacidade — agora com página de verdade, e
 * exigidos de quem vende pela internet (Decreto 7.962/2013). Entraram nas
 * listas que já existiam, sem coluna nova: a grade do rodapé fica como está.
 *
 * Os dados da empresa (razão social, CNPJ, endereço) vêm de `lib/loja.ts` e só
 * aparecem preenchidos. Em produção, faltando algum, o build para — ver lá.
 *
 * O `id="contato"` fica: é o destino de "Atendimento" na barra do topo e no
 * menu do celular.
 */
export function Footer() {
  const whatsapp = linkWhatsApp();
  const empresa = [
    LOJA.razaoSocial || LOJA.nomeFantasia,
    LOJA.cnpj && `CNPJ ${LOJA.cnpj}`,
    LOJA.endereco,
  ].filter(Boolean).join(" · ");

  return (
    <footer className="footer" id="contato">
      <div className="footer__grid">
        <div className="footer__brand">
          <span className="footer__mark">
            {/* Mesmo arquivo da barra, já em cache quando o rodapé aparece.
                Sobre `<img>` em vez de next/image, ver Navbar.tsx. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="footer__marca"
              src="/logo-marca.webp"
              alt="Florenza"
              width={382}
              height={224}
              loading="lazy"
              decoding="async"
            />
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
            <li><Link href="/termos-de-compra">Termos de compra</Link></li>
            <li><Link href="/trocas-e-devolucoes">Trocas e devoluções</Link></li>
            <li><Link href="/privacidade">Privacidade</Link></li>
          </ul>
        </div>

        <div className="footer__col">
          <h4 className="footer__heading">Atendimento</h4>
          <ul className="footer__list">
            <li><Link href="/conta">Minha conta</Link></li>
            <li><Link href="/carrinho">Meu carrinho</Link></li>
            {/* Só com número publicado em lib/loja.ts: "WhatsApp" que não leva a
                lugar nenhum seria o mesmo problema que este rodapé resolveu. */}
            {whatsapp && (
              <li><a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
            )}
            {LOJA.email && <li><a href={`mailto:${LOJA.email}`}>{LOJA.email}</a></li>}
          </ul>
          <p className="footer__nota">
            {pagamentoOnlineAtivo()
              ? "Pagamento com Pix ou cartão pelo Mercado Pago."
              : "O pagamento é combinado por WhatsApp depois que o pedido chega."}
          </p>
        </div>
      </div>

      <div className="footer__inner">
        <p>&copy; 2026 {empresa}. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
