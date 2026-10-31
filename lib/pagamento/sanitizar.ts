/**
 * O QUE PODE IR PARA O LOG.
 *
 * Lista de quem SAI e de quem é mascarado, aplicada em qualquer profundidade. O
 * resto passa, porque a homologação precisa ver a forma real da resposta.
 *
 * `name` é mascarado sempre, mesmo sendo às vezes o nome do item: mais vale sobrar.
 */

/** Dados de cartão e credenciais: saem inteiros, nem mascarados. */
const REMOVER = new Set([
  "card",
  "encrypted",
  "security_code",
  "authorization",
  "token",
  "first_digits",
  "last_digits",
  "exp_month",
  "exp_year",
  "masked_card_number",
  "authorization_code",
  "public_key",
]);

function mascarar(chave: string, valor: string): string | null {
  switch (chave) {
    case "tax_id":
      return `***${valor.slice(-2)}`;
    case "email":
    case "customer_email":
      return valor.replace(/^(.).*(@.*)$/, "$1***$2");
    case "name":
    case "customer_name":
      return `${valor.trim().charAt(0)}***`;
    case "street":
    case "complement":
    case "number":
    case "locality":
    case "postal_code":
    case "area":
      return "***";
    default:
      return null;
  }
}

function limpar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(limpar);
  if (!valor || typeof valor !== "object") return valor;

  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor)) {
    if (REMOVER.has(chave.toLowerCase())) continue;
    const mascara = typeof item === "string" ? mascarar(chave, item) : null;
    saida[chave] = mascara ?? limpar(item);
  }
  return saida;
}

export function sanitizarParaLog(dados: unknown): string | null {
  if (dados === undefined || dados === null) return null;
  return JSON.stringify(limpar(dados)).slice(0, 20_000);
}
