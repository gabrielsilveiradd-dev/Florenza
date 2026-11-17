/* Gera a migration supabase/migrations/20261117120000_aliancas_prata_novembro.sql a partir das fichas de
 * lib/data/catalogo-local.ts — a mesma fonte do site, para o banco e o
 * repositório não divergirem.
 *
 * O QUE O SQL FAZ (17/11/2026): aplica o catálogo de prata de novembro.
 *   - As 14 já existentes (9001-9014) ganham o nome da etiqueta do PDF de
 *     preços, a foto nova e a foto na mão. A 9013 passa de 5mm para 2mm.
 *     Preço e estoque delas NÃO mudam.
 *   - Entram 5 novas (9015-9019), com o estoque da ficha. A 9018 (trio) entra
 *     com `ativo = false`, como na ficha.
 *
 * Uso:  node tools/gerar-pratas-novembro.mjs
 *       npx supabase db push --linked   (só DEPOIS do deploy com as fotos)
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { produtos } from "../lib/data/catalogo-local.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// O nome do arquivo é a versão registrada no banco: não renomear depois do push.
const DESTINO = resolve(RAIZ, "supabase/migrations/20261117120000_aliancas_prata_novembro.sql");

const txt = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? "NULL" : String(v));

const prata = produtos.filter((p) => p.categoriaSlug === "aliancas-prata" && /^90\d\d$/.test(p.sku));
if (prata.some((p) => !(p.precoCentavos > 0))) {
  console.error("Peça de prata com preço 0 na ficha — o SQL NÃO foi gerado.");
  process.exit(1);
}

const linhas = prata
  .map(
    (p) => `insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  (${txt(p.sku)}, ${txt(p.slug)}, 'aliancas-prata', ${txt(p.nome)}, ${txt(p.metal)}, NULL, NULL, NULL,
   ${num(p.larguraMm)}, ${txt(p.material)}, ${txt(p.descricao)}, ${p.precoCentavos},
   ${txt(p.imagemUrl)}, ${txt(p.imagemSmUrl)}, ${txt(p.imagemUsoUrl)}, ${txt(p.imagemUsoSmUrl)},
   ${txt(p.alt)}, ${p.aros}, ${p.estoque}, ${p.ativo ? "true" : "false"})
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;
`
  )
  .join("\n");

const novas = prata.filter((p) => Number(p.sku) >= 9015);
const comMao = prata.filter((p) => p.imagemUsoUrl).length;
const ativas = prata.filter((p) => p.ativo).length;

const sql = `-- ============================================================================
-- FLORENZA — ALIANÇAS DE PRATA 950, CATÁLOGO DE NOVEMBRO/2026
--
-- GERADO por tools/gerar-pratas-novembro.mjs a partir de lib/data/catalogo-local.ts.
-- Não editar à mão: mude as fichas e rode o gerador de novo.
--
-- POR QUÊ (17/11/2026, a pedido da loja): entram 5 alianças do catálogo novo
-- (9015-9019) e as 14 que já existiam passam a usar o nome da etiqueta do PDF
-- de preços, a foto nova e a foto na mão. A 9013 passa de 5mm para 2mm.
-- Nas existentes, preço, estoque, slug e ativo NÃO mudam: podem ter sido
-- ajustados no painel. A 9018 (trio) entra desligada: com aros = 2 o site
-- ofereceria "uma unidade" pela metade do trio.
--
-- COMO RODAR: \`npx supabase db push --linked\`, DEPOIS que o deploy com as
-- fotos terminou (a lição de reativar-prata-apos-deploy.sql) — confira antes
-- que https://florenza.blog/produtos/prata/9019.webp abre. Seguro rodar de novo.
--
-- Sem tabela, view ou função nova: nada a acrescentar em RLS ou grants.
-- ============================================================================

${linhas}

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'pratas 9001-9019 no banco' as item, count(*)::text as valor
  from public.produtos where sku between '9001' and '9019'
union all
select 'ativas entre elas', count(*)::text
  from public.produtos where sku between '9001' and '9019' and ativo
union all
select 'com foto na mão', count(*)::text
  from public.produtos where sku between '9001' and '9019' and imagem_uso_url is not null
union all
select 'novas (9015-9019)', count(*)::text
  from public.produtos where sku in (${novas.map((p) => txt(p.sku)).join(", ")})
union all
select 'preco zerado ativo (deve ser 0)', count(*)::text
  from public.produtos where ativo and preco_centavos <= 0;

-- Esperado: ${prata.length} | ${ativas} (se as antigas seguiam ativas) | ${comMao} | ${novas.length} | 0
`;

await writeFile(DESTINO, sql, "utf8");
console.log(`Escrito ${DESTINO} — ${prata.length} alianças de prata (${novas.length} novas).`);
