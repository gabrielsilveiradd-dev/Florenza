-- ============================================================================
-- FLORENZA — ALIANÇA POR UNIDADE, E OS TEXTOS DE OURO E PRATA
--
-- Decisões da loja em 31/10/2026:
--
--   1. PAR OU UNIDADE. Toda aliança passa a ser vendida das duas formas. O preço
--      da ficha continua sendo o do PAR, e a unidade custa a metade. O navegador
--      manda só `avulsa: true`, nunca o valor: criar_pedido() calcula o preço,
--      como faz com o resto, e recusa a unidade em peça que não é par.
--
--      Estoque: de aliança, conta ALIANÇAS, não pares. O par baixa 2 e a unidade
--      baixa 1. O estoque atual, que contava pares, é multiplicado por 2 uma vez.
--
--   2. ALIANÇAS DE PRATA COMO PAR. 13 das 16 peças ativas de prata estavam com
--      `aros = 1`, inclusive 4 cujo arquivo de origem dizia "par" no preço
--      (9010, 9011, 9013, 9014): quem pagava o par recebia uma aliança só.
--
--   3. TEXTOS. As categorias passam a "Alianças de Ouro" e "Alianças de Prata";
--      "lapidadas à mão" dá lugar a "feitas em maquinário"; ouro 18K vira
--      18K (750); prata 925 vira 950, inclusive P301 e P601.
--
-- Pedido antigo não fica errado: a devolução usa `pedido_itens.aros`, e antes
-- desta migration só havia um pedido, de anel de formatura.
--
-- ORDEM DE PUBLICAÇÃO: esta migration ANTES do código. O código antigo continua
-- funcionando com ela (nunca manda `avulsa`); o novo, sem ela, teria a unidade
-- recusada por falta da segunda medida.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Toda aliança é par ou unidade
-- ---------------------------------------------------------------------------
update public.produtos
   set aros = 2
 where categoria_slug in ('aliancas-ouro', 'aliancas-prata')
   and aros <> 2;


-- ---------------------------------------------------------------------------
-- 1b) O estoque de aliança passa a contar alianças
--
--     Só uma vez: o comentário da coluna é a marca de que já foi convertido, e
--     rodar de novo não dobra o estoque.
-- ---------------------------------------------------------------------------
do $$
begin
  if coalesce(col_description('public.produtos'::regclass,
       (select attnum from pg_attribute
         where attrelid = 'public.produtos'::regclass and attname = 'estoque')), '') not like '%alianças%' then
    update public.produtos
       set estoque = estoque * 2
     where categoria_slug in ('aliancas-ouro', 'aliancas-prata');
  end if;
end;
$$;

comment on column public.produtos.estoque is
  'Unidades disponíveis. Em peça com aros = 2, conta alianças: o par baixa 2 e a unidade baixa 1.';

-- Quanto uma linha de pedido tira do estoque: a linha do par tem aros = 2; a da
-- unidade, aros = 1. Espelhada em `aliancasDaLinha()`, de lib/aros.ts.
create or replace function public.aliancas_da_linha(p_quantidade integer, p_aros integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select p_quantidade * case when p_aros = 2 then 2 else 1 end;
$$;

revoke execute on function public.aliancas_da_linha(integer, integer) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2) Os textos
--
--    Cada troca só pega o texto antigo: rodar de novo não duplica o "(750)".
-- ---------------------------------------------------------------------------
update public.categorias
   set nome = 'Alianças de Ouro',
       descricao = 'Peças atemporais, feitas em maquinário para selar promessas que atravessam gerações. O ouro 18K (750) é sinônimo de nobreza, beleza e eternidade.'
 where slug = 'aliancas-ouro'
   and (nome = 'Anéis de Ouro' or descricao like '%lapidadas à mão%');

update public.categorias
   set nome = 'Alianças de Prata',
       descricao = replace(descricao, 'prata 925', 'prata 950')
 where slug = 'aliancas-prata'
   and (nome = 'Anéis de Prata' or descricao like '%prata 925%');

update public.filtro_opcoes
   set nome = 'Ouro 18K (750)'
 where categoria_slug = 'aliancas-ouro' and nome = 'Ouro 18K';

update public.produtos
   set metal = replace(metal, 'Ouro 18K', 'Ouro 18K (750)')
 where categoria_slug = 'aliancas-ouro'
   and metal like 'Ouro 18K%' and metal not like '%(750)%';

update public.produtos
   set alt = replace(alt, 'ouro 18K', 'ouro 18K (750)')
 where categoria_slug = 'aliancas-ouro'
   and alt like '%ouro 18K%' and alt not like '%(750)%';

update public.produtos
   set metal = replace(metal, 'Prata 925', 'Prata 950'),
       alt   = replace(alt, 'prata 925', 'prata 950')
 where categoria_slug = 'aliancas-prata'
   and (metal like '%925%' or alt like '%925%');


-- ---------------------------------------------------------------------------
-- 3) criar_pedido() aceita a unidade
--
--    O corpo é o da migration 20260914140000. Muda só o que está marcado com
--    UNIDADE, mais `avulsa` na normalização do carrinho. A assinatura é a mesma.
-- ---------------------------------------------------------------------------
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
  v_preco      integer;
  v_baixa      integer;

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

  -- O CEP diz o estado. Divergindo do escolhido, a etiqueta sairia para
  -- um lugar e o frete seria cobrado para outro. CEP fora das faixas conhecidas
  -- não é barrado: vale o estado do formulário.
  v_uf_do_cep := public.uf_do_cep(v_cep);
  if v_uf_do_cep is not null and v_uf_do_cep <> v_uf then
    raise exception 'O CEP %-% é de %, mas o estado escolhido é %. Confira o endereço.',
      substr(v_cep, 1, 5), substr(v_cep, 6, 3), v_uf_do_cep, v_uf using errcode = 'P0001';
  end if;

  -- ---- Como vai --------------------------------------------------------------
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
           'sku', l.sku, 'tamanho', l.tamanho, 'tamanho_par', l.tamanho_par,
           'avulsa', l.avulsa, 'quantidade', l.quantidade
         )), '[]'::jsonb)
    into v_linhas
    from (
      select e.valor ->> 'sku' as sku,
             case when (e.valor ->> 'tamanho') ~ '^[0-9]{1,2}$'
                  then (e.valor ->> 'tamanho')::smallint end as tamanho,
             case when (e.valor ->> 'tamanho_par') ~ '^[0-9]{1,2}$'
                  then (e.valor ->> 'tamanho_par')::smallint end as tamanho_par,
             coalesce((e.valor ->> 'avulsa') = 'true', false) as avulsa,
             sum(greatest(coalesce(
               case when (e.valor ->> 'quantidade') ~ '^[0-9]{1,4}$'
                    then (e.valor ->> 'quantidade')::integer end, 1), 1))::integer as quantidade
        from jsonb_array_elements(p_itens) as e(valor)
       where jsonb_typeof(e.valor) = 'object'
         and coalesce(e.valor ->> 'sku', '') <> ''
       group by 1, 2, 3, 4
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
    select x ->> 'sku' as sku, sum((x ->> 'quantidade')::integer)::integer as quantidade,
           sum(public.aliancas_da_linha((x ->> 'quantidade')::integer,
                                        case when (x ->> 'avulsa')::boolean then 1 else 2 end))::integer as aliancas
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
    -- Peça em par conta alianças: o par baixa 2 e a unidade baixa 1.
    v_baixa := case when v_produto.aros = 2 then v_peca.aliancas else v_peca.quantidade end;

    if v_produto.estoque < v_baixa then
      if v_produto.aros = 2 then
        raise exception 'Restam % aliança(s) de %.', v_produto.estoque, v_produto.nome using errcode = 'P0001';
      end if;
      raise exception 'Restam % unidade(s) de %.', v_produto.estoque, v_produto.nome using errcode = 'P0001';
    end if;

    update public.produtos p set estoque = p.estoque - v_baixa where p.id = v_produto.id;
  end loop;

  -- ---- Passada 2: um item por peça e tamanho -------------------------------
  for v_linha in
    select x ->> 'sku' as sku,
           (x ->> 'tamanho')::smallint     as tamanho,
           (x ->> 'tamanho_par')::smallint as tamanho_par,
           (x ->> 'avulsa')::boolean       as avulsa,
           (x ->> 'quantidade')::integer   as quantidade
      from jsonb_array_elements(v_linhas) as x
     order by 1, 2 nulls last, 3 nulls last, 4
  loop
    -- A linha do produto já está travada pela passada 1.
    select * into v_produto from public.produtos p where p.sku = v_linha.sku;

    if (v_linha.tamanho is not null and v_linha.tamanho not between 1 and 40)
       or (v_linha.tamanho_par is not null and v_linha.tamanho_par not between 1 and 40) then
      raise exception 'Tamanho de aro inválido em %.', v_produto.nome using errcode = 'P0001';
    end if;

    -- UNIDADE: só peça vendida em par. Sem esta recusa, um anel de formatura
    -- sairia pela metade do preço mexendo na requisição.
    if v_linha.avulsa and v_produto.aros <> 2 then
      raise exception 'A peça % não é vendida por unidade.', v_produto.nome using errcode = 'P0001';
    end if;

    -- Medida obrigatória. Tamanho que a peça NÃO tem continua descartado
    -- (carrinho antigo de uma peça que deixou de ser par); o que ela tem e não
    -- veio é recusado.
    if v_produto.aros >= 1 and v_linha.tamanho is null then
      raise exception 'Escolha a medida do aro de % antes de fechar o pedido.', v_produto.nome
        using errcode = 'P0001';
    end if;
    if v_produto.aros = 2 and not v_linha.avulsa and v_linha.tamanho_par is null then
      raise exception 'Escolha as duas medidas de % antes de fechar o pedido.', v_produto.nome
        using errcode = 'P0001';
    end if;

    -- UNIDADE: metade do par, com centavo ímpar para cima, a mesma conta de
    -- precoDaUnidade(). O nome leva "(unidade)" porque é ele que chega à bancada,
    -- à conta do cliente, ao e-mail e ao PagBank, e a linha fica com um aro só.
    v_preco := case when v_linha.avulsa then (v_produto.preco_centavos + 1) / 2
                    else v_produto.preco_centavos end;

    insert into public.pedido_itens (
      pedido_id, produto_id, sku, nome, preco_centavos, quantidade, aros, tamanho, tamanho_par
    ) values (
      v_pedido_id, v_produto.id, v_linha.sku,
      case when v_linha.avulsa then v_produto.nome || ' (unidade)' else v_produto.nome end,
      v_preco, v_linha.quantidade,
      case when v_linha.avulsa then 1 else v_produto.aros end,
      case when v_produto.aros >= 1 then v_linha.tamanho end,
      case when v_produto.aros = 2 and not v_linha.avulsa then v_linha.tamanho_par end
    );

    v_subtotal := v_subtotal + (v_preco * v_linha.quantidade);
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
  'Fecha o pedido de quem está logado numa transação: confere e desconta estoque com a linha travada, exige a medida de peça com aro, copia preço de produtos (a unidade de aliança é a metade do par) e frete de fretes, aplica cupom pelo código e dá 48 horas para o pagamento. Não aceita preço, frete, status nem desconto do cliente.';


-- ---------------------------------------------------------------------------
-- 3b) Devolver e tirar de novo seguem a mesma conta
--
--     O corpo é o da migration 20261031130200. Muda só a soma de cada linha.
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
        from (select produto_id, sum(public.aliancas_da_linha(quantidade, aros))::int as qtd
                from public.pedido_itens
               where pedido_id = new.id and produto_id is not null
               group by produto_id) s
       where p.id = s.produto_id;
    end if;

  elsif old.status = 'cancelado' and new.status is distinct from 'cancelado' then
    if new.estoque_no_estorno is distinct from 'retido' then
      select p.nome, p.estoque, s.qtd
        into v_falta
        from (select produto_id, sum(public.aliancas_da_linha(quantidade, aros))::int as qtd
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
        from (select produto_id, sum(public.aliancas_da_linha(quantidade, aros))::int as qtd
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
      from (select produto_id, sum(public.aliancas_da_linha(quantidade, aros))::int as qtd
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


-- ---------------------------------------------------------------------------
-- 4) O ranking do painel continua com um nome por peça
--
--    A view agrupa por SKU e pega max(nome): sem isto, a peça apareceria como
--    "(unidade)" no ranking inteiro depois da primeira venda por unidade.
-- ---------------------------------------------------------------------------
create or replace view public.vw_produtos_vendidos with (security_invoker = true) as
  select
    i.sku,
    regexp_replace(max(i.nome), ' \(unidade\)$', '')      as nome,
    sum(i.quantidade)::bigint                              as unidades,
    sum(i.preco_centavos * i.quantidade)::bigint           as total_centavos,
    count(distinct i.pedido_id)::bigint                    as pedidos
  from public.pedido_itens i
  join public.vw_pedidos_confirmados p on p.id = i.pedido_id
  group by i.sku;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'toda aliança é par ou unidade' as checagem,
       case when exists (select 1 from public.produtos
                          where categoria_slug in ('aliancas-ouro', 'aliancas-prata') and aros <> 2)
            then 'FALHOU' else 'ok' end as resultado
union all
select 'nome e texto das categorias',
       case when exists (select 1 from public.categorias
                          where slug in ('aliancas-ouro', 'aliancas-prata')
                            and (nome like 'Anéis%' or descricao like '%lapidadas à mão%' or descricao like '%925%'))
            then 'FALHOU' else 'ok' end
union all
select 'ouro 18K (750)',
       case when exists (select 1 from public.produtos
                          where categoria_slug = 'aliancas-ouro' and metal not like '%(750)%')
            then 'FALHOU' else 'ok' end
union all
select 'prata 950',
       case when exists (select 1 from public.produtos
                          where categoria_slug = 'aliancas-prata' and (metal like '%925%' or alt like '%925%'))
            then 'FALHOU' else 'ok' end
union all
select 'estoque de aliança conta alianças',
       case when col_description('public.produtos'::regclass,
              (select attnum from pg_attribute
                where attrelid = 'public.produtos'::regclass and attname = 'estoque')) like '%alianças%'
            then 'ok' else 'FALHOU' end
union all
select 'aliancas_da_linha sem EXECUTE para o público',
       case when has_function_privilege('anon', 'public.aliancas_da_linha(integer,integer)', 'EXECUTE')
              or has_function_privilege('authenticated', 'public.aliancas_da_linha(integer,integer)', 'EXECUTE')
            then 'FALHOU' else 'ok' end
union all
select 'criar_pedido fechado para visitante',
       case when has_function_privilege('anon',
              'public.criar_pedido(jsonb,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,text)', 'EXECUTE')
            then 'FALHOU' else 'ok' end;
