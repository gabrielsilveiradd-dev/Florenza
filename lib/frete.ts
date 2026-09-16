import { createClient } from "@/lib/supabase/client";
import { supabaseConfigurado } from "@/lib/supabase/config";

/**
 * FRETE — a cotação que a página da peça e o carrinho mostram.
 *
 * Quem calcula é o banco (`cotar_frete()`), pela tabela `fretes`: preço e prazo
 * por região, e a região sai do CEP. A tela só pergunta e mostra. Ao fechar o
 * pedido o navegador manda a MODALIDADE escolhida, nunca o valor, e
 * `criar_pedido()` procura o preço de novo — a mesma regra do preço da peça e
 * do cupom.
 *
 * Os valores da tabela são FICTÍCIOS até a Florenza escolher os meios de envio
 * (supabase/antes-de-abrir.sql, bloco 10). Trocar é mexer na tabela, não aqui.
 */

export type OpcaoDeFrete = {
  modalidade: string;
  nome: string;
  precoCentavos: number;
  prazoMinDias: number;
  prazoMaxDias: number;
  uf: string;
  ufNome: string;
};

type LinhaDaCotacao = {
  modalidade: string;
  nome: string;
  preco_centavos: number;
  prazo_min_dias: number;
  prazo_max_dias: number;
  uf: string;
  uf_nome: string;
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "R$ 24,90" — ou "Grátis", para o dia em que uma região tiver frete zero. */
export function valorDoFrete(centavos: number): string {
  return centavos === 0 ? "Grátis" : moeda.format(centavos / 100);
}

/** "1 dia útil", "3 a 6 dias úteis" — ou `null` quando o pedido não guardou prazo. */
export function descreverPrazo(min: number | null, max: number | null): string | null {
  if (max === null) return null;
  const dias = (n: number) => (n === 1 ? "1 dia útil" : `${n} dias úteis`);
  return min === null || min === max ? dias(max) : `${min} a ${dias(max)}`;
}

/**
 * Pergunta ao banco quanto custa entregar no CEP. `uf` é o estado que o ViaCEP
 * devolveu, quando houver — o banco só o usa se o CEP cair fora das faixas que
 * ele conhece.
 */
export async function cotarFrete(
  cep: string,
  uf?: string
): Promise<{ opcoes: OpcaoDeFrete[] } | { erro: string }> {
  const digitos = cep.replace(/\D/g, "");
  if (digitos.length !== 8) return { erro: "Digite os 8 números do CEP." };
  if (!supabaseConfigurado()) {
    return { erro: "O frete é calculado pelo banco, e o Supabase não está conectado nesta cópia do site." };
  }

  const { data, error } = await createClient().rpc("cotar_frete", { p_cep: digitos, p_uf: uf || null });
  if (error) return { erro: "Não foi possível calcular o frete agora. Tente de novo em instantes." };

  const linhas = (data ?? []) as LinhaDaCotacao[];
  if (linhas.length === 0) return { erro: "Não encontramos entrega para esse CEP. Confira os números." };

  return {
    opcoes: linhas.map((l) => ({
      modalidade: l.modalidade,
      nome: l.nome,
      precoCentavos: l.preco_centavos,
      prazoMinDias: l.prazo_min_dias,
      prazoMaxDias: l.prazo_max_dias,
      uf: l.uf,
      ufNome: l.uf_nome,
    })),
  };
}
