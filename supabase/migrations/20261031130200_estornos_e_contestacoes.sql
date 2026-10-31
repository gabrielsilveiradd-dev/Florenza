-- ============================================================================
-- FLORENZA — ESTORNOS E CONTESTAÇÕES
--
-- POR QUE: estorno e contestação iam só para o log, e um cartão contestado podia
-- ter a peça despachada sem ninguém saber. Agora os dois mudam o estado do
-- pagamento, ficam visíveis no painel, e o estorno sai do painel.
--
-- pagamento_estornos: o pedido de estorno é gravado ANTES da chamada ao PagBank,
-- com quem pediu. A documentação de POST /charges/{id}/cancel não cita chave de
-- idempotência, então a trava contra estornar duas vezes é daqui: um estorno
-- aberto por pedido. Timeout vira 'incerto', sem reenvio automático; a próxima
-- reconciliação compara com o que o PagBank diz.
--
-- pagamento_disputas: a contestação tem identidade própria (CBKS_...,
-- reference/objeto-chargeback), prazo e status, e nem sempre se acha o pedido.
--
-- ESTOQUE: devolver dinheiro não significa que a peça voltou. A regra é da loja
-- (`configuracoes_loja`), e `pedidos.estoque_no_estorno` guarda o que se decidiu,
-- para cancelar o pedido depois não devolver a peça uma segunda vez.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) As tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.pagamento_disputas (
  id              text primary key,
  pedido_id       uuid references public.pedidos(id) on delete set null,
  status          text not null,
  valor_centavos  integer not null default 0 check (valor_centavos >= 0),
  prazo           timestamptz,
  classificacao   text,
  codigo_motivo   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists pagamento_disputas_pedido_idx on public.pagamento_disputas (pedido_id);

drop trigger if exists pagamento_disputas_updated_at on public.pagamento_disputas;
create trigger pagamento_disputas_updated_at
  before update on public.pagamento_disputas
  for each row execute function public.tocar_updated_at();

create table if not exists public.pagamento_estornos (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references public.pedidos(id) on delete cascade,
  cobranca_id      text not null,
  valor_centavos   integer not null check (valor_centavos > 0),
  estornado_antes  integer not null default 0,
  motivo           text,
  status           text not null default 'solicitado' check (status in ('solicitado', 'concluido', 'falhou', 'incerto')),
  devolver_estoque boolean,
  admin_id         uuid references auth.users(id) on delete set null,
  admin_email      text,
  resposta         text,
  created_at       timestamptz not null default now(),
  concluido_em     timestamptz
);

create index if not exists pagamento_estornos_pedido_idx on public.pagamento_estornos (pedido_id, created_at desc);
create index if not exists pagamento_estornos_admin_idx on public.pagamento_estornos (admin_id);
-- O que impede dois estornos ao mesmo tempo, em duas abas ou dois admins.
create unique index if not exists pagamento_estornos_um_aberto_por_pedido
  on public.pagamento_estornos (pedido_id) where status in ('solicitado', 'incerto');

create table if not exists public.configuracoes_loja (
  id                 boolean primary key default true check (id),
  estoque_no_estorno text not null default 'perguntar'
                     check (estoque_no_estorno in ('perguntar', 'devolver', 'nao_devolver')),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null
);
insert into public.configuracoes_loja (id) values (true) on conflict (id) do nothing;
create index if not exists configuracoes_loja_updated_by_idx on public.configuracoes_loja (updated_by);

drop trigger if exists configuracoes_loja_updated_at on public.configuracoes_loja;
create trigger configuracoes_loja_updated_at
  before update on public.configuracoes_loja
  for each row execute function public.tocar_updated_at();

alter table public.pedidos add column if not exists estoque_no_estorno text;
alter table public.pedidos drop constraint if exists pedidos_estoque_no_estorno_check;
alter table public.pedidos add constraint pedidos_estoque_no_estorno_check
  check (estoque_no_estorno in ('devolvido', 'retido'));

alter table public.pagamento_disputas enable row level security;
alter table public.pagamento_estornos enable row level security;
alter table public.configuracoes_loja enable row level security;

drop policy if exists "Admin lê disputas" on public.pagamento_disputas;
create policy "Admin lê disputas" on public.pagamento_disputas
  for select to authenticated using (public.is_admin());

drop policy if exists "Admin lê estornos" on public.pagamento_estornos;
create policy "Admin lê estornos" on public.pagamento_estornos
  for select to authenticated using (public.is_admin());

drop policy if exists "Admin lê configurações" on public.configuracoes_loja;
create policy "Admin lê configurações" on public.configuracoes_loja
  for select to authenticated using (public.is_admin());

drop policy if exists "Admin muda configurações" on public.configuracoes_loja;
create policy "Admin muda configurações" on public.configuracoes_loja
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.pagamento_disputas from anon;
revoke all on public.pagamento_estornos from anon;
revoke all on public.configuracoes_loja from anon;
revoke insert, update, delete on public.pagamento_disputas from authenticated;
revoke insert, update, delete on public.pagamento_estornos from authenticated;
revoke insert, update, delete on public.configuracoes_loja from authenticated;
grant update (estoque_no_estorno, updated_by) on public.configuracoes_loja to authenticated;


-- ---------------------------------------------------------------------------
-- 2) A trigger de estoque respeita o que o estorno já decidiu
--
--    Sem isto, cancelar um pedido estornado devolveria a peça de novo, ou uma
--    que a loja decidiu não repor. Reativar desfaz a decisão: o pedido volta a
--    valer, e só tira do estoque o que tinha voltado para ele.
-- ---------------------------------------------------------------------------
create or replace function public.ajustar_estoque_por_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_falta record;
begin
  if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    if new.estoque_no_estorno is null then
      update public.produtos p
         set estoque = p.estoque + s.qtd
        from (select produto_id, sum(quantidade)::int as qtd
                from public.pedido_itens
               where pedido_id = new.id and produto_id is not null
               group by produto_id) s
       where p.id = s.produto_id;
    end if;

  elsif old.status = 'cancelado' and new.status is distinct from 'cancelado' then
    if new.estoque_no_estorno is distinct from 'retido' then
      select p.nome, p.estoque, s.qtd
        into v_falta
        from (select produto_id, sum(quantidade)::int as qtd
                from public.pedido_itens
               where pedido_id = new.id and produto_id is not null
               group by produto_id) s
        join public.produtos p on p.id = s.produto_id
       where p.estoque < s.qtd
       limit 1;

      if found then
        raise exception 'Não dá para reativar: restam % unidade(s) de % e o pedido pede %.',
          v_falta.estoque, v_falta.nome, v_falta.qtd using errcode = 'P0001';
      end if;

      update public.produtos p
         set estoque = p.estoque - s.qtd
        from (select produto_id, sum(quantidade)::int as qtd
                from public.pedido_itens
               where pedido_id = new.id and produto_id is not null
               group by produto_id) s
       where p.id = s.produto_id;
    end if;

    update public.pedidos p set estoque_no_estorno = null where p.id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function public.ajustar_estoque_por_status() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) O contexto da reconciliação passa a contar disputas e estornos
-- ---------------------------------------------------------------------------
create or replace function public.pagbank_contexto_pedido(p_segredo text, p_pedido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_contexto jsonb;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  select jsonb_build_object(
    'id', p.id,
    'numero', p.numero,
    'status', p.status,
    'estado', p.pagamento_estado,
    'totalCentavos', p.total_centavos,
    'estornadoCentavos', p.estornado_centavos,
    'expiraEm', p.expira_em,
    'estoqueNoEstorno', p.estoque_no_estorno,
    'checkouts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'checkoutId', c.checkout_id, 'status', c.status, 'payUrl', c.pay_url, 'expiraEm', c.expira_em)
             order by c.created_at)
        from public.pagbank_checkouts c where c.pedido_id = p.id), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(o.order_id order by o.created_at)
        from public.pagbank_orders o where o.pedido_id = p.id), '[]'::jsonb),
    'cobrancas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.provedor_pagamento_id, 'status', g.status,
               'valorCentavos', g.valor_centavos, 'estornadoCentavos', g.estornado_centavos))
        from public.pagamentos g where g.pedido_id = p.id), '[]'::jsonb),
    'disputas', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'status', d.status, 'valorCentavos', d.valor_centavos))
        from public.pagamento_disputas d where d.pedido_id = p.id), '[]'::jsonb)
  )
    into v_contexto
    from public.pedidos p
   where p.id = p_pedido_id;

  return v_contexto;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4) Contestação: grava o que o PagBank diz, a mesma resposta não muda nada
-- ---------------------------------------------------------------------------
create or replace function public.pagbank_registrar_disputa(
  p_segredo       text,
  p_id            text,
  p_pedido_id     uuid,
  p_status        text,
  p_valor         integer,
  p_prazo         timestamptz default null,
  p_classificacao text default null,
  p_codigo_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  insert into public.pagamento_disputas as d
    (id, pedido_id, status, valor_centavos, prazo, classificacao, codigo_motivo)
  values
    (p_id, p_pedido_id, p_status, coalesce(p_valor, 0), p_prazo, p_classificacao, p_codigo_motivo)
  on conflict (id) do update
    set pedido_id      = coalesce(d.pedido_id, excluded.pedido_id),
        status         = excluded.status,
        valor_centavos = excluded.valor_centavos,
        prazo          = coalesce(excluded.prazo, d.prazo),
        classificacao  = coalesce(excluded.classificacao, d.classificacao),
        codigo_motivo  = coalesce(excluded.codigo_motivo, d.codigo_motivo)
  where (d.status, d.valor_centavos, d.pedido_id) is distinct from (excluded.status, excluded.valor_centavos, coalesce(d.pedido_id, excluded.pedido_id));
end;
$$;


-- ---------------------------------------------------------------------------
-- 5) O estorno pedido pelo painel
-- ---------------------------------------------------------------------------
create or replace function public.pagbank_iniciar_estorno(
  p_segredo     text,
  p_pedido_id   uuid,
  p_cobranca_id text,
  p_valor       integer,
  p_devolver    boolean,
  p_motivo      text,
  p_admin_id    uuid,
  p_admin_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobranca public.pagamentos;
  v_id       uuid;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  -- A linha do pedido serializa dois estornos concorrentes.
  perform 1 from public.pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  select * into v_cobranca
    from public.pagamentos g
   where g.pedido_id = p_pedido_id and g.provedor_pagamento_id = p_cobranca_id;

  if not found or v_cobranca.status not in ('PAID', 'PARTIALLY_REFUNDED') then
    raise exception 'Só dá para estornar uma cobrança paga deste pedido.' using errcode = 'P0001';
  end if;

  if p_valor is null or p_valor <= 0 or p_valor > v_cobranca.valor_centavos - v_cobranca.estornado_centavos then
    raise exception 'O valor precisa estar entre R$ 0,01 e o que ainda não foi estornado (R$ %).',
      to_char((v_cobranca.valor_centavos - v_cobranca.estornado_centavos) / 100.0, 'FM999G999D00')
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.pagamento_estornos e
     where e.pedido_id = p_pedido_id and e.status in ('solicitado', 'incerto')
  ) then
    raise exception 'Já há um estorno em andamento neste pedido. Reconcilie para ver o resultado.' using errcode = 'P0001';
  end if;

  insert into public.pagamento_estornos
    (pedido_id, cobranca_id, valor_centavos, estornado_antes, motivo, devolver_estoque, admin_id, admin_email)
  values
    (p_pedido_id, p_cobranca_id, p_valor, v_cobranca.estornado_centavos, nullif(trim(p_motivo), ''), p_devolver, p_admin_id, p_admin_email)
  returning id into v_id;

  insert into public.payment_events (chave, origem, tipo, pedido_id, recurso_id, detalhe, processado_em)
  values (format('estorno:%s', v_id), 'painel', 'estorno', p_pedido_id, p_cobranca_id,
          format('%s pediu estorno de R$ %s', coalesce(p_admin_email, 'admin'), to_char(p_valor / 100.0, 'FM999G999D00')),
          now());

  return v_id;
end;
$$;

create or replace function public.pagbank_concluir_estorno(
  p_segredo  text,
  p_id       uuid,
  p_status   text,
  p_resposta text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  update public.pagamento_estornos e
     set status       = p_status,
         resposta     = p_resposta,
         concluido_em = case when p_status in ('concluido', 'falhou') then now() end
   where e.id = p_id;
end;
$$;

-- Estorno 'incerto' (a chamada caiu sem resposta): decide pelo que o PagBank já
-- registrou na cobrança. Depois de 1 hora sem efeito, conta como não realizado.
create or replace function public.pagbank_resolver_estornos_incertos(p_segredo text, p_pedido_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos integer;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  update public.pagamento_estornos e
     set status       = case when g.estornado_centavos >= e.estornado_antes + e.valor_centavos then 'concluido' else 'falhou' end,
         resposta     = coalesce(e.resposta, '') || ' Resolvido pela conferência com o PagBank.',
         concluido_em = now()
    from public.pagamentos g
   where e.pedido_id = p_pedido_id
     and e.status = 'incerto'
     and g.pedido_id = e.pedido_id
     and g.provedor_pagamento_id = e.cobranca_id
     and (g.estornado_centavos >= e.estornado_antes + e.valor_centavos
          or e.created_at < now() - interval '1 hour');

  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6) O estoque depois de um estorno total
--
--    Devolve 'devolvido', 'retido', 'perguntar' (a equipe decide no painel) ou
--    'decidido' (já estava resolvido: rodar de novo não mexe no estoque).
-- ---------------------------------------------------------------------------
create or replace function public.pagbank_decidir_estoque(p_segredo text, p_pedido_id uuid, p_devolver boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  select * into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
  -- Pedido cancelado já devolveu a peça pela trigger.
  if not found or v_pedido.estoque_no_estorno is not null or v_pedido.status = 'cancelado' then
    return 'decidido';
  end if;

  if p_devolver then
    update public.produtos pr
       set estoque = pr.estoque + s.qtd
      from (select produto_id, sum(quantidade)::int as qtd
              from public.pedido_itens
             where pedido_id = p_pedido_id and produto_id is not null
             group by produto_id) s
     where pr.id = s.produto_id;
  end if;

  update public.pedidos p
     set estoque_no_estorno = case when p_devolver then 'devolvido' else 'retido' end
   where p.id = p_pedido_id;

  return case when p_devolver then 'devolvido' else 'retido' end;
end;
$$;

create or replace function public.pagbank_estoque_apos_estorno(p_segredo text, p_pedido_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decisao boolean;
  v_regra   text;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  -- O que quem pediu o estorno escolheu vale mais que a regra geral.
  select e.devolver_estoque into v_decisao
    from public.pagamento_estornos e
   where e.pedido_id = p_pedido_id and e.status = 'concluido' and e.devolver_estoque is not null
   order by e.created_at desc
   limit 1;

  if v_decisao is null then
    select c.estoque_no_estorno into v_regra from public.configuracoes_loja c limit 1;
    if coalesce(v_regra, 'perguntar') = 'perguntar' then
      return case when exists (
        select 1 from public.pedidos p
         where p.id = p_pedido_id and p.estoque_no_estorno is null and p.status <> 'cancelado'
      ) then 'perguntar' else 'decidido' end;
    end if;
    v_decisao := v_regra = 'devolver';
  end if;

  return public.pagbank_decidir_estoque(p_segredo, p_pedido_id, v_decisao);
end;
$$;


-- ---------------------------------------------------------------------------
-- 7) A fila do job inclui estorno sem resposta
-- ---------------------------------------------------------------------------
create or replace function public.pagbank_pedidos_a_reconciliar(p_segredo text, p_limite integer)
returns table (pedido_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  return query
    select p.id
      from public.pedidos p
     where exists (select 1 from public.pagbank_checkouts c where c.pedido_id = p.id)
       and (
         (p.status = 'aguardando_pagamento' and p.pagamento_estado in ('pending', 'declined'))
         or p.pagamento_estado = 'in_dispute'
         or exists (select 1 from public.pagamento_estornos e where e.pedido_id = p.id and e.status = 'incerto')
         or (p.pagamento_estado in ('paid', 'partially_refunded', 'expired')
             and p.created_at > now() - interval '30 days'
             and (p.reconciliado_em is null or p.reconciliado_em < now() - interval '6 hours'))
       )
     order by p.reconciliado_em nulls first
     limit greatest(p_limite, 0);
end;
$$;

do $$
declare
  v_assinatura text;
begin
  foreach v_assinatura in array array[
    'pagbank_registrar_disputa(text, text, uuid, text, integer, timestamptz, text, text)',
    'pagbank_iniciar_estorno(text, uuid, text, integer, boolean, text, uuid, text)',
    'pagbank_concluir_estorno(text, uuid, text, text)',
    'pagbank_resolver_estornos_incertos(text, uuid)',
    'pagbank_decidir_estoque(text, uuid, boolean)',
    'pagbank_estoque_apos_estorno(text, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', v_assinatura);
    execute format('grant execute on function public.%s to anon, authenticated', v_assinatura);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'RLS em disputas, estornos e configurações' as checagem,
       case when (select bool_and(relrowsecurity) from pg_class
                   where oid in ('public.pagamento_disputas'::regclass, 'public.pagamento_estornos'::regclass, 'public.configuracoes_loja'::regclass))
            then 'ok' else 'FALHOU' end as resultado
union all
select 'um estorno aberto por pedido',
       case when to_regclass('public.pagamento_estornos_um_aberto_por_pedido') is not null then 'ok' else 'FALHOU' end
union all
select 'regra de estoque criada',
       case when exists (select 1 from public.configuracoes_loja) then 'ok' else 'FALHOU' end
union all
select 'ninguém grava estorno pela API',
       case when has_table_privilege('authenticated', 'public.pagamento_estornos', 'INSERT') then 'FALHOU' else 'ok' end
union all
select 'visitante não lê configuração',
       case when has_table_privilege('anon', 'public.configuracoes_loja', 'SELECT') then 'FALHOU' else 'ok' end;
