-- ============================================================================
-- FLORENZA — PEÇA VENDIDA SÓ EM CONJUNTO (O TRIO)
--
-- Decisão da loja em 17/11/2026: a 9018 (par de alianças + anel solitário) é
-- anunciada e vendida como TRIO, e só como trio — a loja não tem preço para
-- uma aliança avulsa dela.
--
-- Até aqui, toda peça com `aros = 2` era "par ou unidade": o site oferecia
-- uma aliança pela metade do preço, e criar_pedido() aceitava `avulsa: true`.
-- No trio isso daria R$ 245 por algo que não corresponde a nada. Por isso a
-- peça passa a dizer o que o preço compra:
--
--   conjunto = 'par'   o preço é do par; vende também a unidade (como antes)
--   conjunto = 'trio'  o preço é do trio; NÃO vende unidade
--
-- A recusa fica no banco, não só na tela: o navegador manda só `avulsa`, e a
-- regra de ouro é que quem decide é o banco. Em vez de reescrever
-- criar_pedido() (600 linhas, com cupom e frete), uma trigger em
-- `pedido_itens` recusa a linha de UNIDADE (aros 1) de peça de dois aros que
-- não é par. Vale também para a venda manual do painel.
--
-- Estoque do trio: continua contando alianças, como toda peça de dois aros.
-- O trio baixa 2, como o par (o solitário acompanha a aliança feminina).
--
-- ORDEM DE PUBLICAÇÃO: esta migration ANTES do código, que passa a ler a
-- coluna. A 9018 continua desligada aqui; quem liga é a migration seguinte,
-- depois do deploy.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================

alter table public.produtos
  add column if not exists conjunto text not null default 'par';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_conjunto_valido') then
    alter table public.produtos
      add constraint produtos_conjunto_valido check (conjunto in ('par', 'trio'));
  end if;
end;
$$;

comment on column public.produtos.conjunto is
  'O que o preço de uma peça de dois aros compra: par (vende também a unidade, pela metade) ou trio (só o conjunto).';


-- ---------------------------------------------------------------------------
-- A trava: unidade só de peça vendida em par
-- ---------------------------------------------------------------------------
-- security definer: a função lê `produtos` mesmo de peça desligada, e quem
-- insere a linha (criar_pedido, painel) não deve depender da RLS para isso.
create or replace function public.pedido_item_unidade_so_de_par()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto record;
begin
  select p.nome, p.aros, p.conjunto into v_produto
    from public.produtos p
   where p.id = new.produto_id;

  if found and v_produto.aros = 2 and v_produto.conjunto <> 'par' and new.aros = 1 then
    raise exception 'A peça % é vendida só como %, não por unidade.', v_produto.nome, v_produto.conjunto
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Função de trigger não recebe EXECUTE: o PostgREST exporia em /rpc/.
revoke all on function public.pedido_item_unidade_so_de_par() from public, anon, authenticated;

drop trigger if exists pedido_itens_unidade_so_de_par on public.pedido_itens;
create trigger pedido_itens_unidade_so_de_par
  before insert or update of aros, produto_id on public.pedido_itens
  for each row execute function public.pedido_item_unidade_so_de_par();


-- ---------------------------------------------------------------------------
-- A 9018 é um trio (continua desligada até o código novo estar no ar)
-- ---------------------------------------------------------------------------
update public.produtos
   set conjunto = 'trio',
       descricao = 'Trio: o par de alianças com friso central e um anel solitário com zircônia. O solitário segue a medida do Aro 1.'
 where sku = '9018';


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'coluna conjunto com check' as checagem,
       case when exists (select 1 from pg_constraint where conname = 'produtos_conjunto_valido')
            then 'ok' else 'FALHOU' end as resultado
union all
select 'trigger em pedido_itens',
       case when exists (select 1 from pg_trigger where tgname = 'pedido_itens_unidade_so_de_par')
            then 'ok' else 'FALHOU' end
union all
select 'função de trigger sem EXECUTE para anon',
       case when has_function_privilege('anon', 'public.pedido_item_unidade_so_de_par()', 'execute')
            then 'FALHOU' else 'ok' end
union all
select '9018 é trio (ou não existe neste banco)',
       case when exists (select 1 from public.produtos where sku = '9018' and conjunto <> 'trio')
            then 'FALHOU' else 'ok' end;
