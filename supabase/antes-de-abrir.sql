-- ===========================================================================
-- ANTES DE ABRIR A LOJA
--
-- Para rodar no SQL Editor do Supabase DEPOIS de aplicar as migrations de
-- 14/09/2026 (`npx supabase db push --linked`). Rode bloco a bloco, lendo o
-- resultado de cada um — não é um script para executar inteiro.
--
-- Nada aqui altera dados sozinho: todo UPDATE e DELETE está comentado. Tire o
-- comentário só da linha que você quer rodar, com os números/códigos certos.
-- ===========================================================================


-- 1) As migrations novas estão no banco? --------------------------------------
--    As três colunas precisam vir `true`.
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'pedidos' and column_name = 'expira_em') as reserva_de_48h,
  exists (select 1 from information_schema.tables
          where table_schema = 'public' and table_name = 'pagamentos')                          as tabela_pagamentos,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'produtos' and column_name = 'aros')    as medida_do_aro;


-- 2) A devolução automática das reservas vencidas está agendada? ---------------
--    Precisa aparecer uma linha, com active = true. Sem linha: ligue o pg_cron em
--    Database -> Extensions e rode a migration 20260914120000 de novo.
select jobname, schedule, active
from cron.job
where jobname = 'florenza-expirar-reservas';


-- 3) O segredo dos pagamentos existe? (só quando for ligar o Mercado Pago) -----
--    Uma linha com tamanho_ok = true. O valor em si não aparece aqui.
select name, length(decrypted_secret) >= 32 as tamanho_ok
from vault.decrypted_secrets
where name = 'florenza_pagamentos';


-- 4) Quem é admin --------------------------------------------------------------
select u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';


-- 5) Pedidos existentes: quais são de teste? -----------------------------------
select numero, nome, email, origem, status, total_centavos, cupom_codigo, created_at
from public.pedidos
order by created_at;


-- 6) Tirar os pedidos de teste -------------------------------------------------
--    A ORDEM IMPORTA. Apagar um pedido NÃO devolve o estoque nem o uso do cupom —
--    quem devolve é o CANCELAMENTO. Então: primeiro cancele, depois apague.
--
-- update public.pedidos
--    set status = 'cancelado', motivo_cancelamento = 'Pedido de teste.'
--  where numero in (/* números do bloco 5 */) and status <> 'cancelado';
--
-- delete from public.pedidos where numero in (/* os mesmos números */);
--    (itens e pagamentos do pedido saem junto, por cascata)


-- 7) Estoque real, peça a peça -------------------------------------------------
--    A partir de agora estoque é o que existe na gaveta: peça com 0 aparece
--    esgotada e não pode ser comprada.
select sku, nome, categoria_slug, estoque, aros, ativo, preco_centavos
from public.produtos
order by categoria_slug, sku;

-- update public.produtos set estoque = 1 where sku = '3187';
--
-- Ou vários de uma vez:
-- update public.produtos p
--    set estoque = v.estoque
--   from (values ('3187', 2), ('3190', 1)) as v(sku, estoque)
--  where p.sku = v.sku;


-- 8) Medida do aro -------------------------------------------------------------
--    aros = 1: anel ou aliança avulsa (um seletor de medida).
--    aros = 2: par de alianças vendido junto (dois seletores).
--    aros = 0: peça sem medida.
--    A migration marcou como par tudo cuja descrição começa com "Par ". Confira.
select sku, nome, left(descricao, 60) as descricao, aros
from public.produtos
order by aros desc, sku;

-- update public.produtos set aros = 2 where sku in (/* pares */);


-- 9) Cupons --------------------------------------------------------------------
select codigo, tipo, valor, ativo, so_primeira_compra, um_por_cliente, usos, limite_usos, validade_ate
from public.cupons
order by codigo;

--    Usos gastos em teste. Cancelar o pedido (bloco 6) já devolve o uso; este é
--    para o caso de o contador ter ficado alto por outro motivo.
-- update public.cupons set usos = 0 where codigo = 'BEMVINDO10';
