-- ===========================================================================
-- FLORENZA — CARGA COMPLETA DO BANCO, EM UMA COLADA SÓ
--
-- Este arquivo é gerado: são as 7 migrations de supabase/migrations/ na ordem,
-- seguidas do seed do catálogo. Existe só para poupar seis idas ao SQL Editor.
-- A fonte de verdade continua sendo os arquivos originais — se precisar mudar
-- algo, mude lá e gere este de novo.
--
-- COMO USAR: SQL Editor do Supabase -> cole tudo -> Run.
-- É idempotente: rodar duas vezes não quebra nada.
--
-- No fim há uma CONFERÊNCIA única. Todas as linhas precisam dar "ok".
-- ===========================================================================


-- ###########################################################################
-- 20260814174040_base_perfis_e_papeis.sql
-- ###########################################################################

-- ============================================================================
-- FLORENZA — 01. BASE: perfis, papéis e utilidades
--
-- Primeira migration do projeto. Cria a identidade das pessoas que usam o site
-- (clientes) e do time (admin), mais duas funções que todas as migrations
-- seguintes reaproveitam.
--
-- COMO RODAR: `npx supabase db push --linked`, ou colar este arquivo inteiro no
-- SQL Editor do projeto e executar. É seguro rodar de novo — tudo usa
-- IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) updated_at automático
--
--    Sem isto, `updated_at` só muda se quem escreve lembrar de mandar o campo —
--    e uma hora alguém esquece, deixando o painel mostrar "atualizado em" errado.
-- ---------------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2) profiles — uma linha por conta criada no site
--
--    O e-mail NÃO é copiado para cá: ele já mora em auth.users e duplicá-lo
--    criaria duas versões da mesma verdade, que divergem no primeiro cadastro
--    com e-mail trocado. A view vw_clientes (migration 04) junta os dois.
--
--    `role` decide quem entra em /admin. Nasce sempre 'cliente': promover
--    alguém a admin é um UPDATE manual e consciente no SQL Editor, nunca algo
--    que o cadastro do site possa fazer sozinho.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  nome       text,
  telefone   text,
  cep        text,
  cidade     text,
  uf         char(2),
  role       text not null default 'cliente' check (role in ('cliente', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.tocar_updated_at();

-- O painel lista clientes ordenando por data de cadastro.
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);
-- E filtra por papel para separar cliente de equipe.
create index if not exists profiles_role_idx on public.profiles (role);


-- ---------------------------------------------------------------------------
-- 3) is_admin() — a pergunta que toda policy do painel faz
--
--    SECURITY DEFINER porque a função precisa ler `profiles` sem passar pela
--    RLS de `profiles` — se passasse, a política que usa is_admin() chamaria
--    is_admin() de novo, em recursão infinita.
--
--    `set search_path = ''` (com os nomes qualificados abaixo) fecha a porta
--    clássica de escalada de privilégio: sem isso, alguém com permissão de
--    criar objetos poderia plantar um `profiles` falso num schema à frente no
--    caminho de busca e a função passaria a ler a tabela errada.
--
--    A checagem de identidade está dentro do corpo — a função responde apenas
--    sobre quem está chamando, nunca sobre terceiros.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'
  );
$$;

--    Sobre quem pode CHAMAR: `anon` também recebe, e isso é necessário, não
--    descuido. Várias policies abaixo têm a forma `<condição> or is_admin()`.
--    Para um visitante sem sessão a primeira parte dá NULL (auth.uid() é nulo),
--    então o Postgres precisa avaliar is_admin() para decidir — e se `anon` não
--    tivesse EXECUTE, a consulta morreria com "permission denied for function"
--    em vez de devolver zero linhas. Erro no lugar de lista vazia, o que é pior
--    de diagnosticar e assusta sem motivo.
--
--    Conceder não abre nada: a função só responde sobre QUEM ESTÁ CHAMANDO, e
--    para uma sessão anônima a resposta é sempre false.
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) Cadastro no site cria o perfil sozinho
--
--    É esta trigger que faz a aba "Clientes" do painel se atualizar sem
--    ninguém digitar nada: quem cria conta vira uma linha em profiles no mesmo
--    instante, e a view vw_clientes já enxerga.
--
--    nome e telefone chegam em raw_user_meta_data porque o cadastro os envia em
--    `options.data` do signUp.
-- ---------------------------------------------------------------------------
create or replace function public.criar_perfil_do_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, telefone)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'nome', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'telefone', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_do_usuario();


-- ---------------------------------------------------------------------------
-- 5) RLS
--
--    `(select auth.uid())` e não `auth.uid()` puro: dentro do parêntese o
--    Postgres avalia uma vez e reaproveita; solto, ele chama a função uma vez
--    POR LINHA varrida. Em tabela grande a diferença é de ordem de grandeza.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Cada um lê o próprio perfil" on public.profiles;
create policy "Cada um lê o próprio perfil" on public.profiles
  for select using ((select auth.uid()) = id or public.is_admin());

drop policy if exists "Cada um edita o próprio perfil" on public.profiles;
create policy "Cada um edita o próprio perfil" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Admin precisa poder promover/rebaixar e corrigir cadastro.
drop policy if exists "Admin gerencia perfis" on public.profiles;
create policy "Admin gerencia perfis" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'tabela profiles' as item, count(*)::text as valor
  from information_schema.tables where table_schema = 'public' and table_name = 'profiles'
union all
select 'funcao is_admin', count(*)::text from pg_proc where proname = 'is_admin'
union all
select 'is_admin e security definer', (prosecdef)::text from pg_proc where proname = 'is_admin'
union all
select 'anon executa is_admin (responde false)',
       has_function_privilege('anon', 'public.is_admin()', 'execute')::text
union all
select 'trigger de novo usuario', count(*)::text from pg_trigger where tgname = 'ao_criar_usuario'
union all
select 'RLS ligada em profiles', (relrowsecurity)::text from pg_class where relname = 'profiles'
union all
select 'policies em profiles', count(*)::text from pg_policies where tablename = 'profiles';

-- Esperado: 1 | 1 | true | true | 1 | true | 3


-- ###########################################################################
-- 20260814174057_geografia_ufs.sql
-- ###########################################################################

-- ============================================================================
-- FLORENZA — 02. GEOGRAFIA: as 27 unidades federativas e suas regiões
--
-- Existe por causa da pergunta central do painel: "quais regiões do Brasil mais
-- compram?". Podia ser um CASE gigante dentro de cada consulta, mas aí o mapa,
-- o gráfico de regiões e o formulário de pedido teriam três cópias da mesma
-- verdade — e a primeira divergência (Tocantins no Norte ou no Centro-Oeste?)
-- só apareceria num número errado meses depois.
--
-- Sendo tabela, `pedidos.uf` ganha chave estrangeira e o banco passa a recusar
-- "SP " com espaço, "sp" minúsculo ou "XX" inexistente na hora do INSERT.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================

create table if not exists public.ufs (
  uf     char(2) primary key,
  nome   text not null,
  regiao text not null check (regiao in ('Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul')),
  ordem  smallint not null default 0
);

comment on table public.ufs is
  'Unidades federativas e suas regiões. Fonte única para o mapa do painel, para a agregação de vendas e para a validação de pedidos.';

insert into public.ufs (uf, nome, regiao, ordem) values
  ('AC', 'Acre',                'Norte',        1),
  ('AP', 'Amapá',               'Norte',        2),
  ('AM', 'Amazonas',            'Norte',        3),
  ('PA', 'Pará',                'Norte',        4),
  ('RO', 'Rondônia',            'Norte',        5),
  ('RR', 'Roraima',             'Norte',        6),
  ('TO', 'Tocantins',           'Norte',        7),
  ('AL', 'Alagoas',             'Nordeste',     8),
  ('BA', 'Bahia',               'Nordeste',     9),
  ('CE', 'Ceará',               'Nordeste',    10),
  ('MA', 'Maranhão',            'Nordeste',    11),
  ('PB', 'Paraíba',             'Nordeste',    12),
  ('PE', 'Pernambuco',          'Nordeste',    13),
  ('PI', 'Piauí',               'Nordeste',    14),
  ('RN', 'Rio Grande do Norte', 'Nordeste',    15),
  ('SE', 'Sergipe',             'Nordeste',    16),
  ('DF', 'Distrito Federal',    'Centro-Oeste', 17),
  ('GO', 'Goiás',               'Centro-Oeste', 18),
  ('MT', 'Mato Grosso',         'Centro-Oeste', 19),
  ('MS', 'Mato Grosso do Sul',  'Centro-Oeste', 20),
  ('ES', 'Espírito Santo',      'Sudeste',     21),
  ('MG', 'Minas Gerais',        'Sudeste',     22),
  ('RJ', 'Rio de Janeiro',      'Sudeste',     23),
  ('SP', 'São Paulo',           'Sudeste',     24),
  ('PR', 'Paraná',              'Sul',         25),
  ('RS', 'Rio Grande do Sul',   'Sul',         26),
  ('SC', 'Santa Catarina',      'Sul',         27)
on conflict (uf) do update
  set nome = excluded.nome, regiao = excluded.regiao, ordem = excluded.ordem;

create index if not exists ufs_regiao_idx on public.ufs (regiao);


-- ---------------------------------------------------------------------------
-- RLS
--
-- Leitura liberada para todo mundo, inclusive visitante não logado: o seletor
-- de estado do checkout precisa da lista antes de existir sessão. Não há nada
-- sensível aqui — é a divisão política do país.
--
-- Escrita: ninguém. Nem admin. A lista só muda se o IBGE mudar, e aí é uma
-- migration nova, revisada, e não um clique no painel.
-- ---------------------------------------------------------------------------
alter table public.ufs enable row level security;

drop policy if exists "UFs são públicas para leitura" on public.ufs;
create policy "UFs são públicas para leitura" on public.ufs
  for select using (true);


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'total de UFs' as item, count(*)::text as valor from public.ufs
union all
select 'regioes distintas', count(distinct regiao)::text from public.ufs
union all
select 'Sudeste tem 4', (count(*) = 4)::text from public.ufs where regiao = 'Sudeste'
union all
select 'Nordeste tem 9', (count(*) = 9)::text from public.ufs where regiao = 'Nordeste'
union all
select 'Norte tem 7', (count(*) = 7)::text from public.ufs where regiao = 'Norte'
union all
select 'Centro-Oeste tem 4', (count(*) = 4)::text from public.ufs where regiao = 'Centro-Oeste'
union all
select 'Sul tem 3', (count(*) = 3)::text from public.ufs where regiao = 'Sul'
union all
select 'RLS ligada', (relrowsecurity)::text from pg_class where relname = 'ufs';

-- Esperado: 27 | 5 | true | true | true | true | true | true


-- ###########################################################################
-- 20260814174116_catalogo.sql
-- ###########################################################################

-- ============================================================================
-- FLORENZA — 03. CATÁLOGO: categorias, filtros e produtos
--
-- Tira as fichas do repositório e põe no banco. Hoje elas moram em
-- lib/data/catalogo-local.ts (antes js/data/aneis-formatura.js) e nas quatro
-- alianças que estavam escritas à mão no HTML — por isso cadastrar peça nova
-- exige editar código e publicar de novo. Depois desta migration, é um
-- formulário no painel.
--
-- Duas formas de produto convivem: anel de formatura tem pedra, cor e
-- lapidação; aliança tem largura em milímetros. Estão resolvidas com colunas
-- nulas tipadas, e não com um `jsonb` de atributos, porque são poucas e
-- precisam ser filtráveis e conferíveis pelo banco — dentro de jsonb não há
-- CHECK, não há FK e o índice é sempre mais caro.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) categorias — as três páginas da vitrine
--
--    `slug` é a chave e também o endereço: /aneis-formatura, /aliancas-ouro,
--    /aliancas-prata. Um identificador só, do banco até a URL.
-- ---------------------------------------------------------------------------
create table if not exists public.categorias (
  slug         text primary key,
  nome         text not null,
  descricao    text,
  imagem_url   text,
  -- Qual coluna de `produtos` a barra de filtros usa. NULL = categoria sem
  -- filtro, que é o caso das alianças hoje.
  filtro_campo text check (filtro_campo in ('cor_pedra', 'material')),
  -- Como a foto se comporta no card: 'produto' são as fotos recortadas com
  -- fundo transparente (deitadas, 5/4 + contain); 'foto' são as de aliança, em
  -- pé (4/5 + cover). Trocar isso corta o aro do anel — não é cosmético.
  variante     text not null default 'produto' check (variante in ('produto', 'foto')),
  rotulo_filtro text,
  nota         text[] not null default '{}',
  ordem        smallint not null default 0,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists categorias_updated_at on public.categorias;
create trigger categorias_updated_at
  before update on public.categorias
  for each row execute function public.tocar_updated_at();


-- ---------------------------------------------------------------------------
-- 2) filtro_opcoes — os botões da barra de filtro
--
--    Para os anéis de formatura, são as seis cores de pedra. O filtro é pela
--    COR e não pelo metal de propósito: em anel de formatura a cor identifica o
--    curso, e todas as peças da categoria são do mesmo metal.
--
--    `amostra` é o hex da bolinha ao lado do rótulo; alimenta a variável
--    --swatch que categoria.css já usa.
-- ---------------------------------------------------------------------------
create table if not exists public.filtro_opcoes (
  categoria_slug text not null references public.categorias(slug) on update cascade on delete cascade,
  slug           text not null,
  nome           text not null,
  amostra        text,
  ordem          smallint not null default 0,
  primary key (categoria_slug, slug)
);

-- A PK já começa por categoria_slug, então a FK está indexada pelo prefixo da
-- chave primária — não precisa de índice extra.


-- ---------------------------------------------------------------------------
-- 3) produtos
--
--    `sku` é chave de negócio, não detalhe de exibição: vem do nome do arquivo
--    da foto original (`3187_R$2420.png` -> 3187) e é por ele que a Florenza
--    encontra a peça na gaveta. UNIQUE porque dois anéis com o mesmo código
--    seriam um erro de cadastro, não um caso válido.
--
--    `preco_centavos` é integer e nunca float: 0.1 + 0.2 não dá 0.3 em ponto
--    flutuante, e isso vira centavo perdido em soma de pedido.
-- ---------------------------------------------------------------------------
create table if not exists public.produtos (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null unique,
  slug           text not null unique,
  categoria_slug text not null references public.categorias(slug) on update cascade,
  nome           text not null,

  metal          text,
  pedra          text,
  cor_pedra      text,
  lapidacao      text,
  largura_mm     numeric(4,1) check (largura_mm is null or largura_mm > 0),
  material       text,

  descricao      text,
  preco_centavos integer not null check (preco_centavos >= 0),
  imagem_url     text,
  imagem_sm_url  text,
  -- Alt escrito à mão (as alianças tinham um por card). Nulo = a vitrine compõe
  -- a partir de metal, pedra e lapidação.
  alt            text,

  estoque        integer not null default 0 check (estoque >= 0),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists produtos_updated_at on public.produtos;
create trigger produtos_updated_at
  before update on public.produtos
  for each row execute function public.tocar_updated_at();

-- A consulta da vitrine é sempre "categoria X, ativo, ordenado por sku".
-- Índice parcial: só as linhas ativas entram, que é o que a loja consulta —
-- fica menor e mais rápido que o índice completo.
create index if not exists produtos_vitrine_idx
  on public.produtos (categoria_slug, sku)
  where ativo;

-- O painel lista tudo, inclusive inativo, por categoria (FK indexada).
create index if not exists produtos_categoria_idx on public.produtos (categoria_slug);


-- ---------------------------------------------------------------------------
-- 4) RLS
--
--    Leitura pública, mas SÓ do que está ativo: desativar um produto no painel
--    precisa sumir da vitrine de verdade, não só da consulta que a aplicação
--    faz. Se a regra vivesse apenas no `.eq("ativo", true)` do front, qualquer
--    um com a chave pública leria os rascunhos.
--
--    O painel enxerga tudo porque é admin, e a política de admin vem depois.
-- ---------------------------------------------------------------------------
alter table public.categorias   enable row level security;
alter table public.filtro_opcoes enable row level security;
alter table public.produtos     enable row level security;

drop policy if exists "Categorias ativas são públicas" on public.categorias;
create policy "Categorias ativas são públicas" on public.categorias
  for select using (ativo or public.is_admin());

drop policy if exists "Admin gerencia categorias" on public.categorias;
create policy "Admin gerencia categorias" on public.categorias
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Opções de filtro são públicas" on public.filtro_opcoes;
create policy "Opções de filtro são públicas" on public.filtro_opcoes
  for select using (true);

drop policy if exists "Admin gerencia opções de filtro" on public.filtro_opcoes;
create policy "Admin gerencia opções de filtro" on public.filtro_opcoes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Produtos ativos são públicos" on public.produtos;
create policy "Produtos ativos são públicos" on public.produtos
  for select using (ativo or public.is_admin());

drop policy if exists "Admin gerencia produtos" on public.produtos;
create policy "Admin gerencia produtos" on public.produtos
  for all using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 5) Storage: bucket das fotos de produto
--
--    Público para leitura (é a vitrine), escrita só para admin. O upload passa
--    a acontecer no painel; tools/importar-aneis-formatura.py continua servindo
--    para importação em massa do acervo que já existe.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do update set public = true;

drop policy if exists "Fotos de produto são públicas" on storage.objects;
create policy "Fotos de produto são públicas" on storage.objects
  for select using (bucket_id = 'produtos');

drop policy if exists "Admin envia fotos de produto" on storage.objects;
create policy "Admin envia fotos de produto" on storage.objects
  for insert to authenticated with check (bucket_id = 'produtos' and public.is_admin());

drop policy if exists "Admin atualiza fotos de produto" on storage.objects;
create policy "Admin atualiza fotos de produto" on storage.objects
  for update to authenticated using (bucket_id = 'produtos' and public.is_admin());

drop policy if exists "Admin apaga fotos de produto" on storage.objects;
create policy "Admin apaga fotos de produto" on storage.objects
  for delete to authenticated using (bucket_id = 'produtos' and public.is_admin());


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'tabelas do catalogo' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name in ('categorias', 'filtro_opcoes', 'produtos')
union all
select 'preco_centavos e integer', (data_type = 'integer')::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'produtos' and column_name = 'preco_centavos'
union all
select 'sku e unico', count(*)::text
  from pg_constraint where conname like 'produtos_sku%' and contype = 'u'
union all
select 'indice parcial da vitrine', count(*)::text
  from pg_indexes where tablename = 'produtos' and indexname = 'produtos_vitrine_idx'
union all
select 'RLS em produtos', (relrowsecurity)::text from pg_class where relname = 'produtos'
union all
select 'bucket produtos publico', (public)::text from storage.buckets where id = 'produtos';

-- Esperado: 3 | true | 1 | 1 | true | true


-- ###########################################################################
-- 20260814174132_clientes_e_diretorio.sql
-- ###########################################################################

-- ============================================================================
-- FLORENZA — 04. CLIENTES: cadastro manual e o diretório unificado
--
-- O pedido tem duas metades que precisam conviver numa lista só:
--   1. quem cria conta no site entra sozinho (trigger da migration 01);
--   2. quem fecha pela loja, Instagram ou WhatsApp é cadastrado à mão no painel.
--
-- Quem resolve isso é a view vw_clientes lá embaixo. A coluna `origem` diz de
-- qual metade cada pessoa veio, para o painel não misturar as duas coisas sem
-- avisar.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) clientes_manuais — quem não tem conta
--
--    Deliberadamente separada de `profiles`: profiles é o retrato de uma conta
--    em auth.users e some junto com ela; isto aqui é a agenda comercial da
--    Florenza e não deveria depender de ninguém ter criado senha.
-- ---------------------------------------------------------------------------
create table if not exists public.clientes_manuais (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) > 0),
  telefone    text,
  email       text,
  cidade      text,
  uf          char(2) references public.ufs(uf),
  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists clientes_manuais_updated_at on public.clientes_manuais;
create trigger clientes_manuais_updated_at
  before update on public.clientes_manuais
  for each row execute function public.tocar_updated_at();

-- FK indexada (o painel agrupa cliente por estado).
create index if not exists clientes_manuais_uf_idx on public.clientes_manuais (uf);
create index if not exists clientes_manuais_criado_idx on public.clientes_manuais (created_at desc);

alter table public.clientes_manuais enable row level security;

-- Agenda comercial é dado do negócio: só o time vê, e ninguém mais.
drop policy if exists "Admin gerencia clientes manuais" on public.clientes_manuais;
create policy "Admin gerencia clientes manuais" on public.clientes_manuais
  for all using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 2) email_dos_clientes() — a única porta para o e-mail
--
--    O e-mail mora em auth.users, e copiá-lo para profiles criaria duas versões
--    da mesma verdade, que divergem no primeiro "trocar e-mail". Só que o
--    schema `auth` é fechado: no Supabase os papéis `anon` e `authenticated`
--    NÃO têm SELECT em auth.users. Uma view com security_invoker que lesse
--    aquela tabela direto falharia com "permission denied" até para o admin —
--    a aba Clientes simplesmente não abriria.
--
--    Daí esta função: SECURITY DEFINER (roda com direitos do dono, alcança
--    auth.users) mas com a checagem de admin DENTRO do corpo. Para quem não é
--    admin ela não devolve nada — nem erro, nem linha. É o mínimo de privilégio
--    elevado possível: expõe duas colunas, id e e-mail, e só para o time.
--
--    `anon` também recebe EXECUTE pelo mesmo motivo do is_admin(): assim uma
--    consulta anônima à view devolve lista vazia em vez de estourar erro.
-- ---------------------------------------------------------------------------
-- A view depende da função. Derrubar a view antes deixa esta migration segura
-- de rodar de novo mesmo que um dia a assinatura da função mude — o Postgres
-- recusa substituir função com dependente vivo.
drop view if exists public.vw_clientes;

create or replace function public.email_dos_clientes()
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text
    from auth.users u
   where public.is_admin();
$$;

revoke execute on function public.email_dos_clientes() from public;
grant execute on function public.email_dos_clientes() to anon, authenticated;

comment on function public.email_dos_clientes() is
  'Devolve id e e-mail das contas, e SOMENTE quando quem chama é admin. Existe porque auth.users é inacessível aos papéis do cliente.';


-- ---------------------------------------------------------------------------
-- 3) vw_clientes — as duas origens numa lista só
--
--    É esta view que cumpre "a lista se atualiza conforme eles vão se
--    cadastrando no site": ninguém sincroniza nada, a conta nova aparece porque
--    a view lê profiles direto.
--
--    `security_invoker = true` é obrigatório e não é detalhe: sem ele a view
--    roda com os direitos de quem a criou, ignora a RLS das tabelas de baixo, e
--    qualquer visitante com a chave pública lê o e-mail e o telefone de todos
--    os clientes da loja. Com ele, a view enxerga exatamente o que quem
--    consulta poderia enxergar sozinho — ou seja, só admin.
--
--    O LEFT JOIN (e não INNER) com a função é de propósito: se um dia o e-mail
--    não vier, a pessoa continua aparecendo na lista sem e-mail, em vez de
--    desaparecer do diretório sem ninguém notar.
-- ---------------------------------------------------------------------------
drop view if exists public.vw_clientes;
create view public.vw_clientes with (security_invoker = true) as
  select
    p.id,
    coalesce(
      nullif(trim(p.nome), ''),
      nullif(split_part(coalesce(e.email, ''), '@', 1), ''),
      'Sem nome'
    ) as nome,
    e.email,
    p.telefone,
    p.cidade,
    p.uf,
    'site'::text as origem,
    p.created_at,
    null::text   as observacoes
  from public.profiles p
  left join public.email_dos_clientes() e on e.id = p.id
  where p.role = 'cliente'

  union all

  select
    c.id,
    c.nome,
    c.email,
    c.telefone,
    c.cidade,
    c.uf,
    'manual'::text as origem,
    c.created_at,
    c.observacoes
  from public.clientes_manuais c;

comment on view public.vw_clientes is
  'Diretório único de clientes: contas criadas no site (origem=site) e cadastros feitos à mão no painel (origem=manual).';


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'tabela clientes_manuais' as item, count(*)::text as valor
  from information_schema.tables where table_schema = 'public' and table_name = 'clientes_manuais'
union all
select 'view vw_clientes', count(*)::text
  from information_schema.views where table_schema = 'public' and table_name = 'vw_clientes'
union all
select 'view respeita RLS (security_invoker)', count(*)::text
  from pg_class where relname = 'vw_clientes' and reloptions::text like '%security_invoker=true%'
union all
select 'RLS em clientes_manuais', (relrowsecurity)::text from pg_class where relname = 'clientes_manuais'
union all
select 'uf tem FK para ufs', count(*)::text
  from pg_constraint where conrelid = 'public.clientes_manuais'::regclass and contype = 'f'
union all
select 'email_dos_clientes e security definer', count(*)::text
  from pg_proc where proname = 'email_dos_clientes' and prosecdef;

-- Esperado: 1 | 1 | 1 | true | 1 | 1


-- ###########################################################################
-- 20260814174152_pedidos.sql
-- ###########################################################################

-- ============================================================================
-- FLORENZA — 05. PEDIDOS: a venda, e de onde ela veio
--
-- É esta tabela que responde à pergunta do painel sobre regiões. A coluna que
-- importa para isso é `uf`, preenchida a partir do CEP no checkout ou escolhida
-- à mão quando o pedido é lançado pelo painel — sem ela, o mapa nasce cinza.
--
-- Duas origens de venda convivem por desenho:
--   - checkout do site  -> user_id preenchido
--   - lançamento manual -> cliente_manual_id preenchido (ou nenhum dos dois,
--     quando é uma venda avulsa de quem nunca virou cadastro)
--
-- Pagamento fica de fora nesta etapa. O status já nasce com
-- 'aguardando_pagamento' e o Mercado Pago, quando entrar, só precisa promover
-- para 'pago' — sem remodelar nada.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) pedidos
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos (
  id                uuid primary key default gen_random_uuid(),
  -- Número curto e crescente para falar com o cliente ("pedido 1043").
  -- O uuid é a chave técnica; ninguém dita uuid por telefone.
  numero            bigint generated always as identity,

  user_id           uuid references auth.users on delete set null,
  cliente_manual_id uuid references public.clientes_manuais(id) on delete set null,

  -- Cópia do contato no momento da compra. Não é redundância preguiçosa: o
  -- cliente pode trocar de telefone depois, e o pedido antigo tem que continuar
  -- mostrando para onde a peça foi enviada de fato.
  nome              text not null check (length(trim(nome)) > 0),
  email             text,
  telefone          text,

  cep               text,
  cidade            text,
  uf                char(2) references public.ufs(uf),

  origem            text not null default 'site'
                    check (origem in ('site', 'whatsapp', 'instagram', 'loja', 'indicacao', 'outro')),

  status            text not null default 'aguardando_pagamento'
                    check (status in ('aguardando_pagamento', 'pago', 'em_producao',
                                      'enviado', 'entregue', 'cancelado')),

  total_centavos    integer not null default 0 check (total_centavos >= 0),
  observacoes       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists pedidos_updated_at on public.pedidos;
create trigger pedidos_updated_at
  before update on public.pedidos
  for each row execute function public.tocar_updated_at();

-- FKs indexadas + os cortes que o painel realmente faz.
create index if not exists pedidos_user_idx           on public.pedidos (user_id);
create index if not exists pedidos_cliente_manual_idx on public.pedidos (cliente_manual_id);
create index if not exists pedidos_uf_idx             on public.pedidos (uf);
create index if not exists pedidos_status_idx         on public.pedidos (status);
create index if not exists pedidos_criado_idx         on public.pedidos (created_at desc);


-- ---------------------------------------------------------------------------
-- 2) pedido_itens
--
--    sku, nome e preço são CÓPIA do produto no instante da compra, não uma
--    consulta a `produtos`. Preço de joia acompanha o ouro: se o item apontasse
--    só para o produto, um pedido de março passaria a valer o preço de agosto
--    sozinho, e o faturamento do mês passado mudaria retroativamente.
--    Por isso `produto_id` é ON DELETE SET NULL — apagar a peça do catálogo não
--    pode apagar a história da venda.
-- ---------------------------------------------------------------------------
create table if not exists public.pedido_itens (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references public.pedidos(id) on delete cascade,
  produto_id     uuid references public.produtos(id) on delete set null,

  sku            text not null,
  nome           text not null,
  preco_centavos integer not null check (preco_centavos >= 0),
  quantidade     integer not null default 1 check (quantidade > 0)
);

create index if not exists pedido_itens_pedido_idx  on public.pedido_itens (pedido_id);
create index if not exists pedido_itens_produto_idx on public.pedido_itens (produto_id);


-- ---------------------------------------------------------------------------
-- 3) O total nunca diverge dos itens
--
--    Somar no cliente e mandar o número pronto é como o total sai errado: dois
--    caminhos gravam o mesmo valor (checkout e painel) e um dia um deles
--    esquece o frete, a quantidade ou um arredondamento.
--
--    Quando o pedido tem itens, o total é recalculado aqui. Quando não tem — é
--    o caso da venda avulsa lançada à mão, sem detalhar as peças — o valor
--    digitado no painel é respeitado.
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_total_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
  v_total  integer;
  v_itens  integer;
begin
  select coalesce(sum(i.preco_centavos * i.quantidade), 0), count(*)
    into v_total, v_itens
    from public.pedido_itens i
   where i.pedido_id = v_pedido;

  if v_itens > 0 then
    update public.pedidos set total_centavos = v_total where id = v_pedido;
  end if;

  return null;
end;
$$;

drop trigger if exists pedido_itens_recalcula_total on public.pedido_itens;
create trigger pedido_itens_recalcula_total
  after insert or update or delete on public.pedido_itens
  for each row execute function public.recalcular_total_do_pedido();


-- ---------------------------------------------------------------------------
-- 4) RLS
--
--    O cliente vê os pedidos dele e mais nada — é o requisito mais sensível do
--    projeto inteiro, porque um erro aqui expõe endereço e telefone de todos.
--    Criar pedido: qualquer sessão autenticada pode, desde que o pedido saia no
--    nome dela (o WITH CHECK impede lançar pedido no nome de outra pessoa).
--
--    Mudar status é só do admin: o cliente não pode marcar o próprio pedido
--    como "pago". Por isso não existe policy de UPDATE para cliente.
-- ---------------------------------------------------------------------------
alter table public.pedidos      enable row level security;
alter table public.pedido_itens enable row level security;

drop policy if exists "Cliente lê os próprios pedidos" on public.pedidos;
create policy "Cliente lê os próprios pedidos" on public.pedidos
  for select using ((select auth.uid()) = user_id or public.is_admin());

drop policy if exists "Cliente cria o próprio pedido" on public.pedidos;
create policy "Cliente cria o próprio pedido" on public.pedidos
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Admin gerencia pedidos" on public.pedidos;
create policy "Admin gerencia pedidos" on public.pedidos
  for all using (public.is_admin()) with check (public.is_admin());

-- O item herda a permissão do pedido: quem pode ver o pedido pode ver o item.
drop policy if exists "Itens seguem o pedido" on public.pedido_itens;
create policy "Itens seguem o pedido" on public.pedido_itens
  for select using (
    exists (
      select 1 from public.pedidos p
       where p.id = pedido_itens.pedido_id
         and (p.user_id = (select auth.uid()) or public.is_admin())
    )
  );

drop policy if exists "Cliente cria itens do próprio pedido" on public.pedido_itens;
create policy "Cliente cria itens do próprio pedido" on public.pedido_itens
  for insert to authenticated with check (
    exists (
      select 1 from public.pedidos p
       where p.id = pedido_itens.pedido_id
         and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "Admin gerencia itens" on public.pedido_itens;
create policy "Admin gerencia itens" on public.pedido_itens
  for all using (public.is_admin()) with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'tabelas de pedido' as item, count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name in ('pedidos', 'pedido_itens')
union all
select 'total_centavos e integer', (data_type = 'integer')::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'pedidos' and column_name = 'total_centavos'
union all
select 'uf tem FK para ufs', count(*)::text
  from pg_constraint c join pg_attribute a
    on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
 where c.conrelid = 'public.pedidos'::regclass and c.contype = 'f' and a.attname = 'uf'
union all
select 'trigger de total', count(*)::text
  from pg_trigger where tgname = 'pedido_itens_recalcula_total'
union all
select 'indice em pedidos.uf', count(*)::text
  from pg_indexes where tablename = 'pedidos' and indexname = 'pedidos_uf_idx'
union all
select 'RLS em pedidos', (relrowsecurity)::text from pg_class where relname = 'pedidos'
union all
select 'policies em pedidos', count(*)::text from pg_policies where tablename = 'pedidos';

-- Esperado: 2 | true | 1 | 1 | 1 | true | 3


-- ###########################################################################
-- 20260814174208_visoes_de_venda.sql
-- ###########################################################################

-- ============================================================================
-- FLORENZA — 06. VISÕES DE VENDA: o que o dashboard lê
--
-- Agregar aqui, e não em JavaScript, por dois motivos: o Postgres soma milhares
-- de linhas sem trafegar nenhuma delas pela rede, e a definição de "venda" fica
-- escrita num lugar só.
--
-- Esse "um lugar só" é `vw_pedidos_confirmados`. Todas as outras visões partem
-- dela. Sem essa base, a regra de quais status contam estaria copiada em cinco
-- consultas e um dia uma delas passaria a incluir cancelado.
--
-- Todas as visões usam `security_invoker = true`: elas enxergam exatamente o
-- que quem consulta enxergaria sozinho. Como `pedidos` só se abre para o dono
-- do pedido ou para o admin, o faturamento da loja não vaza por aqui.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) A base: o que conta como venda
--
--    Fora ficam 'cancelado' (não aconteceu) e 'aguardando_pagamento' (ainda não
--    aconteceu). Contar carrinho não pago como faturamento é a forma mais fácil
--    de um painel mentir para o dono.
-- ---------------------------------------------------------------------------
drop view if exists public.vw_vendas_por_uf      cascade;
drop view if exists public.vw_vendas_por_regiao  cascade;
drop view if exists public.vw_vendas_por_mes     cascade;
drop view if exists public.vw_vendas_por_cidade  cascade;
drop view if exists public.vw_produtos_vendidos  cascade;
drop view if exists public.vw_pedidos_confirmados cascade;

create view public.vw_pedidos_confirmados with (security_invoker = true) as
  select *
    from public.pedidos
   where status in ('pago', 'em_producao', 'enviado', 'entregue');

comment on view public.vw_pedidos_confirmados is
  'Pedidos que contam como venda. Base de todas as visões do dashboard — mudar a regra aqui muda o painel inteiro de uma vez.';


-- ---------------------------------------------------------------------------
-- 2) Vendas por UF — a fonte do mapa
--
--    LEFT JOIN a partir de `ufs`: as 27 linhas sempre voltam, mesmo as sem
--    nenhuma venda. O mapa precisa disso — um estado sem pedido tem que ser
--    desenhado em cinza, não sumir do Brasil.
-- ---------------------------------------------------------------------------
create view public.vw_vendas_por_uf with (security_invoker = true) as
  select
    u.uf,
    u.nome   as uf_nome,
    u.regiao,
    count(p.id)::bigint                          as pedidos,
    coalesce(sum(p.total_centavos), 0)::bigint   as total_centavos,
    count(distinct coalesce(
      p.user_id::text,
      p.cliente_manual_id::text,
      p.email,
      p.id::text
    ))::bigint                                   as clientes
  from public.ufs u
  left join public.vw_pedidos_confirmados p on p.uf = u.uf
  group by u.uf, u.nome, u.regiao;


-- ---------------------------------------------------------------------------
-- 3) Vendas por região — a resposta direta da pergunta do painel
-- ---------------------------------------------------------------------------
create view public.vw_vendas_por_regiao with (security_invoker = true) as
  select
    regiao,
    sum(pedidos)::bigint        as pedidos,
    sum(total_centavos)::bigint as total_centavos,
    sum(clientes)::bigint       as clientes
  from public.vw_vendas_por_uf
  group by regiao;


-- ---------------------------------------------------------------------------
-- 4) Faturamento por mês — 12 meses, inclusive os vazios
--
--    O generate_series existe para o gráfico não "pular" um mês sem venda. Uma
--    linha que salta de março para maio faz o leitor achar que abril sumiu do
--    sistema, quando abril só foi um mês ruim.
-- ---------------------------------------------------------------------------
create view public.vw_vendas_por_mes with (security_invoker = true) as
  with meses as (
    select generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    ) as mes
  )
  select
    m.mes::date                                  as mes,
    to_char(m.mes, 'MM/YY')                      as rotulo,
    count(p.id)::bigint                          as pedidos,
    coalesce(sum(p.total_centavos), 0)::bigint   as total_centavos
  from meses m
  left join public.vw_pedidos_confirmados p
    on date_trunc('month', p.created_at) = m.mes
  group by m.mes
  order by m.mes;


-- ---------------------------------------------------------------------------
-- 5) Cidades que mais compram
-- ---------------------------------------------------------------------------
create view public.vw_vendas_por_cidade with (security_invoker = true) as
  select
    coalesce(nullif(trim(cidade), ''), 'Não informada') as cidade,
    uf,
    count(id)::bigint                        as pedidos,
    coalesce(sum(total_centavos), 0)::bigint as total_centavos
  from public.vw_pedidos_confirmados
  group by coalesce(nullif(trim(cidade), ''), 'Não informada'), uf;


-- ---------------------------------------------------------------------------
-- 6) Peças mais vendidas
--
--    Agrupa por SKU e não por produto_id porque produto_id vira NULL quando a
--    peça sai do catálogo — e a venda dela continua tendo acontecido.
-- ---------------------------------------------------------------------------
create view public.vw_produtos_vendidos with (security_invoker = true) as
  select
    i.sku,
    max(i.nome)                                            as nome,
    sum(i.quantidade)::bigint                              as unidades,
    sum(i.preco_centavos * i.quantidade)::bigint           as total_centavos,
    count(distinct i.pedido_id)::bigint                    as pedidos
  from public.pedido_itens i
  join public.vw_pedidos_confirmados p on p.id = i.pedido_id
  group by i.sku;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'visoes criadas' as item, count(*)::text as valor
  from information_schema.views
 where table_schema = 'public'
   and table_name in ('vw_pedidos_confirmados', 'vw_vendas_por_uf', 'vw_vendas_por_regiao',
                      'vw_vendas_por_mes', 'vw_vendas_por_cidade', 'vw_produtos_vendidos')
union all
select 'todas com security_invoker', count(*)::text
  from pg_class
 where relname in ('vw_pedidos_confirmados', 'vw_vendas_por_uf', 'vw_vendas_por_regiao',
                   'vw_vendas_por_mes', 'vw_vendas_por_cidade', 'vw_produtos_vendidos')
   and reloptions::text like '%security_invoker=true%'
union all
select 'mapa devolve 27 UFs', count(*)::text from public.vw_vendas_por_uf
union all
select 'regioes devolve 5', count(*)::text from public.vw_vendas_por_regiao
union all
select 'meses devolve 12', count(*)::text from public.vw_vendas_por_mes;

-- Esperado: 6 | 6 | 27 | 5 | 12


-- ###########################################################################
-- 20260814174615_endurecimento_apos_auditoria.sql
-- ###########################################################################

-- ============================================================================
-- FLORENZA — 07. ENDURECIMENTO: o que o auditor do Supabase apontou
--
-- Escrita depois de aplicar as seis primeiras no projeto real e rodar o linter
-- de segurança e o de performance (Advisors). Três achados eram legítimos e
-- estão corrigidos aqui; dois são intencionais e ficam registrados como tal,
-- para ninguém "consertar" de novo daqui a seis meses e reabrir o buraco.
--
-- COMO RODAR: `npx supabase db push --linked`. Seguro rodar de novo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) tocar_updated_at() estava sem search_path fixo
--
--    Era a única função do projeto sem `set search_path`. É a mesma porta de
--    escalada de privilégio que is_admin() já fechava: com o caminho de busca
--    aberto, quem puder criar objetos planta uma função homônima à frente no
--    caminho e passa a executar código próprio dentro de uma trigger que roda
--    em toda escrita de produto, pedido e perfil.
--
--    `now()` mora em pg_catalog, que está sempre no caminho mesmo com o
--    search_path vazio — então zerar não quebra a função.
-- ---------------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2) Função de trigger não é endpoint da API
--
--    criar_perfil_do_usuario() e recalcular_total_do_pedido() existem só para
--    serem disparadas por trigger, mas o PostgREST expõe toda função de
--    `public` em /rest/v1/rpc/<nome> — e as duas são SECURITY DEFINER, ou seja,
--    rodariam com os direitos do dono do banco a pedido de qualquer visitante.
--
--    Revogar o EXECUTE é seguro e não desliga as triggers: o Postgres confere
--    essa permissão na hora de CRIAR a trigger, não a cada disparo. Conferido
--    na prática — cadastro novo continua criando o perfil.
-- ---------------------------------------------------------------------------
revoke execute on function public.criar_perfil_do_usuario()    from public, anon, authenticated;
revoke execute on function public.recalcular_total_do_pedido() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3) Uma policy a menos no caminho quente da vitrine
--
--    O linter de performance apontou policy permissiva duplicada: as tabelas do
--    catálogo tinham "público lê" E "admin faz tudo" valendo para o mesmo
--    SELECT. O Postgres avalia todas as permissivas aplicáveis, então toda
--    visita à vitrine — gente sem conta, que é a maioria — chamava is_admin()
--    de graça.
--
--    O SELECT do admin já estava coberto pelo `or public.is_admin()` da própria
--    policy pública. Aqui a policy de admin deixa de valer para SELECT e passa
--    a cobrir só escrita. Nenhuma permissão muda: some a duplicata.
--
--    As tabelas sensíveis (profiles, pedidos, pedido_itens) ficam como estão, de
--    propósito. Lá a sobreposição é entre "o dono lê o dele" e "admin lê tudo",
--    que não são a mesma regra — juntar as duas numa policy só é onde se erra o
--    sinal e se vaza pedido alheio. Custo de uma chamada extra de função contra
--    risco de exposição: fica como está.
-- ---------------------------------------------------------------------------
drop policy if exists "Admin gerencia categorias" on public.categorias;
drop policy if exists "Admin cria categorias"     on public.categorias;
drop policy if exists "Admin edita categorias"    on public.categorias;
drop policy if exists "Admin apaga categorias"    on public.categorias;
create policy "Admin cria categorias" on public.categorias
  for insert to authenticated with check (public.is_admin());
create policy "Admin edita categorias" on public.categorias
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin apaga categorias" on public.categorias
  for delete to authenticated using (public.is_admin());

drop policy if exists "Admin gerencia opções de filtro" on public.filtro_opcoes;
drop policy if exists "Admin cria opções de filtro"     on public.filtro_opcoes;
drop policy if exists "Admin edita opções de filtro"    on public.filtro_opcoes;
drop policy if exists "Admin apaga opções de filtro"    on public.filtro_opcoes;
create policy "Admin cria opções de filtro" on public.filtro_opcoes
  for insert to authenticated with check (public.is_admin());
create policy "Admin edita opções de filtro" on public.filtro_opcoes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin apaga opções de filtro" on public.filtro_opcoes
  for delete to authenticated using (public.is_admin());

drop policy if exists "Admin gerencia produtos" on public.produtos;
drop policy if exists "Admin cria produtos"     on public.produtos;
drop policy if exists "Admin edita produtos"    on public.produtos;
drop policy if exists "Admin apaga produtos"    on public.produtos;
create policy "Admin cria produtos" on public.produtos
  for insert to authenticated with check (public.is_admin());
create policy "Admin edita produtos" on public.produtos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admin apaga produtos" on public.produtos
  for delete to authenticated using (public.is_admin());


-- ---------------------------------------------------------------------------
-- 4) O que o linter aponta e fica como está, de propósito
--
--    is_admin() e email_dos_clientes() seguem SECURITY DEFINER e executáveis
--    por `anon`. O linter sinaliza as duas; as duas são desenho, não descuido:
--
--    - is_admin() só responde sobre QUEM CHAMA. Para sessão anônima é sempre
--      false. Precisa de EXECUTE em anon porque as policies têm a forma
--      `<condição> or is_admin()` e, sem sessão, a primeira parte dá NULL — o
--      Postgres precisa avaliar a segunda. Sem o grant, a consulta anônima
--      morreria com "permission denied for function" em vez de devolver lista
--      vazia.
--
--    - email_dos_clientes() é SECURITY DEFINER porque auth.users é fechada aos
--      papéis do cliente, e carrega a checagem de admin DENTRO do corpo: para
--      quem não é admin devolve zero linha.
--
--    Conferido contra o projeto real, pela API pública e com a chave publicável,
--    já com um cliente cadastrado no banco: sem sessão, vw_clientes, pedidos,
--    pedido_itens, profiles e clientes_manuais devolvem 0 linhas, e chamar
--    /rest/v1/rpc/email_dos_clientes direto devolve [].
-- ---------------------------------------------------------------------------
comment on function public.is_admin() is
  'SECURITY DEFINER de propósito, e com EXECUTE para anon de propósito: responde apenas sobre quem chama, e sem o grant as policies "x or is_admin()" estourariam erro para visitante em vez de devolver vazio.';


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'tocar_updated_at com search_path' as item,
       (proconfig is not null)::text as valor
  from pg_proc where proname = 'tocar_updated_at'
union all
select 'anon NAO executa criar_perfil_do_usuario',
       (not has_function_privilege('anon', 'public.criar_perfil_do_usuario()', 'execute'))::text
union all
select 'anon NAO executa recalcular_total_do_pedido',
       (not has_function_privilege('anon', 'public.recalcular_total_do_pedido()', 'execute'))::text
union all
select 'trigger de perfil continua viva',
       (count(*) = 1)::text from pg_trigger where tgname = 'ao_criar_usuario'
union all
select 'produtos sem policy de SELECT duplicada',
       (count(*) = 1)::text from pg_policies
 where tablename = 'produtos' and cmd in ('SELECT', 'ALL');

-- Esperado: true | true | true | true | true


-- ###########################################################################
-- seed-catalogo.sql — as 3 categorias, as 6 cores de pedra e os 20 produtos
-- ###########################################################################

-- ============================================================================
-- FLORENZA — CARGA INICIAL DO CATÁLOGO
--
-- GERADO por tools/seed-catalogo.mjs a partir de lib/data/catalogo-local.ts.
-- Não editar à mão: rode `npm run seed` de novo depois de mexer nas fichas.
--
-- COMO RODAR: cole no SQL Editor do Supabase e execute, DEPOIS das migrations.
-- Seguro rodar de novo — tudo usa ON CONFLICT DO UPDATE, então repetir apenas
-- atualiza o que mudou, sem duplicar nada.
--
-- 3 categorias · 20 produtos
-- ============================================================================

-- ---------- Categorias ----------
insert into public.categorias
  (slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, ordem, ativo)
values
  ('aneis-formatura', 'Anéis de Formatura', 'Celebre uma conquista com uma joia que marca o início de uma nova história. Cada anel carrega o símbolo da sua profissão e os anos que levaram até ele.', '/categorias/anelformatura.png',
   'cor_pedra', 'produto',
   'Filtrar por cor da pedra', ARRAY['Todas as peças são ouro 18K (750); o filtro é pela cor da pedra, que é o que identifica o curso na tradição do anel de formatura.'], 1, true)
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, imagem_url = excluded.imagem_url,
  filtro_campo = excluded.filtro_campo, variante = excluded.variante,
  rotulo_filtro = excluded.rotulo_filtro, nota = excluded.nota, ordem = excluded.ordem;

insert into public.categorias
  (slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, ordem, ativo)
values
  ('aliancas-ouro', 'Alianças de Ouro', 'Peças atemporais, lapidadas à mão para selar promessas que atravessam gerações. O ouro 18K é sinônimo de nobreza, beleza e eternidade.', '/categorias/aliançaouro.png',
   NULL, 'foto',
   'Filtrar por material', ARRAY[]::text[], 2, true)
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, imagem_url = excluded.imagem_url,
  filtro_campo = excluded.filtro_campo, variante = excluded.variante,
  rotulo_filtro = excluded.rotulo_filtro, nota = excluded.nota, ordem = excluded.ordem;

insert into public.categorias
  (slug, nome, descricao, imagem_url, filtro_campo, variante, rotulo_filtro, nota, ordem, ativo)
values
  ('aliancas-prata', 'Alianças de Prata', 'Elegância discreta em prata, para quem escolhe simplicidade com sofisticação. A prata 925 oferece beleza e qualidade em cada detalhe, com um brilho que atravessa o tempo.', '/categorias/alliançaprata.png',
   NULL, 'foto',
   'Filtrar por material', ARRAY[]::text[], 3, true)
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, imagem_url = excluded.imagem_url,
  filtro_campo = excluded.filtro_campo, variante = excluded.variante,
  rotulo_filtro = excluded.rotulo_filtro, nota = excluded.nota, ordem = excluded.ordem;


-- ---------- Opções de filtro (as cores de pedra) ----------
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'vermelha', 'Vermelha', '#b3102b', 1)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'rosa', 'Rosa', '#d4276e', 2)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'azul', 'Azul', '#1b4fb0', 3)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'verde', 'Verde', '#0f8a4e', 4)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'amarela', 'Amarela', '#e3a516', 5)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aneis-formatura', 'negra', 'Negra', '#24211f', 6)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aliancas-ouro', 'ouro', 'Ouro 18K', '#b3854e', 1)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aliancas-ouro', 'ouro-diamantes', 'Ouro + Diamantes', '#e3c692', 2)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;
insert into public.filtro_opcoes (categoria_slug, slug, nome, amostra, ordem)
values ('aliancas-prata', 'prata', 'Prata 925', '#cfd3d6', 1)
on conflict (categoria_slug, slug) do update set
  nome = excluded.nome, amostra = excluded.amostra, ordem = excluded.ordem;


-- ---------- Produtos ----------
insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3001', 'anel-citrino-arabesco', 'aneis-formatura', 'Anel Citrino Arabesco',
   'Ouro 18K (750)', 'Citrino', 'amarela', 'Redonda', NULL, NULL,
   'Citrino redondo cercado por um halo de diamantes, sobre um aro largo com arabescos em alto relevo.', 349000, '/produtos/formatura/3001.webp', '/produtos/formatura/3001-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3002', 'anel-rubi-bicolor', 'aneis-formatura', 'Anel Rubi Bicolor',
   'Ouro 18K (750)', 'Rubi', 'vermelha', 'Oval', NULL, NULL,
   'Rubi oval em halo de diamantes, com ombros em ouro branco cravejado que abrem contraste sobre o aro amarelo.', 349000, '/produtos/formatura/3002.webp', '/produtos/formatura/3002-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3003', 'anel-esmeralda-leque', 'aneis-formatura', 'Anel Esmeralda Leque',
   'Ouro 18K (750)', 'Esmeralda', 'verde', 'Redonda', NULL, NULL,
   'Esmeralda redonda sustentada por garras altas, com diamantes abertos em leque sobre um aro largo e polido.', 349000, '/produtos/formatura/3003.webp', '/produtos/formatura/3003-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3004', 'anel-safira-floral', 'aneis-formatura', 'Anel Safira Floral',
   'Ouro 18K (750)', 'Safira azul', 'azul', 'Redonda', NULL, NULL,
   'Safira azul em halo margarida, com folhas gravadas à mão nas laterais do aro.', 349000, '/produtos/formatura/3004.webp', '/produtos/formatura/3004-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3005', 'anel-safira-negra-arabesco', 'aneis-formatura', 'Anel Safira Negra',
   'Ouro 18K (750)', 'Safira negra', 'negra', 'Oval', NULL, NULL,
   'Pedra negra oval em halo de diamantes, entre arabescos vazados nas laterais do aro.', 299000, '/produtos/formatura/3005.webp', '/produtos/formatura/3005-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3010', 'anel-safira-navete', 'aneis-formatura', 'Anel Safira Navete',
   'Ouro 18K (750)', 'Safira azul', 'azul', 'Navete', NULL, NULL,
   'Safira em lapidação navete, contornada por diamantes, sobre aro duplo que se abre em V.', 210000, '/produtos/formatura/3010.webp', '/produtos/formatura/3010-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3184', 'anel-esmeralda-navete', 'aneis-formatura', 'Anel Esmeralda Navete',
   'Ouro 18K (750)', 'Esmeralda', 'verde', 'Navete', NULL, NULL,
   'Esmeralda navete em halo de diamantes, sobre aro duplo em V — o desenho mais leve da linha.', 226000, '/produtos/formatura/3184.webp', '/produtos/formatura/3184-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3185', 'anel-safira-oval', 'aneis-formatura', 'Anel Safira Oval',
   'Ouro 18K (750)', 'Safira azul', 'azul', 'Oval', NULL, NULL,
   'Safira oval em halo cravejado, com galeria vazada que deixa a luz atravessar a pedra.', 242000, '/produtos/formatura/3185.webp', '/produtos/formatura/3185-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3187', 'anel-rubi-classico', 'aneis-formatura', 'Anel Rubi Clássico',
   'Ouro 18K (750)', 'Rubi', 'vermelha', 'Oval', NULL, NULL,
   'Rubi oval em halo de diamantes sobre aro fino e liso: o desenho clássico do anel de formatura.', 242000, '/produtos/formatura/3187.webp', '/produtos/formatura/3187-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3514', 'anel-topazio-princesa', 'aneis-formatura', 'Anel Topázio Princesa',
   'Ouro 18K (750)', 'Topázio azul-londres', 'azul', 'Princesa', NULL, NULL,
   'Topázio azul em lapidação princesa, com halo quadrado de diamantes sobre aro duplo.', 226000, '/produtos/formatura/3514.webp', '/produtos/formatura/3514-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3517', 'anel-rubi-aro-duplo', 'aneis-formatura', 'Anel Rubi Aro Duplo',
   'Ouro 18K (750)', 'Rubi', 'vermelha', 'Redonda', NULL, NULL,
   'Rubi redondo em halo de diamantes, elevado por uma galeria de garras sobre aro duplo.', 242000, '/produtos/formatura/3517.webp', '/produtos/formatura/3517-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3537', 'anel-turmalina-navete', 'aneis-formatura', 'Anel Turmalina Navete',
   'Ouro 18K (750)', 'Turmalina rosa', 'rosa', 'Navete', NULL, NULL,
   'Turmalina rosa navete em halo de diamantes, com ombros cravejados que seguem até a base do aro.', 314000, '/produtos/formatura/3537.webp', '/produtos/formatura/3537-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3538', 'anel-topazio-oval', 'aneis-formatura', 'Anel Topázio Oval',
   'Ouro 18K (750)', 'Topázio azul', 'azul', 'Oval', NULL, NULL,
   'Topázio azul oval em halo de diamantes, sobre aro com frisos gravados nas laterais.', 317900, '/produtos/formatura/3538.webp', '/produtos/formatura/3538-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3539', 'anel-agua-marinha-halo', 'aneis-formatura', 'Anel Água-marinha',
   'Ouro 18K (750)', 'Água-marinha', 'azul', 'Redonda', NULL, NULL,
   'Água-marinha redonda em halo de diamantes, sobre aro com frisos gravados nas laterais.', 317900, '/produtos/formatura/3539.webp', '/produtos/formatura/3539-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('3555', 'anel-turmalina-princesa', 'aneis-formatura', 'Anel Turmalina Princesa',
   'Ouro 18K (750)', 'Turmalina rosa', 'rosa', 'Princesa', NULL, NULL,
   'Turmalina rosa em lapidação princesa, com halo quadrado de diamantes e aro cravejado.', 290000, '/produtos/formatura/3555.webp', '/produtos/formatura/3555-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('9257', 'anel-rubi-entrelacado', 'aneis-formatura', 'Anel Rubi Entrelaçado',
   'Ouro 18K (750)', 'Rubi', 'vermelha', 'Oval', NULL, NULL,
   'Rubi oval em halo de diamantes, sobre aro entrelaçado — a peça mais imponente da categoria.', 418000, '/produtos/formatura/9257.webp', '/produtos/formatura/9257-sm.webp', NULL,
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('A301', 'alianca-essence', 'aliancas-ouro', 'Aliança Essence',
   'Ouro 18K', NULL, NULL, NULL, 3, 'ouro',
   'Acabamento polido, linhas puras e atemporais.', 289000, '/modelosalianca/3mm.png', NULL, 'Aliança Essence, ouro 18K, 3mm, acabamento polido',
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('A501', 'alianca-aurea', 'aliancas-ouro', 'Aliança Aurea',
   'Ouro 18K + Diamantes', NULL, NULL, NULL, 5, 'ouro-diamantes',
   'Detalhe de coração cravejado, brilho que eterniza.', 469000, '/modelosalianca/5mm.png', NULL, 'Aliança Aurea, ouro 18K, 5mm, detalhe de coração cravejado',
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('P301', 'alianca-elo', 'aliancas-prata', 'Aliança Elo',
   'Prata 925', NULL, NULL, NULL, 3, 'prata',
   'Design minimalista com acabamento diagonal texturizado.', 34900, '/modelosalianca/3mmprata.png', NULL, 'Aliança Elo, prata 925, 3mm, acabamento diagonal texturizado',
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;

insert into public.produtos
  (sku, slug, categoria_slug, nome, metal, pedra, cor_pedra, lapidacao, largura_mm, material,
   descricao, preco_centavos, imagem_url, imagem_sm_url, alt, estoque, ativo)
values
  ('P601', 'alianca-eter', 'aliancas-prata', 'Aliança Éter',
   'Prata 925', NULL, NULL, NULL, 6, 'prata',
   'Friso dourado e detalhe de coração ao centro.', 54900, '/modelosalianca/6mmprata.png', NULL, 'Aliança Éter, prata 925, 6mm, friso dourado e detalhe de coração',
   0, true)
on conflict (sku) do update set
  slug = excluded.slug, categoria_slug = excluded.categoria_slug, nome = excluded.nome,
  metal = excluded.metal, pedra = excluded.pedra, cor_pedra = excluded.cor_pedra,
  lapidacao = excluded.lapidacao, largura_mm = excluded.largura_mm, material = excluded.material,
  descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
  imagem_url = excluded.imagem_url, imagem_sm_url = excluded.imagem_sm_url, alt = excluded.alt;


-- ---------------------------------------------------------------------------
-- CONFERÊNCIA
-- ---------------------------------------------------------------------------
select 'categorias' as item, count(*)::text as valor from public.categorias
union all
select 'opcoes de filtro', count(*)::text from public.filtro_opcoes
union all
select 'produtos', count(*)::text from public.produtos
union all
select 'aneis-formatura', count(*)::text from public.produtos where categoria_slug = 'aneis-formatura'
union all
select 'aliancas-ouro', count(*)::text from public.produtos where categoria_slug = 'aliancas-ouro'
union all
select 'aliancas-prata', count(*)::text from public.produtos where categoria_slug = 'aliancas-prata'
union all
select 'nenhum preco zerado', (count(*) = 0)::text from public.produtos where preco_centavos <= 0;

-- Esperado: 3 | 9 | 20 | 16 | 2 | 2 | true


-- ###########################################################################
-- CONFERÊNCIA FINAL — a única que importa ler
--
-- Todas as linhas precisam vir com situacao = 'ok'. Qualquer 'FALHOU' significa
-- que a parte correspondente não subiu, e o painel vai se comportar mal ali.
-- ###########################################################################

with checagens(ordem, item, obtido, esperado) as (
  values
    ( 1, 'tabelas criadas',
      (select count(*) from information_schema.tables
        where table_schema = 'public'
          and table_name in ('profiles','ufs','categorias','filtro_opcoes','produtos',
                             'clientes_manuais','pedidos','pedido_itens')), 8),
    ( 2, 'views criadas',
      (select count(*) from information_schema.views
        where table_schema = 'public'
          and table_name in ('vw_clientes','vw_pedidos_confirmados','vw_vendas_por_uf',
                             'vw_vendas_por_regiao','vw_vendas_por_mes','vw_vendas_por_cidade',
                             'vw_produtos_vendidos')), 7),
    ( 3, 'toda view com security_invoker',
      (select count(*) from pg_class
        where relname in ('vw_clientes','vw_pedidos_confirmados','vw_vendas_por_uf',
                          'vw_vendas_por_regiao','vw_vendas_por_mes','vw_vendas_por_cidade',
                          'vw_produtos_vendidos')
          and reloptions::text like '%security_invoker=true%'), 7),
    ( 4, 'RLS ligada em toda tabela',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
          and c.relname in ('profiles','ufs','categorias','filtro_opcoes','produtos',
                            'clientes_manuais','pedidos','pedido_itens')), 8),
    ( 5, 'as 27 UFs',        (select count(*) from public.ufs), 27),
    ( 6, 'as 3 categorias',  (select count(*) from public.categorias), 3),
    ( 7, 'as 9 opcoes de filtro', (select count(*) from public.filtro_opcoes), 9),
    ( 8, 'os 20 produtos',   (select count(*) from public.produtos where ativo), 20),
    ( 9, 'mapa devolve 27 linhas', (select count(*) from public.vw_vendas_por_uf), 27),
    (10, 'grafico de meses devolve 12', (select count(*) from public.vw_vendas_por_mes), 12),
    (11, 'trigger que cria o perfil',
      (select count(*) from pg_trigger where tgname = 'ao_criar_usuario'), 1),
    (12, 'is_admin() e security definer',
      (select count(*) from pg_proc where proname = 'is_admin' and prosecdef), 1),
    (13, 'anon NAO executa is_admin()',
      (select count(*) from pg_proc p
        where p.proname = 'is_admin'
          and not has_function_privilege('anon', 'public.is_admin()', 'execute')), 1),
    (14, 'bucket de fotos existe',
      (select count(*) from storage.buckets where id = 'produtos'), 1),
    (15, 'nenhum preco zerado',
      (select count(*) from public.produtos where preco_centavos <= 0), 0),
    (16, 'anon NAO executa funcao de trigger',
      (select count(*) from pg_proc p
        where p.proname = 'criar_perfil_do_usuario'
          and not has_function_privilege('anon', 'public.criar_perfil_do_usuario()', 'execute')), 1)
)
select ordem,
       item,
       obtido,
       esperado,
       case when obtido = esperado then 'ok' else 'FALHOU' end as situacao
  from checagens
 order by ordem;
