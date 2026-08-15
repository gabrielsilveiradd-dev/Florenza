-- ============================================================================
-- FLORENZA — RELIGAR AS 14 ALIANÇAS DE PRATA (rodar DEPOIS do deploy)
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- As 14 fichas de prata 950 foram gravadas no banco antes de o commit com as
-- fotos ter sido publicado. Como a vitrine lê do banco e as imagens vêm do
-- repositório, a loja no ar passou a listar 16 peças com 14 fotos em 404 —
-- `/produtos/prata/9001.webp` e companhia ainda não existiam no deploy.
--
-- A correção imediata foi desligar as 14 (`ativo = false`) e devolver a
-- categoria para `variante = 'foto'`, que é o corte certo para as duas peças
-- antigas (cenas em mármore, não recortes). A loja voltou a mostrar 2 peças
-- com foto funcionando.
--
-- A LIÇÃO, para a próxima carga: publicar o código primeiro, escrever no banco
-- depois. Com `revalidate = 60` a vitrine pega o dado novo sozinha em um
-- minuto — não há pressa que justifique inverter a ordem.
--
-- QUANDO RODAR: depois que `git push origin main` tiver ido e a Vercel tiver
-- terminado o deploy. Confira antes que a foto responde:
--   https://florenza-virid.vercel.app/produtos/prata/9001.webp
-- Se ela abrir, pode rodar. Se der 404, o deploy ainda não terminou.
-- ============================================================================

update public.produtos
   set ativo = true
 where sku between '9001' and '9014';

-- 14 das 16 peças passam a ser fotos recortadas com fundo transparente, que
-- pedem 5/4 + contain. Em `foto` (4/5 + cover) o cover cortaria o aro.
update public.categorias
   set variante = 'produto'
 where slug = 'aliancas-prata';

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'produtos ativos em prata' as item, count(*)::text as valor
  from public.produtos where categoria_slug = 'aliancas-prata' and ativo
union all
select 'variante da categoria', variante
  from public.categorias where slug = 'aliancas-prata'
union all
select 'nenhum preco zerado', (count(*) = 0)::text
  from public.produtos where preco_centavos <= 0;

-- Esperado: 16 | produto | true
