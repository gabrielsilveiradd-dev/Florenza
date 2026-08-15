import { ColecoesShowcase } from "@/components/ColecoesShowcase";
import { ComoFunciona } from "@/components/ComoFunciona";
import { Footer } from "@/components/Footer";
import { HeroMedia } from "@/components/HeroMedia";
import { Rings3D } from "@/components/Rings3D";

// Só a home usa a seção 3D — igual ao <link> que existia apenas em index.html.
import "./estilos/rings-3d.css";
// A vitrine de coleções tem CSS próprio e isolado, com prefixo `col-`: nada
// dele alcança as outras seções desta página.
import "./colecoes.css";
// Como funciona, prefixo `fluxo-`.
import "./secoes.css";

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
            {/* O título era "Alianças", com "De Prata e Ouro" embaixo — e
                "Alianças" é justamente o nome que não pode conviver com
                "Anéis de Ouro"/"Anéis de Prata" nos outros seis lugares onde
                o site nomeia as categorias. Duas palavras para a mesma coisa
                é como um catálogo se torna confuso. O vídeo, a composição e o
                CSS da seção seguem exatamente como estavam. */}
            <p className="section-eyebrow">A casa</p>
            <h2 className="aliancasFeature__title">Ouro e Prata</h2>
            <p className="aliancasFeature__subtitle">Dois metais, a mesma promessa</p>
            <p className="aliancasFeature__desc">
              Peças atemporais, lapidadas à mão para selar promessas que atravessam gerações.
            </p>
            <a className="btn-outline" href="#categoryShowcase">
              Ver as categorias{" "}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </section>

        {/* 4. MATERIAIS — anéis 3D em Three.js. */}
        <Rings3D />

        {/* A grade "Outras categorias" saiu daqui.
            Eram cinco cards — Relógios, Cordões, Pingentes, Anéis, Anéis
            Solitários — marcados "Em breve", com preço "Em breve" e `href="#"`
            em quatro deles. Nenhuma dessas categorias existe: não há tabela,
            não há foto, não há rota. Na prática a home anunciava um catálogo
            cinco vezes maior do que a loja tem, e o único card que levava a
            algum lugar apontava de volta para a seção logo acima.
            A Florenza vende três categorias de anel. É o que a página diz
            agora — e a vitrine de descoberta já as apresenta por inteiro.
            (O CSS `.categorySection` continua em estilos/aliancas.css,
            intocado; ele simplesmente deixou de casar com algo.) */}

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

        {/* COMO FUNCIONA — as quatro etapas reais da compra, e a resposta à
            pergunta que a vitrine sozinha deixava no ar: "e depois que eu
            clico em comprar?". Vem depois dos produtos de propósito: quem
            ainda não se interessou por uma peça não tem por que ler o
            processo. */}
        <ComoFunciona />
      </main>

      <Footer />
    </>
  );
}
