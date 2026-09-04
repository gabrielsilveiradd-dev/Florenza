import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Reveal } from "@/components/Reveal";
import { VideoAutoplay } from "@/components/VideoAutoplay";
import { ProvedorCarrinho } from "@/lib/carrinho";

// A ordem importa e é a mesma das páginas antigas: primeiro as camadas do
// Tailwind, depois style.css, depois aliancas.css. categoria.css entra só nas
// páginas de categoria, e rings-3d.css só na home — igual aos <link> de antes.
import "./globals.css";
import "./estilos/style.css";
import "./estilos/aliancas.css";

export const metadata: Metadata = {
  // Necessário para o Open Graph das páginas de produto: a imagem precisa de
  // URL absoluta, e sem esta base o Next usa localhost — o link compartilhado
  // no WhatsApp sairia sem foto. Em produção a Vercel preenche a variável.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
  ),
  title: "Florenza — Joalheria",
  description: "Joias que eternizam histórias e celebram o que realmente importa.",
  // PNG e não WebP: o Safari não aceita WebP como ícone de aba. Os dois saem
  // do mesmo selo, com fundo transparente — o círculo assenta tanto na aba
  // clara quanto na escura. Gerados por tools/preparar-imagens.py.
  icons: { icon: "/favicon.png", apple: "/apple-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Mesmas famílias e pesos do site antigo. Mantido como <link> em vez de
            next/font de propósito: next/font renomeia a família, e todo o CSS
            do site pede "Cormorant Garamond" / "Inter" pelo nome
            — trocar isso mudaria a tipografia da vitrine inteira. A regra do
            lint supõe o padrão do Pages Router, que não é o caso aqui. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400;1,500&family=Inter:wght@300;400;500;600&family=Jost:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ProvedorCarrinho>
          <Navbar />
          {children}
          {/* Efeitos que antes viviam em js/main.js e js/aliancas.js e agiam
              sobre o documento inteiro. Ficam no layout porque valem para todas
              as páginas; ambos rerodam a cada troca de rota. */}
          <Reveal />
          <VideoAutoplay />
        </ProvedorCarrinho>
      </body>
    </html>
  );
}
