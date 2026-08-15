-- ============================================================================
-- FLORENZA — CARGA INICIAL DO CATÁLOGO
--
-- GERADO por tools/seed-catalogo.mjs a partir de lib/data/catalogo-local.ts.
-- Não editar à mão: rode `npm run seed` de novo depois de mexer nas fichas.
--
-- COMO RODAR: cole no SQL Editor do Supabase e execute, DEPOIS das migrations.
-- Seguro rodar de novo — tudo usa ON CONFLICT DO UPDATE, então repetir apenas
-- atualiza o que mudou, sem duplicar nada.
--
-- 3 categorias · 34 produtos
-- ============================================================================

-- ---------- Categorias ----------
insert into public.categorias
  (slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, ordem, ativo)
values
  ('aneis-formatura', 'Anéis de Formatura', 'Celebre uma conquista com uma joia que marca o início de uma nova história. Cada anel carrega o símbolo da sua profissão e os anos que levaram até ele.', '/categorias/anelformatura.png',
   'cor_pedra', 'produto',
   'Filtrar por cor da pedra', ARRAY['Todas as peças são ouro 18K (750); o filtro é pela cor da pedra, que é o que identifica o curso na tradição do anel de formatura.'], 1, true)
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, imagem_url = excluded.imagem_url,
  filtro_campo = excluded.filtro_campo, variante = excluded.variante,
  rotulo_filtro = excluded.rotulo_filtro, nota = excluded.nota, ordem = excluded.ordem;

insert into public.categorias
  (slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, ordem, ativo)
values
  ('aliancas-ouro', 'Alianças de Ouro', 'Peças atemporais, lapidadas à mão para selar promessas que atravessam gerações. O ouro 18K é sinônimo de nobreza, beleza e eternidade.', '/categorias/aliançaouro.png',
   NULL, 'foto',
   'Filtrar por material', '{}', 2, true)
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, imagem_url = excluded.imagem_url,
  filtro_campo = excluded.filtro_campo, variante = excluded.variante,
  rotulo_filtro = excluded.rotulo_filtro, nota = excluded.nota, ordem = excluded.ordem;

insert into public.categorias
  (slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, ordem, ativo)
values
  ('aliancas-prata', 'Alianças de Prata', 'Elegância discreta em prata, para quem escolhe simplicidade com sofisticação. A prata 925 oferece beleza e qualidade em cada detalhe, com um brilho que atravessa o tempo.', '/categorias/alliançaprata.png',
   NULL, 'produto',
   'Filtrar por material', '{}', 3, true)
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, imagem_url = excluded.imagem_url,
  filtro_campo = excluded.filtro_campo, variante = excluded.variante,
  rotulo_filtro = excluded.rotulo_filtro, nota = excluded.nota, ordem = excluded.ordem;


-- ---------- Opções de filtro (as cores de pedra) ----------
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'vermelha', 'Vermelha', '#b3102b', 1)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'rosa', 'Rosa', '#d4276e', 2)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'azul', 'Azul', '#1b4fb0', 3)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'verde', 'Verde', '#0f8a4e', 4)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'amarela', 'Amarela', '#e3a516', 5)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'negra', 'Negra', '#24211f', 6)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aliancas-ouro', 'ouro', 'Ouro 18K', '#b3854e', 1)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aliancas-ouro', 'ouro-diamantes', 'Ouro + Diamantes', '#e3c692', 2)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aliancas-prata', 'prata', 'Prata', '#cfd3d6', 1)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;


-- ---------- Produtos ----------
insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3001', 'anel-citrino-arabesco', 'aneis-formatura', 'Anel Citrino Arabesco',
   'Ouro 18K (750)', 'Citrino', 'amarela', 'Redonda', NULL, NULL,
   'Citrino redondo cercado por um halo de diamantes, sobre um aro largo com arabescos em alto relevo.', 349000, '/produtos/formatura/3001.webp', '/produtos/formatura/3001-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3002', 'anel-rubi-bicolor', 'aneis-formatura', 'Anel Rubi Bicolor',
   'Ouro 18K (750)', 'Rubi', 'vermelha', 'Oval', NULL, NULL,
   'Rubi oval em halo de diamantes, com ombros em ouro branco cravejado que abrem contraste sobre o aro amarelo.', 349000, '/produtos/formatura/3002.webp', '/produtos/formatura/3002-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3003', 'anel-esmeralda-leque', 'aneis-formatura', 'Anel Esmeralda Leque',
   'Ouro 18K (750)', 'Esmeralda', 'verde', 'Redonda', NULL, NULL,
   'Esmeralda redonda sustentada por garras altas, com diamantes abertos em leque sobre um aro largo e polido.', 349000, '/produtos/formatura/3003.webp', '/produtos/formatura/3003-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3004', 'anel-safira-floral', 'aneis-formatura', 'Anel Safira Floral',
   'Ouro 18K (750)', 'Safira azul', 'azul', 'Redonda', NULL, NULL,
   'Safira azul em halo margarida, com folhas gravadas à mão nas laterais do aro.', 349000, '/produtos/formatura/3004.webp', '/produtos/formatura/3004-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3005', 'anel-safira-negra-arabesco', 'aneis-formatura', 'Anel Safira Negra',
   'Ouro 18K (750)', 'Safira negra', 'negra', 'Oval', NULL, NULL,
   'Pedra negra oval em halo de diamantes, entre arabescos vazados nas laterais do aro.', 299000, '/produtos/formatura/3005.webp', '/produtos/formatura/3005-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3010', 'anel-safira-navete', 'aneis-formatura', 'Anel Safira Navete',
   'Ouro 18K (750)', 'Safira azul', 'azul', 'Navete', NULL, NULL,
   'Safira em lapidação navete, contornada por diamantes, sobre aro duplo que se abre em V.', 210000, '/produtos/formatura/3010.webp', '/produtos/formatura/3010-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3184', 'anel-esmeralda-navete', 'aneis-formatura', 'Anel Esmeralda Navete',
   'Ouro 18K (750)', 'Esmeralda', 'verde', 'Navete', NULL, NULL,
   'Esmeralda navete em halo de diamantes, sobre aro duplo em V — o desenho mais leve da linha.', 226000, '/produtos/formatura/3184.webp', '/produtos/formatura/3184-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3185', 'anel-safira-oval', 'aneis-formatura', 'Anel Safira Oval',
   'Ouro 18K (750)', 'Safira azul', 'azul', 'Oval', NULL, NULL,
   'Safira oval em halo cravejado, com galeria vazada que deixa a luz atravessar a pedra.', 242000, '/produtos/formatura/3185.webp', '/produtos/formatura/3185-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3187', 'anel-rubi-classico', 'aneis-formatura', 'Anel Rubi Clássico',
   'Ouro 18K (750)', 'Rubi', 'vermelha', 'Oval', NULL, NULL,
   'Rubi oval em halo de diamantes sobre aro fino e liso: o desenho clássico do anel de formatura.', 242000, '/produtos/formatura/3187.webp', '/produtos/formatura/3187-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3514', 'anel-topazio-princesa', 'aneis-formatura', 'Anel Topázio Princesa',
   'Ouro 18K (750)', 'Topázio azul-londres', 'azul', 'Princesa', NULL, NULL,
   'Topázio azul em lapidação princesa, com halo quadrado de diamantes sobre aro duplo.', 226000, '/produtos/formatura/3514.webp', '/produtos/formatura/3514-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3517', 'anel-rubi-aro-duplo', 'aneis-formatura', 'Anel Rubi Aro Duplo',
   'Ouro 18K (750)', 'Rubi', 'vermelha', 'Redonda', NULL, NULL,
   'Rubi redondo em halo de diamantes, elevado por uma galeria de garras sobre aro duplo.', 242000, '/produtos/formatura/3517.webp', '/produtos/formatura/3517-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3537', 'anel-turmalina-navete', 'aneis-formatura', 'Anel Turmalina Navete',
   'Ouro 18K (750)', 'Turmalina rosa', 'rosa', 'Navete', NULL, NULL,
   'Turmalina rosa navete em halo de diamantes, com ombros cravejados que seguem até a base do aro.', 314000, '/produtos/formatura/3537.webp', '/produtos/formatura/3537-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3538', 'anel-topazio-oval', 'aneis-formatura', 'Anel Topázio Oval',
   'Ouro 18K (750)', 'Topázio azul', 'azul', 'Oval', NULL, NULL,
   'Topázio azul oval em halo de diamantes, sobre aro com frisos gravados nas laterais.', 317900, '/produtos/formatura/3538.webp', '/produtos/formatura/3538-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3539', 'anel-agua-marinha-halo', 'aneis-formatura', 'Anel Água-marinha',
   'Ouro 18K (750)', 'Água-marinha', 'azul', 'Redonda', NULL, NULL,
   'Água-marinha redonda em halo de diamantes, sobre aro com frisos gravados nas laterais.', 317900, '/produtos/formatura/3539.webp', '/produtos/formatura/3539-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3555', 'anel-turmalina-princesa', 'aneis-formatura', 'Anel Turmalina Princesa',
   'Ouro 18K (750)', 'Turmalina rosa', 'rosa', 'Princesa', NULL, NULL,
   'Turmalina rosa em lapidação princesa, com halo quadrado de diamantes e aro cravejado.', 290000, '/produtos/formatura/3555.webp', '/produtos/formatura/3555-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9257', 'anel-rubi-entrelacado', 'aneis-formatura', 'Anel Rubi Entrelaçado',
   'Ouro 18K (750)', 'Rubi', 'vermelha', 'Oval', NULL, NULL,
   'Rubi oval em halo de diamantes, sobre aro entrelaçado — a peça mais imponente da categoria.', 418000, '/produtos/formatura/9257.webp', '/produtos/formatura/9257-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('A301', 'alianca-essence', 'aliancas-ouro', 'Aliança Essence',
   'Ouro 18K', NULL, NULL, NULL, 3, 'ouro',
   'Acabamento polido, linhas puras e atemporais.', 289000, '/modelosalianca/3mm.png', NULL, 'Aliança Essence, ouro 18K, 3mm, acabamento polido',
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('A501', 'alianca-aurea', 'aliancas-ouro', 'Aliança Aurea',
   'Ouro 18K + Diamantes', NULL, NULL, NULL, 5, 'ouro-diamantes',
   'Detalhe de coração cravejado, brilho que eterniza.', 469000, '/modelosalianca/5mm.png', NULL, 'Aliança Aurea, ouro 18K, 5mm, detalhe de coração cravejado',
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('P301', 'alianca-elo', 'aliancas-prata', 'Aliança Elo',
   'Prata 925', NULL, NULL, NULL, 3, 'prata',
   'Design minimalista com acabamento diagonal texturizado.', 34900, '/modelosalianca/3mmprata.png', NULL, 'Aliança Elo, prata 925, 3mm, acabamento diagonal texturizado',
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('P601', 'alianca-eter', 'aliancas-prata', 'Aliança Éter',
   'Prata 925', NULL, NULL, NULL, 6, 'prata',
   'Friso dourado e detalhe de coração ao centro.', 54900, '/modelosalianca/6mmprata.png', NULL, 'Aliança Éter, prata 925, 6mm, friso dourado e detalhe de coração',
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9001', 'alianca-lumen', 'aliancas-prata', 'Aliança Lumen',
   'Prata 950', NULL, NULL, NULL, 4, 'prata',
   'Friso em banho dourado sobre aro polido, com coração vazado em uma das peças.', 27900, '/produtos/prata/9001.webp', '/produtos/prata/9001-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9002', 'alianca-vertice', 'aliancas-prata', 'Aliança Vértice',
   'Prata 950', NULL, NULL, NULL, 8, 'prata',
   'Oito milímetros de prata polida, riscada por dois frisos paralelos.', 69000, '/produtos/prata/9002.webp', '/produtos/prata/9002-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9003', 'alianca-enlace', 'aliancas-prata', 'Aliança Enlace',
   'Prata 950', NULL, NULL, NULL, 5, 'prata',
   'Bordas diamantadas e centro polido, com coração vazado em uma das peças.', 39000, '/produtos/prata/9003.webp', '/produtos/prata/9003-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9004', 'alianca-solar', 'aliancas-prata', 'Aliança Solar',
   'Prata 950', NULL, NULL, NULL, 4, 'prata',
   'Aro diamantado cortado por friso dourado, com coração em banho dourado.', 29900, '/produtos/prata/9004.webp', '/produtos/prata/9004-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9005', 'alianca-aurora', 'aliancas-prata', 'Aliança Aurora',
   'Prata 950', NULL, NULL, NULL, 4, 'prata',
   'Textura diamantada intensa, friso dourado ao centro e coração vazado.', 39900, '/produtos/prata/9005.webp', '/produtos/prata/9005-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9006', 'alianca-meridiano', 'aliancas-prata', 'Aliança Meridiano',
   'Prata 950', NULL, NULL, NULL, 6, 'prata',
   'Seis milímetros polidos, com friso em banho dourado percorrendo o centro.', 39900, '/produtos/prata/9006.webp', '/produtos/prata/9006-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9007', 'alianca-duo', 'aliancas-prata', 'Aliança Duo',
   'Prata 950', NULL, NULL, NULL, 6, 'prata',
   'Par em contraste: um aro diamantado, outro polido, ambos com borda fosca.', 36900, '/produtos/prata/9007.webp', '/produtos/prata/9007-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9008', 'alianca-chanfro', 'aliancas-prata', 'Aliança Chanfro',
   'Prata 950', NULL, NULL, NULL, 3, 'prata',
   'Aro chanfrado que alterna prata polida e banho rosé.', 15900, '/produtos/prata/9008.webp', '/produtos/prata/9008-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9009', 'alianca-cintila', 'aliancas-prata', 'Aliança Cintila',
   'Prata 950', NULL, NULL, NULL, 3, 'prata',
   'Par fino inteiramente diamantado, com um friso polido ao centro.', 22000, '/produtos/prata/9009.webp', '/produtos/prata/9009-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9010', 'alianca-rose', 'aliancas-prata', 'Aliança Rosé',
   'Prata 950', NULL, NULL, NULL, 3, 'prata',
   'Chanfro bicolor: prata polida de um lado, banho rosé do outro.', 14900, '/produtos/prata/9010.webp', '/produtos/prata/9010-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9011', 'alianca-nevoa', 'aliancas-prata', 'Aliança Névoa',
   'Prata 950', NULL, NULL, NULL, 3, 'prata',
   'Superfície diamantada com um friso polido correndo ao centro.', 15900, '/produtos/prata/9011.webp', '/produtos/prata/9011-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9012', 'alianca-sol-e-lua', 'aliancas-prata', 'Aliança Sol e Lua',
   'Prata 950', NULL, NULL, NULL, 4, 'prata',
   'Par com sol e lua gravados, um símbolo em cada aliança.', 39000, '/produtos/prata/9012.webp', '/produtos/prata/9012-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9013', 'alianca-serena', 'aliancas-prata', 'Aliança Serena',
   'Prata 950', NULL, NULL, NULL, 5, 'prata',
   'Aro abaulado e polido, sem relevo — o desenho mais simples da linha.', 11500, '/produtos/prata/9013.webp', '/produtos/prata/9013-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9014', 'alianca-martelada', 'aliancas-prata', 'Aliança Martelada',
   'Prata 950', NULL, NULL, NULL, 4, 'prata',
   'Superfície martelada, com brilho irregular que muda conforme a luz.', 14900, '/produtos/prata/9014.webp', '/produtos/prata/9014-sm.webp', NULL,
   5, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'categorias' as item, count(*)::text as valor from public.categorias
union all
select 'opcoes de filtro', count(*)::text from public.filtro_opcoes
union all
select 'produtos', count(*)::text from public.produtos
union all
select 'aneis-formatura', count(*)::text from public.produtos where categoria_slug = 'aneis-formatura'
union all
select 'aliancas-ouro', count(*)::text from public.produtos where categoria_slug = 'aliancas-ouro'
union all
select 'aliancas-prata', count(*)::text from public.produtos where categoria_slug = 'aliancas-prata'
union all
select 'nenhum preco zerado', (count(*) = 0)::text from public.produtos where preco_centavos <= 0;

-- Esperado: 3 | 9 | 34 | 16 | 2 | 16 | true
