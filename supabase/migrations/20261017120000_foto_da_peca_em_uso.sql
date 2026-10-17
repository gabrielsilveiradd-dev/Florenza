-- ============================================================================
-- FLORENZA — SEGUNDA FOTO DA PEÇA: A PEÇA EM USO
--
-- POR QUE: as alianças de ouro do catálogo de outubro/2026 chegaram com duas
-- fotos cada — o produto recortado e o par na mão. Até aqui `produtos` só
-- guardava uma (`imagem_url` + `imagem_sm_url`). A foto na mão vende mais que
-- o recorte, mas não serve de foto principal: é cena com fundo cheio, e a
-- vitrine de recortes usa `contain`, que a mostraria encolhida numa moldura.
--
-- Por isso são colunas próprias, e não uma lista genérica de fotos: o site
-- trata as duas de jeitos diferentes (o card troca para ela ao passar o mouse,
-- a página da peça mostra as duas na galeria, cada uma com seu corte). Uma
-- lista não diria qual é qual.
--
-- Nulas: só as alianças de ouro têm hoje, e o site funciona igual sem elas.
--
-- ORDEM DE PUBLICAÇÃO: esta migration ANTES do código. O código novo pede estas
-- colunas na consulta da vitrine; sem elas, a vitrine inteira dá erro. Já a
-- coluna nova sem o código novo não muda nada para o site no ar.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================

alter table public.produtos add column if not exists imagem_uso_url    text;
alter table public.produtos add column if not exists imagem_uso_sm_url text;

comment on column public.produtos.imagem_uso_url is
  'Foto da peça em uso (na mão), 960px. Opcional. Sempre exibida com cover.';
comment on column public.produtos.imagem_uso_sm_url is
  'Mesma foto de imagem_uso_url, 480px.';

-- Nenhuma policy nova: RLS decide linha, e as policies de `produtos` já cobrem
-- a linha inteira (anon lê o ativo, admin escreve). Coluna de foto não é dado
-- sensível — é o que a vitrine mostra.

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'produtos'
   and column_name in ('imagem_uso_url', 'imagem_uso_sm_url')
 order by column_name;
-- Esperado: 2 linhas, text, YES
