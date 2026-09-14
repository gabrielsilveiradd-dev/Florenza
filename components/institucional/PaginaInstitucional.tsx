import Link from "next/link";
import { Footer } from "@/components/Footer";
import { LOJA, linkWhatsApp } from "@/lib/loja";

/**
 * Moldura das páginas de termos, trocas e privacidade.
 *
 * ESTES TEXTOS SÃO UMA BASE, NÃO PARECER JURÍDICO. Foram escritos a partir do
 * que o sistema faz de fato (reserva de 48 horas, compra com conta, cupom de
 * primeira compra, Mercado Pago) e das regras que valem para qualquer loja
 * online — Decreto 7.962/2013, CDC arts. 18, 26 e 49, LGPD. Antes de abrir a
 * loja, revise com o advogado ou o contador da empresa.
 */

const PAGINAS = [
  { href: "/termos-de-compra", rotulo: "Termos de compra" },
  { href: "/trocas-e-devolucoes", rotulo: "Trocas e devoluções" },
  { href: "/privacidade", rotulo: "Privacidade" },
];

export function PaginaInstitucional({
  caminho,
  titulo,
  atualizadoEm,
  children,
}: {
  caminho: string;
  titulo: string;
  atualizadoEm: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <main className="inst">
        <article className="inst__caixa">
          <p className="inst__eyebrow">Florenza</p>
          <h1 className="inst__titulo">{titulo}</h1>
          <p className="inst__data">Atualizado em {atualizadoEm}</p>

          <div className="inst__corpo">{children}</div>

          <nav className="inst__outras" aria-label="Políticas da loja">
            {PAGINAS.map((p) => (
              <Link key={p.href} href={p.href} aria-current={p.href === caminho ? "page" : undefined}>
                {p.rotulo}
              </Link>
            ))}
          </nav>
        </article>
      </main>
      <Footer />
    </>
  );
}

/** Campo da loja ainda vazio. Só aparece fora de produção: lá, `lib/loja.ts` barra o build. */
function Valor({ children }: { children: string }) {
  return children ? <dd>{children}</dd> : <dd><span className="inst__pendente">a preencher</span></dd>;
}

/** Quem vende — o que o Decreto 7.962/2013 manda deixar à vista. */
export function DadosDaLoja() {
  const whatsapp = linkWhatsApp();
  return (
    <dl className="inst__loja">
      <div><dt>Razão social</dt><Valor>{LOJA.razaoSocial}</Valor></div>
      <div><dt>Nome fantasia</dt><Valor>{LOJA.nomeFantasia}</Valor></div>
      <div><dt>CNPJ</dt><Valor>{LOJA.cnpj}</Valor></div>
      <div><dt>Endereço</dt><Valor>{LOJA.endereco}</Valor></div>
      <div>
        <dt>E-mail</dt>
        {LOJA.email ? <dd><a href={`mailto:${LOJA.email}`}>{LOJA.email}</a></dd> : <Valor>{""}</Valor>}
      </div>
      <div>
        <dt>WhatsApp</dt>
        {whatsapp ? (
          <dd><a href={whatsapp} target="_blank" rel="noopener noreferrer">{LOJA.whatsapp}</a></dd>
        ) : (
          <Valor>{""}</Valor>
        )}
      </div>
    </dl>
  );
}

/** Frase de contato reaproveitada nas três páginas. */
export function ComoFalar() {
  const canais = [LOJA.email && `pelo e-mail ${LOJA.email}`, LOJA.whatsapp && `pelo WhatsApp ${LOJA.whatsapp}`]
    .filter(Boolean)
    .join(" ou ");
  return <>{canais || "pelos canais de atendimento informados acima"}</>;
}
