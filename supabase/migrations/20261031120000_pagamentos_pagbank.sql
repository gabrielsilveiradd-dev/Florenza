-- ============================================================================
-- FLORENZA — O PAGAMENTO PASSA A SER PELO PAGBANK
--
-- POR QUE: a loja escolheu o PagBank no lugar do Mercado Pago, cuja conta nunca
-- chegou a ser ligada. A tabela `pagamentos` guarda o status cru do provedor, e
-- os do PagBank são outros (PAID, WAITING, IN_ANALYSIS...). Sem esta migration,
-- um pagamento aprovado seria gravado e o pedido NÃO viraria 'pago', porque a
-- função só reconhecia 'approved'.
--
-- O modelo não muda: registrar_pagamento() continua exigindo o segredo do Vault
-- ('florenza_pagamentos'), e o servidor só a chama depois de consultar a API do
-- provedor. A assinatura da função é a mesma.
--
-- O PagBank não tem status de estorno: a cobrança estornada traz o valor em
-- amount.summary.refunded, e lib/pagamento/pagbank.ts a manda como 'REFUNDED'.
--
-- Contestação de cartão chega ao site em outro formato e ainda não é tratada, por
-- isso não há mais pendência de chargeback aqui — ver app/api/pagbank/webhook.
--
-- ORDEM DE PUBLICAÇÃO: esta migration ANTES de pôr PAGBANK_TOKEN na Vercel. Com o
-- token ausente o pagamento online fica desligado e ninguém chama estas funções.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) O provedor. 'mercadopago' continua aceito só para não invalidar linha de
--    teste que exista; nada novo nasce com ele.
-- ---------------------------------------------------------------------------
alter table public.pagamentos drop constraint if exists pagamentos_provedor_check;
alter table public.pagamentos
  add constraint pagamentos_provedor_check check (provedor in ('mercadopago', 'pagbank'));
alter table public.pagamentos alter column provedor set default 'pagbank';


-- ---------------------------------------------------------------------------
-- 2) registrar_pagamento() — agora com o vocabulário do PagBank
--
--    Idempotente e sem andar para trás, como antes: um aviso atrasado dizendo
--    WAITING não apaga um PAID que já chegou.
--
--    CANCELED depois de PAID também vira pendência: é dinheiro que voltou.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_pagamento(
  p_segredo               text,
  p_pedido_id             uuid,
  p_provedor_pagamento_id text,
  p_status                text,
  p_valor_centavos        integer,
  p_status_detalhe        text        default null,
  p_metodo                text        default null,
  p_parcelas              integer     default null,
  p_aprovado_em           timestamptz default null
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
  v_segredo   text;
  v_pedido    public.pedidos;
  v_existente public.pagamentos;
  v_promovido boolean := false;
  v_pendencia text;
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
    metodo, valor_centavos, parcelas, aprovado_em
  ) values (
    p_pedido_id, 'pagbank', p_provedor_pagamento_id, p_status, p_status_detalhe,
    p_metodo, p_valor_centavos, p_parcelas, p_aprovado_em
  )
  on conflict (provedor, provedor_pagamento_id) do update
    set status = case
                   when g.status in ('PAID', 'REFUNDED')
                    and excluded.status in ('WAITING', 'IN_ANALYSIS', 'AUTHORIZED')
                   then g.status
                   else excluded.status
                 end,
        status_detalhe = excluded.status_detalhe,
        metodo         = coalesce(excluded.metodo, g.metodo),
        valor_centavos = excluded.valor_centavos,
        parcelas       = coalesce(excluded.parcelas, g.parcelas),
        aprovado_em    = coalesce(excluded.aprovado_em, g.aprovado_em);

  if p_status = 'PAID' then
    if p_valor_centavos < v_pedido.total_centavos then
      v_pendencia := format(
        'Valor aprovado (R$ %s) menor que o total do pedido (R$ %s). Conferir antes de enviar.',
        to_char(p_valor_centavos / 100.0, 'FM999G999D00'),
        to_char(v_pedido.total_centavos / 100.0, 'FM999G999D00')
      );

    elsif v_pedido.status = 'aguardando_pagamento' then
      update public.pedidos p set status = 'pago' where p.id = p_pedido_id;
      v_promovido := true;

    elsif v_pedido.status = 'cancelado' then
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

  elsif v_pedido.status <> 'cancelado'
    and (p_status = 'REFUNDED' or (p_status = 'CANCELED' and v_existente.status = 'PAID')) then
    v_pendencia := 'Pagamento estornado no PagBank. Conferir se o pedido deve ser cancelado.';
  end if;

  update public.pagamentos g
     set pendencia = v_pendencia
   where g.provedor = 'pagbank' and g.provedor_pagamento_id = p_provedor_pagamento_id;

  select * into v_pedido from public.pedidos p where p.id = p_pedido_id;

  return query select v_pedido.numero, v_pedido.status, v_pedido.nome, v_pedido.email,
                      v_pedido.telefone, v_pedido.total_centavos, v_promovido, v_pendencia;
end;
$$;

-- `anon` executa porque o webhook chega sem sessão. A proteção é o segredo,
-- conferido na primeira linha — sem ele a função não lê nem escreve nada.
revoke execute on function public.registrar_pagamento(text, uuid, text, text, integer, text, text, integer, timestamptz) from public;
grant  execute on function public.registrar_pagamento(text, uuid, text, text, integer, text, text, integer, timestamptz) to anon, authenticated;

comment on function public.registrar_pagamento(text, uuid, text, text, integer, text, text, integer, timestamptz) is
  'Registra o que o PagBank disse sobre uma cobrança e promove o pedido a pago quando paga pelo valor total. Exige o segredo florenza_pagamentos do Vault.';


-- ---------------------------------------------------------------------------
-- 3) A expiração continua respeitando pagamento em análise — nos nomes novos.
--    Sem isto, cartão IN_ANALYSIS perderia a reserva no meio da análise.
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
       and not exists (
         select 1 from public.pagamentos g
          where g.pedido_id = p.id and g.status in ('IN_ANALYSIS', 'AUTHORIZED')
       )
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
-- CONFERÊNCIA — as linhas precisam vir 'ok'; a última diz se já dá para ligar
-- ---------------------------------------------------------------------------
select 'provedor padrão é pagbank' as checagem,
       case when (select column_default from information_schema.columns
                   where table_schema = 'public' and table_name = 'pagamentos' and column_name = 'provedor')
                 like '%pagbank%'
            then 'ok' else 'FALHOU' end as resultado
union all
select 'registrar_pagamento fala PAID',
       case when pg_get_functiondef(
              'public.registrar_pagamento(text,uuid,text,text,integer,text,text,integer,timestamptz)'::regprocedure
            ) like '%''PAID''%' then 'ok' else 'FALHOU' end
union all
select 'expiração respeita IN_ANALYSIS',
       case when pg_get_functiondef('public.expirar_pedidos_vencidos()'::regprocedure) like '%IN_ANALYSIS%'
            then 'ok' else 'FALHOU' end
union all
select 'webhook consegue chamar registrar_pagamento',
       case when has_function_privilege('anon',
              'public.registrar_pagamento(text,uuid,text,text,integer,text,text,integer,timestamptz)', 'EXECUTE')
            then 'ok' else 'FALHOU' end
union all
select 'ninguém grava pagamento pela API',
       case when has_table_privilege('authenticated', 'public.pagamentos', 'INSERT')
              or has_table_privilege('authenticated', 'public.pagamentos', 'UPDATE')
            then 'FALHOU' else 'ok' end
union all
select 'segredo florenza_pagamentos criado',
       case when to_regclass('vault.decrypted_secrets') is null then 'PENDENTE'
            when exists (select 1 from vault.decrypted_secrets where name = 'florenza_pagamentos') then 'ok'
            else 'PENDENTE — ver DEPLOY.md, "Ligar o PagBank"' end;
