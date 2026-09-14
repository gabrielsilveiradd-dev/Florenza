-- ============================================================================
-- FLORENZA — PAGAMENTOS (Mercado Pago), prontos para quando a conta existir
--
-- O pedido já nascia em 'aguardando_pagamento' esperando alguém que o
-- promovesse a 'pago'. Este arquivo cria esse alguém — sem abrir mão da regra
-- do projeto de que NENHUMA service-role key entra no site.
--
-- O PROBLEMA: o aviso de pagamento chega do Mercado Pago num webhook, sem
-- sessão de ninguém. Pela RLS só o admin muda status de pedido, e o jeito
-- comum de contornar isso é dar ao servidor a service-role key — que ignora a
-- RLS inteira. Vazou, vazou o banco.
--
-- A SAÍDA: uma função só, registrar_pagamento(), que faz UMA coisa e exige um
-- segredo para fazê-la. O segredo mora em dois lugares e em nenhum outro:
--
--   - no Vault do Supabase, com o nome 'florenza_pagamentos';
--   - na variável PAGAMENTO_SEGREDO_BANCO da Vercel (nunca NEXT_PUBLIC_).
--
-- Quem tem o segredo consegue registrar um pagamento. Não consegue ler
-- cliente, mudar preço, nem mexer em pedido de outro jeito. E o servidor só
-- chama a função depois de buscar o pagamento NA API do Mercado Pago com o
-- token da loja — o corpo do webhook nunca é tomado como verdade.
--
-- Enquanto o segredo não for criado, a função recusa tudo e o site segue no
-- acerto por WhatsApp. Ligar é o passo a passo do DEPLOY.md.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) pagamentos — o que o Mercado Pago disse sobre cada cobrança
--
--    Um pedido pode ter várias tentativas (cartão recusado, depois Pix), então
--    é tabela própria e não coluna em `pedidos`. `status` é o valor cru do
--    provedor (approved, pending, in_process, rejected, refunded...), guardado
--    como veio: traduzir aqui esconderia justamente o que se precisa ler numa
--    disputa.
--
--    `pendencia` é o recado para o painel quando o pagamento não pôde fazer o
--    que devia — valor menor que o pedido, pedido que expirou e perdeu a peça,
--    estorno. É ali que o dono olha antes de despachar.
-- ---------------------------------------------------------------------------
create table if not exists public.pagamentos (
  id                    uuid primary key default gen_random_uuid(),
  pedido_id             uuid not null references public.pedidos(id) on delete cascade,
  provedor              text not null default 'mercadopago' check (provedor in ('mercadopago')),
  provedor_pagamento_id text not null,
  status                text not null,
  status_detalhe        text,
  metodo                text,
  valor_centavos        integer not null check (valor_centavos >= 0),
  parcelas              smallint,
  aprovado_em           timestamptz,
  pendencia             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- O mesmo pagamento avisado duas vezes (o Mercado Pago reenvia) é UMA linha.
  unique (provedor, provedor_pagamento_id)
);

drop trigger if exists pagamentos_updated_at on public.pagamentos;
create trigger pagamentos_updated_at
  before update on public.pagamentos
  for each row execute function public.tocar_updated_at();

create index if not exists pagamentos_pedido_idx on public.pagamentos (pedido_id);

alter table public.pagamentos enable row level security;

-- Leitura segue o pedido, como os itens: quem vê o pedido vê as tentativas.
drop policy if exists "Pagamentos seguem o pedido" on public.pagamentos;
create policy "Pagamentos seguem o pedido" on public.pagamentos
  for select using (
    exists (
      select 1 from public.pedidos p
       where p.id = pagamentos.pedido_id
         and (p.user_id = (select auth.uid()) or public.is_admin())
    )
  );

-- Escrita: ninguém pela API. Nem admin — pagamento registrado à mão é
-- pagamento inventado. Sem policy de escrita a RLS já barra; o revoke tira a
-- tabela até do mapa de quem tentar.
revoke insert, update, delete on public.pagamentos from anon, authenticated;
revoke select on public.pagamentos from anon;


-- ---------------------------------------------------------------------------
-- 2) registrar_pagamento()
--
--    Idempotente: o Mercado Pago avisa o mesmo pagamento várias vezes, e a
--    página de retorno também sincroniza quando a pessoa volta. Rodar dez vezes
--    tem o efeito de rodar uma.
--
--    Status não anda para trás: um aviso atrasado dizendo 'pending' não apaga um
--    'approved' que já chegou.
--
--    O que promove o pedido a 'pago': status 'approved' E valor aprovado de pelo
--    menos o total do pedido. Pago a menos vira pendência, não venda.
--
--    Pedido que EXPIROU e foi pago depois (Pix pago no último minuto, cartão em
--    análise): tenta reativar. A trigger de estoque desconta de novo e recusa se
--    a peça já foi vendida para outra pessoa — nesse caso o pedido fica
--    cancelado e a pendência diz para estornar.
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
  -- plpgsql e não sql: o corpo só é resolvido ao rodar, então a migration não
  -- quebra num Postgres sem Vault (o teste local) — a função é que recusa.
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
   where g.provedor = 'mercadopago' and g.provedor_pagamento_id = p_provedor_pagamento_id
     for update;

  if found and v_existente.pedido_id <> p_pedido_id then
    raise exception 'O pagamento % pertence a outro pedido.', p_provedor_pagamento_id using errcode = 'P0001';
  end if;

  insert into public.pagamentos as g (
    pedido_id, provedor, provedor_pagamento_id, status, status_detalhe,
    metodo, valor_centavos, parcelas, aprovado_em
  ) values (
    p_pedido_id, 'mercadopago', p_provedor_pagamento_id, p_status, p_status_detalhe,
    p_metodo, p_valor_centavos, p_parcelas, p_aprovado_em
  )
  on conflict (provedor, provedor_pagamento_id) do update
    set status = case
                   when g.status in ('approved', 'refunded', 'charged_back')
                    and excluded.status in ('pending', 'in_process', 'authorized')
                   then g.status
                   else excluded.status
                 end,
        status_detalhe = excluded.status_detalhe,
        metodo         = coalesce(excluded.metodo, g.metodo),
        valor_centavos = excluded.valor_centavos,
        parcelas       = coalesce(excluded.parcelas, g.parcelas),
        aprovado_em    = coalesce(excluded.aprovado_em, g.aprovado_em);

  if p_status = 'approved' then
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
                    || 'Estornar no Mercado Pago, ou repor a peça e reativar o pedido.';
      end;
    end if;

  elsif p_status = 'refunded' and v_pedido.status <> 'cancelado' then
    v_pendencia := 'Pagamento estornado no Mercado Pago. Conferir se o pedido deve ser cancelado.';

  elsif p_status = 'charged_back' and v_pedido.status <> 'cancelado' then
    v_pendencia := 'O cliente contestou a cobrança no cartão. Não enviar a peça antes de resolver.';
  end if;

  update public.pagamentos g
     set pendencia = v_pendencia
   where g.provedor = 'mercadopago' and g.provedor_pagamento_id = p_provedor_pagamento_id;

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
  'Registra o que o Mercado Pago disse sobre um pagamento e promove o pedido a pago quando aprovado pelo valor total. Exige o segredo florenza_pagamentos do Vault.';


-- ---------------------------------------------------------------------------
-- 3) A expiração passa a respeitar pagamento em análise
--
--    Cartão 'in_process' pode levar até dois dias na análise antifraude do
--    Mercado Pago. Cancelar a reserva nesse meio-tempo devolveria a peça para a
--    vitrine enquanto o dinheiro ainda pode entrar. Pix e boleto pendentes NÃO
--    seguram a reserva: a preferência de pagamento vence junto com ela.
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
          where g.pedido_id = p.id and g.status in ('in_process', 'authorized')
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
select 'tabela pagamentos com RLS' as checagem,
       case when (select relrowsecurity from pg_class where oid = 'public.pagamentos'::regclass)
            then 'ok' else 'FALHOU' end as resultado
union all
select 'visitante não lê pagamentos',
       case when has_table_privilege('anon', 'public.pagamentos', 'SELECT') then 'FALHOU' else 'ok' end
union all
select 'ninguém grava pagamento pela API',
       case when has_table_privilege('authenticated', 'public.pagamentos', 'INSERT')
              or has_table_privilege('authenticated', 'public.pagamentos', 'UPDATE')
            then 'FALHOU' else 'ok' end
union all
select 'webhook consegue chamar registrar_pagamento',
       case when has_function_privilege('anon',
              'public.registrar_pagamento(text,uuid,text,text,integer,text,text,integer,timestamptz)', 'EXECUTE')
            then 'ok' else 'FALHOU' end
union all
select 'Vault disponível',
       case when to_regclass('vault.decrypted_secrets') is not null then 'ok' else 'FALHOU' end
union all
select 'segredo florenza_pagamentos criado',
       case when to_regclass('vault.decrypted_secrets') is null then 'PENDENTE'
            when exists (select 1 from vault.decrypted_secrets where name = 'florenza_pagamentos') then 'ok'
            else 'PENDENTE — ver DEPLOY.md, "Ligar o Mercado Pago"' end;
