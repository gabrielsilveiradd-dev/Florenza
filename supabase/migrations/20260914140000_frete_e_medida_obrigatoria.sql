-- ============================================================================
-- FLORENZA — FRETE CALCULADO PELO BANCO, E MEDIDA DO ARO OBRIGATÓRIA
--
-- Duas mudanças no fechamento do pedido, decididas em 14/09/2026:
--
--   1. FRETE. O pedido não tinha frete: nem valor, nem prazo, nem forma de
--      envio — e a lei pede que o custo da entrega apareça antes de a pessoa
--      pagar. Os meios de envio reais ainda não foram escolhidos, então a tabela
--      `fretes` nasce com VALORES FICTÍCIOS, por região: o bastante para a tela,
--      o pedido e o pagamento funcionarem de ponta a ponta. Quando os meios
--      reais chegarem, muda a tabela, não o código.
--
--      A regra é a mesma do preço e do cupom: o navegador manda a MODALIDADE
--      ("economica"), nunca o valor. criar_pedido() procura o preço pela região
--      da entrega e copia para o pedido.
--
--   2. MEDIDA. "Não sei ainda" deixa de existir: peça com aro só fecha pedido
--      com a medida escolhida. Medida a combinar era uma conversa a mais antes
--      de a peça sair, e a tela agora tem o guia de medidas para quem não sabe
--      medir. Pedidos antigos com medida nula continuam válidos — a regra vale
--      para pedido novo.
--
-- ORDEM DE PUBLICAÇÃO: criar_pedido() muda de assinatura e passa a exigir frete
-- e medida. Aplicar esta migration e publicar o código novo andam juntos, como
-- em 14/09 — ver DEPLOY.md.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) fretes — quanto custa e quanto demora, por região
--
--    Por REGIÃO e não por estado: 27 linhas por modalidade seriam 27 números a
--    manter à mão, e o custo de envio segue a região quase sempre. `ufs.regiao`
--    já é a fonte única dessa divisão.
--
--    `nome` é o que o cliente lê ("Econômica"); `modalidade` é o código que o
--    carrinho manda. Prazo em dias úteis, contado a partir da postagem.
-- ---------------------------------------------------------------------------
create table if not exists public.fretes (
  modalidade     text        not null check (modalidade ~ '^[a-z0-9_]{1,30}$'),
  regiao         text        not null check (regiao in ('Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul')),
  nome           text        not null check (length(trim(nome)) > 0),
  preco_centavos integer     not null check (preco_centavos >= 0),
  prazo_min_dias smallint    not null check (prazo_min_dias >= 0),
  prazo_max_dias smallint    not null,
  ordem          smallint    not null default 0,
  ativo          boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (modalidade, regiao),
  constraint fretes_prazo_valido check (prazo_max_dias >= prazo_min_dias)
);

drop trigger if exists fretes_updated_at on public.fretes;
create trigger fretes_updated_at
  before update on public.fretes
  for each row execute function public.tocar_updated_at();

alter table public.fretes enable row level security;

-- Frete é informação pública: a página da peça cota para quem nem entrou.
-- Mesmo desenho do catálogo — uma policy de leitura com `or is_admin()`, e a
-- escrita do admin separada, para não duplicar policy no SELECT.
drop policy if exists "Fretes ativos são públicos" on public.fretes;
create policy "Fretes ativos são públicos" on public.fretes
  for select using (ativo or public.is_admin());

drop policy if exists "Admin cria fretes" on public.fretes;
create policy "Admin cria fretes" on public.fretes
  for insert to authenticated with check (public.is_admin());

drop policy if exists "Admin edita fretes" on public.fretes;
create policy "Admin edita fretes" on public.fretes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin apaga fretes" on public.fretes;
create policy "Admin apaga fretes" on public.fretes
  for delete to authenticated using (public.is_admin());

-- VALORES FICTÍCIOS. Servem para a loja funcionar enquanto os meios de envio
-- não são escolhidos — trocar antes de vender de verdade (antes-de-abrir.sql,
-- bloco 10). `do nothing` no conflito: rodar esta migration de novo não desfaz
-- os valores reais que já tiverem sido postos.
insert into public.fretes (modalidade, regiao, nome, preco_centavos, prazo_min_dias, prazo_max_dias, ordem) values
  ('economica', 'Sudeste',      'Econômica', 2490, 3,  6, 1),
  ('economica', 'Sul',          'Econômica', 2990, 4,  8, 1),
  ('economica', 'Centro-Oeste', 'Econômica', 3290, 5,  9, 1),
  ('economica', 'Nordeste',     'Econômica', 3690, 6, 11, 1),
  ('economica', 'Norte',        'Econômica', 4290, 8, 14, 1),
  ('expressa',  'Sudeste',      'Expressa',  4490, 1,  3, 2),
  ('expressa',  'Sul',          'Expressa',  5490, 2,  4, 2),
  ('expressa',  'Centro-Oeste', 'Expressa',  5990, 2,  5, 2),
  ('expressa',  'Nordeste',     'Expressa',  6990, 3,  6, 2),
  ('expressa',  'Norte',        'Expressa',  7990, 4,  8, 2)
on conflict (modalidade, regiao) do nothing;


-- ---------------------------------------------------------------------------
-- 2) uf_do_cep() — o estado que o próprio CEP diz
--
--    Faixas dos Correios. Serve a duas coisas: cotar o frete só com o CEP (a
--    página da peça não tem formulário de endereço) e conferir, no fechamento,
--    que CEP e estado concordam.
--
--    CEP fora das faixas devolve NULL, e quem chama decide o que fazer — nunca
--    recusa sozinha. Uma faixa que falte aqui não pode barrar uma venda.
--
--    Pura, sem tabela: executável por todos, como cpf_valido().
-- ---------------------------------------------------------------------------
create or replace function public.uf_do_cep(p_cep text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when n between  1000 and 19999 then 'SP'
           when n between 20000 and 28999 then 'RJ'
           when n between 29000 and 29999 then 'ES'
           when n between 30000 and 39999 then 'MG'
           when n between 40000 and 48999 then 'BA'
           when n between 49000 and 49999 then 'SE'
           when n between 50000 and 56999 then 'PE'
           when n between 57000 and 57999 then 'AL'
           when n between 58000 and 58999 then 'PB'
           when n between 59000 and 59999 then 'RN'
           when n between 60000 and 63999 then 'CE'
           when n between 64000 and 64999 then 'PI'
           when n between 65000 and 65999 then 'MA'
           when n between 66000 and 68899 then 'PA'
           when n between 68900 and 68999 then 'AP'
           when n between 69000 and 69299 then 'AM'
           when n between 69300 and 69399 then 'RR'
           when n between 69400 and 69899 then 'AM'
           when n between 69900 and 69999 then 'AC'
           when n between 70000 and 72799 then 'DF'
           when n between 72800 and 72999 then 'GO'
           when n between 73000 and 73699 then 'DF'
           when n between 73700 and 76799 then 'GO'
           when n between 76800 and 76999 then 'RO'
           when n between 77000 and 77999 then 'TO'
           when n between 78000 and 78899 then 'MT'
           when n between 79000 and 79999 then 'MS'
           when n between 80000 and 87999 then 'PR'
           when n between 88000 and 89999 then 'SC'
           when n between 90000 and 99999 then 'RS'
         end
    from (
      select case when d ~ '^[0-9]{8}$' then substr(d, 1, 5)::integer end as n
        from (select regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g') as d) limpo
    ) prefixo;
$$;


-- ---------------------------------------------------------------------------
-- 3) cotar_frete() — o que a página da peça e o carrinho mostram
--
--    A região sai do CEP; `p_uf` (o estado que o ViaCEP devolveu) só entra se o
--    CEP cair fora das faixas conhecidas. Sem região, zero linhas — a tela diz
--    que não achou o CEP.
--
--    SECURITY INVOKER (o padrão): lê `ufs` e `fretes` pelas policies públicas
--    que as duas já têm. Não precisa de privilégio a mais para responder.
-- ---------------------------------------------------------------------------
create or replace function public.cotar_frete(p_cep text, p_uf text default null)
returns table (
  modalidade     text,
  nome           text,
  preco_centavos integer,
  prazo_min_dias smallint,
  prazo_max_dias smallint,
  uf             text,
  uf_nome        text,
  regiao         text
)
language sql
stable
set search_path = ''
as $$
  select f.modalidade, f.nome, f.preco_centavos, f.prazo_min_dias, f.prazo_max_dias,
         u.uf::text, u.nome, u.regiao
    from public.ufs u
    join public.fretes f on f.regiao = u.regiao and f.ativo
   where regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8}$'
     and u.uf = coalesce(public.uf_do_cep(p_cep), upper(trim(coalesce(p_uf, ''))))
   order by f.ordem, f.preco_centavos;
$$;

revoke execute on function public.cotar_frete(text, text) from public;
grant  execute on function public.cotar_frete(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) O pedido guarda o frete, e o total passa a somá-lo
--
--    Cópia, como o preço das peças: se a tabela mudar amanhã, o pedido de hoje
--    continua dizendo quanto foi cobrado e em quanto tempo a peça chegaria.
--
--    `frete_centavos` nasce 0 para os pedidos que já existem e para a venda
--    lançada à mão no painel — os dois não tinham frete.
-- ---------------------------------------------------------------------------
alter table public.pedidos add column if not exists frete_modalidade     text;
alter table public.pedidos add column if not exists frete_nome           text;
alter table public.pedidos add column if not exists frete_centavos       integer not null default 0;
alter table public.pedidos add column if not exists frete_prazo_min_dias smallint;
alter table public.pedidos add column if not exists frete_prazo_max_dias smallint;

alter table public.pedidos drop constraint if exists pedidos_frete_valido;
alter table public.pedidos add constraint pedidos_frete_valido check (frete_centavos >= 0);

-- Total = peças − desconto + frete. O desconto nunca come o frete: cupom de
-- R$ 500 num pedido de R$ 349 zera as peças, e a entrega continua cobrada.
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
           total_centavos    = greatest(0, v_subtotal - desconto_centavos) + frete_centavos
     where id = v_pedido;
  end if;

  return coalesce(new, old);
end;
$$;

revoke execute on function public.recalcular_total_do_pedido() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 5) criar_pedido() — agora com frete e medida obrigatória
--
--    O corpo é o da migration 20260914120000. Mudam três pontos, marcados com
--    NOVO: CEP e estado precisam concordar; a forma de envio chega pela
--    modalidade e o valor sai de `fretes`; peça com aro sem medida é recusada.
--
--    A assinatura ganha `p_frete` e o retorno ganha `pedido_frete_centavos` —
--    por isso a função antiga sai antes, senão o PostgREST ficaria com duas.
-- ---------------------------------------------------------------------------
drop function if exists public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text);

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
  p_mensagem_presente text    default null,
  p_frete             text    default null
)
returns table (
  pedido_id             uuid,
  pedido_numero         bigint,
  pedido_total_centavos integer,
  pedido_frete_centavos integer,
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

  v_usuario    uuid := (select auth.uid());
  v_perfil     public.profiles;
  v_email      text;
  v_nome       text;
  v_telefone   text;
  v_cpf        text;
  v_cep        text := regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g');
  v_uf         text := upper(trim(coalesce(p_uf, '')));
  v_uf_do_cep  text;
  v_pendentes  integer;

  v_modalidade text := nullif(lower(trim(coalesce(p_frete, ''))), '');
  v_frete      public.fretes;

  v_linhas     jsonb;
  v_peca       record;
  v_linha      record;
  v_produto    public.produtos;

  v_pedido_id  uuid;
  v_numero     bigint;
  v_expira     timestamptz := now() + c_reserva;
  v_subtotal   integer := 0;
  v_codigo     text := nullif(upper(trim(coalesce(p_cupom, ''))), '');
  v_cupom      public.cupons;
  v_avaliacao  record;
  v_desconto   integer := 0;
  v_total      integer;
  v_presente   boolean := coalesce(p_presente, false);
  -- Mensagem só sobrevive se for presente — a mesma regra do check da tabela,
  -- aplicada antes de gravar para a constraint nunca precisar reclamar.
  v_mensagem   text := case when coalesce(p_presente, false)
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

  -- NOVO: o CEP diz o estado. Divergindo do escolhido, a etiqueta sairia para
  -- um lugar e o frete seria cobrado para outro. CEP fora das faixas conhecidas
  -- não é barrado: vale o estado do formulário.
  v_uf_do_cep := public.uf_do_cep(v_cep);
  if v_uf_do_cep is not null and v_uf_do_cep <> v_uf then
    raise exception 'O CEP %-% é de %, mas o estado escolhido é %. Confira o endereço.',
      substr(v_cep, 1, 5), substr(v_cep, 6, 3), v_uf_do_cep, v_uf using errcode = 'P0001';
  end if;

  -- ---- Como vai (NOVO) ------------------------------------------------------
  -- Chega a modalidade, nunca o valor. O preço sai da tabela, pela região da
  -- entrega, e vira cópia no pedido como o preço das peças.
  if v_modalidade is null then
    raise exception 'Escolha a forma de envio.' using errcode = 'P0001';
  end if;

  select f.* into v_frete
    from public.fretes f
    join public.ufs u on u.regiao = f.regiao
   where u.uf = v_uf
     and f.modalidade = v_modalidade
     and f.ativo;

  if not found then
    raise exception 'Essa forma de envio não atende o endereço informado. Escolha outra.' using errcode = 'P0001';
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
    origem, status, total_centavos, observacoes, presente, mensagem_presente, expira_em,
    frete_modalidade, frete_nome, frete_centavos, frete_prazo_min_dias, frete_prazo_max_dias
  ) values (
    v_usuario, v_nome, v_email, v_telefone, v_cpf,
    v_cep, trim(p_logradouro), trim(p_endereco_numero),
    nullif(trim(coalesce(p_complemento, '')), ''), trim(p_bairro), trim(p_cidade), v_uf,
    'site', 'aguardando_pagamento', 0,
    nullif(trim(coalesce(p_observacoes, '')), ''),
    v_presente, v_mensagem, v_expira,
    v_frete.modalidade, v_frete.nome, v_frete.preco_centavos, v_frete.prazo_min_dias, v_frete.prazo_max_dias
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

    -- NOVO: medida obrigatória. Tamanho que a peça NÃO tem continua descartado
    -- (carrinho antigo de uma peça que deixou de ser par); o que ela tem e não
    -- veio é recusado.
    if v_produto.aros >= 1 and v_linha.tamanho is null then
      raise exception 'Escolha a medida do aro de % antes de fechar o pedido.', v_produto.nome
        using errcode = 'P0001';
    end if;
    if v_produto.aros = 2 and v_linha.tamanho_par is null then
      raise exception 'Escolha as duas medidas de % antes de fechar o pedido.', v_produto.nome
        using errcode = 'P0001';
    end if;

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
  -- dois pedidos simultâneos furam o limite de usos. O desconto é sobre as
  -- peças; o frete fica de fora.
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

  v_total := greatest(0, v_subtotal - v_desconto) + v_frete.preco_centavos;

  update public.pedidos p
     set subtotal_centavos = v_subtotal,
         desconto_centavos = v_desconto,
         cupom_codigo      = v_codigo,
         total_centavos    = v_total
   where p.id = v_pedido_id;

  return query select v_pedido_id, v_numero, v_total, v_frete.preco_centavos, v_expira;
end;
$$;

revoke execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text)
  from public, anon;
grant  execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text)
  to authenticated;

comment on function public.criar_pedido(jsonb, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) is
  'Fecha o pedido de quem está logado numa transação: confere e desconta estoque com a linha travada, exige a medida de peça com aro, copia preço de produtos e frete de fretes, aplica cupom pelo código e reserva por 48 horas. Não aceita preço, frete, status nem desconto do cliente.';


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as linhas precisam vir 'ok'; a última lembra dos valores
-- ---------------------------------------------------------------------------
select 'fretes com RLS' as checagem,
       case when (select relrowsecurity from pg_class where oid = 'public.fretes'::regclass)
            then 'ok' else 'FALHOU' end as resultado
union all
select 'visitante cota frete',
       case when has_function_privilege('anon', 'public.cotar_frete(text,text)', 'EXECUTE')
            then 'ok' else 'FALHOU' end
union all
select 'uf_do_cep conhece as faixas',
       case when public.uf_do_cep('01310-100') = 'SP' and public.uf_do_cep('20040002') = 'RJ'
              and public.uf_do_cep('70040010') = 'DF' and public.uf_do_cep('72800000') = 'GO'
              and public.uf_do_cep('69900000') = 'AC' and public.uf_do_cep('00000000') is null
              and public.uf_do_cep('123') is null
            then 'ok' else 'FALHOU' end
union all
select 'cotação para São Paulo',
       case when (select count(*) from public.cotar_frete('01310100')) >= 1
            then 'ok' else 'FALHOU (tabela de fretes vazia ou desligada)' end
union all
select 'pedidos guardam o frete',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'pedidos'
                     and column_name in ('frete_modalidade', 'frete_nome', 'frete_centavos',
                                         'frete_prazo_min_dias', 'frete_prazo_max_dias')) = 5
            then 'ok' else 'FALHOU' end
union all
select 'criar_pedido com frete',
       case when to_regprocedure('public.criar_pedido(jsonb,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)') is not null
            then 'ok' else 'FALHOU' end
union all
select 'assinatura sem frete removida',
       case when to_regprocedure('public.criar_pedido(jsonb,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text)') is null
            then 'ok' else 'FALHOU' end
union all
select 'criar_pedido fechado para visitante',
       case when has_function_privilege('anon',
              'public.criar_pedido(jsonb,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)', 'EXECUTE')
            then 'FALHOU' else 'ok' end
union all
select 'valores de frete',
       case when (select count(*) from public.fretes) = 10
              and (select sum(preco_centavos) from public.fretes) = 47700
            then 'PENDENTE — ainda os valores fictícios; trocar antes de vender (antes-de-abrir.sql, bloco 10)'
            else 'ok' end;
