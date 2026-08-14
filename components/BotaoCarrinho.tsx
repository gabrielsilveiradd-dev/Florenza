"use client";

import Link from "next/link";
import { useCarrinho } from "@/lib/carrinho";

/**
 * O carrinho na nav, com a contagem de peças.
 *
 * `pronto` é falso no servidor e durante a hidratação, e por isso a bolinha da
 * contagem não aparece nesse instante: o HTML do servidor não tem como saber o
 * que existe no localStorage de quem está olhando, e desenhar um número que o
 * navegador logo corrige daria divergência de hidratação — o React reclama e o
 * número pisca na tela.
 */
export function BotaoCarrinho() {
  const { quantidadeTotal, pronto } = useCarrinho();
  const tem = pronto && quantidadeTotal > 0;

  return (
    <Link
      className="nav__carrinho"
      href="/carrinho"
      aria-label={tem ? `Carrinho com ${quantidadeTotal} peça(s)` : "Carrinho"}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" />
      </svg>
      {tem && <span className="nav__carrinho-conta">{quantidadeTotal}</span>}
    </Link>
  );
}
