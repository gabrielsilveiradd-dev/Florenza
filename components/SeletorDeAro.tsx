"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TAMANHOS_DE_ARO, medidasDoAro } from "@/lib/aros";

/**
 * O seletor da medida do aro — página da peça e linha do carrinho.
 *
 * Substitui o `<select>` nativo, cuja lista aberta é desenhada pelo sistema
 * (cinza, com a fonte do Windows ou do Android) e destoava do resto da loja.
 * Aqui os números aparecem em grade, cada um num pequeno aro, com o diâmetro do
 * número em destaque — no mesmo bege e dourado do site.
 *
 * O que o nativo dava de graça precisa ser refeito à mão, e segue o padrão
 * "select-only combobox" da WAI-ARIA:
 *   - o foco fica sempre na caixa (`role="combobox"`); o número em destaque é
 *     anunciado por `aria-activedescendant`, sem mover o foco;
 *   - setas andam pela grade (esquerda e direita uma casa, cima e baixo uma
 *     linha), Home e End vão às pontas, Enter ou espaço escolhem, Esc fecha;
 *   - digitar o número escolhe direto, como no nativo ("1" e "8" = aro 18).
 *
 * É uma `<div>` e não um `<button>` de propósito: o botão dispara clique no
 * Enter e no espaço, e a mesma tecla abriria e escolheria ao mesmo tempo.
 *
 * Não há "Não sei ainda": a medida é obrigatória. O rodapé da lista abre o guia
 * de medidas, e a tabela do guia escolhe por este seletor.
 */
export function SeletorDeAro({
  rotulo,
  descricao,
  valor,
  aoMudar,
  aoPedirGuia,
  invalido = false,
  variante,
}: {
  /** O que aparece junto da caixa: "Aro", "Aro 1". */
  rotulo: string;
  /** Nome acessível completo, quando o rótulo sozinho não basta ("Aro 1 de Aliança Lisa"). */
  descricao?: string;
  valor: number | null;
  aoMudar: (aro: number) => void;
  /** Abre o guia de medidas já apontado para este seletor. */
  aoPedirGuia?: () => void;
  invalido?: boolean;
  /** `pagina`: caixa reta, rótulo em cima. `carrinho`: compacta, rótulo ao lado. */
  variante: "pagina" | "carrinho";
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [posicao, setPosicao] = useState({ acima: false, deslocamento: 0 });
  const raiz = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const grade = useRef<HTMLDivElement>(null);
  const digitado = useRef({ texto: "", ate: 0 });

  // Clique fora fecha. Só escuta enquanto a lista está aberta.
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  function abrir() {
    const r = caixa.current?.getBoundingClientRect();
    if (r) {
      const largura = Math.min(300, window.innerWidth - 32);
      const abaixo = window.innerHeight - r.bottom;
      // A lista encosta na borda da tela quando não cabe a partir da caixa — no
      // celular, o "Aro 2" do carrinho fica perto da borda direita.
      const deslocamento = Math.max(16 - r.left, Math.min(0, window.innerWidth - 16 - r.left - largura));
      setPosicao({ acima: abaixo < 340 && r.top > abaixo, deslocamento });
    }
    const escolhido = valor === null ? -1 : TAMANHOS_DE_ARO.indexOf(valor);
    setAtivo(escolhido >= 0 ? escolhido : 0);
    setAberto(true);
  }

  function escolher(indice: number) {
    aoMudar(TAMANHOS_DE_ARO[indice]);
    setAberto(false);
  }

  /** Quantas colunas a grade tem agora — é o passo das setas para cima e para baixo. */
  function colunas(): number {
    if (!grade.current) return 1;
    return getComputedStyle(grade.current).gridTemplateColumns.split(" ").length || 1;
  }

  /** "1" e logo depois "8" = aro 18. Uma tecla sozinha vai ao primeiro número que começa com ela. */
  function buscarPorNumero(tecla: string): number {
    const agora = Date.now();
    let texto = (agora < digitado.current.ate ? digitado.current.texto : "") + tecla;
    if (!TAMANHOS_DE_ARO.some((n) => String(n).startsWith(texto))) texto = tecla;
    digitado.current = { texto, ate: agora + 900 };

    const exato = TAMANHOS_DE_ARO.indexOf(Number(texto));
    return exato >= 0 ? exato : TAMANHOS_DE_ARO.findIndex((n) => String(n).startsWith(texto));
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLDivElement>) {
    const ultimo = TAMANHOS_DE_ARO.length - 1;

    if (/^[0-9]$/.test(evento.key)) {
      const indice = buscarPorNumero(evento.key);
      if (indice < 0) return;
      evento.preventDefault();
      if (aberto) setAtivo(indice);
      else aoMudar(TAMANHOS_DE_ARO[indice]);
      return;
    }

    if (!aberto) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(evento.key)) {
        evento.preventDefault();
        abrir();
      }
      return;
    }

    const mover = (indice: number) => {
      evento.preventDefault();
      setAtivo(Math.min(ultimo, Math.max(0, indice)));
    };

    switch (evento.key) {
      case "ArrowRight": return mover(ativo + 1);
      case "ArrowLeft": return mover(ativo - 1);
      case "ArrowDown": return mover(ativo + colunas());
      case "ArrowUp": return mover(ativo - colunas());
      case "Home": return mover(0);
      case "End": return mover(ultimo);
      case "Enter":
      case " ":
        evento.preventDefault();
        return escolher(ativo);
      case "Escape":
        evento.preventDefault();
        return setAberto(false);
      case "Tab":
        return setAberto(false);
    }
  }

  const idRotulo = `${id}-rotulo`;
  const idLista = `${id}-lista`;
  const idOpcao = (aro: number) => `${id}-aro-${aro}`;
  const emDestaque = TAMANHOS_DE_ARO[ativo];
  const medidas = medidasDoAro(emDestaque);

  return (
    <div className={`aro aro--${variante}${aberto ? " is-aberto" : ""}`} ref={raiz}>
      {/* <label> não aponta para <div>; o clique no rótulo faz o que ele faria. */}
      <span
        className="aro__rotulo"
        id={idRotulo}
        onClick={() => {
          caixa.current?.focus();
          if (!aberto) abrir();
        }}
      >
        {rotulo}
      </span>

      <div className="aro__ancora">
        <div
          ref={caixa}
          className="aro__caixa"
          role="combobox"
          tabIndex={0}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-activedescendant={aberto ? idOpcao(emDestaque) : undefined}
          aria-labelledby={descricao ? undefined : idRotulo}
          aria-label={descricao}
          aria-invalid={invalido || undefined}
          onClick={() => (aberto ? setAberto(false) : abrir())}
          onKeyDown={aoTeclar}
        >
          <span className={valor === null ? "aro__vazio" : "aro__valor"}>{valor ?? "Escolha"}</span>
          <ChevronDown aria-hidden size={15} className="aro__seta" />
        </div>

        {aberto && (
          <div className={`aro__painel${posicao.acima ? " is-acima" : ""}`} style={{ left: posicao.deslocamento }}>
            <p className="aro__painel-topo" aria-hidden="true">
              <span className="aro__painel-numero">Aro {emDestaque}</span>
              <span>
                {medidas.diametro} mm de diâmetro · {medidas.circunferencia} mm de volta
              </span>
            </p>

            <div
              className="aro__grade"
              role="listbox"
              id={idLista}
              ref={grade}
              aria-labelledby={descricao ? undefined : idRotulo}
              aria-label={descricao}
            >
              {TAMANHOS_DE_ARO.map((aro, indice) => (
                <div
                  key={aro}
                  id={idOpcao(aro)}
                  role="option"
                  aria-selected={valor === aro}
                  className={`aro__opcao${valor === aro ? " is-escolhido" : ""}${indice === ativo ? " is-ativo" : ""}`}
                  // Sem isto o toque tira o foco da caixa antes do clique chegar.
                  onPointerDown={(evento) => evento.preventDefault()}
                  onPointerEnter={() => setAtivo(indice)}
                  onClick={() => escolher(indice)}
                >
                  {aro}
                </div>
              ))}
            </div>

            {aoPedirGuia && (
              <button
                type="button"
                className="aro__guia"
                onPointerDown={(evento) => evento.preventDefault()}
                onClick={() => {
                  setAberto(false);
                  aoPedirGuia();
                }}
              >
                Não sabe a medida? Veja como medir
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
