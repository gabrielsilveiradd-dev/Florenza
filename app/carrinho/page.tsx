import type { Metadata } from "next";
import { Checkout } from "@/components/Checkout";
import { Footer } from "@/components/Footer";
import { supabaseConfigurado } from "@/lib/supabase/config";

// produto.css continua entrando por causa das classes `.checkout__*` do
// formulário de endereço, que não foram redesenhadas; checkout.css traz o
// vocabulário novo da lista, do resumo e do acompanhamento.
import "../produto/produto.css";
import "./checkout.css";

export const metadata: Metadata = {
  title: "Carrinho — Florenza",
  robots: { index: false, follow: false },
};

export default function PaginaCarrinho() {
  return (
    <>
      <main className="chk">
        <div className="chk__cabecalho">
          <p className="chk__eyebrow">Florenza</p>
          <h1 className="chk__titulo">Seu pedido</h1>
        </div>
        <Checkout demo={!supabaseConfigurado()} />
      </main>
      <Footer colecoes="categoria" />
    </>
  );
}
