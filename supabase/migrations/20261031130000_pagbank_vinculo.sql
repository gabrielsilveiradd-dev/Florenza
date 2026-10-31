-- ============================================================================
-- FLORENZA — VÍNCULO PEDIDO ↔ PAGBANK PELO ID QUE O PAGBANK DEVOLVE
--
-- POR QUE: até aqui o site só reencontrava o pedido se o PagBank devolvesse o
-- nosso `reference_id` na order, e a documentação não garante isso. Na criação
-- do checkout o PagBank responde com um id (`CHEC_...`): esse id, salvo aqui,
-- passa a ser a chave do vínculo. O `reference_id` continua indo, como redundância.
--
-- POR QUE TABELA, E NÃO COLUNA EM `pedidos`: um pedido pode ter mais de uma
-- tentativa (a reserva dura 48 h, o cartão pode ser recusado). Coluna guardaria
-- só a última, e um pagamento feito no checkout anterior ficaria órfão.
--
-- O id da order (`ORDE_...`) só nasce quando a pessoa paga, por isso outra tabela:
-- a documentação não diz que um checkout gera uma order só.
--
-- ESCRITA: ninguém pela API. Só as funções abaixo, que exigem o segredo do Vault
-- ('florenza_pagamentos') — o mesmo modelo de registrar_pagamento(), sem
-- service-role key.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) O segredo, num lugar só. Sem EXECUTE para ninguém: quem chama são as
--    funções security definer deste schema, que rodam como o dono.
-- ---------------------------------------------------------------------------
create or replace function public.pagbank_exigir_segredo(p_segredo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_segredo text;
begin
  select s.decrypted_secret into v_segredo
    from vault.decrypted_secrets s
   where s.name = 'florenza_pagamentos'
   limit 1;

  if v_segredo is null or length(v_segredo) < 32 then
    raise exception 'Pagamentos não configurados no banco (falta o segredo florenza_pagamentos no Vault).'
      using errcode = '55000';
  end if;

  if p_segredo is null or p_segredo <> v_segredo then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.pagbank_exigir_segredo(text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2) As tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.pagbank_checkouts (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  checkout_id text not null,
  pay_url     text not null,
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'EXPIRED')),
  expira_em   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists pagbank_checkouts_checkout_id_key on public.pagbank_checkouts (checkout_id);
create index if not exists pagbank_checkouts_pedido_idx on public.pagbank_checkouts (pedido_id);
-- No máximo um checkout ativo por pedido: é o que impede pagar duas vezes por
-- corrida entre duas abas.
create unique index if not exists pagbank_checkouts_um_ativo_por_pedido
  on public.pagbank_checkouts (pedido_id) where status = 'ACTIVE';

drop trigger if exists pagbank_checkouts_updated_at on public.pagbank_checkouts;
create trigger pagbank_checkouts_updated_at
  before update on public.pagbank_checkouts
  for each row execute function public.tocar_updated_at();

create table if not exists public.pagbank_orders (
  order_id    text primary key,
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  checkout_id text references public.pagbank_checkouts(checkout_id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists pagbank_orders_pedido_idx on public.pagbank_orders (pedido_id);
create index if not exists pagbank_orders_checkout_idx on public.pagbank_orders (checkout_id);

alter table public.pagbank_checkouts enable row level security;
alter table public.pagbank_orders enable row level security;

-- Cliente não lê: o link de pagamento chega a ele pelo servidor, depois de a RLS
-- de `pedidos` confirmar que o pedido é dele.
drop policy if exists "Admin lê checkouts" on public.pagbank_checkouts;
create policy "Admin lê checkouts" on public.pagbank_checkouts
  for select to authenticated using (public.is_admin());

drop policy if exists "Admin lê orders" on public.pagbank_orders;
create policy "Admin lê orders" on public.pagbank_orders
  for select to authenticated using (public.is_admin());

revoke insert, update, delete on public.pagbank_checkouts from anon, authenticated;
revoke insert, update, delete on public.pagbank_orders from anon, authenticated;
revoke select on public.pagbank_checkouts from anon;
revoke select on public.pagbank_orders from anon;


-- ---------------------------------------------------------------------------
-- 3) As funções de escrita
-- ---------------------------------------------------------------------------
create or replace function public.pagbank_vincular_checkout(
  p_segredo     text,
  p_pedido_id   uuid,
  p_checkout_id text,
  p_pay_url     text,
  p_expira_em   timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  insert into public.pagbank_checkouts (pedido_id, checkout_id, pay_url, expira_em)
  values (p_pedido_id, p_checkout_id, p_pay_url, p_expira_em)
  on conflict (checkout_id) do nothing;
end;
$$;

create or replace function public.pagbank_atualizar_checkout(
  p_segredo     text,
  p_checkout_id text,
  p_status      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  update public.pagbank_checkouts c
     set status = p_status
   where c.checkout_id = p_checkout_id and c.status <> p_status;
end;
$$;

-- Idempotente: a mesma order avisada de novo não muda nada. A mesma order em
-- outro pedido é recusada, porque seria pagamento creditado no pedido errado.
create or replace function public.pagbank_vincular_order(
  p_segredo     text,
  p_pedido_id   uuid,
  p_order_id    text,
  p_checkout_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dono uuid;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  insert into public.pagbank_orders (order_id, pedido_id, checkout_id)
  values (p_order_id, p_pedido_id, p_checkout_id)
  on conflict (order_id) do nothing;

  select o.pedido_id into v_dono from public.pagbank_orders o where o.order_id = p_order_id;
  if v_dono <> p_pedido_id then
    raise exception 'A order % pertence a outro pedido.', p_order_id using errcode = 'P0001';
  end if;
end;
$$;

-- `anon` executa porque o webhook chega sem sessão. A proteção é o segredo,
-- conferido na primeira linha.
revoke execute on function public.pagbank_vincular_checkout(text, uuid, text, text, timestamptz) from public;
grant  execute on function public.pagbank_vincular_checkout(text, uuid, text, text, timestamptz) to anon, authenticated;
revoke execute on function public.pagbank_atualizar_checkout(text, text, text) from public;
grant  execute on function public.pagbank_atualizar_checkout(text, text, text) to anon, authenticated;
revoke execute on function public.pagbank_vincular_order(text, uuid, text, text) from public;
grant  execute on function public.pagbank_vincular_order(text, uuid, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'RLS em pagbank_checkouts' as checagem,
       case when (select relrowsecurity from pg_class where oid = 'public.pagbank_checkouts'::regclass)
            then 'ok' else 'FALHOU' end as resultado
union all
select 'RLS em pagbank_orders',
       case when (select relrowsecurity from pg_class where oid = 'public.pagbank_orders'::regclass)
            then 'ok' else 'FALHOU' end
union all
select 'índice único no id do checkout',
       case when to_regclass('public.pagbank_checkouts_checkout_id_key') is not null then 'ok' else 'FALHOU' end
union all
select 'um checkout ativo por pedido',
       case when to_regclass('public.pagbank_checkouts_um_ativo_por_pedido') is not null then 'ok' else 'FALHOU' end
union all
select 'ninguém grava vínculo pela API',
       case when has_table_privilege('authenticated', 'public.pagbank_checkouts', 'INSERT')
              or has_table_privilege('authenticated', 'public.pagbank_orders', 'INSERT')
            then 'FALHOU' else 'ok' end
union all
select 'segredo não é chamável de fora',
       case when has_function_privilege('anon', 'public.pagbank_exigir_segredo(text)', 'EXECUTE')
            then 'FALHOU' else 'ok' end;
