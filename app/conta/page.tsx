import type { Metadata } from "next";
import Link from "next/link";
import { ContaFormulario } from "@/components/ContaFormulario";
import { BotaoSair } from "@/components/conta/BotaoSair";
import { DadosDaConta } from "@/components/conta/DadosDaConta";
import { Footer } from "@/components/Footer";
import { StatusDoPedido } from "@/components/pedido/StatusDoPedido";
import { formatarPreco } from "@/lib/catalogo";
import { STATUS_DO_PEDIDO } from "@/lib/conta";
import { lerPerfil, listarMeusPedidos } from "@/lib/conta-servidor";
import { supabaseConfigurado } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// O acompanhamento do pedido usa o mesmo vocabulário visual do carrinho, de
// propósito: é a mesma tela que a pessoa viu ao comprar.
import "../carrinho/checkout.css";
import "./conta.css";

export const metadata: Metadata = {
  title: "Minha conta — Florenza",
  robots: { index: false, follow: false },
};

const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

/**
 * A página tem dois estados no mesmo endereço: formulário para quem chega de
 * fora, área da conta para quem já entrou.
 *
 * Ficam juntos de propósito. /conta é o link que o cliente guarda, que chega no
 * e-mail de confirmação e que o painel manda — mandar para uma tela de login
 * quem já está logado, ou para a conta quem não está, seria trocar o significado
 * do endereço conforme o estado. Aqui ele significa sempre "minha conta", e a
 * página decide o que mostrar.
 */
export default async function PaginaConta({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const demo = !supabaseConfigurado();
  const pedido = (await searchParams).redirect;

  // Só caminho interno é aceito como destino. Sem esta checagem, um link como
  // /conta?redirect=https://site-falso.com levaria a pessoa para fora logo
  // depois de ela digitar a senha — o padrão clássico de redirecionamento
  // aberto.
  const redirect = pedido && pedido.startsWith("/") && !pedido.startsWith("//") ? pedido : "/";

  // `getUser` e não `getSession`: getSession acredita no cookie, getUser vai ao
  // servidor validar o token. Aqui a diferença decide o que a página mostra.
  const usuario = demo
    ? null
    : (await (await createClient()).auth.getUser()).data.user;

  if (!usuario) {
    return (
      <>
        <main className="conta">
          <div className="conta__caixa">
            <p className="conta__eyebrow">Florenza</p>
            <h1 className="conta__titulo">Minha conta</h1>
            <p className="conta__sub">
              Acompanhe seus pedidos e guarde suas peças favoritas.
            </p>

            {demo && (
              <div className="conta__aviso" style={{ marginTop: 26, marginBottom: 0 }}>
                <strong>Modo demonstração.</strong> O Supabase ainda não está conectado, então
                não é possível entrar nem criar conta. Basta preencher{" "}
                <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
                <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> em <code>.env.local</code>.
              </div>
            )}

            <ContaFormulario redirect={redirect} demo={demo} />
          </div>
        </main>

        <Footer colecoes="categoria" />
      </>
    );
  }

  const [perfil, pedidos] = await Promise.all([lerPerfil(), listarMeusPedidos()]);
  const primeiroNome = (perfil?.nome ?? "").trim().split(" ")[0];

  return (
    <>
      <main className="conta conta--painel">
        <div className="conta__painel">
          <header className="conta__cabecalho">
            <div>
              <p className="conta__eyebrow">Florenza</p>
              <h1 className="conta__titulo conta__titulo--painel">
                {primeiroNome ? `Olá, ${primeiroNome}` : "Minha conta"}
              </h1>
              <p className="conta__sub conta__sub--painel">{usuario.email}</p>
            </div>
            <BotaoSair />
          </header>

          <section className="conta__bloco">
            <h2 className="conta__bloco-titulo">Meus pedidos</h2>

            {pedidos.length === 0 ? (
              <div className="conta__vazio">
                <p>Você ainda não fez nenhum pedido.</p>
                <Link className="conta__botao conta__botao--link" href="/aneis-formatura">
                  Ver as peças
                </Link>
              </div>
            ) : (
              <ul className="conta__pedidos">
                {pedidos.map((p) => (
                  <li className="conta__pedido ped-cartao" key={p.id}>
                    <div className="ped-cabecalho">
                      <div>
                        <p className="ped-rotulo">Código do pedido</p>
                        <p className="ped-numero">#{p.numero}</p>
                      </div>
                      <span className={`conta__selo conta__selo--${p.status}`}>
                        {STATUS_DO_PEDIDO[p.status] ?? p.status}
                      </span>
                    </div>

                    <p className="conta__pedido-data">
                      {dia.format(new Date(p.criadoEm))}
                      {p.cidade && ` · ${p.cidade}${p.uf ? `/${p.uf}` : ""}`}
                    </p>

                    {/* Mesmo componente da tela de confirmação. Quem voltou dias
                        depois reencontra a tela que viu na compra, com uma etapa
                        a mais acesa — em vez de uma lista diferente. */}
                    <StatusDoPedido
                      pedido={{
                        numero: p.numero,
                        status: p.status,
                        criadoEm: p.criadoEm,
                        pagoEm: p.pagoEm,
                        enviadoEm: p.enviadoEm,
                        entregueEm: p.entregueEm,
                        codigoRastreio: p.codigoRastreio,
                        transportadora: p.transportadora,
                      }}
                    />

                    <ul className="ped-itens">
                      {p.itens.map((i) => (
                        <li key={i.sku}>
                          <span>
                            {i.quantidade > 1 && `${i.quantidade}× `}
                            {i.nome}
                          </span>
                          <span>{formatarPreco(i.precoCentavos * i.quantidade)}</span>
                        </li>
                      ))}
                    </ul>

                    <dl className="ped-contas">
                      <div>
                        <dt>Subtotal</dt>
                        <dd>{formatarPreco(p.subtotalCentavos)}</dd>
                      </div>
                      {p.descontoCentavos > 0 && (
                        <div>
                          <dt>Desconto{p.cupomCodigo && ` · ${p.cupomCodigo}`}</dt>
                          <dd>− {formatarPreco(p.descontoCentavos)}</dd>
                        </div>
                      )}
                      <div className="ped-contas__total">
                        <dt>Total</dt>
                        <dd>{formatarPreco(p.totalCentavos)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="conta__bloco">
            <h2 className="conta__bloco-titulo">Meus dados</h2>
            {perfil ? (
              <DadosDaConta perfil={perfil} />
            ) : (
              <p className="conta__nota">Não foi possível carregar seus dados agora.</p>
            )}
          </section>
        </div>
      </main>

      <Footer colecoes="categoria" />
    </>
  );
}
