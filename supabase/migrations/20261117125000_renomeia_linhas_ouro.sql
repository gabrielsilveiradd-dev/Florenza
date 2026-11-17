-- ============================================================================
-- FLORENZA — NOMES DE QUATRO ALIANÇAS DE OURO
--
-- Decisão da loja em 17/11/2026, seguindo os nomes por linha que a loja já
-- usa ("Linha Tradicional Meia Cana", "Linha Trabalhada 4mm"):
--
--   033E  Aliança Brisa      -> Linha Trabalhada 3mm
--   034   Aliança Onda       -> Linha Trabalhada 5mm
--   6BVL  Aliança Esplendor  -> Linha Trabalhada 6mm 40 pedras zircônia
--   ESC3  Aliança Linear     -> Linha Reta 3mm
--
-- O slug fica como está, para não quebrar link já enviado ou indexado. Pedido
-- antigo guarda o nome da época em `pedido_itens.nome` e não muda.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================

update public.produtos as p
   set nome = n.nome
  from (values
    ('033E', 'Linha Trabalhada 3mm'),
    ('034',  'Linha Trabalhada 5mm'),
    ('6BVL', 'Linha Trabalhada 6mm 40 pedras zircônia'),
    ('ESC3', 'Linha Reta 3mm')
  ) as n (sku, nome)
 where p.sku = n.sku;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — nenhum dos quatro com o nome antigo
-- ---------------------------------------------------------------------------
select 'nomes antigos restantes (deve ser 0)' as checagem, count(*)::text as resultado
  from public.produtos
 where sku in ('033E', '034', '6BVL', 'ESC3')
   and nome in ('Aliança Brisa', 'Aliança Onda', 'Aliança Esplendor', 'Aliança Linear');
