-- ============================================================================
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('002', 'alianca-petala', 'aliancas-ouro', 'Aliança Pétala', 'Ouro 18K', NULL, NULL, NULL,
   2.5, 'ouro', 'Par fino e abaulado, polido por inteiro: o desenho tradicional na medida mais delicada. Peso aproximado do par: 1,7 g.', 189000,
   '/produtos/ouro/002.webp', '/produtos/ouro/002-sm.webp', '/produtos/ouro/002-mao.webp', '/produtos/ouro/002-mao-sm.webp',
   NULL, 2, 5, true)
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('003', 'alianca-essence-ouro', 'aliancas-ouro', 'Aliança Essence', 'Ouro 18K', NULL, NULL, NULL,
   3, 'ouro', 'O clássico abaulado e polido, em três milímetros: linhas puras e atemporais. Peso aproximado do par: 2,3 g.', 249000,
   '/produtos/ouro/003.webp', '/produtos/ouro/003-sm.webp', '/produtos/ouro/003-mao.webp', '/produtos/ouro/003-mao-sm.webp',
   NULL, 2, 5, true)
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('005', 'alianca-nobre', 'aliancas-ouro', 'Aliança Nobre', 'Ouro 18K', NULL, NULL, NULL,
   4, 'ouro', 'Quatro milímetros de ouro abaulado e polido, com mais presença no dedo. Peso aproximado do par: 3,7 g.', 396900,
   '/produtos/ouro/005.webp', '/produtos/ouro/005-sm.webp', '/produtos/ouro/005-mao.webp', '/produtos/ouro/005-mao-sm.webp',
   NULL, 2, 5, true)
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('033E', 'alianca-brisa', 'aliancas-ouro', 'Aliança Brisa', 'Ouro 18K', NULL, NULL, NULL,
   3, 'ouro', 'Riscas diamantadas em diagonal entre bordas polidas, na versão de três milímetros. Peso aproximado do par: 2,0 g.', 219000,
   '/produtos/ouro/033e.webp', '/produtos/ouro/033e-sm.webp', '/produtos/ouro/033e-mao.webp', '/produtos/ouro/033e-mao-sm.webp',
   NULL, 2, 5, true)
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('033', 'alianca-raio', 'aliancas-ouro', 'Aliança Raio', 'Ouro 18K', NULL, NULL, NULL,
   4, 'ouro', 'Riscas diamantadas em diagonal correndo entre duas bordas polidas. Peso aproximado do par: 3,0 g.', 319000,
   '/produtos/ouro/033.webp', '/produtos/ouro/033-sm.webp', '/produtos/ouro/033-mao.webp', '/produtos/ouro/033-mao-sm.webp',
   NULL, 2, 5, true)
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('034', 'alianca-onda', 'aliancas-ouro', 'Aliança Onda', 'Ouro 18K', NULL, NULL, NULL,
   5, 'ouro', 'Perfil côncavo, diamantado em diagonal, com bordas polidas que emolduram o brilho. Peso aproximado do par: 3,4 g.', 399000,
   '/produtos/ouro/034.webp', '/produtos/ouro/034-sm.webp', '/produtos/ouro/034-mao.webp', '/produtos/ouro/034-mao-sm.webp',
   NULL, 2, 5, true)
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('ESC3', 'alianca-linear', 'aliancas-ouro', 'Aliança Linear', 'Ouro 18K', NULL, NULL, NULL,
   3, 'ouro', 'Aro reto e polido, de perfil escravo: o ouro sem curva nem relevo. Peso aproximado do par: 2 g.', 219900,
   '/produtos/ouro/esc3.webp', '/produtos/ouro/esc3-sm.webp', '/produtos/ouro/esc3-mao.webp', '/produtos/ouro/esc3-mao-sm.webp',
   NULL, 2, 5, true)
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('6BVL', 'alianca-esplendor', 'aliancas-ouro', 'Aliança Esplendor', 'Ouro 18K + Zircônias', NULL, NULL, NULL,
   6, 'ouro-zirconias', 'Par com frisos paralelos; a aliança feminina traz duas fileiras de zircônias, 40 pedras ao todo. Peso aproximado do par: 7,0 g.', 789000,
   '/produtos/ouro/6bvl.webp', '/produtos/ouro/6bvl-sm.webp', '/produtos/ouro/6bvl-mao.webp', '/produtos/ouro/6bvl-mao-sm.webp',
   NULL, 2, 5, true)
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

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, imagem_uso_url, imagem_uso_sm_url,
   alt, aros, estoque, ativo)
values
  ('X', 'alianca-celeste', 'aliancas-ouro', 'Aliança Celeste', 'Ouro 18K + Zircônias', NULL, NULL, NULL,
   NULL, 'ouro-zirconias', 'Par com frisos largos; a aliança feminina tem duas fileiras de zircônias e um ponto de luz ao centro.', 0,
   '/produtos/ouro/x.webp', '/produtos/ouro/x-sm.webp', '/produtos/ouro/x-mao.webp', '/produtos/ouro/x-mao-sm.webp',
   NULL, 2, 0, true)
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
  from public.produtos where sku in ('002', '003', '005', '033E', '033', '034', 'ESC3', '6BVL', 'X') and imagem_uso_url is not null
union all
select 'variante da categoria', variante from public.categorias where slug = 'aliancas-ouro'
union all
select 'preco zerado com estoque (deve ser 0)', count(*)::text
  from public.produtos where ativo and preco_centavos <= 0 and estoque > 0
union all
select 'ouro sem preco (provisorio)', count(*)::text
  from public.produtos where sku in ('002', '003', '005', '033E', '033', '034', 'ESC3', '6BVL', 'X') and preco_centavos = 0;

-- Esperado: 9 | 2 | 9 | produto | 0 | 1
