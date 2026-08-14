-- Estoque que significa alguma coisa, e um pedido que não pode sair torto.
--
-- Três problemas diferentes, todos na mesma costura entre carrinho e banco:
--
-- 1. O fechamento do pedido eram DOIS inserts do navegador — primeiro `pedidos`,
--    depois `pedido_itens`. Se o segundo falhasse, sobrava pedido sem peça
--    nenhuma, e o próprio código admitia isso numa mensagem de erro. Duas
--    escritas separadas não são uma transação.
--
-- 2. O preço vinha do navegador. `pedido_itens.preco_centavos` era o que o
--    cliente mandasse, e a trigger de total só somava o que recebeu — dava para
--    fechar um anel de R$ 2.420 por R$ 1 mexendo na requisição. Preço de joia
--    tem que sair de `produtos`, no servidor, sempre.
--
-- 3. `estoque` existia e não era lido nem escrito por ninguém. Sem baixa e sem
--    trava, dois clientes compram a mesma peça no mesmo minuto e os dois
--    recebem confirmação.
--
-- A resposta para os três é a mesma: uma função que faz tudo numa transação só,
-- com a linha do produto travada enquanto decide.
--
-- Aproveita para fechar uma escalada de privilégio encontrada ao ler as
-- policies (detalhe no bloco 1).


-- ---------------------------------------------------------------------------
-- 1) Escalada de privilégio em profiles
--
--    A policy "Cada um edita o próprio perfil" libera UPDATE na própria linha.
--    RLS decide LINHA, não coluna — e o Supabase concede UPDATE na tabela
--    inteira para `authenticated`. Somando as duas coisas, qualquer cliente
--    cadastrado podia mandar
--
--        PATCH /rest/v1/profiles?id=eq.<o próprio>   {"role":"admin"}
--
--    e virar admin. Daí em diante `is_admin()` responde true para ele, e o
--    painel inteiro abre: e-mail, telefone e pedidos de todos os clientes.
--
--    O conserto é privilégio de coluna, que é o mecanismo certo para isso: a
--    policy continua igual, mas `role` deixa de ser escrevível pela API por
--    qualquer papel. Promover alguém segue sendo o UPDATE manual no SQL Editor
--    que o CLAUDE.md já descreve como passo consciente — e agora é o único
--    caminho, em vez de ser o caminho educado.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;
-- O `grant` das colunas liberadas vem no fim do bloco 2: uma delas ainda não
-- existe neste ponto do arquivo.


-- ---------------------------------------------------------------------------
-- 2) Forma de pagamento preferida
--
--    NÃO é cartão salvo. Número de cartão não entra neste banco em hipótese
--    alguma: guardar cartão exige cofre de PSP e certificação PCI, e um site de
--    joalheria não tem por que carregar esse risco. Quando o Mercado Pago
--    entrar (Módulo 2), o que se guarda é o token dele, nunca o número.
--
--    Isto aqui é preferência declarada: por onde a pessoa prefere acertar. Serve
--    para a Florenza já abrir a conversa no WhatsApp sabendo o que oferecer.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists forma_pagamento_preferida text;

alter table public.profiles
  drop constraint if exists profiles_forma_pagamento_check;

alter table public.profiles
  add constraint profiles_forma_pagamento_check
  check (forma_pagamento_preferida is null
         or forma_pagamento_preferida in ('pix', 'cartao', 'transferencia', 'combinar'));

-- Agora sim: as únicas colunas de profiles que a pessoa pode mexer na própria
-- linha. `role`, `id` e `created_at` ficam de fora — é o conserto do bloco 1.
grant update (nome, telefone, cep, cidade, uf, forma_pagamento_preferida)
  on public.profiles to authenticated;


-- ---------------------------------------------------------------------------
-- 3) criar_pedido()
--
--    Uma chamada, uma transação. Ou nasce o pedido inteiro com as peças e o
--    estoque descontado, ou não nasce nada.
--
--    `for update` na linha do produto é o coração: a segunda transação que
--    pedir a mesma peça fica esperando aqui e só lê o estoque depois que a
--    primeira terminou. Sem isso as duas leem "resta 1" e as duas vendem.
--
--    O laço percorre as peças em ordem de SKU de propósito. Dois pedidos com as
--    mesmas duas peças em ordens opostas travariam um no outro — cada um
--    segurando o que o outro espera. Ordem igual para todo mundo, sem impasse.
--
--    SECURITY DEFINER com EXECUTE para `anon` porque comprar sem conta é
--    permitido (`pedidos.user_id` é nulo nesse caso). Não é porta aberta: a
--    função não aceita preço, não aceita status e não aceita id — só nome,
--    contato, endereço e uma lista de SKU com quantidade. Todo o resto ela
--    calcula.
-- ---------------------------------------------------------------------------
create or replace function public.criar_pedido(
  p_itens       jsonb,
  p_nome        text,
  p_telefone    text default null,
  p_email       text default null,
  p_cep         text default null,
  p_cidade      text default null,
  p_uf          text default null,
  p_observacoes text default null
)
returns table (pedido_id uuid, pedido_numero bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido_id uuid;
  v_numero    bigint;
  v_item      record;
  v_produto   record;
begin
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Carrinho vazio.' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Falta o nome de quem está comprando.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (
    user_id, nome, email, telefone, cep, cidade, uf,
    origem, status, total_centavos, observacoes
  ) values (
    (select auth.uid()),
    trim(p_nome),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_telefone, '')), ''),
    nullif(trim(coalesce(p_cep, '')), ''),
    nullif(trim(coalesce(p_cidade, '')), ''),
    nullif(upper(trim(coalesce(p_uf, ''))), ''),
    'site',
    'aguardando_pagamento',
    0,  -- a trigger pedido_itens_recalcula_total corrige a cada peça inserida
    nullif(trim(coalesce(p_observacoes, '')), '')
  )
  returning id, numero into v_pedido_id, v_numero;

  for v_item in
    -- Agrupa por SKU antes de tudo: o mesmo código repetido no carrinho viraria
    -- duas baixas de estoque e duas linhas de item para a mesma peça.
    select  e.valor ->> 'sku' as sku,
            sum(greatest(1, coalesce((e.valor ->> 'quantidade')::int, 1)))::int as quantidade
      from  jsonb_array_elements(p_itens) as e(valor)
     where  coalesce(e.valor ->> 'sku', '') <> ''
     group  by e.valor ->> 'sku'
     order  by 1
  loop
    select p.id, p.nome, p.preco_centavos, p.estoque, p.ativo
      into v_produto
      from public.produtos p
     where p.sku = v_item.sku
     for update;

    if not found then
      raise exception 'A peça de código % não está mais no catálogo.', v_item.sku
        using errcode = 'P0001';
    end if;

    if not v_produto.ativo then
      raise exception 'A peça % saiu do catálogo.', v_produto.nome
        using errcode = 'P0001';
    end if;

    if v_produto.estoque < v_item.quantidade then
      raise exception 'Restam % unidade(s) de %.', v_produto.estoque, v_produto.nome
        using errcode = 'P0001';
    end if;

    -- Preço e nome saem daqui, do banco, e viram cópia no item. O que o
    -- navegador mandou de preço é ignorado.
    insert into public.pedido_itens (pedido_id, produto_id, sku, nome, preco_centavos, quantidade)
    values (v_pedido_id, v_produto.id, v_item.sku, v_produto.nome,
            v_produto.preco_centavos, v_item.quantidade);

    update public.produtos
       set estoque = estoque - v_item.quantidade
     where id = v_produto.id;
  end loop;

  return query select v_pedido_id, v_numero;
end;
$$;

revoke execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text) from public;
grant  execute on function public.criar_pedido(jsonb, text, text, text, text, text, text, text) to anon, authenticated;

comment on function public.criar_pedido(jsonb, text, text, text, text, text, text, text) is
  'Fecha o pedido inteiro numa transação: confere e desconta estoque com a linha travada, e copia preço e nome de produtos. Não aceita preço do cliente.';


-- ---------------------------------------------------------------------------
-- 4) Estoque de volta quando o pedido é cancelado
--
--    Sem isto a peça fica presa: o pedido morre no painel e o estoque nunca
--    volta, então a última unidade some da vitrine para sempre.
--
--    Trata os dois sentidos. Sair de 'cancelado' (o admin corrigiu um clique
--    errado) tem que tirar o estoque de novo, senão cancelar e descancelar vira
--    uma máquina de inventar unidade. E se nesse meio-tempo a peça tiver sido
--    vendida, a mudança de status é barrada com recado, em vez de deixar o
--    estoque negativo.
--
--    Peça excluída do catálogo tem `produto_id` nulo no item (a FK é
--    `on delete set null`) e por isso não entra na conta — não há para onde
--    devolver.
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
    update public.produtos p
       set estoque = p.estoque + s.qtd
      from (select produto_id, sum(quantidade)::int as qtd
              from public.pedido_itens
             where pedido_id = new.id and produto_id is not null
             group by produto_id) s
     where p.id = s.produto_id;

  elsif old.status = 'cancelado' and new.status is distinct from 'cancelado' then
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

  return new;
end;
$$;

-- Mesma razão de recalcular_total_do_pedido: função de trigger não recebe
-- EXECUTE, senão o PostgREST a publica em /rest/v1/rpc/. Revogar não desliga a
-- trigger — o Postgres confere essa permissão ao criar a trigger, não a cada
-- disparo.
revoke execute on function public.ajustar_estoque_por_status() from public, anon, authenticated;

drop trigger if exists pedidos_ajusta_estoque on public.pedidos;
create trigger pedidos_ajusta_estoque
  after update of status on public.pedidos
  for each row execute function public.ajustar_estoque_por_status();


-- ---------------------------------------------------------------------------
-- 5) Carga inicial de estoque
--
--    Os 20 produtos entraram com estoque 0, porque a coluna não era usada. Com
--    a vitrine passando a esconder o que está zerado, a loja abriria inteira
--    esgotada.
--
--    `where estoque = 0` faz a carga ser idempotente e, mais importante, não
--    atropelar contagem de verdade: rodando de novo depois de o dono ajustar as
--    quantidades no painel, nada do que ele digitou é sobrescrito.
-- ---------------------------------------------------------------------------
update public.produtos set estoque = 5 where estoque = 0;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA — as seis linhas precisam vir 'ok'
-- ---------------------------------------------------------------------------
select 'role fechada para authenticated' as checagem,
       case when has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
            then 'FALHOU' else 'ok' end as resultado
union all
select 'nome ainda editável pelo dono',
       case when has_column_privilege('authenticated', 'public.profiles', 'nome', 'UPDATE')
            then 'ok' else 'FALHOU' end
union all
select 'criar_pedido existe',
       case when to_regprocedure('public.criar_pedido(jsonb,text,text,text,text,text,text,text)') is not null
            then 'ok' else 'FALHOU' end
union all
select 'criar_pedido executável por anon',
       case when has_function_privilege('anon', 'public.criar_pedido(jsonb,text,text,text,text,text,text,text)', 'EXECUTE')
            then 'ok' else 'FALHOU' end
union all
select 'trigger de estoque no lugar',
       case when exists (select 1 from pg_trigger where tgname = 'pedidos_ajusta_estoque')
            then 'ok' else 'FALHOU' end
union all
select 'nenhuma peça zerada',
       case when (select count(*) from public.produtos where estoque = 0) = 0
            then 'ok' else 'FALHOU' end;
