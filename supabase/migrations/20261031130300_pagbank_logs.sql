-- ============================================================================
-- FLORENZA — LOG DAS CONVERSAS COM O PAGBANK
--
-- POR QUE: a homologação do PagBank valida "request e response" dos ambientes de
-- sandbox e produção, e o prazo só vale com os logs enviados corretamente
-- (docs/solicitar-homologacao). Também é o que permite responder "o que o PagBank
-- disse?" meses depois de um problema.
--
-- O QUE NÃO ENTRA: token e dados de cartão. CPF, e-mail, telefone e nome entram
-- mascarados: lib/pagamento/sanitizar.ts faz isso antes de chegar aqui.
--
-- Expira em 180 dias, porque é registro técnico e carrega dados de pedido.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================

create table if not exists public.payment_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  ambiente    text not null,
  metodo      text not null,
  caminho     text not null,
  http_status integer,
  duracao_ms  integer,
  requisicao  text,
  resposta    text,
  erro        text
);

create index if not exists payment_logs_data_idx on public.payment_logs (created_at desc);

alter table public.payment_logs enable row level security;

drop policy if exists "Admin lê logs de pagamento" on public.payment_logs;
create policy "Admin lê logs de pagamento" on public.payment_logs
  for select to authenticated using (public.is_admin());

revoke all on public.payment_logs from anon;
revoke insert, update, delete on public.payment_logs from authenticated;

create or replace function public.pagbank_registrar_log(
  p_segredo     text,
  p_ambiente    text,
  p_metodo      text,
  p_caminho     text,
  p_http_status integer,
  p_duracao_ms  integer,
  p_requisicao  text,
  p_resposta    text,
  p_erro        text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pagbank_exigir_segredo(p_segredo);

  insert into public.payment_logs (ambiente, metodo, caminho, http_status, duracao_ms, requisicao, resposta, erro)
  values (p_ambiente, p_metodo, p_caminho, p_http_status, p_duracao_ms, p_requisicao, p_resposta, p_erro);
end;
$$;

revoke execute on function public.pagbank_registrar_log(text, text, text, text, integer, integer, text, text, text) from public;
grant  execute on function public.pagbank_registrar_log(text, text, text, text, integer, integer, text, text, text) to anon, authenticated;

create or replace function public.pagbank_limpar_logs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos integer;
begin
  delete from public.payment_logs l where l.created_at < now() - interval '180 days';
  get diagnostics v_quantos = row_count;
  return v_quantos;
end;
$$;

revoke execute on function public.pagbank_limpar_logs() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('florenza-limpar-logs-pagbank', '17 4 * * *', 'select public.pagbank_limpar_logs()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'RLS em payment_logs' as checagem,
       case when (select relrowsecurity from pg_class where oid = 'public.payment_logs'::regclass)
            then 'ok' else 'FALHOU' end as resultado
union all
select 'ninguém grava log pela API',
       case when has_table_privilege('authenticated', 'public.payment_logs', 'INSERT') then 'FALHOU' else 'ok' end
union all
select 'visitante não lê log',
       case when has_table_privilege('anon', 'public.payment_logs', 'SELECT') then 'FALHOU' else 'ok' end;
