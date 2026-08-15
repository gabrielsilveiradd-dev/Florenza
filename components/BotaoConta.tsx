"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconeConta } from "@/components/IconesNav";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigurado } from "@/lib/supabase/config";

/**
 * O botão da nav: "Entrar" para quem está de fora, "Minha conta" para quem já
 * entrou.
 *
 * É um componente de cliente isolado, e não a nav inteira, por causa da
 * renderização. Descobrir quem está logado no servidor exige ler o cookie da
 * requisição, e ler cookie faz o Next marcar a página como dinâmica — as três
 * páginas de categoria e as vinte de produto deixariam de ser pré-renderizadas.
 * Como a nav vive no layout, o estrago seria no site todo, pelo rótulo de um
 * botão. É o mesmo raciocínio que criou lib/supabase/publico.ts.
 *
 * Aqui o HTML sai do servidor dizendo "Entrar" (é o que vale para quem chega
 * sem sessão, que é a maioria) e o navegador corrige depois de montar, se for
 * o caso. O primeiro render precisa bater com o HTML do servidor, senão o React
 * acusa divergência de hidratação — por isso o estado começa em `false` em vez
 * de já consultar a sessão.
 */
export function BotaoConta() {
  const [logado, setLogado] = useState(false);

  useEffect(() => {
    // Sem chaves não há sessão a consultar, e `createClient` com URL vazia
    // estoura. No modo de demonstração o botão fica como está.
    if (!supabaseConfigurado()) return;

    const supabase = createClient();
    let ativo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (ativo) setLogado(!!data.session);
    });

    // Cobre entrar e sair em outra aba: o Supabase avisa por aqui, e o rótulo
    // acompanha sem precisar recarregar a página.
    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (ativo) setLogado(!!sessao);
    });

    return () => {
      ativo = false;
      inscricao.subscription.unsubscribe();
    };
  }, []);

  const rotulo = logado ? "Minha conta" : "Entrar";

  return (
    // O `aria-label` é o que mantém o rótulo para leitor de tela nas telas mais
    // estreitas, onde o CSS troca a palavra pelo ícone.
    <Link className="nav__entrar" href={logado ? "/conta" : "/entrar"} aria-label={rotulo}>
      <IconeConta className="nav__entrar-icone" />
      <span className="nav__entrar-texto">{rotulo}</span>
    </Link>
  );
}
