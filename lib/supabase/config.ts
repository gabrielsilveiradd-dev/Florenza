/**
 * Uma pergunta só: o Supabase já está plugado?
 *
 * Enquanto o projeto não existe (ou enquanto alguém clona o repositório sem as
 * chaves), o site precisa continuar abrindo. A vitrine cai para o catálogo
 * local e o painel entra em modo de demonstração, com dados de exemplo e um
 * aviso na tela — em vez de estourar uma tela branca de erro.
 *
 * As duas variáveis são `NEXT_PUBLIC_` porque o Supabase foi desenhado para a
 * chave publicável circular no navegador: quem protege os dados é a RLS no
 * banco, não o segredo da chave. A service-role key, essa sim secreta, não
 * entra neste projeto em lugar nenhum.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function supabaseConfigurado(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;
}

/**
 * Em produção, faltar chave é erro — não é modo de demonstração.
 *
 * Sem esta trava o pior caso é silencioso: o build passa, o site sobe verde, e
 * a loja de verdade fica servindo o catálogo do repositório com o painel cheio
 * de pedidos de exemplo. Ninguém percebe olhando, porque parece funcionando.
 * Numa joalheria isso é preço errado na vitrine.
 *
 * A trava vale só para o deploy de produção da Vercel. Preview continua
 * permissivo de propósito: é onde se confere layout, e ali a demonstração
 * ajuda em vez de atrapalhar.
 */
if (process.env.VERCEL_ENV === "production" && !supabaseConfigurado()) {
  throw new Error(
    "Faltam as chaves do Supabase no deploy de produção.\n\n" +
      "Em Settings -> Environment Variables, para o ambiente Production:\n" +
      "  NEXT_PUBLIC_SUPABASE_URL\n" +
      "  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\n\n" +
      "Depois refaça o deploy: a Vercel não reaproveita variáveis num build já feito.\n" +
      "Sem elas o site subiria com dados de exemplo, parecendo correto."
  );
}
