import type { Metadata } from "next";
import { Checkout } from "@/components/Checkout";
import { Footer } from "@/components/Footer";
import { lerPerfil } from "@/lib/conta-servidor";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// produto.css continua entrando por causa das classes `.checkout__*` do
// formulário de endereço; checkout.css traz o vocabulário novo da lista, do
// resumo e do acompanhamento.
import "../produto/produto.css";
import "./checkout.css";

export const metadata: Metadata = {
  title: "Carrinho — Florenza",
  robots: { index: false, follow: false },
};

/**
 * A página deixou de ser estática e virou dinâmica de propósito.
 *
 * Ela precisa saber quem está olhando para preencher os dados da conta, e ler o
 * cookie de sessão é o que torna a rota dinâmica. Aqui isso não custa nada: o
 * carrinho é pessoal por definição, e não estava entre as 23 páginas
 * pré-renderizadas que `lib/supabase/publico.ts` existe para proteger.
 */
export default async function PaginaCarrinho() {
  const demo = !supabaseConfigurado();

  // `getUser` e não `getSession`: getSession acredita no cookie, getUser vai ao
  // servidor validar. O que está em jogo aqui é preencher o pedido com os dados
  // de alguém.
  const usuario = demo ? null : (await (await createClient()).auth.getUser()).data.user;
  const perfil = usuario ? await lerPerfil() : null;

  return (
    <>
      <main className="chk">
        <div className="chk__cabecalho">
          <p className="chk__eyebrow">Florenza</p>
          <h1 className="chk__titulo">Seu pedido</h1>
        </div>
        <Checkout
          demo={demo}
          conta={
            usuario && perfil
              ? {
                  nome: perfil.nome,
                  telefone: perfil.telefone,
                  email: usuario.email ?? "",
                  cep: perfil.cep,
                  cidade: perfil.cidade,
                  uf: perfil.uf,
                }
              : null
          }
        />
      </main>
      <Footer colecoes="categoria" />
    </>
  );
}
