-- ============================================================================
-- FLORENZA — LIGA O TRIO 9018 NA VITRINE
--
-- Separada de 20261117130000_venda_em_trio.sql de propósito: o código que
-- mostra "o trio" e esconde a opção de unidade lê a coluna `conjunto`, que
-- aquela migration cria. A ordem é coluna -> deploy do código -> esta aqui.
-- Ligada antes do deploy, a página antiga ofereceria "uma aliança" por R$ 245
-- (o banco recusaria, mas a pessoa veria a oferta).
--
-- COMO RODAR: `npx supabase db push --linked`, DEPOIS que o deploy terminou.
-- Seguro rodar de novo.
-- ============================================================================

update public.produtos
   set ativo = true
 where sku = '9018' and conjunto = 'trio' and preco_centavos > 0;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select '9018 ligada como trio (ou não existe neste banco)' as checagem,
       case when exists (select 1 from public.produtos where sku = '9018' and not (ativo and conjunto = 'trio'))
            then 'FALHOU' else 'ok' end as resultado;
