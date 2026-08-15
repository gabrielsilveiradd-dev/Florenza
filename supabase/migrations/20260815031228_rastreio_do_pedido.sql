-- Rastreio e datas do pedido.
--
-- A tela de acompanhamento do cliente precisa responder três perguntas: em que
-- etapa está, quando mudou de etapa, e por onde a peça vai chegar. As duas
-- primeiras o `status` sozinho não responde — ele diz o AGORA e esquece o
-- quando, e "enviado há dois dias" é informação diferente de "enviado".
alter table public.pedidos add column if not exists codigo_rastreio text;
alter table public.pedidos add column if not exists transportadora   text;
alter table public.pedidos add column if not exists pago_em          timestamptz;
alter table public.pedidos add column if not exists enviado_em       timestamptz;
alter table public.pedidos add column if not exists entregue_em      timestamptz;

-- As datas são carimbadas pelo banco, não digitadas no painel.
--
-- Data de etapa preenchida à mão erra: alguém marca "enviado" na segunda e só
-- lembra de anotar a data na quarta. Aqui a data nasce do próprio ato de mudar
-- o status, e é a mesma que o cliente vê.
--
-- `is distinct from` e não `<>` porque o status anterior pode ser nulo em
-- teoria, e `null <> 'pago'` é null, não true — a condição nunca dispararia.
create or replace function public.carimbar_etapas_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pago'     and new.pago_em     is null then new.pago_em     := now(); end if;
    if new.status = 'enviado'  and new.enviado_em  is null then new.enviado_em  := now(); end if;
    if new.status = 'entregue' and new.entregue_em is null then new.entregue_em := now(); end if;
  end if;
  return new;
end;
$$;

-- Mesma razão das outras funções de trigger: sem EXECUTE, senão o PostgREST a
-- publica em /rest/v1/rpc/. Revogar não desliga a trigger — o Postgres confere
-- essa permissão ao criar a trigger, não a cada disparo.
revoke execute on function public.carimbar_etapas_do_pedido() from public, anon, authenticated;

-- BEFORE, e não AFTER: a função escreve em `new`, e depois do UPDATE já
-- gravado isso não teria efeito nenhum.
drop trigger if exists pedidos_carimba_etapas on public.pedidos;
create trigger pedidos_carimba_etapas
  before update of status on public.pedidos
  for each row execute function public.carimbar_etapas_do_pedido();

-- O cliente lê estas colunas pela policy que já existe ("Cliente lê os
-- próprios pedidos"). Escrever é só do admin, também pela policy que já existe.
comment on column public.pedidos.codigo_rastreio is
  'Código da transportadora, preenchido pelo painel quando a peça é despachada.';


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as três linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'colunas de rastreio criadas' as checagem,
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'pedidos'
                     and column_name in ('codigo_rastreio','transportadora','pago_em','enviado_em','entregue_em')) = 5
            then 'ok' else 'FALHOU' end as resultado
union all
select 'trigger de carimbo no lugar',
       case when exists (select 1 from pg_trigger where tgname = 'pedidos_carimba_etapas')
            then 'ok' else 'FALHOU' end
union all
select 'função de trigger fechada na API',
       case when has_function_privilege('anon', 'public.carimbar_etapas_do_pedido()', 'EXECUTE')
            then 'FALHOU' else 'ok' end;
