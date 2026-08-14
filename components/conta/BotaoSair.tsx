"use client";

import { createClient } from "@/lib/supabase/client";

export function BotaoSair() {
  return (
    <button
      type="button"
      className="conta__sair"
      onClick={async () => {
        await createClient().auth.signOut();
        // `window.location` e não `router.push`, pelo mesmo motivo da entrada:
        // a navegação do Next não recarrega o documento, e o Server Component
        // do destino poderia rodar com o cookie de sessão ainda em pé.
        window.location.assign("/");
      }}
    >
      Sair
    </button>
  );
}
