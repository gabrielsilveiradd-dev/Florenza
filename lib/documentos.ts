/**
 * CPF e CEP do lado da tela.
 *
 * A validação aqui é CORTESIA: avisa enquanto a pessoa digita, em vez de só
 * depois de clicar em fechar. Quem decide é `public.cpf_valido()` no banco, na
 * CHECK constraint e dentro de `criar_pedido()` — o mesmo algoritmo, escrito lá
 * para valer mesmo contra quem pula esta tela.
 */

export const somenteDigitos = (valor: string) => valor.replace(/\D/g, "");

export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

/** Máscara progressiva: "529982" -> "529.982", até "529.982.247-25". */
export function formatarCpf(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarCep(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

export type EnderecoViaCep = { logradouro: string; bairro: string; cidade: string; uf: string };

/**
 * ViaCEP: preenche rua, bairro, cidade e estado. Conveniência — se o serviço
 * não responder, os campos continuam editáveis e o pedido segue.
 */
export async function buscarCep(valor: string): Promise<EnderecoViaCep | null> {
  const cep = somenteDigitos(valor);
  if (cep.length !== 8) return null;
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resposta.json();
    if (dados.erro) return null;
    return {
      logradouro: dados.logradouro ?? "",
      bairro: dados.bairro ?? "",
      cidade: dados.localidade ?? "",
      uf: dados.uf ?? "",
    };
  } catch {
    return null;
  }
}
