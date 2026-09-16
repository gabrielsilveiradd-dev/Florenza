import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NovaSenhaFormulario } from "@/components/conta/NovaSenhaFormulario";
import { SmokeyBackground } from "@/components/ui/login-form";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

import "../../entrar/entrar.css";

export const metadata: Metadata = {
  title: "Nova senha — Florenza",
  robots: { index: false, follow: false },
};

/**
 * Fim do "Esqueci minha senha": o link do e-mail passa pelo /auth/callback, que
 * abre a sessão, e chega aqui.
 *
 * Mesmo desenho de /entrar — vidro sobre a fumaça —, porque é a continuação
 * dela: a pessoa pediu o link naquela tela e volta por esta.
 *
 * Sem sessão não há senha para trocar — a pessoa abriu o endereço direto, ou o
 * link já foi usado. A página não manda de volta ao login em silêncio: explica
 * o que houve e aponta onde pedir outro link.
 */
export default async function PaginaNovaSenha() {
  const demo = !supabaseConfigurado();
  const usuario = demo ? null : (await (await createClient()).auth.getUser()).data.user;

  return (
    <main className="entrar">
      <SmokeyBackground backdropBlurAmount="sm" />

      <div className="entrar__caixa">
        <p className="entrar__eyebrow">Florenza</p>
        <h1 className="entrar__titulo">Nova senha</h1>

        {demo || usuario ? (
          <>
            <p className="entrar__sub">
              Escolha a senha que você vai usar para entrar
              {usuario?.email && (
                <>
                  {" "}com <strong className="entrar__email">{usuario.email}</strong>
                </>
              )}
              .
            </p>

            {demo && (
              <p className="entrar__aviso">
                <strong>Modo demonstração.</strong> O Supabase não está conectado nesta cópia, então
                não é possível trocar a senha.
              </p>
            )}

            <NovaSenhaFormulario email={usuario?.email ?? ""} demo={demo} />
          </>
        ) : (
          <>
            <p className="entrar__sub">
              Para criar uma senha nova, abra o link que enviamos por e-mail. Se ele já foi usado ou
              expirou, peça outro em “Esqueci minha senha”.
            </p>
            <Link className="entrar__botao entrar__botao--link" href="/entrar">
              Pedir um novo link
              <ArrowRight aria-hidden size={16} className="entrar__seta" />
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
