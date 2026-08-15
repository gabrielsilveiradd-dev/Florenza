"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconeAnelFormatura,
  IconeAnelOuro,
  IconeAnelPrata,
  IconeConta,
  IconeContato,
  IconeFechar,
  IconeMenu,
} from "@/components/IconesNav";
import { CATEGORIAS_NAV, SECOES_INSTITUCIONAIS } from "@/lib/navegacao";

/**
 * O menu do celular: ☰ à esquerda da marca, gaveta com as três categorias
 * escritas por extenso.
 *
 * O QUE ELE RESOLVE
 *
 * A barra estreita mostrava só os ícones, sem rótulo — solução que funcionava
 * quando eram seções ("Alianças", "Coleção", "Contato"), porque um ícone
 * genérico ao menos não mentia. Com as categorias, não funciona: ouro e prata
 * são o mesmo anel, e a diferença entre elas é o metal, que traço monocromático
 * não desenha. Ou o rótulo aparece, ou a pessoa não sabe onde está clicando.
 *
 * Na gaveta as três aparecem no primeiro nível, sem "Produtos" nem "Loja" por
 * cima. Quem abre o menu vê imediatamente o que a Florenza vende.
 *
 * O QUE ELE NÃO FAZ: não existe no desktop. Acima de 860px a gaveta fica
 * `display: none` e as pílulas voltam — este componente não duplica a
 * navegação, ele a substitui na faixa onde a outra não cabe.
 */
export function MenuMobile() {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();
  const idPainel = useId();
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  /* Trocar de página fecha a gaveta. Sem isto ela ficaria aberta por cima da
   * página nova, já que o Next não recarrega o documento.
   *
   * Ajuste durante a renderização, e não dentro de um efeito: é o padrão que o
   * React documenta para "estado que precisa mudar quando uma prop muda". Com
   * `useEffect` o fechamento só aconteceria depois de a página nova já ter
   * sido pintada com a gaveta por cima — um quadro de defeito visível — e o
   * lint reprova por isso. Aqui o React reinicia a renderização antes de
   * pintar qualquer coisa. */
  const [caminhoAnterior, setCaminhoAnterior] = useState(caminho);
  if (caminho !== caminhoAnterior) {
    setCaminhoAnterior(caminho);
    setAberto(false);
  }

  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      setAberto(false);
      // Devolve o foco a quem abriu: sem isso ele volta para o começo do
      // documento e a pessoa que navega por teclado se perde.
      botaoRef.current?.focus();
    };

    // A página não rola atrás da gaveta — é o único bloqueio de scroll do
    // site, e ele dura só enquanto o menu está aberto.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", aoTeclar);

    // O primeiro link recebe o foco, para o teclado entrar na gaveta.
    painelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  const ICONES = {
    "/aliancas-ouro": IconeAnelOuro,
    "/aliancas-prata": IconeAnelPrata,
    "/aneis-formatura": IconeAnelFormatura,
  } as const;

  return (
    <>
      <button
        className="nav__hamburguer"
        type="button"
        ref={botaoRef}
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-controls={idPainel}
        aria-label={aberto ? "Fechar menu" : "Abrir menu"}
      >
        {aberto ? <IconeFechar /> : <IconeMenu />}
      </button>

      {/* O painel fica sempre no HTML e é escondido por `hidden`, e não montado
          na hora: montar no clique custaria um quadro em branco no celular,
          justo onde a resposta ao toque precisa ser imediata. */}
      <div
        className={`menuMobile${aberto ? " is-aberto" : ""}`}
        id={idPainel}
        ref={painelRef}
        hidden={!aberto}
      >
        <div
          className="menuMobile__fundo"
          onClick={() => setAberto(false)}
          aria-hidden="true"
        />
        <nav className="menuMobile__painel" aria-label="Menu principal">
          <p className="menuMobile__rotulo">Categorias</p>
          <ul className="menuMobile__lista">
            {CATEGORIAS_NAV.map(({ href, rotulo, frase }) => {
              const Icone = ICONES[href as keyof typeof ICONES];
              const ativa = caminho === href;
              return (
                <li key={href}>
                  <Link
                    className={`menuMobile__item${ativa ? " is-ativa" : ""}`}
                    href={href}
                    aria-current={ativa ? "page" : undefined}
                  >
                    <Icone className="menuMobile__icone" size={20} />
                    <span className="menuMobile__texto">
                      <span className="menuMobile__nome">{rotulo}</span>
                      <span className="menuMobile__frase">{frase}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="menuMobile__rotulo">A Florenza</p>
          <ul className="menuMobile__lista menuMobile__lista--simples">
            {SECOES_INSTITUCIONAIS.map(({ href, rotulo }) => (
              <li key={href}>
                <Link className="menuMobile__item" href={href}>
                  <IconeContato className="menuMobile__icone" size={20} />
                  <span className="menuMobile__texto">
                    <span className="menuMobile__nome">{rotulo}</span>
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link className="menuMobile__item" href="/conta">
                <IconeConta className="menuMobile__icone" size={20} />
                <span className="menuMobile__texto">
                  <span className="menuMobile__nome">Minha conta</span>
                </span>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
}
