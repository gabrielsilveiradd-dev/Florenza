"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconeSacola } from "@/components/IconesNav";
import { useCarrinho } from "@/lib/carrinho";

/**
 * O carrinho na nav, com a contagem de peças.
 *
 * `pronto` é falso no servidor e durante a hidratação, e por isso o selo da
 * contagem não aparece nesse instante: o HTML do servidor não tem como saber o
 * que existe no localStorage de quem está olhando, e desenhar um número que o
 * navegador logo corrige daria divergência de hidratação.
 *
 * O selo entra e sai animado — é o retorno visual de "a peça entrou no
 * carrinho" para quem clicou em Comprar lá na vitrine e não mudou de página.
 */
export function BotaoCarrinho() {
  const { quantidadeTotal, pronto } = useCarrinho();
  const semMovimento = useReducedMotion();
  const tem = pronto && quantidadeTotal > 0;

  return (
    <Link
      className="nav__carrinho"
      href="/carrinho"
      aria-label={tem ? `Carrinho com ${quantidadeTotal} peça(s)` : "Carrinho"}
    >
      <IconeSacola size={18} />

      <AnimatePresence>
        {tem && (
          <motion.span
            key="conta"
            className="nav__carrinho-conta"
            initial={semMovimento ? undefined : { scale: 0.5, opacity: 0 }}
            animate={semMovimento ? undefined : { scale: 1, opacity: 1 }}
            exit={semMovimento ? undefined : { scale: 0.5, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
          >
            {quantidadeTotal}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
