-- ============================================================================
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
-- COMO RODAR: `npx supabase db push --linked`, DEPOIS que o deploy com as
-- fotos terminou (a lição de reativar-prata-apos-deploy.sql) — confira antes
-- que https://florenza.blog/produtos/prata/9019.webp abre. Seguro rodar de novo.
--
-- Banco novo (testes, aplicar-tudo.sql): a categoria vem do seed, depois das
-- migrations. Sem ela, nada é inserido — por isso o `where exists`.
--
-- Sem tabela, view ou função nova: nada a acrescentar em RLS ou grants.
-- ============================================================================

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9001', 'alianca-lumen', 'aliancas-prata', 'Aliança Prata 950 4mm Friso Banho Dourado', 'Prata 950', NULL, NULL, NULL,
  4, 'prata', 'Friso em banho dourado sobre aro polido, com coração vazado em uma das peças.', 27900,
  '/produtos/prata/9001.webp', '/produtos/prata/9001-sm.webp', '/produtos/prata/9001-mao.webp', '/produtos/prata/9001-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9002', 'alianca-vertice', 'aliancas-prata', 'Aliança Prata 950 8mm', 'Prata 950', NULL, NULL, NULL,
  8, 'prata', 'Oito milímetros de prata polida, riscada por frisos paralelos.', 69000,
  '/produtos/prata/9002.webp', '/produtos/prata/9002-sm.webp', '/produtos/prata/9002-mao.webp', '/produtos/prata/9002-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9003', 'alianca-enlace', 'aliancas-prata', 'Aliança Prata 950 5mm', 'Prata 950', NULL, NULL, NULL,
  5, 'prata', 'Bordas diamantadas e centro polido, com coração vazado em uma das peças.', 39000,
  '/produtos/prata/9003.webp', '/produtos/prata/9003-sm.webp', NULL, NULL,
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9004', 'alianca-solar', 'aliancas-prata', 'Aliança Prata 950 4mm Friso Banho Dourado', 'Prata 950', NULL, NULL, NULL,
  4, 'prata', 'Aro diamantado cortado por friso dourado, com coração em banho dourado.', 29900,
  '/produtos/prata/9004.webp', '/produtos/prata/9004-sm.webp', NULL, NULL,
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9005', 'alianca-aurora', 'aliancas-prata', 'Aliança Prata 950 4mm Friso Banho Dourado', 'Prata 950', NULL, NULL, NULL,
  4, 'prata', 'Textura diamantada intensa, friso dourado ao centro e coração vazado.', 39900,
  '/produtos/prata/9005.webp', '/produtos/prata/9005-sm.webp', '/produtos/prata/9005-mao.webp', '/produtos/prata/9005-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9006', 'alianca-meridiano', 'aliancas-prata', 'Aliança Prata 950 6mm Friso Banho Dourado', 'Prata 950', NULL, NULL, NULL,
  6, 'prata', 'Seis milímetros polidos, com friso em banho dourado percorrendo o centro.', 39900,
  '/produtos/prata/9006.webp', '/produtos/prata/9006-sm.webp', '/produtos/prata/9006-mao.webp', '/produtos/prata/9006-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9007', 'alianca-duo', 'aliancas-prata', 'Aliança Prata 950 6mm', 'Prata 950', NULL, NULL, NULL,
  6, 'prata', 'Par em contraste: um aro diamantado, outro polido, ambos com borda fosca.', 36900,
  '/produtos/prata/9007.webp', '/produtos/prata/9007-sm.webp', '/produtos/prata/9007-mao.webp', '/produtos/prata/9007-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9008', 'alianca-chanfro', 'aliancas-prata', 'Aliança Chanfrada Prata 950 3mm', 'Prata 950', NULL, NULL, NULL,
  3, 'prata', 'Aro chanfrado que alterna prata polida e banho rosé.', 15900,
  '/produtos/prata/9008.webp', '/produtos/prata/9008-sm.webp', NULL, NULL,
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9009', 'alianca-cintila', 'aliancas-prata', 'Aliança Prata 950 3mm', 'Prata 950', NULL, NULL, NULL,
  3, 'prata', 'Par fino inteiramente diamantado, com frisos polidos.', 22000,
  '/produtos/prata/9009.webp', '/produtos/prata/9009-sm.webp', '/produtos/prata/9009-mao.webp', '/produtos/prata/9009-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9010', 'alianca-rose', 'aliancas-prata', 'Aliança Prata 950 3mm', 'Prata 950', NULL, NULL, NULL,
  3, 'prata', 'Chanfro bicolor: prata polida de um lado, banho rosé do outro.', 14900,
  '/produtos/prata/9010.webp', '/produtos/prata/9010-sm.webp', NULL, NULL,
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9011', 'alianca-nevoa', 'aliancas-prata', 'Aliança Prata 950 3mm', 'Prata 950', NULL, NULL, NULL,
  3, 'prata', 'Superfície diamantada com borda polida.', 15900,
  '/produtos/prata/9011.webp', '/produtos/prata/9011-sm.webp', '/produtos/prata/9011-mao.webp', '/produtos/prata/9011-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9012', 'alianca-sol-e-lua', 'aliancas-prata', 'Aliança Prata 950 4mm', 'Prata 950', NULL, NULL, NULL,
  4, 'prata', 'Par com sol e lua gravados, um símbolo em cada aliança.', 39000,
  '/produtos/prata/9012.webp', '/produtos/prata/9012-sm.webp', '/produtos/prata/9012-mao.webp', '/produtos/prata/9012-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9013', 'alianca-serena', 'aliancas-prata', 'Aliança Prata 950 2mm', 'Prata 950', NULL, NULL, NULL,
  2, 'prata', 'Aro fino e polido, sem relevo — o desenho mais simples da linha.', 11500,
  '/produtos/prata/9013.webp', '/produtos/prata/9013-sm.webp', '/produtos/prata/9013-mao.webp', '/produtos/prata/9013-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9014', 'alianca-martelada', 'aliancas-prata', 'Aliança Prata 950 4mm', 'Prata 950', NULL, NULL, NULL,
  4, 'prata', 'Aro reto e polido, de bordas vivas.', 14900,
  '/produtos/prata/9014.webp', '/produtos/prata/9014-sm.webp', '/produtos/prata/9014-mao.webp', '/produtos/prata/9014-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9015', 'alianca-prata-950-3mm-riscadinha', 'aliancas-prata', 'Aliança Prata 950 3mm Riscadinha', 'Prata 950', NULL, NULL, NULL,
  3, 'prata', 'Superfície riscada em linhas finas, com bordas polidas.', 16900,
  '/produtos/prata/9015.webp', '/produtos/prata/9015-sm.webp', '/produtos/prata/9015-mao.webp', '/produtos/prata/9015-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9016', 'alianca-prata-950-3mm-diamantada', 'aliancas-prata', 'Aliança Prata 950 3mm', 'Prata 950', NULL, NULL, NULL,
  3, 'prata', 'Par em textura diamantada, com bordas polidas.', 15900,
  '/produtos/prata/9016.webp', '/produtos/prata/9016-sm.webp', '/produtos/prata/9016-mao.webp', '/produtos/prata/9016-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9017', 'alianca-prata-950-3mm-frisos', 'aliancas-prata', 'Aliança Prata 950 3mm', 'Prata 950', NULL, NULL, NULL,
  3, 'prata', 'Textura riscada cortada por dois frisos polidos.', 24900,
  '/produtos/prata/9017.webp', '/produtos/prata/9017-sm.webp', '/produtos/prata/9017-mao.webp', '/produtos/prata/9017-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9018', 'alianca-prata-950-4mm-com-solitario', 'aliancas-prata', 'Aliança Prata 950 4mm + Anel Solitário', 'Prata 950', NULL, NULL, NULL,
  4, 'prata', 'Trio: o par de alianças com friso central e um anel solitário com zircônia.', 49000,
  '/produtos/prata/9018.webp', '/produtos/prata/9018-sm.webp', '/produtos/prata/9018-mao.webp', '/produtos/prata/9018-mao-sm.webp',
  NULL, 2, 10, false
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
select
  '9019', 'alianca-prata-950-7mm-gravacao-a-laser', 'aliancas-prata', 'Aliança Prata 950 7mm com Gravação a Laser', 'Prata 950', NULL, NULL, NULL,
  7, 'prata', 'Sete milímetros com os nomes gravados a laser na lateral. Escreva os nomes em Observações, no fechamento do pedido.', 129000,
  '/produtos/prata/9019.webp', '/produtos/prata/9019-sm.webp', '/produtos/prata/9019-mao.webp', '/produtos/prata/9019-mao-sm.webp',
  NULL, 2, 10, true
where exists (select 1 from public.categorias where slug = 'aliancas-prata')
on conflict (sku) do update set
  -- Peça que já existe: muda nome, descrição, largura e fotos. Preço, estoque,
  -- slug e ativo ficam como estão no banco (podem ter sido ajustados no painel).
  nome = excluded.nome, largura_mm = excluded.largura_mm, descricao = excluded.descricao,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url,
  imagem_uso_url = excluded.imagem_uso_url, imagem_uso_sm_url = excluded.imagem_uso_sm_url;


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
  from public.produtos where sku in ('9015', '9016', '9017', '9018', '9019')
union all
select 'preco zerado ativo (deve ser 0)', count(*)::text
  from public.produtos where ativo and preco_centavos <= 0;

-- Esperado: 19 | 18 (se as antigas seguiam ativas) | 15 | 5 | 0
