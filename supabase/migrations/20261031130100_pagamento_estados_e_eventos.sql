-- ============================================================================
-- FLORENZA — ESTADO DO PAGAMENTO, EVENTOS E RECONCILIAÇÃO
--
-- POR QUE: o site só sabia de um pagamento quando o webhook chegava. Webhook se
-- perde, e aí um pedido pago expirava. Agora três caminhos (webhook, página do
-- pedido e job) convergem para a mesma reconciliação, que pergunta ao PagBank.
--
-- ESTADO DO PAGAMENTO É COLUNA NOVA, NÃO `pedidos.status`. Aquele status controla
-- estoque, cupom e as etapas de entrega; um estorno parcial não muda nada disso.
-- `pagamento_estado` é uma máquina de estados explícita, e a trigger recusa
-- transição inválida. Nulo = pedido sem pagamento online (venda manual, WhatsApp).
-- A tabela de transições é espelhada em lib/pagamento/estados.ts.
--
-- A EXPIRAÇÃO MUDA: `expirar_pedidos_vencidos()` cancelava às cegas pelo relógio.
-- Pedido com checkout agora só expira pela reconciliação, depois de consultar o
-- PagBank. Pedido sem checkout (acerto por WhatsApp) segue como sempre.
--
-- ORDEM DE PUBLICAÇÃO: esta migration ANTES do código, que pede `pagamento_estado`
-- nas consultas da conta.
--
-- O JOB: precisa do pg_net e de dois segredos no Vault ('florenza_job_url' e
-- 'florenza_job_pagbank'). Sem eles o agendamento roda e não faz nada — DEPLOY.md.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) A máquina de estados
-- ---------------------------------------------------------------------------
alter table public.pedidos add column if not exists pagamento_estado text;
alter table public.pedidos add column if not exists pagamento_estado_em timestamptz;
alter table public.pedidos add column if not exists reconciliado_em timestamptz;
alter table public.pedidos add column if not exists estornado_centavos integer not null default 0;
alter table public.pedidos add column if not exists estornado_em timestamptz;

alter table public.pedidos drop constraint if exists pedidos_pagamento_estado_check;
alter table public.pedidos add constraint pedidos_pagamento_estado_check check (
  pagamento_estado in ('pending', 'paid', 'declined', 'expired', 'refunded', 'partially_refunded', 'in_dispute')
);
alter table public.pedidos drop constraint if exists pedidos_estornado_centavos_check;
alter table public.pedidos add constraint pedidos_estornado_centavos_check check (estornado_centavos >= 0);

-- A fila do job varre por aqui.
create index if not exists pedidos_pagamento_estado_idx
  on public.pedidos (pagamento_estado, reconciliado_em) where pagamento_estado is not null;

create or replace function public.pagamento_transicao_valida(p_de text, p_para text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_de
    when 'pending'            then p_para in ('paid', 'declined', 'expired')
    when 'declined'           then p_para in ('pending', 'paid', 'expired')
    when 'expired'            then p_para in ('paid')
    when 'paid'               then p_para in ('partially_refunded', 'refunded', 'in_dispute')
    when 'partially_refunded' then p_para in ('refunded', 'in_dispute')
    when 'in_dispute'         then p_para in ('paid', 'partially_refunded', 'refunded')
    when 'refunded'           then p_para in ('in_dispute')
    else false
  end;
$$;

revoke execute on function public.pagamento_transicao_valida(text, text) from public, anon, authenticated;

create or replace function public.pedidos_conferir_estado_do_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pagamento_estado is not distinct from old.pagamento_estado then
    return new;
  end if;

  -- Sair de um estado para "nenhum" apagaria a história do pagamento.
  if new.pagamento_estado is null
     or (old.pagamento_estado is not null
         and not public.pagamento_transicao_valida(old.pagamento_estado, new.pagamento_estado)) then
    raise exception 'Transição de pagamento inválida: % para %.', old.pagamento_estado, new.pagamento_estado
      using errcode = 'P0001';
  end if;

  new.pagamento_estado_em := now();
  return new;
end;
$$;

revoke execute on function public.pedidos_conferir_estado_do_pagamento() from public, anon, authenticated;

drop trigger if exists pedidos_confere_estado_do_pagamento on public.pedidos;
create trigger pedidos_confere_estado_do_pagamento
  before update of pagamento_estado on public.pedidos
  for each row execute function public.pedidos_conferir_estado_do_pagamento();


-- ---------------------------------------------------------------------------
-- 2) payment_events — tudo o que chegou, como chegou
--
--    `chave` é a idempotência: o hash do corpo cru, para aviso repetido virar a
--    mesma linha. `processado_em` nulo = ainda por fazer; o job tenta de novo.
--    `alerta` é o que precisa de gente olhando.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id                  uuid primary key default gen_random_uuid(),
  chave               text not null,
  origem              text not null check (origem in ('webhook', 'job', 'pagina', 'painel', 'sistema')),
  tipo                text not null check (tipo in ('pagamento', 'estorno', 'contestacao', 'pos_transacao', 'transicao', 'alerta', 'unknown')),
  pedido_id           uuid references public.pedidos(id) on delete set null,
  recurso_id          text,
  assinatura          text,
  corpo               text,
  detalhe             text,
  alerta              text,
  alerta_resolvido_em timestamptz,
  processado_em       timestamptz,
  erro                text,
  tentativas          integer not null default 0,
  created_at          timestamptz not null default now()
);

create unique index if not exists payment_events_chave_key on public.payment_events (chave);
create index if not exists payment_events_pedido_idx on public.payment_events (pedido_id, created_at desc);
create index if not exists payment_events_a_processar_idx on public.payment_events (created_at) where processado_em is null;
create index if not exists payment_events_alertas_idx on public.payment_events (created_at desc)
  where alerta is not null and alerta_resolvido_em is null;

alter table public.payment_events enable row level security;

drop policy if exists "Admin lê eventos de pagamento" on public.payment_events;
create policy "Admin lê eventos de pagamento" on public.payment_events
  for select to authenticated using (public.is_admin());

drop policy if exists "Admin resolve alertas" on public.payment_events;
create policy "Admin resolve alertas" on public.payment_events
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- RLS decide linha, não coluna: no evento, o admin só carimba o alerta como
-- resolvido. O registro do que o PagBank disse não se reescreve.
revoke insert, update, delete on public.payment_events from anon, authenticated;
revoke select on public.payment_events from anon;
grant update (alerta_resolvido_em) on public.payment_events to authenticated;


-- ---------------------------------------------------------------------------
-- 3) registrar_pagamento() ganha o valor estornado
--
--    Estorno parcial não muda o status no PagBank: a cobrança segue PAID, e só
--    `amount.summary.refunded` conta a história (page/passo-a-passo-devolvendo-
--    uma-cobrança-paga). lib/pagamento/pagbank.ts traduz para REFUNDED ou
--    PARTIALLY_REFUNDED.
-- ---------------------------------------------------------------------------
alter table public.pagamentos add column if not exists estornado_centavos integer not null default 0;
alter table public.pagamentos add column if not exists order_id text;
create index if not exists pagamentos_order_idx on public.pagamentos (order_id);

drop function if exists public.registrar_pagamento(text, uuid, text, text, integer, text, text, integer, timestamptz);

create or replace function public.registrar_pagamento(
  p_segredo               text,
  p_pedido_id             uuid,
  p_provedor_pagamento_id text,
  p_status                text,
  p_valor_centavos        integer,
  p_status_detalhe        text        default null,
  p_metodo                text        default null,
  p_parcelas              integer     default null,
  p_aprovado_em           timestamptz default null,
  p_estornado_centavos    integer     default 0,
  p_order_id              text        default null
)
returns table (
  pedido_numero         bigint,
  pedido_status         text,
  pedido_nome           text,
  pedido_email          text,
  pedido_telefone       text,
  pedido_total_centavos integer,
  promovido             boolean,
  pendencia             text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido    public.pedidos;
  v_existente public.pagamentos;
  v_promovido boolean := false;
  v_pendencia text;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  if coalesce(p_provedor_pagamento_id, '') = '' or coalesce(p_status, '') = ''
     or p_valor_centavos is null or p_valor_centavos < 0 then
    raise exception 'Pagamento sem identificação, status ou valor.' using errcode = '22023';
  end if;

  select * into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido % não existe.', p_pedido_id using errcode = 'P0001';
  end if;

  select * into v_existente
    from public.pagamentos g
   where g.provedor = 'pagbank' and g.provedor_pagamento_id = p_provedor_pagamento_id
     for update;

  if found and v_existente.pedido_id <> p_pedido_id then
    raise exception 'O pagamento % pertence a outro pedido.', p_provedor_pagamento_id using errcode = 'P0001';
  end if;

  insert into public.pagamentos as g (
    pedido_id, provedor, provedor_pagamento_id, status, status_detalhe,
    metodo, valor_centavos, parcelas, aprovado_em, estornado_centavos, order_id
  ) values (
    p_pedido_id, 'pagbank', p_provedor_pagamento_id, p_status, p_status_detalhe,
    p_metodo, p_valor_centavos, p_parcelas, p_aprovado_em, coalesce(p_estornado_centavos, 0), p_order_id
  )
  on conflict (provedor, provedor_pagamento_id) do update
    set status = case
                   when g.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
                    and excluded.status in ('WAITING', 'IN_ANALYSIS', 'AUTHORIZED')
                   then g.status
                   else excluded.status
                 end,
        status_detalhe     = excluded.status_detalhe,
        metodo             = coalesce(excluded.metodo, g.metodo),
        valor_centavos     = excluded.valor_centavos,
        parcelas           = coalesce(excluded.parcelas, g.parcelas),
        aprovado_em        = coalesce(excluded.aprovado_em, g.aprovado_em),
        estornado_centavos = greatest(excluded.estornado_centavos, g.estornado_centavos),
        order_id           = coalesce(excluded.order_id, g.order_id);

  if p_status in ('PAID', 'PARTIALLY_REFUNDED') then
    if p_valor_centavos < v_pedido.total_centavos then
      v_pendencia := format(
        'Valor aprovado (R$ %s) menor que o total do pedido (R$ %s). Conferir antes de enviar.',
        to_char(p_valor_centavos / 100.0, 'FM999G999D00'),
        to_char(v_pedido.total_centavos / 100.0, 'FM999G999D00')
      );

    elsif v_pedido.status = 'aguardando_pagamento' then
      update public.pedidos p set status = 'pago' where p.id = p_pedido_id;
      v_promovido := true;

    elsif v_pedido.status = 'cancelado' and p_status = 'PAID' and v_pedido.estornado_centavos = 0 then
      -- Bloco com exceção = subtransação: se a trigger de estoque recusar, só a
      -- tentativa de reativar volta; o registro do pagamento acima fica.
      begin
        update public.pedidos p set status = 'pago' where p.id = p_pedido_id;
        v_promovido := true;
      exception when sqlstate 'P0001' then
        v_pendencia := 'Pagamento aprovado depois de a reserva expirar, e a peça já não tem estoque. '
                    || 'Estornar no PagBank, ou repor a peça e reativar o pedido.';
      end;
    end if;
  end if;

  update public.pagamentos g
     set pendencia = v_pendencia
   where g.provedor = 'pagbank' and g.provedor_pagamento_id = p_provedor_pagamento_id;

  select * into v_pedido from public.pedidos p where p.id = p_pedido_id;

  return query select v_pedido.numero, v_pedido.status, v_pedido.nome, v_pedido.email,
                      v_pedido.telefone, v_pedido.total_centavos, v_promovido, v_pendencia;
end;
$$;

revoke execute on function public.registrar_pagamento(text, uuid, text, text, integer, text, text, integer, timestamptz, integer, text) from public;
grant  execute on function public.registrar_pagamento(text, uuid, text, text, integer, text, text, integer, timestamptz, integer, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) As funções da reconciliação. Todas exigem o segredo.
-- ---------------------------------------------------------------------------

-- Checkout novo põe o pedido em 'pending' (e tira de 'declined', na nova tentativa).
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

  update public.pedidos p
     set pagamento_estado = 'pending'
   where p.id = p_pedido_id and (p.pagamento_estado is null or p.pagamento_estado = 'declined');
end;
$$;

-- Tudo o que a reconciliação precisa saber do pedido, numa leitura só.
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
    'checkouts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'checkoutId', c.checkout_id, 'status', c.status, 'payUrl', c.pay_url, 'expiraEm', c.expira_em)
             order by c.created_at)
        from public.pagbank_checkouts c where c.pedido_id = p.id), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(o.order_id order by o.created_at)
        from public.pagbank_orders o where o.pedido_id = p.id), '[]'::jsonb),
    'cobrancas', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.provedor_pagamento_id, 'status', g.status))
        from public.pagamentos g where g.pedido_id = p.id), '[]'::jsonb)
  )
    into v_contexto
    from public.pedidos p
   where p.id = p_pedido_id;

  return v_contexto;
end;
$$;

-- O pedido por qualquer um dos identificadores que podem chegar num aviso.
create or replace function public.pagbank_achar_pedido(
  p_segredo     text,
  p_numero      bigint default null,
  p_checkout_id text   default null,
  p_order_id    text   default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  if p_order_id is not null then
    select o.pedido_id into v_id from public.pagbank_orders o where o.order_id = p_order_id;
  end if;
  if v_id is null and p_checkout_id is not null then
    select c.pedido_id into v_id from public.pagbank_checkouts c where c.checkout_id = p_checkout_id;
  end if;
  if v_id is null and p_numero is not null then
    select p.id into v_id from public.pedidos p where p.numero = p_numero;
  end if;

  return v_id;
end;
$$;

-- Limita as consultas ao PagBank: `false` = outra reconciliação rodou há pouco.
create or replace function public.pagbank_reservar_reconciliacao(
  p_segredo   text,
  p_pedido_id uuid,
  p_segundos  integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  update public.pedidos p
     set reconciliado_em = now()
   where p.id = p_pedido_id
     and (p.reconciliado_em is null or p.reconciliado_em <= now() - make_interval(secs => p_segundos));

  return found;
end;
$$;

-- Idempotente: a mesma chave devolve a linha que já existe, sem mudar nada.
create or replace function public.pagbank_registrar_evento(
  p_segredo    text,
  p_chave      text,
  p_origem     text,
  p_tipo       text,
  p_pedido_id  uuid default null,
  p_recurso_id text default null,
  p_assinatura text default null,
  p_corpo      text default null,
  p_detalhe    text default null,
  p_alerta     text default null,
  p_processado boolean default false
)
returns table (evento_id uuid, novo boolean, processado boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  insert into public.payment_events
    (chave, origem, tipo, pedido_id, recurso_id, assinatura, corpo, detalhe, alerta, processado_em)
  values
    (p_chave, p_origem, p_tipo, p_pedido_id, p_recurso_id, p_assinatura, p_corpo, p_detalhe, p_alerta,
     case when p_processado then now() end)
  on conflict (chave) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true, p_processado;
    return;
  end if;

  return query
    select e.id, false, e.processado_em is not null
      from public.payment_events e where e.chave = p_chave;
end;
$$;

create or replace function public.pagbank_concluir_evento(
  p_segredo   text,
  p_evento_id uuid,
  p_pedido_id uuid default null,
  p_tipo      text default null,
  p_erro      text default null,
  p_alerta    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  update public.payment_events e
     set pedido_id     = coalesce(p_pedido_id, e.pedido_id),
         tipo          = coalesce(p_tipo, e.tipo),
         alerta        = coalesce(p_alerta, e.alerta),
         erro          = p_erro,
         tentativas    = e.tentativas + 1,
         processado_em = case when p_erro is null then now() end
   where e.id = p_evento_id;
end;
$$;

-- A transição é conferida aqui para virar resposta, não erro: a reconciliação
-- precisa saber que foi recusada, registrar e seguir para o próximo pedido.
create or replace function public.pagbank_aplicar_estado(
  p_segredo   text,
  p_pedido_id uuid,
  p_estado    text,
  p_estornado integer default null,
  p_origem    text default 'sistema'
)
returns table (mudou boolean, rejeitada boolean, anterior text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
  v_mudou  boolean := false;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  select * into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido % não existe.', p_pedido_id using errcode = 'P0001';
  end if;

  if p_estado is distinct from v_pedido.pagamento_estado then
    if v_pedido.pagamento_estado is not null
       and not public.pagamento_transicao_valida(v_pedido.pagamento_estado, p_estado) then
      return query select false, true, v_pedido.pagamento_estado;
      return;
    end if;

    update public.pedidos p set pagamento_estado = p_estado where p.id = p_pedido_id;
    v_mudou := true;
  end if;

  if p_estornado is not null and p_estornado <> v_pedido.estornado_centavos then
    update public.pedidos p
       set estornado_centavos = p_estornado, estornado_em = now()
     where p.id = p_pedido_id;
    v_mudou := true;
  end if;

  -- O histórico da ficha. A chave faz a mesma mudança contar uma vez só.
  if v_mudou then
    insert into public.payment_events (chave, origem, tipo, pedido_id, detalhe, processado_em)
    values (
      format('transicao:%s:%s:%s:%s', p_pedido_id, coalesce(v_pedido.pagamento_estado, 'nenhum'), p_estado, coalesce(p_estornado, 0)),
      p_origem, 'transicao', p_pedido_id,
      format('%s → %s', coalesce(v_pedido.pagamento_estado, 'nenhum'), p_estado),
      now()
    )
    on conflict (chave) do nothing;
  end if;

  return query select v_mudou, false, v_pedido.pagamento_estado;
end;
$$;

-- A trava final: mesmo com a reconciliação errada, pagamento registrado aqui
-- impede expirar. Devolve false sem mudar nada.
create or replace function public.pagbank_expirar_pedido(p_segredo text, p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  select * into v_pedido from public.pedidos p where p.id = p_pedido_id for update;
  if not found or v_pedido.status <> 'aguardando_pagamento' then
    return false;
  end if;

  if exists (
    select 1 from public.pagamentos g
     where g.pedido_id = p_pedido_id
       and g.status in ('PAID', 'PARTIALLY_REFUNDED', 'IN_ANALYSIS', 'AUTHORIZED')
  ) then
    return false;
  end if;

  update public.pedidos p
     set status              = 'cancelado',
         motivo_cancelamento = 'Reserva expirada sem pagamento.',
         pagamento_estado    = 'expired'
   where p.id = p_pedido_id;

  update public.pagbank_checkouts c
     set status = 'EXPIRED'
   where c.pedido_id = p_pedido_id and c.status = 'ACTIVE';

  insert into public.payment_events (chave, origem, tipo, pedido_id, detalhe, processado_em)
  values (format('transicao:%s:expirado', p_pedido_id), 'job', 'transicao', p_pedido_id,
          format('%s → expired', coalesce(v_pedido.pagamento_estado, 'nenhum')), now())
  on conflict (chave) do nothing;

  return true;
end;
$$;

-- A fila do job. Pendentes primeiro; pago recente de vez em quando, porque um
-- estorno feito no painel do PagBank com o aviso perdido também precisa aparecer.
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
         or (p.pagamento_estado in ('paid', 'partially_refunded', 'expired')
             and p.created_at > now() - interval '30 days'
             and (p.reconciliado_em is null or p.reconciliado_em < now() - interval '6 hours'))
       )
     order by p.reconciliado_em nulls first
     limit greatest(p_limite, 0);
end;
$$;

create or replace function public.pagbank_eventos_a_processar(p_segredo text, p_limite integer)
returns table (evento_id uuid, corpo text, assinatura text, recurso_id text, tipo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  return query
    select e.id, e.corpo, e.assinatura, e.recurso_id, e.tipo
      from public.payment_events e
     where e.processado_em is null
       and e.origem = 'webhook'
       and e.tentativas < 10
       and e.created_at < now() - interval '1 minute'
     order by e.created_at
     limit greatest(p_limite, 0);
end;
$$;

do $$
declare
  v_assinatura text;
begin
  foreach v_assinatura in array array[
    'pagbank_contexto_pedido(text, uuid)',
    'pagbank_achar_pedido(text, bigint, text, text)',
    'pagbank_reservar_reconciliacao(text, uuid, integer)',
    'pagbank_registrar_evento(text, text, text, text, uuid, text, text, text, text, text, boolean)',
    'pagbank_concluir_evento(text, uuid, uuid, text, text, text)',
    'pagbank_aplicar_estado(text, uuid, text, integer, text)',
    'pagbank_expirar_pedido(text, uuid)',
    'pagbank_pedidos_a_reconciliar(text, integer)',
    'pagbank_eventos_a_processar(text, integer)'
  ] loop
    execute format('revoke execute on function public.%s from public', v_assinatura);
    execute format('grant execute on function public.%s to anon, authenticated', v_assinatura);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5) A expiração às cegas deixa de valer para quem tem checkout
-- ---------------------------------------------------------------------------
create or replace function public.expirar_pedidos_vencidos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos integer;
begin
  with vencidos as (
    select p.id
      from public.pedidos p
     where p.status = 'aguardando_pagamento'
       and p.expira_em is not null
       and p.expira_em < now()
       and not exists (select 1 from public.pagbank_checkouts c where c.pedido_id = p.id)
     order by p.id
       for update of p skip locked
  )
  update public.pedidos p
     set status              = 'cancelado',
         motivo_cancelamento = 'Reserva expirada sem pagamento.'
    from vencidos v
   where p.id = v.id;

  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

revoke execute on function public.expirar_pedidos_vencidos() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 6) O job: a cada 5 minutos o banco chama o site, que consulta o PagBank
--
--    Por que não uma Edge Function: ela exigiria o token do PagBank num segundo
--    lugar e uma service-role key, que este projeto não usa. A Vercel Hobby só
--    agenda 1x por dia; o pg_cron agenda, e o site faz o trabalho.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;

create or replace function public.pagbank_disparar_reconciliacao()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_segredo text;
begin
  select s.decrypted_secret into v_url
    from vault.decrypted_secrets s where s.name = 'florenza_job_url' limit 1;
  select s.decrypted_secret into v_segredo
    from vault.decrypted_secrets s where s.name = 'florenza_job_pagbank' limit 1;

  if v_url is null or v_segredo is null or to_regnamespace('net') is null then
    return;
  end if;

  -- plpgsql resolve só ao rodar: sem pg_net o `return` acima já saiu.
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-florenza-job', v_segredo),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke execute on function public.pagbank_disparar_reconciliacao() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule(
      'florenza-reconciliar-pagbank',
      '*/5 * * * *',
      'select public.pagbank_disparar_reconciliacao()'
    );
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'RLS em payment_events' as checagem,
       case when (select relrowsecurity from pg_class where oid = 'public.payment_events'::regclass)
            then 'ok' else 'FALHOU' end as resultado
union all
select 'trigger de transição de pagamento',
       case when exists (select 1 from pg_trigger where tgname = 'pedidos_confere_estado_do_pagamento')
            then 'ok' else 'FALHOU' end
union all
select 'chave de idempotência dos eventos',
       case when to_regclass('public.payment_events_chave_key') is not null then 'ok' else 'FALHOU' end
union all
select 'ninguém grava evento pela API',
       case when has_table_privilege('authenticated', 'public.payment_events', 'INSERT') then 'FALHOU' else 'ok' end
union all
select 'função de trigger sem EXECUTE',
       case when has_function_privilege('anon', 'public.pedidos_conferir_estado_do_pagamento()', 'EXECUTE')
            then 'FALHOU' else 'ok' end
union all
select 'pg_net ligado',
       case when to_regnamespace('net') is not null then 'ok' else 'PENDENTE — habilitar em Database → Extensions' end
union all
select 'job com endereço e segredo',
       case when to_regclass('vault.decrypted_secrets') is null then 'PENDENTE'
            when (select count(*) from vault.decrypted_secrets
                   where name in ('florenza_job_url', 'florenza_job_pagbank')) = 2 then 'ok'
            else 'PENDENTE — ver DEPLOY.md, "Ligar o PagBank"' end;
