/**
 * QUEM É A LOJA — os dados que a lei pede à vista numa venda pela internet.
 *
 * O Decreto 7.962/2013 exige, em lugar de fácil acesso, nome empresarial, CNPJ
 * (ou CPF), endereço físico e eletrônico, e as condições de entrega. O rodapé,
 * os termos de compra e a política de privacidade leem daqui — um lugar só,
 * para o CNPJ não sair com um dígito diferente em cada página.
 *
 * Ficam no código, e não em variável de ambiente, porque são públicos por
 * definição e mudam quase nunca. Quando mudarem, a mudança passa pelo git.
 *
 * VAZIOS DE PROPÓSITO: nenhum destes valores pode ser inventado. Enquanto
 * estiverem vazios, o site abre em todo lugar, com "a preencher" nas páginas
 * legais — e o build de produção deixa um aviso no log (fim do arquivo).
 */
export const LOJA = {
  nomeFantasia: "Florenza Joalheria",
  razaoSocial: "",
  /** Como aparece no cartão CNPJ: 00.000.000/0001-00. */
  cnpj: "",
  /** Endereço completo em uma linha, com cidade, UF e CEP. */
  endereco: "",
  email: "",
  /** Só dígitos, com DDI e DDD: 5521999998888. */
  whatsapp: "",
  /**
   * Como a entrega funciona hoje, em uma ou duas frases: quem paga o frete,
   * por qual transportadora, e em quanto tempo a peça sai. Vai para os termos
   * de compra — a lei pede que isso esteja escrito antes de a pessoa pagar.
   */
  entrega: "",
};

/** Mesmo prazo de `criar_pedido()` no banco. Mudou lá, muda aqui. */
export const RESERVA_HORAS = 48;

const OBRIGATORIOS = ["razaoSocial", "cnpj", "endereco", "email", "whatsapp", "entrega"] as const;

export function camposDaLojaPendentes(): string[] {
  return OBRIGATORIOS.filter((campo) => LOJA[campo].trim() === "");
}

/** Link para falar com a Florenza. `null` enquanto o número não estiver cadastrado. */
export function linkWhatsApp(mensagem?: string): string | null {
  const numero = LOJA.whatsapp.replace(/\D/g, "");
  if (!numero) return null;
  return `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ""}`;
}

/**
 * Link para a Florenza falar com o CLIENTE — o botão da ficha do pedido no
 * painel. Telefone brasileiro digitado sem DDI ("(21) 99999-0000") ganha o 55;
 * sem isso o wa.me abriria uma conversa com um número de outro país.
 */
export function linkWhatsAppDoCliente(telefone: string | null, mensagem: string): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const comDdi = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(mensagem)}`;
}

/*
 * Em produção, loja sem identificação é AVISO no log, não erro de build.
 *
 * Até 14/09/2026 era erro — mesmo raciocínio de lib/supabase/config.ts. Virou
 * aviso por decisão de publicar a loja nova antes de ter os dados em mãos.
 * Enquanto faltarem, as páginas legais mostram "a preencher" e o quadro
 * "Ligações da loja" do painel lista o que falta. A lei continua exigindo esses
 * dados à vista: preencher é pendência de abertura, não detalhe.
 */
if (process.env.VERCEL_ENV === "production" && camposDaLojaPendentes().length > 0) {
  console.warn(
    "AVISO: faltam os dados da loja em produção.\n" +
      `Preencha em lib/loja.ts: ${camposDaLojaPendentes().join(", ")}.\n` +
      "A lei do comércio eletrônico (Decreto 7.962/2013) exige esses dados à vista no site."
  );
}
