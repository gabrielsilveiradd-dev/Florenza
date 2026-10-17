/* Gera supabase/trocar-aliancas-ouro.sql a partir das fichas de
 * lib/data/catalogo-local.ts — a mesma fonte do site, para o banco e o
 * repositório não divergirem.
 *
 * O QUE O SQL FAZ (17/10/2026): troca as alianças de ouro da vitrine pelas 9 do
 * catálogo novo.
 *   - A301 (Essence) e A501 (Aurea) passam a `ativo = false`. Não são apagadas:
 *     pedido antigo aponta para elas e a ficha do pedido lê a peça.
 *   - As 9 novas entram (ou são atualizadas) com as duas fotos.
 *   - A categoria passa a `variante = 'produto'` (as fotos novas são recortes).
 *   - A opção de filtro "Ouro + Diamantes" vira "Ouro + Zircônias".
 *
 * PREÇO 0 É PROVISÓRIO (17/10/2026, a pedido da loja): a peça entra visível,
 * mas com estoque 0. criar_pedido() copia o preço de `produtos`, então ativa com
 * estoque venderia um par de ouro por R$ 0 + frete — sem estoque, o banco recusa.
 * Quando o preço chegar, rodar de novo devolve o estoque da ficha (5).
 *
 * Uso:  node tools/gerar-troca-ouro.mjs
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { produtos } from "../lib/data/catalogo-local.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = resolve(RAIZ, "supabase/trocar-aliancas-ouro.sql");

const txt = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined ? "NULL" : String(v));

const ouro = produtos.filter((p) => p.categoriaSlug === "aliancas-ouro");
const semPreco = ouro.filter((p) => !(p.precoCentavos > 0));
if (semPreco.some((p) => p.estoque !== 0)) {
  console.error("Peça com preço 0 e estoque na ficha — o SQL NÃO foi gerado.");
  process.exit(1);
}

const linhas = ouro
  .map(
    (p) => `insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  (${txt(p.sku)}, ${txt(p.slug)}, 'aliancas-ouro', ${txt(p.nome)}, ${txt(p.metal)}, NULL, NULL, NULL,
   ${num(p.larguraMm)}, ${txt(p.material)}, ${txt(p.descricao)}, ${p.precoCentavos},
   ${txt(p.imagemUrl)}, ${txt(p.imagemSmUrl)}, ${txt(p.imagemUsoUrl)}, ${txt(p.imagemUsoSmUrl)},
   ${txt(p.alt)}, ${p.aros}, ${p.estoque}, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url,
  alt = excluded.alt, aros = excluded.aros, ativo = true,
  -- Sem preço, sem estoque. Saindo do preço 0, recebe o estoque da ficha; com
  -- preço desde antes, o estoque do banco (vendas, ajustes) fica como está.
  estoque = case
    when excluded.preco_centavos = 0 then 0
    when public.produtos.preco_centavos = 0 then excluded.estoque
    else public.produtos.estoque
  end;
`
  )
  .join("\n");

const skus = ouro.map((p) => txt(p.sku)).join(", ");

const sql = `-- ============================================================================
-- FLORENZA — TROCA DAS ALIANÇAS DE OURO (catálogo de outubro/2026)
--
-- GERADO por tools/gerar-troca-ouro.mjs a partir de lib/data/catalogo-local.ts.
-- Não editar à mão: mude as fichas e rode o gerador de novo.
--
-- QUANDO RODAR — a mesma lição das pratas (reativar-prata-apos-deploy.sql):
--   1. migration 20261017120000_foto_da_peca_em_uso.sql aplicada (db push);
--   2. código publicado na Vercel, deploy terminado;
--   3. a foto responde: https://florenza-virid.vercel.app/produtos/ouro/002.webp
--   Só então cole este arquivo no SQL Editor. Ao contrário, a vitrine lista
--   peças com foto em 404.
--
-- Seguro rodar de novo: tudo é ON CONFLICT / UPDATE.
-- ============================================================================

begin;

-- As duas antigas saem da vitrine, mas ficam no banco (pedidos apontam para elas).
update public.produtos set ativo = false where sku in ('A301', 'A501');

-- Recortes com fundo transparente: 5/4 + contain. Em 'foto' o cover corta o aro.
update public.categorias set variante = 'produto' where slug = 'aliancas-ouro';

delete from public.filtro_opcoes where categoria_slug = 'aliancas-ouro' and slug = 'ouro-diamantes';
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aliancas-ouro', 'ouro-zirconias', 'Ouro + Zircônias', '#E5D3A6', 2)
on conflict (categoria_slug, slug) do update set nome = excluded.nome, amostra = excluded.amostra;

${linhas}
commit;

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'ouro ativos' as item, count(*)::text as valor
  from public.produtos where categoria_slug = 'aliancas-ouro' and ativo
union all
select 'antigas desligadas', count(*)::text
  from public.produtos where sku in ('A301', 'A501') and not ativo
union all
select 'novas com foto na mão', count(*)::text
  from public.produtos where sku in (${skus}) and imagem_uso_url is not null
union all
select 'variante da categoria', variante from public.categorias where slug = 'aliancas-ouro'
union all
select 'preco zerado com estoque (deve ser 0)', count(*)::text
  from public.produtos where ativo and preco_centavos <= 0 and estoque > 0
union all
select 'ouro sem preco (provisorio)', count(*)::text
  from public.produtos where sku in (${skus}) and preco_centavos = 0;

-- Esperado: ${ouro.length} | 2 | ${ouro.length} | produto | 0 | ${semPreco.length}
`;

await writeFile(DESTINO, sql, "utf8");
console.log(`Escrito ${DESTINO} — ${ouro.length} alianças de ouro.`);
if (semPreco.length) {
  console.log(`Sem preço (R$ 0, sem estoque): ${semPreco.map((p) => p.sku).join(", ")}`);
}
