-- ============================================================================
-- FLORENZA — PEDIDO QUE DÁ PARA ENTREGAR, E QUE NINGUÉM CONSEGUE TRAVAR
--
-- A revisão de 14/09/2026 achou o núcleo do dinheiro sólido (preço e estoque
-- decididos pelo banco numa transação só) e quase tudo em volta dele faltando.
-- O pedido entrava no banco, mas a Florenza não teria como entregar a peça com
-- o que recebia, e a loja podia ser esvaziada por um script:
--
--   1. Endereço era só CEP, cidade e UF. Sem rua e número a peça não sai, e sem
--      CPF não há nota fiscal nem etiqueta de envio.
--   2. Tamanho do aro não existia: ia em texto livre nas observações, e aliança
--      em par tem DOIS tamanhos.
--   3. Qualquer visitante, sem login, chamava criar_pedido() em laço e reservava
--      o estoque inteiro. E pedido não pago nunca expirava.
--   4. O cupom BEMVINDO10 dava 10% sem limite, e "primeira compra" não era
--      conferido por ninguém.
--   5. As policies de INSERT em pedidos e pedido_itens, de antes de
--      criar_pedido() existir, continuavam valendo: um cliente logado gravava
--      direto pela API um pedido já "pago", com o preço que quisesse.
--
-- Duas decisões do dono moldam este arquivo: o estoque é REAL (a peça existe;
-- não é sob encomenda) e só se compra COM CONTA.
--
-- ORDEM DE PUBLICAÇÃO: criar_pedido() muda de assinatura e deixa de aceitar
-- visitante. O site no ar chama a versão antiga, então aplicar esta migration e
-- publicar o código novo andam juntos — ver DEPLOY.md.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) CPF e endereço completo
--
--    O CPF é conferido pelos dígitos verificadores, não só pela contagem de
--    números: "111.111.111-11" tem onze dígitos e não é CPF de ninguém, e é
--    exatamente o que se digita para passar de um formulário. A nota fiscal
--    recusaria depois, com a peça já separada.
--
--    Guardado só com os dígitos. A máscara é coisa da tela.
--
--    A função fica executável por todos (padrão do Postgres) de propósito: é
--    pura, não lê tabela nenhuma, e a CHECK constraint precisa dela.
-- ---------------------------------------------------------------------------
create or replace function public.cpf_valido(p_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_soma  integer;
  v_resto integer;
begin
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' or p_cpf ~ '^(.)\1{10}$' then
    return false;
  end if;

  v_soma := 0;
  for i in 1..9 loop
    v_soma := v_soma + substr(p_cpf, i, 1)::integer * (11 - i);
  end loop;
  v_resto := (v_soma * 10) % 11;
  if v_resto = 10 then v_resto := 0; end if;
  if v_resto <> substr(p_cpf, 10, 1)::integer then
    return false;
  end if;

  v_soma := 0;
  for i in 1..10 loop
    v_soma := v_soma + substr(p_cpf, i, 1)::integer * (12 - i);
  end loop;
  v_resto := (v_soma * 10) % 11;
  if v_resto = 10 then v_resto := 0; end if;
  return v_resto = substr(p_cpf, 11, 1)::integer;
end;
$$;

-- `endereco_numero` e não `numero`: `pedidos.numero` já é o número do pedido,
-- aquele que o cliente dita por telefone. O mesmo nome nas duas tabelas evita
-- que alguém escreva `numero` em profiles achando que é outra coisa.
alter table public.profiles add column if not exists cpf             text;
alter table public.profiles add column if not exists logradouro      text;
alter table public.profiles add column if not exists endereco_numero text;
alter table public.profiles add column if not exists complemento     text;
alter table public.profiles add column if not exists bairro          text;

alter table public.profiles drop constraint if exists profiles_cpf_valido;
alter table public.profiles add constraint profiles_cpf_valido
  check (cpf is null or public.cpf_valido(cpf));

-- Mesma regra da migration do estoque: RLS decide linha, privilégio de coluna
-- decide coluna. As colunas novas entram na lista do que a pessoa pode mexer na
-- própria linha; `role` continua fora.
grant update (cpf, logradouro, endereco_numero, complemento, bairro)
  on public.profiles to authenticated;

alter table public.pedidos add column if not exists cpf             text;
alter table public.pedidos add column if not exists logradouro      text;
alter table public.pedidos add column if not exists endereco_numero text;
alter table public.pedidos add column if not exists complemento     text;
alter table public.pedidos add column if not exists bairro          text;

alter table public.pedidos drop constraint if exists pedidos_cpf_valido;
alter table public.pedidos add constraint pedidos_cpf_valido
  check (cpf is null or public.cpf_valido(cpf));

-- A regra de "primeira compra" do cupom procura pedidos pelo CPF, além da conta:
-- sem isso, criar um segundo e-mail bastaria para ganhar o desconto de novo.
create index if not exists pedidos_cpf_idx on public.pedidos (cpf) where cpf is not null;


-- ---------------------------------------------------------------------------
-- 2) Tamanho do aro
--
--    Quantos aros a peça tem é dado DA PEÇA, não da categoria: entre as
--    alianças de prata há peças avulsas e pares vendidos juntos, e o importador
--    já distinguia as duas pelo nome do arquivo.
--
--      0 = sem aro (reservado para colar, brinco, o que vier)
--      1 = um tamanho — anel de formatura, aliança avulsa
--      2 = par — dois tamanhos, um para cada pessoa
--
--    No item, tamanho NULO numa peça com aro quer dizer "não sei ainda": a
--    Florenza confirma a medida pelo WhatsApp. É uma escolha explícita da tela,
--    não esquecimento — por isso não é barrado.
-- ---------------------------------------------------------------------------
alter table public.produtos add column if not exists aros smallint not null default 1;
alter table public.produtos drop constraint if exists produtos_aros_valido;
alter table public.produtos add constraint produtos_aros_valido check (aros between 0 and 2);

-- Carga inicial: as fichas de par começam a descrição por "Par" (9007, 9009 e
-- 9012 hoje). `where aros = 1` não atropela o que o painel já tiver ajustado.
update public.produtos set aros = 2 where aros = 1 and descricao ilike 'par %';

-- `aros` no item é cópia, como nome e preço: se a ficha mudar depois, o pedido
-- antigo continua dizendo quantas medidas foram pedidas.
alter table public.pedido_itens add column if not exists aros        smallint;
alter table public.pedido_itens add column if not exists tamanho     smallint;
alter table public.pedido_itens add column if not exists tamanho_par smallint;

alter table public.pedido_itens drop constraint if exists pedido_itens_tamanhos_validos;
alter table public.pedido_itens add constraint pedido_itens_tamanhos_validos check (
  (tamanho     is null or (tamanho     between 1 and 40 and coalesce(aros, 0) >= 1)) and
  (tamanho_par is null or (tamanho_par between 1 and 40 and coalesce(aros, 0) = 2))
);


-- ---------------------------------------------------------------------------
-- 3) Fecha a porta de gravar pedido direto pela API
--
--    Estas duas policies são da migration de pedidos, de quando o checkout
--    fazia dois INSERTs do navegador. criar_pedido() substituiu aquele caminho,
--    mas elas ficaram — e com elas um cliente logado mandava
--
--        POST /rest/v1/pedidos        {"user_id":"<o dele>","status":"pago",...}
--        POST /rest/v1/pedido_itens   {"preco_centavos":1,...}
--
--    e o painel mostrava uma venda paga que não existiu, sem baixa de estoque.
--    Sem elas, o único jeito de um cliente criar pedido é criar_pedido(), que
--    não aceita preço nem status. O admin continua lançando venda manual pela
--    policy "Admin gerencia pedidos".
-- ---------------------------------------------------------------------------
drop policy if exists "Cliente cria o próprio pedido"        on public.pedidos;
drop policy if exists "Cliente cria itens do próprio pedido" on public.pedido_itens;


-- ---------------------------------------------------------------------------
-- 4) Regras do cupom num lugar só
--
--    Até aqui a mesma regra estava escrita duas vezes — em conferir_cupom() e
--    dentro de criar_pedido() — e as duas já divergiam num detalhe de mensagem.
--    Com "primeira compra" e "um por cliente" entrando, a terceira cópia seria
--    onde a divergência vira desconto indevido. avaliar_cupom() é a regra; as
--    outras duas perguntam a ela.
-- ---------------------------------------------------------------------------
alter table public.cupons add column if not exists so_primeira_compra boolean not null default false;
alter table public.cupons add column if not exists um_por_cliente     boolean not null default false;

-- O cupom de exemplo diz "Primeira compra — 10%" desde que nasceu, e nunca
-- conferiu isso. Passa a conferir.
update public.cupons
   set so_primeira_compra = true,
       um_por_cliente     = true
 where codigo = 'BEMVINDO10';

create or replace function public.avaliar_cupom(
  p_cupom        public.cupons,
  p_subtotal     integer,
  p_usuario      uuid,
  p_cpf          text default null,
  p_pedido_atual uuid default null
)
returns table (motivo text, desconto_centavos integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subtotal integer := greatest(coalesce(p_subtotal, 0), 0);
  v_desconto integer;
begin
  -- Mesma resposta para código inexistente e desligado: dizer "existe, mas está
  -- desativado" ajuda quem estiver adivinhando códigos.
  if p_cupom.codigo is null or not p_cupom.ativo then
    return query select 'Cupom não encontrado.'::text, 0;
    return;
  end if;

  -- A validade é um DIA no calendário de quem compra. Em UTC, um cupom "até
  -- 25/12" morreria às 21h do dia 25 no horário de Brasília.
  if p_cupom.validade_ate is not null
     and p_cupom.validade_ate < (now() at time zone 'America/Sao_Paulo')::date then
    return query select 'Este cupom expirou.'::text, 0;
    return;
  end if;

  if p_cupom.limite_usos is not null and p_cupom.usos >= p_cupom.limite_usos then
    return query select 'Este cupom já atingiu o limite de usos.'::text, 0;
    return;
  end if;

  if (p_cupom.so_primeira_compra or p_cupom.um_por_cliente) and p_usuario is null then
    return query select 'Entre na sua conta para usar este cupom.'::text, 0;
    return;
  end if;

  -- "Compra" é pedido que não foi cancelado. O pedido que está nascendo agora
  -- fica de fora da busca — senão ele mesmo contaria como compra anterior.
  if p_cupom.so_primeira_compra and exists (
    select 1
      from public.pedidos p
     where p.status <> 'cancelado'
       and (p_pedido_atual is null or p.id <> p_pedido_atual)
       and (p.user_id = p_usuario or (p_cpf is not null and p.cpf = p_cpf))
  ) then
    return query select 'Este cupom vale só para a primeira compra.'::text, 0;
    return;
  end if;

  if p_cupom.um_por_cliente and exists (
    select 1
      from public.pedidos p
     where p.status <> 'cancelado'
       and p.cupom_codigo = p_cupom.codigo
       and (p_pedido_atual is null or p.id <> p_pedido_atual)
       and (p.user_id = p_usuario or (p_cpf is not null and p.cpf = p_cpf))
  ) then
    return query select 'Você já usou este cupom.'::text, 0;
    return;
  end if;

  if v_subtotal < p_cupom.minimo_centavos then
    return query select
      ('Este cupom vale a partir de R$ ' || to_char(p_cupom.minimo_centavos / 100.0, 'FM999G999D00') || '.')::text,
      0;
    return;
  end if;

  if p_cupom.tipo = 'percentual' then
    v_desconto := (v_subtotal * p_cupom.valor) / 100;
  else
    v_desconto := p_cupom.valor;
  end if;

  -- Desconto nunca passa do subtotal: cupom de R$ 500 num pedido de R$ 349 zera
  -- a conta, não gera troco.
  return query select null::text, least(v_desconto, v_subtotal);
end;
$$;

-- Peça interna: só as duas funções abaixo, que rodam como dono, a chamam.
revoke execute on function public.avaliar_cupom(public.cupons, integer, uuid, text, uuid)
  from public, anon, authenticated;

-- conferir_cupom() mantém a assinatura e passa a perguntar a avaliar_cupom().
-- Deixa de atender visitante: sem compra sem conta, não há por que um anônimo
-- testar códigos — e cada porta a menos é uma lista de descontos a menos para
-- quem estiver adivinhando.
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
  v_cupom     public.cupons;
  v_cpf       text;
  v_avaliacao record;
begin
  select * into v_cupom
    from public.cupons c
   where c.codigo = upper(trim(coalesce(p_codigo, '')));

  select pr.cpf into v_cpf from public.profiles pr where pr.id = (select auth.uid());

  select * into v_avaliacao
    from public.avaliar_cupom(v_cupom, p_subtotal, (select auth.uid()), v_cpf);

  if v_avaliacao.motivo is not null then
    return query select false, v_avaliacao.motivo, 0, null::text;
    return;
  end if;

  return query select true, 'Cupom aplicado.'::text, v_avaliacao.desconto_centavos, v_cupom.descricao;
end;
$$;

revoke execute on function public.conferir_cupom(text, integer) from public, anon;
grant  execute on function public.conferir_cupom(text, integer) to authenticated;


-- ---------------------------------------------------------------------------
-- 5) Reserva com prazo
--
--    Pedido fechado desconta o estoque na hora — é o que impede duas pessoas de
--    comprarem a mesma última peça. O preço disso é que um pedido nunca pago
--    segurava a peça para sempre, e bastava um script para a vitrine inteira
--    aparecer esgotada.
--
--    Agora a reserva vence em 48 horas (o prazo mora em criar_pedido()). Um job
--    do pg_cron cancela o que venceu a cada 10 minutos, e o cancelamento
--    devolve o estoque pela trigger que já existe.
--
--    `expira_em` nulo = não expira. É o que o painel grava ao "segurar a
--    reserva" de quem combinou pagar depois, e é o estado de todo pedido que
--    saiu de 'aguardando_pagamento'. Pedidos anteriores a esta migration também
--    ficam nulos: expirar em massa o que já existe não é decisão de migration.
-- ---------------------------------------------------------------------------
alter table public.pedidos add column if not exists expira_em           timestamptz;
alter table public.pedidos add column if not exists cancelado_em        timestamptz;
alter table public.pedidos add column if not exists motivo_cancelamento text;

create index if not exists pedidos_reserva_vencendo_idx
  on public.pedidos (expira_em)
  where status = 'aguardando_pagamento' and expira_em is not null;

-- O carimbo das etapas ganha o cancelamento, e aprende a desfazer o que não vale
-- mais: pedido reativado não está cancelado, e pedido pago não tem reserva
-- vencendo.
create or replace function public.carimbar_etapas_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'pago'      and new.pago_em      is null then new.pago_em      := now(); end if;
    if new.status = 'enviado'   and new.enviado_em   is null then new.enviado_em   := now(); end if;
    if new.status = 'entregue'  and new.entregue_em  is null then new.entregue_em  := now(); end if;
    if new.status = 'cancelado' and new.cancelado_em is null then new.cancelado_em := now(); end if;

    if old.status = 'cancelado' then
      new.cancelado_em        := null;
      new.motivo_cancelamento := null;
    end if;

    if new.status <> 'aguardando_pagamento' then
      new.expira_em := null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.carimbar_etapas_do_pedido() from public, anon, authenticated;

create or replace function public.expirar_pedidos_vencidos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantos integer;
begin
  -- `skip locked`: se criar_pedido() ou o painel estiver mexendo num pedido
  -- agora, ele fica para a próxima rodada em vez de travar a fila.
  with vencidos as (
    select p.id
      from public.pedidos p
     where p.status = 'aguardando_pagamento'
       and p.expira_em is not null
       and p.expira_em < now()
     order by p.id
       for update skip locked
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

-- Só o agendador chama. Exposta em /rpc/, qualquer um cancelaria reservas
-- vencidas — inofensivo hoje, mas não é papel de visitante.
revoke execute on function public.expirar_pedidos_vencidos() from public, anon, authenticated;

-- O pg_cron vem com o Supabase, mas precisa ser ligado. Os dois blocos testam
-- antes de agir para a migration também rodar num Postgres sem ele (teste
-- local); em produção a CONFERÊNCIA lá embaixo acusa se o job não existir.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
end;
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    -- Mesmo nome = o agendador atualiza em vez de duplicar. Rodar de novo é seguro.
    perform cron.schedule(
      'florenza-expirar-reservas',
      '*/10 * * * *',
      'select public.expirar_pedidos_vencidos()'
    );
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6) Cancelar devolve o uso do cupom
--
--    Mesmo desenho da trigger de estoque: um cupom de limite 1 usado num pedido
--    que expirou ficava gasto para sempre, e reativar o pedido não o gastava de
--    novo.
-- ---------------------------------------------------------------------------
create or replace function public.ajustar_uso_do_cupom_por_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cupom_codigo is null then
    return new;
  end if;

  if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    update public.cupons c set usos = greatest(c.usos - 1, 0) where c.codigo = new.cupom_codigo;
  elsif old.status = 'cancelado' and new.status is distinct from 'cancelado' then
    update public.cupons c set usos = c.usos + 1 where c.codigo = new.cupom_codigo;
  end if;

  return new;
end;
$$;

revoke execute on function public.ajustar_uso_do_cupom_por_status() from public, anon, authenticated;

drop trigger if exists pedidos_ajusta_uso_do_cupom on public.pedidos;
create trigger pedidos_ajusta_uso_do_cupom
  after update of status on public.pedidos
  for each row execute function public.ajustar_uso_do_cupom_por_status();


-- ---------------------------------------------------------------------------
-- 7) criar_pedido() — agora só com conta, com endereço e com medida
--
--    O que continua igual, e é o coração: uma transação só; peças travadas em
--    ordem de SKU; preço e nome copiados de `produtos`; nenhum preço, status ou
--    desconto aceito do navegador.
--
--    O que muda:
--
--    - Identidade vem da CONTA. Nome, telefone e CPF são lidos do perfil; os
--      parâmetros só preenchem o que o perfil ainda não tem (primeira compra), e
--      o que preenchem fica gravado nele. Quem já tem CPF na conta não troca de
--      CPF no checkout.
--    - O endereço da conta só é gravado se ela não tinha nenhum: o presente
--      mandado para a casa da mãe não pode virar o endereço de quem comprou.
--    - Limites contra quem quer travar o estoque: até 3 pedidos aguardando
--      pagamento por conta, até 10 unidades da mesma peça por pedido, até 20
--      linhas no carrinho. Turma de formatura com 40 anéis é venda por WhatsApp,
--      lançada no painel.
--    - Travar o perfil no começo serializa os pedidos da MESMA pessoa: sem isso,
--      três abas fechando juntas passariam todas pela contagem de pendentes.
--
--    Duas passadas pelo carrinho: a primeira por SKU (trava, confere e desconta
--    o estoque somando todos os tamanhos da peça); a segunda por linha (grava um
--    item por combinação de peça e tamanho).
-- ---------------------------------------------------------------------------
drop function if exists public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, boolean, text);

create or replace function public.criar_pedido(
  p_itens             jsonb,
  p_cep               text,
  p_logradouro        text,
  p_endereco_numero   text,
  p_bairro            text,
  p_cidade            text,
  p_uf                text,
  p_complemento       text    default null,
  p_nome              text    default null,
  p_telefone          text    default null,
  p_cpf               text    default null,
  p_observacoes       text    default null,
  p_cupom             text    default null,
  p_presente          boolean default false,
  p_mensagem_presente text    default null
)
returns table (
  pedido_id             uuid,
  pedido_numero         bigint,
  pedido_total_centavos integer,
  pedido_expira_em      timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_reserva       constant interval := interval '48 hours';
  c_max_pendentes constant integer  := 3;
  c_max_por_peca  constant integer  := 10;
  c_max_linhas    constant integer  := 20;

  v_usuario   uuid := (select auth.uid());
  v_perfil    public.profiles;
  v_email     text;
  v_nome      text;
  v_telefone  text;
  v_cpf       text;
  v_cep       text := regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g');
  v_uf        text := upper(trim(coalesce(p_uf, '')));
  v_pendentes integer;

  v_linhas    jsonb;
  v_pecas     integer := 0;
  v_peca      record;
  v_linha     record;
  v_produto   public.produtos;

  v_pedido_id uuid;
  v_numero    bigint;
  v_expira    timestamptz := now() + c_reserva;
  v_subtotal  integer := 0;
  v_codigo    text := nullif(upper(trim(coalesce(p_cupom, ''))), '');
  v_cupom     public.cupons;
  v_avaliacao record;
  v_desconto  integer := 0;
  v_presente  boolean := coalesce(p_presente, false);
  -- Mensagem só sobrevive se for presente — a mesma regra do check da tabela,
  -- aplicada antes de gravar para a constraint nunca precisar reclamar.
  v_mensagem  text := case when coalesce(p_presente, false)
                           then nullif(trim(coalesce(p_mensagem_presente, '')), '')
                           else null end;
begin
  if v_usuario is null then
    raise exception 'Entre na sua conta para fechar o pedido.' using errcode = 'P0001';
  end if;

  select * into v_perfil from public.profiles pr where pr.id = v_usuario for update;
  if not found then
    raise exception 'Sua conta ainda não terminou de ser criada. Saia e entre de novo.'
      using errcode = 'P0001';
  end if;

  select u.email::text into v_email from auth.users u where u.id = v_usuario;

  -- ---- Quem compra ----------------------------------------------------------
  v_nome     := coalesce(nullif(trim(v_perfil.nome), ''), nullif(trim(coalesce(p_nome, '')), ''));
  v_telefone := coalesce(nullif(trim(v_perfil.telefone), ''), nullif(trim(coalesce(p_telefone, '')), ''));
  v_cpf      := coalesce(v_perfil.cpf, nullif(regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g'), ''));

  if v_nome is null then
    raise exception 'Falta o seu nome.' using errcode = 'P0001';
  end if;
  if v_telefone is null
     or length(regexp_replace(v_telefone, '[^0-9]', '', 'g')) not between 10 and 13 then
    raise exception 'Informe um WhatsApp com DDD para a Florenza falar com você.' using errcode = 'P0001';
  end if;
  if v_cpf is null or not public.cpf_valido(v_cpf) then
    raise exception 'CPF inválido. Ele vai na nota fiscal e na etiqueta de envio.' using errcode = 'P0001';
  end if;

  -- ---- Para onde vai --------------------------------------------------------
  if length(v_cep) <> 8 then
    raise exception 'CEP inválido.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_logradouro), '') = '' or coalesce(trim(p_endereco_numero), '') = ''
     or coalesce(trim(p_bairro), '') = '' or coalesce(trim(p_cidade), '') = '' then
    raise exception 'Endereço incompleto: confira rua, número, bairro e cidade.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ufs u where u.uf = v_uf) then
    raise exception 'Escolha o estado da entrega.' using errcode = 'P0001';
  end if;

  -- ---- Limites --------------------------------------------------------------
  select count(*) into v_pendentes
    from public.pedidos p
   where p.user_id = v_usuario and p.status = 'aguardando_pagamento';

  if v_pendentes >= c_max_pendentes then
    raise exception 'Você já tem % pedidos aguardando pagamento. Conclua um deles ou fale com a Florenza antes de abrir outro.',
      v_pendentes using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_itens) > c_max_linhas then
    raise exception 'São muitas peças para um pedido só. Fale com a Florenza pelo WhatsApp.' using errcode = 'P0001';
  end if;

  -- ---- Carrinho, normalizado uma vez ---------------------------------------
  -- Tudo que vem do navegador é lido com desconfiança: quantidade e tamanho só
  -- valem se forem números pequenos; o resto vira o padrão. Juntar linhas
  -- iguais aqui evita duas baixas de estoque para a mesma peça no mesmo tamanho.
  select coalesce(jsonb_agg(jsonb_build_object(
           'sku', l.sku, 'tamanho', l.tamanho, 'tamanho_par', l.tamanho_par, 'quantidade', l.quantidade
         )), '[]'::jsonb)
    into v_linhas
    from (
      select e.valor ->> 'sku' as sku,
             case when (e.valor ->> 'tamanho') ~ '^[0-9]{1,2}$'
                  then (e.valor ->> 'tamanho')::smallint end as tamanho,
             case when (e.valor ->> 'tamanho_par') ~ '^[0-9]{1,2}$'
                  then (e.valor ->> 'tamanho_par')::smallint end as tamanho_par,
             sum(greatest(coalesce(
               case when (e.valor ->> 'quantidade') ~ '^[0-9]{1,4}$'
                    then (e.valor ->> 'quantidade')::integer end, 1), 1))::integer as quantidade
        from jsonb_array_elements(p_itens) as e(valor)
       where jsonb_typeof(e.valor) = 'object'
         and coalesce(e.valor ->> 'sku', '') <> ''
       group by 1, 2, 3
    ) l;

  if jsonb_array_length(v_linhas) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;

  -- O pedido nasce antes das peças porque os itens precisam do id dele. Se
  -- qualquer conferência abaixo falhar, a transação inteira volta — pedido,
  -- itens, estoque e perfil.
  insert into public.pedidos (
    user_id, nome, email, telefone, cpf,
    cep, logradouro, endereco_numero, complemento, bairro, cidade, uf,
    origem, status, total_centavos, observacoes, presente, mensagem_presente, expira_em
  ) values (
    v_usuario, v_nome, v_email, v_telefone, v_cpf,
    v_cep, trim(p_logradouro), trim(p_endereco_numero),
    nullif(trim(coalesce(p_complemento, '')), ''), trim(p_bairro), trim(p_cidade), v_uf,
    'site', 'aguardando_pagamento', 0,
    nullif(trim(coalesce(p_observacoes, '')), ''),
    v_presente, v_mensagem, v_expira
  )
  returning id, numero into v_pedido_id, v_numero;

  -- ---- Passada 1: por peça, em ordem de SKU --------------------------------
  for v_peca in
    select x ->> 'sku' as sku, sum((x ->> 'quantidade')::integer)::integer as quantidade
      from jsonb_array_elements(v_linhas) as x
     group by 1
     order by 1
  loop
    if v_peca.quantidade > c_max_por_peca then
      raise exception 'Um pedido leva até % unidades da mesma peça. Para mais, fale com a Florenza pelo WhatsApp.',
        c_max_por_peca using errcode = 'P0001';
    end if;

    select * into v_produto from public.produtos p where p.sku = v_peca.sku for update;

    if not found then
      raise exception 'A peça de código % não está mais no catálogo.', v_peca.sku using errcode = 'P0001';
    end if;
    if not v_produto.ativo then
      raise exception 'A peça % saiu do catálogo.', v_produto.nome using errcode = 'P0001';
    end if;
    if v_produto.estoque < v_peca.quantidade then
      raise exception 'Restam % unidade(s) de %.', v_produto.estoque, v_produto.nome using errcode = 'P0001';
    end if;

    update public.produtos p set estoque = p.estoque - v_peca.quantidade where p.id = v_produto.id;
    v_pecas := v_pecas + 1;
  end loop;

  -- ---- Passada 2: um item por peça e tamanho -------------------------------
  for v_linha in
    select x ->> 'sku' as sku,
           (x ->> 'tamanho')::smallint     as tamanho,
           (x ->> 'tamanho_par')::smallint as tamanho_par,
           (x ->> 'quantidade')::integer   as quantidade
      from jsonb_array_elements(v_linhas) as x
     order by 1, 2 nulls last, 3 nulls last
  loop
    -- A linha do produto já está travada pela passada 1.
    select * into v_produto from public.produtos p where p.sku = v_linha.sku;

    if (v_linha.tamanho is not null and v_linha.tamanho not between 1 and 40)
       or (v_linha.tamanho_par is not null and v_linha.tamanho_par not between 1 and 40) then
      raise exception 'Tamanho de aro inválido em %.', v_produto.nome using errcode = 'P0001';
    end if;

    -- Tamanho que a peça não tem é descartado, não recusado: um carrinho antigo
    -- no navegador pode trazer medida de uma peça que deixou de ser par.
    insert into public.pedido_itens (
      pedido_id, produto_id, sku, nome, preco_centavos, quantidade, aros, tamanho, tamanho_par
    ) values (
      v_pedido_id, v_produto.id, v_linha.sku, v_produto.nome, v_produto.preco_centavos,
      v_linha.quantidade, v_produto.aros,
      case when v_produto.aros >= 1 then v_linha.tamanho end,
      case when v_produto.aros = 2  then v_linha.tamanho_par end
    );

    v_subtotal := v_subtotal + (v_produto.preco_centavos * v_linha.quantidade);
  end loop;

  -- ---- Cupom, por último: só agora o subtotal é conhecido -------------------
  -- `for update` na linha do cupom pelo mesmo motivo do estoque: sem a trava,
  -- dois pedidos simultâneos furam o limite de usos.
  if v_codigo is not null then
    select * into v_cupom from public.cupons c where c.codigo = v_codigo for update;

    select * into v_avaliacao
      from public.avaliar_cupom(v_cupom, v_subtotal, v_usuario, v_cpf, v_pedido_id);

    if v_avaliacao.motivo is not null then
      raise exception '%', v_avaliacao.motivo using errcode = 'P0001';
    end if;

    v_desconto := v_avaliacao.desconto_centavos;
    update public.cupons c set usos = c.usos + 1 where c.codigo = v_codigo;
  end if;

  -- ---- Completa a conta com o que faltava ----------------------------------
  -- No SET, todo lado direito enxerga a linha ANTIGA: `pr.logradouro is null`
  -- vale igual para as sete colunas de endereço, e elas mudam juntas ou não
  -- mudam.
  update public.profiles pr
     set nome            = v_nome,
         telefone        = v_telefone,
         cpf             = v_cpf,
         cep             = case when pr.logradouro is null then v_cep else pr.cep end,
         logradouro      = coalesce(pr.logradouro, trim(p_logradouro)),
         endereco_numero = case when pr.logradouro is null then trim(p_endereco_numero) else pr.endereco_numero end,
         complemento     = case when pr.logradouro is null
                                then nullif(trim(coalesce(p_complemento, '')), '') else pr.complemento end,
         bairro          = case when pr.logradouro is null then trim(p_bairro) else pr.bairro end,
         cidade          = case when pr.logradouro is null then trim(p_cidade) else pr.cidade end,
         uf              = case when pr.logradouro is null then v_uf else pr.uf end
   where pr.id = v_usuario;

  update public.pedidos p
     set subtotal_centavos = v_subtotal,
         desconto_centavos = v_desconto,
         cupom_codigo      = v_codigo,
         total_centavos    = greatest(0, v_subtotal - v_desconto)
   where p.id = v_pedido_id;

  return query select v_pedido_id, v_numero, greatest(0, v_subtotal - v_desconto), v_expira;
end;
$$;

revoke execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text)
  from public, anon;
grant  execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text)
  to authenticated;

comment on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text) is
  'Fecha o pedido de quem está logado numa transação: confere e desconta estoque com a linha travada, copia preço de produtos, aplica cupom pelo código e reserva por 48 horas. Não aceita preço, status nem desconto do cliente.';


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — todas as linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'cpf_valido aceita CPF bom e recusa repetido' as checagem,
       case when public.cpf_valido('52998224725') and not public.cpf_valido('11111111111')
                 and not public.cpf_valido('52998224724')
            then 'ok' else 'FALHOU' end as resultado
union all
select 'endereço completo em pedidos',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'pedidos'
                     and column_name in ('cpf', 'logradouro', 'endereco_numero', 'complemento', 'bairro')) = 5
            then 'ok' else 'FALHOU' end
union all
select 'cliente edita CPF na própria conta',
       case when has_column_privilege('authenticated', 'public.profiles', 'cpf', 'UPDATE')
            then 'ok' else 'FALHOU' end
union all
select 'role continua fechada',
       case when has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
            then 'FALHOU' else 'ok' end
union all
select 'produtos têm aros',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'produtos' and column_name = 'aros')
            then 'ok' else 'FALHOU' end
union all
select 'cliente não grava pedido direto',
       case when exists (select 1 from pg_policies
                          where tablename in ('pedidos', 'pedido_itens') and policyname like 'Cliente cria%')
            then 'FALHOU' else 'ok' end
union all
select 'criar_pedido fechado para visitante',
       case when has_function_privilege('anon',
              'public.criar_pedido(jsonb,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text)', 'EXECUTE')
            then 'FALHOU' else 'ok' end
union all
select 'criar_pedido aberto para quem tem conta',
       case when has_function_privilege('authenticated',
              'public.criar_pedido(jsonb,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text)', 'EXECUTE')
            then 'ok' else 'FALHOU' end
union all
select 'assinatura antiga removida',
       case when to_regprocedure('public.criar_pedido(jsonb,text,text,text,text,text,text,text,text,boolean,text)') is null
            then 'ok' else 'FALHOU' end
union all
select 'conferir_cupom fechado para visitante',
       case when has_function_privilege('anon', 'public.conferir_cupom(text,integer)', 'EXECUTE')
            then 'FALHOU' else 'ok' end
union all
select 'BEMVINDO10 só na primeira compra',
       case when not exists (select 1 from public.cupons where codigo = 'BEMVINDO10')
              or exists (select 1 from public.cupons where codigo = 'BEMVINDO10' and so_primeira_compra and um_por_cliente)
            then 'ok' else 'FALHOU' end
union all
select 'funções internas fora da API',
       case when has_function_privilege('anon', 'public.expirar_pedidos_vencidos()', 'EXECUTE')
              or has_function_privilege('authenticated', 'public.avaliar_cupom(public.cupons,integer,uuid,text,uuid)', 'EXECUTE')
              or has_function_privilege('authenticated', 'public.ajustar_uso_do_cupom_por_status()', 'EXECUTE')
            then 'FALHOU' else 'ok' end
union all
select 'job de expiração agendado',
       case when to_regclass('cron.job') is null then 'FALHOU (pg_cron não está ligado)'
            else 'ok' end;
