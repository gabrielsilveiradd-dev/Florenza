-- Pedido para presente.
--
-- Numa joalheria isso não é caprichinho: metade das alianças e boa parte dos
-- anéis são comprados para outra pessoa. Muda o que vai na embalagem (sem
-- valores impressos) e muda o que a Florenza fala ao entregar.
alter table public.pedidos add column if not exists presente boolean not null default false;
alter table public.pedidos add column if not exists mensagem_presente text;

-- Mensagem só existe quando é presente. Sem isto, desmarcar "é presente" com o
-- texto já digitado deixaria um recado órfão que ninguém mais vê na tela — e
-- que alguém acabaria imprimindo no cartão.
alter table public.pedidos drop constraint if exists pedidos_mensagem_so_com_presente;
alter table public.pedidos add constraint pedidos_mensagem_so_com_presente
  check (presente or mensagem_presente is null);


-- ---------------------------------------------------------------------------
-- criar_pedido() ganha os dois parâmetros.
--
-- O corpo é o mesmo da migration do cupom; só a assinatura e o insert mudam.
-- Recriar inteiro (em vez de um patch) é o que mantém a função legível: ela é o
-- lugar onde estoque, preço e desconto são decididos, e ler isso em pedaços
-- espalhados por três arquivos é como se perde o fio.
-- ---------------------------------------------------------------------------
create or replace function public.criar_pedido(
  p_itens             jsonb,
  p_nome              text,
  p_telefone          text default null,
  p_email             text default null,
  p_cep               text default null,
  p_cidade            text default null,
  p_uf                text default null,
  p_observacoes       text default null,
  p_cupom             text default null,
  p_presente          boolean default false,
  p_mensagem_presente text default null
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
  v_presente  boolean := coalesce(p_presente, false);
  -- Mensagem só sobrevive se for presente — a mesma regra do check, aplicada
  -- antes de gravar para a constraint nunca precisar reclamar.
  v_mensagem  text := case when coalesce(p_presente, false)
                           then nullif(trim(coalesce(p_mensagem_presente, '')), '')
                           else null end;
begin
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Falta o nome de quem está comprando.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (
    user_id, nome, email, telefone, cep, cidade, uf,
    origem, status, total_centavos, observacoes, presente, mensagem_presente
  ) values (
    (select auth.uid()),
    trim(p_nome),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_telefone, '')), ''),
    nullif(trim(coalesce(p_cep, '')), ''),
    nullif(trim(coalesce(p_cidade, '')), ''),
    nullif(upper(trim(coalesce(p_uf, ''))), ''),
    'site', 'aguardando_pagamento', 0,
    nullif(trim(coalesce(p_observacoes, '')), ''),
    v_presente, v_mensagem
  )
  returning id, numero into v_pedido_id, v_numero;

  for v_item in
    -- Agrupa por SKU: o mesmo código repetido no carrinho viraria duas baixas
    -- de estoque. Ordem de SKU evita que dois pedidos travem um no outro.
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

-- A assinatura mudou de novo: a anterior precisa sair, senão o PostgREST fica
-- com duas e não sabe qual chamar.
drop function if exists public.criar_pedido(jsonb, text, text, text, text, text, text, text, text);

revoke execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, boolean, text) from public;
grant  execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, boolean, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as quatro linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'colunas de presente' as checagem,
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'pedidos'
                     and column_name in ('presente','mensagem_presente')) = 2
            then 'ok' else 'FALHOU' end as resultado
union all
select 'assinatura nova existe',
       case when to_regprocedure('public.criar_pedido(jsonb,text,text,text,text,text,text,text,text,boolean,text)') is not null
            then 'ok' else 'FALHOU' end
union all
select 'assinatura antiga removida',
       case when to_regprocedure('public.criar_pedido(jsonb,text,text,text,text,text,text,text,text)') is null
            then 'ok' else 'FALHOU' end
union all
select 'mensagem órfã é barrada',
       case when (select count(*) from pg_constraint where conname = 'pedidos_mensagem_so_com_presente') = 1
            then 'ok' else 'FALHOU' end;
