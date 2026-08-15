-- Cupons de desconto, e o pedido passando a guardar subtotal e desconto.
--
-- A regra é a mesma do preço: o navegador não decide dinheiro. Ele manda o
-- CÓDIGO do cupom; quem calcula o desconto é o banco, dentro da mesma transação
-- que confere o estoque. Aceitar um valor de desconto vindo da tela seria
-- reabrir, por outra porta, o buraco que a migration anterior fechou.

-- ---------------------------------------------------------------------------
-- 1) A tabela
-- ---------------------------------------------------------------------------
create table if not exists public.cupons (
  codigo          text primary key,
  descricao       text,
  tipo            text    not null check (tipo in ('percentual', 'valor')),
  valor           integer not null check (valor > 0),
  minimo_centavos integer not null default 0 check (minimo_centavos >= 0),
  validade_ate    date,
  limite_usos     integer check (limite_usos is null or limite_usos > 0),
  usos            integer not null default 0 check (usos >= 0),
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.cupons drop constraint if exists cupons_percentual_valido;
alter table public.cupons add constraint cupons_percentual_valido
  check (tipo <> 'percentual' or valor between 1 and 100);

alter table public.cupons enable row level security;

-- Ninguém lê a tabela pela API, nem logado. Uma lista de cupons legível é uma
-- lista de descontos para quem souber pedir — o cliente só pode PERGUNTAR sobre
-- um código que já conhece, pela função conferir_cupom().
drop policy if exists "Admin gerencia cupons" on public.cupons;
create policy "Admin gerencia cupons" on public.cupons
  for all using (public.is_admin()) with check (public.is_admin());

-- O grant de tabela para `anon` sai na migration seguinte
-- (20260814234458_cupons_sem_select_anonimo.sql), que é onde ele foi aplicado
-- no banco. Mantido separado para o nome do arquivo continuar batendo com a
-- versão registrada — se divergir, um `db push` reaplica tudo.


-- ---------------------------------------------------------------------------
-- 2) Colunas no pedido — `total_centavos` continua sendo o que se cobra
-- ---------------------------------------------------------------------------
alter table public.pedidos add column if not exists subtotal_centavos integer not null default 0;
alter table public.pedidos add column if not exists desconto_centavos integer not null default 0;
alter table public.pedidos add column if not exists cupom_codigo text
  references public.cupons(codigo) on delete set null;

create index if not exists pedidos_cupom_idx on public.pedidos (cupom_codigo);


-- ---------------------------------------------------------------------------
-- 3) O total passa a descontar
--
--    Antes: total = soma dos itens. Agora: subtotal = soma dos itens, e
--    total = subtotal - desconto, nunca abaixo de zero.
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_total_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido   uuid := coalesce(new.pedido_id, old.pedido_id);
  v_subtotal integer;
  v_itens    integer;
begin
  select coalesce(sum(i.preco_centavos * i.quantidade), 0), count(*)
    into v_subtotal, v_itens
    from public.pedido_itens i
   where i.pedido_id = v_pedido;

  if v_itens > 0 then
    update public.pedidos
       set subtotal_centavos = v_subtotal,
           total_centavos    = greatest(0, v_subtotal - desconto_centavos)
     where id = v_pedido;
  end if;

  return coalesce(new, old);
end;
$$;

revoke execute on function public.recalcular_total_do_pedido() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) conferir_cupom() — para a pessoa ver o desconto antes de fechar
--
--    SECURITY DEFINER porque a tabela é fechada. Responde só sobre o código
--    perguntado e nunca lista nada. `motivo` já vem pronto para exibir.
-- ---------------------------------------------------------------------------
create or replace function public.conferir_cupom(
  p_codigo   text,
  p_subtotal integer
)
returns table (valido boolean, motivo text, desconto_centavos integer, descricao text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cupons%rowtype;
  v_desconto integer;
begin
  select * into c from public.cupons
   where codigo = upper(trim(coalesce(p_codigo, '')));

  -- Mesma resposta para código inexistente e código desligado: dizer "existe,
  -- mas está desativado" ajuda quem estiver adivinhando códigos.
  if not found or not c.ativo then
    return query select false, 'Cupom não encontrado.', 0, null::text;
    return;
  end if;

  if c.validade_ate is not null and c.validade_ate < current_date then
    return query select false, 'Este cupom expirou.', 0, null::text;
    return;
  end if;

  if c.limite_usos is not null and c.usos >= c.limite_usos then
    return query select false, 'Este cupom já atingiu o limite de usos.', 0, null::text;
    return;
  end if;

  if coalesce(p_subtotal, 0) < c.minimo_centavos then
    return query select false,
      'Este cupom vale a partir de R$ ' || to_char(c.minimo_centavos / 100.0, 'FM999G999D00') || '.',
      0, null::text;
    return;
  end if;

  if c.tipo = 'percentual' then
    v_desconto := (coalesce(p_subtotal, 0) * c.valor) / 100;
  else
    v_desconto := c.valor;
  end if;

  -- Desconto nunca passa do subtotal: um cupom de R$ 500 num pedido de R$ 349
  -- zera a conta, não gera troco.
  v_desconto := least(v_desconto, coalesce(p_subtotal, 0));

  return query select true, 'Cupom aplicado.', v_desconto, c.descricao;
end;
$$;

revoke execute on function public.conferir_cupom(text, integer) from public;
grant  execute on function public.conferir_cupom(text, integer) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5) criar_pedido() passa a aceitar o código do cupom
--
--    O cupom é resolvido por último, quando o subtotal já foi somado a partir
--    do catálogo. `for update` na linha do cupom pelo mesmo motivo do estoque:
--    sem a trava, dois pedidos simultâneos furam o limite de usos.
-- ---------------------------------------------------------------------------
create or replace function public.criar_pedido(
  p_itens       jsonb,
  p_nome        text,
  p_telefone    text default null,
  p_email       text default null,
  p_cep         text default null,
  p_cidade      text default null,
  p_uf          text default null,
  p_observacoes text default null,
  p_cupom       text default null
)
returns table (pedido_id uuid, pedido_numero bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_numero    bigint;
  v_item      record;
  v_produto   record;
  v_subtotal  integer := 0;
  v_codigo    text := nullif(upper(trim(coalesce(p_cupom, ''))), '');
  v_cupom     public.cupons%rowtype;
  v_desconto  integer := 0;
begin
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Falta o nome de quem está comprando.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (
    user_id, nome, email, telefone, cep, cidade, uf,
    origem, status, total_centavos, observacoes
  ) values (
    (select auth.uid()),
    trim(p_nome),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_telefone, '')), ''),
    nullif(trim(coalesce(p_cep, '')), ''),
    nullif(trim(coalesce(p_cidade, '')), ''),
    nullif(upper(trim(coalesce(p_uf, ''))), ''),
    'site', 'aguardando_pagamento', 0,
    nullif(trim(coalesce(p_observacoes, '')), '')
  )
  returning id, numero into v_pedido_id, v_numero;

  for v_item in
    -- Agrupa por SKU: o mesmo código repetido no carrinho viraria duas baixas
    -- de estoque e duas linhas de item para a mesma peça. Ordem de SKU evita
    -- que dois pedidos com as mesmas peças travem um no outro.
    select  e.valor ->> 'sku' as sku,
            sum(greatest(1, coalesce((e.valor ->> 'quantidade')::int, 1)))::int as quantidade
      from  jsonb_array_elements(p_itens) as e(valor)
     where  coalesce(e.valor ->> 'sku', '') <> ''
     group  by e.valor ->> 'sku'
     order  by 1
  loop
    select p.id, p.nome, p.preco_centavos, p.estoque, p.ativo
      into v_produto
      from public.produtos p
     where p.sku = v_item.sku
     for update;

    if not found then
      raise exception 'A peça de código % não está mais no catálogo.', v_item.sku using errcode = 'P0001';
    end if;
    if not v_produto.ativo then
      raise exception 'A peça % saiu do catálogo.', v_produto.nome using errcode = 'P0001';
    end if;
    if v_produto.estoque < v_item.quantidade then
      raise exception 'Restam % unidade(s) de %.', v_produto.estoque, v_produto.nome using errcode = 'P0001';
    end if;

    -- Preço e nome saem do banco e viram cópia no item. O que o navegador
    -- mandou de preço é ignorado.
    insert into public.pedido_itens (pedido_id, produto_id, sku, nome, preco_centavos, quantidade)
    values (v_pedido_id, v_produto.id, v_item.sku, v_produto.nome,
            v_produto.preco_centavos, v_item.quantidade);

    update public.produtos set estoque = estoque - v_item.quantidade where id = v_produto.id;

    v_subtotal := v_subtotal + (v_produto.preco_centavos * v_item.quantidade);
  end loop;

  if v_codigo is not null then
    select * into v_cupom from public.cupons where codigo = v_codigo for update;

    if not found or not v_cupom.ativo then
      raise exception 'Cupom não encontrado.' using errcode = 'P0001';
    end if;
    if v_cupom.validade_ate is not null and v_cupom.validade_ate < current_date then
      raise exception 'Este cupom expirou.' using errcode = 'P0001';
    end if;
    if v_cupom.limite_usos is not null and v_cupom.usos >= v_cupom.limite_usos then
      raise exception 'Este cupom já atingiu o limite de usos.' using errcode = 'P0001';
    end if;
    if v_subtotal < v_cupom.minimo_centavos then
      raise exception 'Este cupom vale a partir de R$ %.',
        to_char(v_cupom.minimo_centavos / 100.0, 'FM999G999D00') using errcode = 'P0001';
    end if;

    if v_cupom.tipo = 'percentual' then
      v_desconto := (v_subtotal * v_cupom.valor) / 100;
    else
      v_desconto := v_cupom.valor;
    end if;
    v_desconto := least(v_desconto, v_subtotal);

    update public.cupons set usos = usos + 1 where codigo = v_codigo;
  end if;

  update public.pedidos
     set subtotal_centavos = v_subtotal,
         desconto_centavos = v_desconto,
         cupom_codigo      = v_codigo,
         total_centavos    = greatest(0, v_subtotal - v_desconto)
   where id = v_pedido_id;

  return query select v_pedido_id, v_numero;
end;
$$;

-- A assinatura mudou (ganhou p_cupom), então a antiga vira função separada e
-- precisa sair — senão o PostgREST fica com duas e não sabe qual chamar.
drop function if exists public.criar_pedido(jsonb, text, text, text, text, text, text, text);

revoke execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text) from public;
grant  execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6) Um cupom de exemplo, para dar para experimentar hoje
--
--    É para apagar ou trocar:
--      delete from public.cupons where codigo = 'BEMVINDO10';
-- ---------------------------------------------------------------------------
insert into public.cupons (codigo, descricao, tipo, valor, minimo_centavos, ativo)
values ('BEMVINDO10', 'Primeira compra — 10%', 'percentual', 10, 0, true)
on conflict (codigo) do nothing;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as cinco linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'cupons fechada para anon' as checagem,
       case when has_table_privilege('anon', 'public.cupons', 'SELECT') then 'FALHOU' else 'ok' end as resultado
union all
select 'conferir_cupom executável por anon',
       case when has_function_privilege('anon', 'public.conferir_cupom(text,integer)', 'EXECUTE') then 'ok' else 'FALHOU' end
union all
select 'criar_pedido com cupom existe',
       case when to_regprocedure('public.criar_pedido(jsonb,text,text,text,text,text,text,text,text)') is not null then 'ok' else 'FALHOU' end
union all
select 'assinatura antiga removida',
       case when to_regprocedure('public.criar_pedido(jsonb,text,text,text,text,text,text,text)') is null then 'ok' else 'FALHOU' end
union all
select 'pedidos tem subtotal e desconto',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'pedidos'
                     and column_name in ('subtotal_centavos', 'desconto_centavos', 'cupom_codigo')) = 3
            then 'ok' else 'FALHOU' end;
