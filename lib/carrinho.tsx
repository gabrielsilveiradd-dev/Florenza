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
 *
 * UMA LINHA É PEÇA + MEDIDA, não só peça. O mesmo anel de formatura em aro 16 e
 * em aro 20 são duas linhas — é o que chega à bancada. Por isso as operações
 * recebem a `chave` da linha, e o teto de estoque é por PEÇA, somando as linhas.
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
  /** 0 sem aro, 1 um tamanho, 2 par. */
  aros: number;
  /** Nulo = "não sei ainda"; ignorado quando a peça não tem aro. */
  tamanho: number | null;
  tamanhoPar: number | null;
};

/** Identidade da linha: a peça e as medidas escolhidas. */
export function chaveDoItem(item: Pick<ItemCarrinho, "sku" | "tamanho" | "tamanhoPar">): string {
  return `${item.sku}|${item.tamanho ?? "-"}|${item.tamanhoPar ?? "-"}`;
}

export type FichaDoBanco = { estoque: number; aros: number };

type Carrinho = {
  itens: ItemCarrinho[];
  quantidadeTotal: number;
  totalCentavos: number;
  adicionar: (item: Omit<ItemCarrinho, "quantidade">, quantidade?: number) => void;
  mudarQuantidade: (chave: string, quantidade: number) => void;
  /** Trocar a medida de uma linha. Se cair numa medida que já está no carrinho, as duas se juntam. */
  mudarMedida: (chave: string, tamanho: number | null, tamanhoPar: number | null) => void;
  remover: (chave: string) => void;
  esvaziar: () => void;
  /**
   * Reconfere estoque e número de aros contra o banco e apara o que passou do
   * teto. SKU ausente do mapa é peça que saiu do catálogo: vira estoque 0.
   */
  sincronizarEstoque: (fichas: Record<string, FichaDoBanco>) => void;
  /** Quantas unidades da peça há no carrinho, somando todas as medidas. */
  quantidadeDaPeca: (sku: string) => number;
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

const numeroOuNulo = (valor: unknown) => (typeof valor === "number" ? valor : null);

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
          // Carrinhos de versões anteriores não tinham `estoque` nem medida. Na
          // dúvida o teto é o que já está no carrinho, e `aros` 0 até o
          // carrinho reconferir com o banco — que devolve o número certo e faz
          // aparecer o seletor de medida, em "não sei ainda".
          .map((i) => ({
            ...i,
            estoque: typeof i.estoque === "number" ? i.estoque : i.quantidade,
            aros: typeof i.aros === "number" ? i.aros : 0,
            tamanho: numeroOuNulo(i.tamanho),
            tamanhoPar: numeroOuNulo(i.tamanhoPar),
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

const somaDaPeca = (itens: ItemCarrinho[], sku: string, exceto?: string) =>
  itens
    .filter((i) => i.sku === sku && chaveDoItem(i) !== exceto)
    .reduce((s, i) => s + i.quantidade, 0);

/** Junta linhas que acabaram com a mesma chave (medida trocada, peça que deixou de ser par). */
function consolidar(itens: ItemCarrinho[]): ItemCarrinho[] {
  const porChave = new Map<string, ItemCarrinho>();
  for (const item of itens) {
    const chave = chaveDoItem(item);
    const existente = porChave.get(chave);
    porChave.set(chave, existente ? { ...existente, quantidade: existente.quantidade + item.quantidade } : item);
  }
  return [...porChave.values()];
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
        const cabe = Math.max(0, item.estoque - somaDaPeca(atuais, item.sku));
        if (cabe === 0) return atuais;

        const chave = chaveDoItem(item);
        // O estoque de todas as linhas da peça se atualiza: a página que chamou
        // acabou de ler do banco, e esse número é mais novo que o guardado.
        const atualizados = atuais.map((i) =>
          i.sku === item.sku ? { ...i, estoque: item.estoque, aros: item.aros } : i
        );
        const soma = Math.min(quantidade, cabe);

        if (atualizados.some((i) => chaveDoItem(i) === chave)) {
          return atualizados.map((i) =>
            chaveDoItem(i) === chave ? { ...i, quantidade: i.quantidade + soma } : i
          );
        }
        return [...atualizados, { ...item, quantidade: soma }];
      });
    },
    [alterar]
  );

  const mudarQuantidade = useCallback(
    (chave: string, quantidade: number) => {
      alterar((atuais) => {
        const alvo = atuais.find((i) => chaveDoItem(i) === chave);
        if (!alvo) return atuais;
        if (quantidade <= 0) return atuais.filter((i) => chaveDoItem(i) !== chave);
        const teto = Math.max(0, alvo.estoque - somaDaPeca(atuais, alvo.sku, chave));
        return atuais.map((i) =>
          chaveDoItem(i) === chave ? { ...i, quantidade: Math.min(quantidade, teto) } : i
        );
      });
    },
    [alterar]
  );

  const mudarMedida = useCallback(
    (chave: string, tamanho: number | null, tamanhoPar: number | null) => {
      alterar((atuais) => {
        if (!atuais.some((i) => chaveDoItem(i) === chave)) return atuais;
        return consolidar(
          atuais.map((i) => (chaveDoItem(i) === chave ? { ...i, tamanho, tamanhoPar } : i))
        );
      });
    },
    [alterar]
  );

  const remover = useCallback(
    (chave: string) => alterar((atuais) => atuais.filter((i) => chaveDoItem(i) !== chave)),
    [alterar]
  );

  const esvaziar = useCallback(() => alterar(() => []), [alterar]);

  const sincronizarEstoque = useCallback(
    (fichas: Record<string, FichaDoBanco>) => {
      alterar((atuais) => {
        // O teto é por peça: a primeira linha leva o que couber, a seguinte o
        // que sobrar. `restante` guarda quanto ainda cabe de cada SKU.
        const restante = new Map<string, number>();
        let mudou = false;

        const novos = atuais.map((i) => {
          const ficha = fichas[i.sku];
          const estoque = ficha?.estoque ?? 0;
          const aros = ficha?.aros ?? i.aros;
          const cabe = restante.has(i.sku) ? restante.get(i.sku)! : estoque;
          const quantidade = Math.min(i.quantidade, cabe);
          restante.set(i.sku, cabe - quantidade);

          // Peça que deixou de ser par (ou de ter aro) perde a medida que não tem.
          const tamanho = aros >= 1 ? i.tamanho : null;
          const tamanhoPar = aros === 2 ? i.tamanhoPar : null;

          if (
            estoque === i.estoque && aros === i.aros && quantidade === i.quantidade &&
            tamanho === i.tamanho && tamanhoPar === i.tamanhoPar
          ) {
            return i;
          }
          mudou = true;
          return { ...i, estoque, aros, quantidade, tamanho, tamanhoPar };
        });
        // Devolver o array original quando nada mudou evita gravar no
        // localStorage e disparar o evento a cada visita ao carrinho — o que
        // faria a lista rerrenderizar à toa.
        return mudou ? consolidar(novos) : atuais;
      });
    },
    [alterar]
  );

  const quantidadeDaPeca = useCallback((sku: string) => somaDaPeca(itens, sku), [itens]);

  const valor = useMemo<Carrinho>(
    () => ({
      itens,
      quantidadeTotal: itens.reduce((s, i) => s + i.quantidade, 0),
      totalCentavos: itens.reduce((s, i) => s + i.precoCentavos * i.quantidade, 0),
      adicionar,
      mudarQuantidade,
      mudarMedida,
      remover,
      esvaziar,
      sincronizarEstoque,
      quantidadeDaPeca,
      pronto,
    }),
    [itens, pronto, adicionar, mudarQuantidade, mudarMedida, remover, esvaziar, sincronizarEstoque, quantidadeDaPeca]
  );

  return <ContextoCarrinho.Provider value={valor}>{children}</ContextoCarrinho.Provider>;
}

export function useCarrinho(): Carrinho {
  const contexto = useContext(ContextoCarrinho);
  if (!contexto) throw new Error("useCarrinho precisa estar dentro de <ProvedorCarrinho>");
  return contexto;
}
