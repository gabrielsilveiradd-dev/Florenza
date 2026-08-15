import { ColecoesShowcase } from "@/components/ColecoesShowcase";
import { Footer } from "@/components/Footer";
import { HeroMedia } from "@/components/HeroMedia";
import { Rings3D } from "@/components/Rings3D";

// Só a home usa a seção 3D — igual ao <link> que existia apenas em index.html.
import "./estilos/rings-3d.css";
// A vitrine de coleções tem CSS próprio e isolado, com prefixo `col-`: nada
// dele alcança as outras seções desta página.
import "./colecoes.css";

/** Cards da grade "Outras categorias": reaproveitam a estrutura de .ringCard. */
const CATEGORIAS_EM_BREVE = [
  { inicial: "R", nome: "Relógios", desc: "Precisão e elegância no pulso.", href: "#" },
  { inicial: "C", nome: "Cordões", desc: "Peças que acompanham cada dia.", href: "#" },
  { inicial: "P", nome: "Pingentes", desc: "Detalhes que contam histórias.", href: "#" },
  { inicial: "A", nome: "Anéis", desc: "Além das alianças, para todos os momentos.", href: "/#categoryShowcase" },
  { inicial: "S", nome: "Anéis Solitários", desc: "O brilho de um único diamante.", href: "#" },
];

export default function Home() {
  return (
    <>
      <main id="top">
        {/* 1. HERO — imagem cinematográfica em tela cheia, sem qualquer controle
            por scroll. herome.png é a fotografia oficial de referência do
            redesign (mãos entrelaçadas, alianças e anel de noivado, mármore
            escuro com veios dourados). */}
        <section className="hero" id="hero">
          <HeroMedia />
          <div className="hero__scrim" aria-hidden="true" />
          <div className="hero__content">
            <p className="hero__eyebrow">Joias que contam</p>
            <h1 className="hero__headline">Histórias</h1>
            <p className="hero__subtitle">que duram para sempre.</p>
            <hr className="hero__rule" />
            <a className="hero__cta" href="#categoryShowcase">Ver Coleção</a>
          </div>
          <div className="hero__scrollcue" aria-hidden="true">
            <span>role para descobrir</span>
            <div className="hero__scrollcue-line" />
          </div>
        </section>

        {/* 2. COLEÇÕES — a vitrine entre a Hero e Alianças. Mantém o id
            `categoryShowcase`, que é o destino dos links "Coleção" da nav e do
            rodapé; trocá-lo quebraria a âncora em quatro lugares. */}
        <ColecoesShowcase />

        {/* 3. ALIANÇAS — vídeo cinematográfico como background da própria seção.
            Toca em loop, sem responder ao scroll. */}
        <section className="aliancasFeature" id="aliancas">
          <video
            className="aliancasFeature__video"
            src="/aliancas-pedestal.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Par de alianças Florenza sobre um pedestal de mármore"
          />
          <div className="aliancasFeature__scrim" aria-hidden="true" />
          <div className="aliancasFeature__content js-reveal">
            <p className="section-eyebrow">Coleção</p>
            <h2 className="aliancasFeature__title">Alianças</h2>
            <p className="aliancasFeature__subtitle">De Prata e Ouro</p>
            <p className="aliancasFeature__desc">
              Peças atemporais, lapidadas à mão para selar promessas que atravessam gerações.
            </p>
            <a className="btn-outline" href="#categoryShowcase">
              Explorar Coleção{" "}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </section>

        {/* 4. MATERIAIS — anéis 3D em Three.js. */}
        <Rings3D />

        {/* 5. OUTRAS CATEGORIAS — grade normal, sem paredes de mármore, sem pin
            de scroll. Reaproveita a estrutura exata de .ringCard. */}
        <section className="categorySection" id="categorias">
          <p className="section-eyebrow categorySection__eyebrow js-reveal">Florenza</p>
          <div className="categorySection__grid js-reveal-stagger">
            {CATEGORIAS_EM_BREVE.map((cat) => (
              <article className="ringCard" key={cat.nome}>
                <a
                  className="ringCard__media ringCard__media--placeholder"
                  href={cat.href}
                  aria-label={`Ver ${cat.nome}`}
                >
                  <span className="ringCard__initial">{cat.inicial}</span>
                </a>
                <div className="ringCard__body">
                  <h3 className="ringCard__name">{cat.nome}</h3>
                  <p className="ringCard__material">Próxima coleção</p>
                  <p className="ringCard__desc">{cat.desc}</p>
                  <div className="ringCard__foot">
                    <span className="ringCard__price">Em breve</span>
                    <a className="ringCard__view" href={cat.href} aria-label={`Ver categoria ${cat.nome}`}>
                      &rarr;
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Encerramento editorial — peça curta, autoplay, em loop, sem prender a
            navegação. */}
        <section className="symbolsShowcase">
          <div className="symbolsShowcase__inner js-reveal">
            <video
              className="symbolsShowcase__video"
              src="/simbolos-marcas.mp4"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Símbolos de amor entrelaçados em veludo, formando a frase Marcas para sempre"
            />
          </div>
        </section>
      </main>

      <Footer colecoes="home" />
    </>
  );
}
