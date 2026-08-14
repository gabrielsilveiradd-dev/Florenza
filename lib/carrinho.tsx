"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

/**
 * Carrinho — vive no localStorage.
 *
 * Não vai para o banco de propósito: carrinho é rascunho, e gravar cada clique
 * de "adicionar" criaria linha de pedido para quem só estava olhando. O que
 * chega ao banco é o pedido fechado, no checkout.
 *
 * Guarda o preço em centavos junto com o item. Assim o total é sempre soma de
 * inteiros, e o valor que a pessoa viu na vitrine é o que ela vê no carrinho,
 * mesmo que a etiqueta mude enquanto a aba fica aberta.
 *
 * A leitura usa `useSyncExternalStore`, e não `useState` + `useEffect`. O
 * localStorage é literalmente uma fonte externa de estado, que é o caso de uso
 * desse hook: ele resolve a hidratação (o servidor não tem localStorage) sem
 * chamar setState dentro de efeito, o que dispararia renderização em cascata. E
 * vem de brinde o que o outro desenho não dava: abrir o site em duas abas
 * mantém o mesmo carrinho nas duas, porque o evento `storage` avisa.
 */
export type ItemCarrinho = {
  sku: string;
  slug: string;
  nome: string;
  precoCentavos: number;
  imagemUrl: string;
  quantidade: number;
  /**
   * Estoque como estava quando a peça entrou no carrinho.
   *
   * Serve para o carrinho não deixar somar 8 de uma peça que tem 5 — mas é
   * conforto, não garantia. O localStorage é editável, a aba pode ficar aberta
   * a semana inteira, e outra pessoa pode levar a última unidade nesse meio
   * tempo. Quem decide de verdade é `criar_pedido()` no banco, que confere com
   * a linha do produto travada. Este número serve para avisar antes, não para
   * autorizar.
   */
  estoque: number;
};

type Carrinho = {
  itens: ItemCarrinho[];
  quantidadeTotal: number;
  totalCentavos: number;
  adicionar: (item: Omit<ItemCarrinho, "quantidade">, quantidade?: number) => void;
  mudarQuantidade: (sku: string, quantidade: number) => void;
  remover: (sku: string) => void;
  esvaziar: () => void;
  /**
   * Reconfere o estoque contra o banco e apara o que passou do teto.
   * SKU ausente do mapa é peça que saiu do catálogo: vira estoque 0.
   */
  sincronizarEstoque: (estoquePorSku: Record<string, number>) => void;
  /** Falso no servidor e durante a hidratação; evita a lista piscar "vazio". */
  pronto: boolean;
};

const CHAVE = "florenza:carrinho";
const EVENTO_LOCAL = "florenza:carrinho-mudou";

const VAZIO: ItemCarrinho[] = [];

/* `getSnapshot` PRECISA devolver a mesma referência enquanto o dado não muda —
 * se devolvesse um array novo a cada chamada, o React entenderia como mudança e
 * entraria em laço infinito. Por isso o cache do texto cru ao lado do valor. */
let cacheTexto: string | null = null;
let cacheValor: ItemCarrinho[] = VAZIO;

function lerSnapshot(): ItemCarrinho[] {
  const texto = window.localStorage.getItem(CHAVE);
  if (texto === cacheTexto) return cacheValor;
  cacheTexto = texto;

  if (!texto) {
    cacheValor = VAZIO;
    return cacheValor;
  }
  try {
    const dados = JSON.parse(texto);
    // localStorage é editável por quem usa e sobrevive a mudanças de formato
    // entre versões do site: só passa o que tem a forma esperada.
    cacheValor = Array.isArray(dados)
      ? dados
          .filter(
            (i) =>
              i &&
              typeof i.sku === "string" &&
              typeof i.precoCentavos === "number" &&
              typeof i.quantidade === "number"
          )
          // `estoque` não existia nas versões anteriores do carrinho, e quem
          // tinha peça guardada continua com o JSON antigo no navegador. Sem
          // este ajuste, `Math.min(quantidade, undefined)` daria NaN e a
          // quantidade sumiria da tela. Na dúvida, o teto é o que já está no
          // carrinho: não tira nada de ninguém e impede somar mais até a
          // página de carrinho reconferir com o banco.
          .map((i) => ({
            ...i,
            estoque: typeof i.estoque === "number" ? i.estoque : i.quantidade,
          }))
      : VAZIO;
  } catch {
    cacheValor = VAZIO;
  }
  return cacheValor;
}

function assinar(aoMudar: () => void) {
  // `storage` só dispara em OUTRAS abas; o evento próprio cobre esta aqui.
  window.addEventListener("storage", aoMudar);
  window.addEventListener(EVENTO_LOCAL, aoMudar);
  return () => {
    window.removeEventListener("storage", aoMudar);
    window.removeEventListener(EVENTO_LOCAL, aoMudar);
  };
}

function gravar(itens: ItemCarrinho[]) {
  window.localStorage.setItem(CHAVE, JSON.stringify(itens));
  window.dispatchEvent(new Event(EVENTO_LOCAL));
}

const ContextoCarrinho = createContext<Carrinho | null>(null);

export function ProvedorCarrinho({ children }: { children: React.ReactNode }) {
  const itens = useSyncExternalStore(assinar, lerSnapshot, () => VAZIO);
  const pronto = useSyncExternalStore(assinar, () => true, () => false);

  const alterar = useCallback(
    (transformar: (atuais: ItemCarrinho[]) => ItemCarrinho[]) => {
      const atuais = lerSnapshot();
      const novos = transformar(atuais);
      // Mesma referência significa "nada mudou". Gravar assim mesmo dispararia
      // o evento e faria toda tela que ouve o carrinho rerrenderizar à toa —
      // e a sincronização de estoque roda a cada visita ao carrinho.
      if (novos === atuais) return;
      gravar(novos);
    },
    []
  );

  const adicionar = useCallback(
    (item: Omit<ItemCarrinho, "quantidade">, quantidade = 1) => {
      if (item.estoque <= 0) return;
      alterar((atuais) => {
        const existente = atuais.find((i) => i.sku === item.sku);
        if (existente) {
          return atuais.map((i) =>
            i.sku === item.sku
              ? {
                  ...i,
                  // O estoque também se atualiza: a página que chamou acabou de
                  // ler do banco, e esse número é mais novo que o guardado.
                  estoque: item.estoque,
                  quantidade: Math.min(i.quantidade + quantidade, item.estoque),
                }
              : i
          );
        }
        return [...atuais, { ...item, quantidade: Math.min(quantidade, item.estoque) }];
      });
    },
    [alterar]
  );

  const mudarQuantidade = useCallback(
    (sku: string, quantidade: number) => {
      alterar((atuais) =>
        quantidade <= 0
          ? atuais.filter((i) => i.sku !== sku)
          : atuais.map((i) =>
              i.sku === sku ? { ...i, quantidade: Math.min(quantidade, i.estoque) } : i
            )
      );
    },
    [alterar]
  );

  const remover = useCallback(
    (sku: string) => alterar((atuais) => atuais.filter((i) => i.sku !== sku)),
    [alterar]
  );

  const esvaziar = useCallback(() => alterar(() => []), [alterar]);

  const sincronizarEstoque = useCallback(
    (estoquePorSku: Record<string, number>) => {
      alterar((atuais) => {
        let mudou = false;
        const novos = atuais.map((i) => {
          const estoque = estoquePorSku[i.sku] ?? 0;
          const quantidade = Math.min(i.quantidade, estoque);
          if (estoque === i.estoque && quantidade === i.quantidade) return i;
          mudou = true;
          return { ...i, estoque, quantidade };
        });
        // Devolver o array original quando nada mudou evita gravar no
        // localStorage e disparar o evento a cada visita ao carrinho — o que
        // faria a lista rerrenderizar à toa.
        return mudou ? novos : atuais;
      });
    },
    [alterar]
  );

  const valor = useMemo<Carrinho>(
    () => ({
      itens,
      quantidadeTotal: itens.reduce((s, i) => s + i.quantidade, 0),
      totalCentavos: itens.reduce((s, i) => s + i.precoCentavos * i.quantidade, 0),
      adicionar,
      mudarQuantidade,
      remover,
      esvaziar,
      sincronizarEstoque,
      pronto,
    }),
    [itens, pronto, adicionar, mudarQuantidade, remover, esvaziar, sincronizarEstoque]
  );

  return <ContextoCarrinho.Provider value={valor}>{children}</ContextoCarrinho.Provider>;
}

export function useCarrinho(): Carrinho {
  const contexto = useContext(ContextoCarrinho);
  if (!contexto) throw new Error("useCarrinho precisa estar dentro de <ProvedorCarrinho>");
  return contexto;
}
