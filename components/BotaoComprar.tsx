"use client";

import { useState } from "react";
import { useCarrinho, type ItemCarrinho } from "@/lib/carrinho";

const Sacola = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" />
  </svg>
);

/**
 * O "Comprar" do card e da página de produto.
 *
 * Continua sendo um `<a>`, e não um `<button>`, de propósito: `.ringCard__buy`
 * foi escrito para um link, e sem o preflight do Tailwind um `<button>` traz a
 * fonte e a borda padrão do navegador — mudaria a aparência do card, que é
 * justamente o que não pode acontecer. O papel de botão fica no `role`.
 *
 * PEÇA COM ARO, NO CARD: o botão leva à página da peça em vez de pôr no
 * carrinho. Anel sem medida não é pedido que se possa atender, e escolher o
 * tamanho num card de 280px apertaria a vitrine inteira. A aparência do botão
 * não muda — só o destino do clique.
 */
export function BotaoComprar({
  produto,
  className = "ringCard__buy",
  modo = "card",
  bloqueado = false,
  aoBloquear,
}: {
  produto: Omit<ItemCarrinho, "quantidade">;
  className?: string;
  /** `pagina`: a medida já foi escolhida ao lado do botão (ou a peça não tem aro). */
  modo?: "card" | "pagina";
  /** Na página: falta escolher a medida. O clique avisa em vez de adicionar. */
  bloqueado?: boolean;
  aoBloquear?: () => void;
}) {
  const { adicionar, quantidadeDaPeca } = useCarrinho();
  const [adicionado, setAdicionado] = useState(false);

  const noCarrinho = quantidadeDaPeca(produto.sku);
  const esgotado = produto.estoque <= 0;
  // Já pegou tudo que existe: continuar clicando não faria nada e o botão
  // dizendo "Comprar" seria promessa falsa.
  const noLimite = !esgotado && noCarrinho >= produto.estoque;

  if (esgotado) {
    // Continua sendo um <a> para o card não mudar de forma, mas sem href não
    // navega e sai da ordem de tabulação — é o jeito de "desabilitar" um link.
    return (
      <span className={`${className} is-esgotado`} aria-disabled="true">
        Esgotado
      </span>
    );
  }

  if (modo === "card" && produto.aros > 0) {
    return (
      <a
        className={className}
        href={`/produto/${produto.slug}#medida`}
        aria-label={`Escolher o tamanho do aro de ${produto.nome}`}
      >
        <Sacola />
        Comprar
      </a>
    );
  }

  return (
    // O <Link> do Next é o certo para navegar, mas aqui o clique normal NÃO
    // navega — ele adiciona ao carrinho. O href existe para o link continuar
    // funcionando com Ctrl/Cmd e para quem estiver sem JavaScript.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      className={className}
      href="/carrinho"
      role="button"
      aria-label={`Comprar ${produto.nome}`}
      onClick={(evento) => {
        // Segurar Ctrl/Cmd ou clicar com o botão do meio continua abrindo o
        // carrinho em outra aba, como qualquer link.
        if (evento.metaKey || evento.ctrlKey || evento.button !== 0) return;
        evento.preventDefault();
        if (bloqueado) {
          aoBloquear?.();
          return;
        }
        if (noLimite) {
          // Sem adicionar: o carrinho já tem todas as unidades que existem.
          window.location.assign("/carrinho");
          return;
        }
        adicionar(produto);
        setAdicionado(true);
        window.setTimeout(() => setAdicionado(false), 1800);
      }}
    >
      <Sacola />
      {noLimite ? "No carrinho" : adicionado ? "Adicionado ✓" : "Comprar"}
    </a>
  );
}
