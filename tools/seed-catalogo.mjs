/* Gera supabase/seed-catalogo.sql a partir das fichas que já estão no
 * repositório (lib/data/catalogo-local.ts): as 3 categorias, as 6 cores de
 * pedra e os 20 produtos.
 *
 * POR QUE GERAR SQL EM VEZ DE ESCREVER DIRETO NO BANCO
 *
 * Escrever em `produtos` exige passar pela RLS, que só se abre para admin. Um
 * script rodando no terminal teria que carregar a service-role key — a chave
 * que ignora RLS e que, vazando, dá acesso total ao banco. Este projeto não tem
 * nenhuma service-role key em lugar nenhum, e não vai passar a ter por causa de
 * uma carga que roda uma vez.
 *
 * O SQL gerado é colado no SQL Editor do Supabase, onde já se está autenticado
 * como dono do banco. Mesmo resultado, nenhuma chave nova circulando.
 *
 * SOBRE AS FOTOS: elas continuam em public/produtos e public/modelosalianca, e
 * `imagem_url` guarda o caminho relativo. Não há nada a subir para o Storage
 * aqui — o bucket existe para as fotos NOVAS, enviadas pelo painel. A coluna é
 * texto e aceita os dois formatos, então as duas origens convivem.
 *
 * Uso:  npm run seed
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Node 24 remove os tipos de um .ts na importação, então dá para ler a mesma
// fonte que a aplicação usa em vez de manter uma segunda cópia das fichas.
import { categorias, produtos } from "../lib/data/catalogo-local.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = resolve(RAIZ, "supabase/seed-catalogo.sql");

/** Escapa aspas simples — a única coisa que pode quebrar um literal em SQL. */
const txt = (valor) =>
  valor === null || valor === undefined || valor === "" ? "NULL" : `'${String(valor).replace(/'/g, "''")}'`;

const num = (valor) => (valor === null || valor === undefined ? "NULL" : String(valor));

const arrayTexto = (linhas) =>
  linhas.length === 0 ? "'{}'" : `ARRAY[${linhas.map((l) => txt(l)).join(", ")}]`;

function main() {
  const partes = [];

  partes.push(`-- ============================================================================
-- FLORENZA — CARGA INICIAL DO CATÁLOGO
--
-- GERADO por tools/seed-catalogo.mjs a partir de lib/data/catalogo-local.ts.
-- Não editar à mão: rode \`npm run seed\` de novo depois de mexer nas fichas.
--
-- COMO RODAR: cole no SQL Editor do Supabase e execute, DEPOIS das migrations.
-- Seguro rodar de novo — tudo usa ON CONFLICT DO UPDATE, então repetir apenas
-- atualiza o que mudou, sem duplicar nada.
--
-- ${categorias.length} categorias · ${produtos.length} produtos
-- ============================================================================

`);

  // ---------- categorias ----------
  partes.push("-- ---------- Categorias ----------\n");
  categorias.forEach((c, i) => {
    partes.push(`insert into public.categorias
  (slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, ordem, ativo)
values
  (${txt(c.slug)}, ${txt(c.nome)}, ${txt(c.descricao)}, ${txt(c.imagemUrl)},
   ${txt(c.filtroCampo === "corPedra" ? "cor_pedra" : c.filtroCampo)}, ${txt(c.variante)},
   ${txt(c.rotuloFiltro)}, ${arrayTexto(c.nota)}, ${i + 1}, true)
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, imagem_url = excluded.imagem_url,
  filtro_campo = excluded.filtro_campo, variante = excluded.variante,
  rotulo_filtro = excluded.rotulo_filtro, nota = excluded.nota, ordem = excluded.ordem;

`);
  });

  // ---------- opções de filtro ----------
  partes.push("\n-- ---------- Opções de filtro (as cores de pedra) ----------\n");
  for (const c of categorias) {
    c.opcoes.forEach((o, i) => {
      partes.push(`insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values (${txt(c.slug)}, ${txt(o.slug)}, ${txt(o.nome)}, ${txt(o.amostra)}, ${i + 1})
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
`);
    });
  }

  // ---------- produtos ----------
  partes.push("\n\n-- ---------- Produtos ----------\n");
  for (const p of produtos) {
    partes.push(`insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  (${txt(p.sku)}, ${txt(p.slug)}, ${txt(p.categoriaSlug)}, ${txt(p.nome)},
   ${txt(p.metal)}, ${txt(p.pedra)}, ${txt(p.corPedra)}, ${txt(p.lapidacao)}, ${num(p.larguraMm)}, ${txt(p.material)},
   ${txt(p.descricao)}, ${p.precoCentavos}, ${txt(p.imagemUrl)}, ${txt(p.imagemSmUrl)},
   ${txt(p.imagemUsoUrl)}, ${txt(p.imagemUsoSmUrl)}, ${txt(p.alt)},
   ${p.aros}, ${p.estoque}, ${p.ativo})
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url,
  alt = excluded.alt, aros = excluded.aros;

`);
  }

  // ---------- conferência ----------
  const porCategoria = categorias
    .map((c) => {
      const n = produtos.filter((p) => p.categoriaSlug === c.slug).length;
      return `select ${txt(c.slug)}, count(*)::text from public.produtos where categoria_slug = ${txt(c.slug)}`;
    })
    .join("\nunion all\n");

  partes.push(`
-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'categorias' as item, count(*)::text as valor from public.categorias
union all
select 'opcoes de filtro', count(*)::text from public.filtro_opcoes
union all
select 'produtos', count(*)::text from public.produtos
union all
${porCategoria}
union all
select 'nenhum preco zerado', (count(*) = 0)::text from public.produtos where preco_centavos <= 0;

-- Esperado: ${categorias.length} | ${categorias.reduce((s, c) => s + c.opcoes.length, 0)} | ${produtos.length} | ${categorias
    .map((c) => produtos.filter((p) => p.categoriaSlug === c.slug).length)
    .join(" | ")} | true
`);

  return partes.join("");
}

const sql = main();
await writeFile(DESTINO, sql, "utf8");

console.log(`Escrito ${DESTINO}`);
console.log(`  ${categorias.length} categorias, ${produtos.length} produtos, ${Math.round(sql.length / 1024)} KB`);
console.log("\nPróximo passo: cole o arquivo no SQL Editor do Supabase, depois das migrations.");
