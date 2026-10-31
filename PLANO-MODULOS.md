<!-- Plano aprovado na sessao de 14/08/2026, 02h53 (madrugada). Recuperado do
     transcript da sessao ae8fb8a6 e versionado aqui para nao depender mais do
     historico do Claude Code. Texto verbatim, nada reescrito. -->

# Florenza — Dashboard de vendas com Supabase

## Contexto

O site da Florenza hoje é um protótipo de vitrine: HTML/CSS/JS estáticos, bundle IIFE via
esbuild, entregue como pasta que abre por `file://`. Não há backend, banco, autenticação,
carrinho nem página de produto — "Comprar", "Ver detalhes" e todos os links de contato são
`href="#"`. As 16 fichas de anel de formatura moram num array em `js/data/aneis-formatura.js`
e as 4 alianças estão escritas à mão no HTML. Não existe um único `<form>` no projeto.

O pedido é um painel administrativo nos moldes do `luxCar2026`: números de venda, mapa das
regiões do Brasil que mais compram, CRUD dos produtos que aparecem ao público, e uma aba de
clientes que aceita cadastro manual **e** se alimenta sozinha conforme o público se cadastra
no site.

Isso não cabe num site que roda por `file://`: `@supabase/supabase-js` usa `fetch`, que falha
com origin `null`. A decisão tomada foi migrar o projeto para **Next.js 16 + Supabase +
Vercel**, a mesma stack do luxCar2026 — que serve como referência de padrão a copiar, não de
código a importar.

**Resultado pretendido (Módulo 1):** o site atual, visualmente intacto, ganha conta de
cliente, catálogo vindo do banco, carrinho e checkout que registram o pedido (pagamento
combinado fora do site por enquanto), e um `/admin` protegido com KPIs, mapa do Brasil, CRUD
de produtos com upload de foto e diretório unificado de clientes.

## 🔒 Regra de ouro: a estética existente não se toca

O trabalho é **aditivo**. Nada do visual já pronto é redesenhado, reescrito ou "melhorado de
passagem".

Na prática:

- **Nenhum arquivo de `css/` é reescrito.** `style.css`, `aliancas.css`, `categoria.css` e
  `rings-3d.css` são movidos para `app/estilos/` e importados **verbatim**, na mesma ordem de
  cascata de hoje (`style` → `aliancas` → `categoria`). A convenção do projeto — cada camada
  só soma, nenhuma redefine a anterior — continua valendo tal como está documentada.
- **Os dois `:root` continuam onde estão.** Cores e `--nav-h` em `style.css`, fontes e linhas
  em `aliancas.css`. Nada de converter token para `@theme` do Tailwind.
- **O JSX reproduz as mesmas classes e a mesma árvore de elementos.** `.ringCard`,
  `.catalog__grid`, `.nav__word`, `.categoryPage__header` — tudo idêntico. `class` vira
  `className`; é essa a extensão da mudança.
- **Tailwind entra sem preflight.** O reset do Tailwind zeraria margens e tipografia do site
  inteiro — exatamente o que não pode acontecer. Importar só as camadas de tema e utilitários:

  ```css
  @layer theme, base, components, utilities;
  @import "tailwindcss/theme.css"     layer(theme);
  @import "tailwindcss/utilities.css" layer(utilities);
  /* preflight.css fica de fora, de propósito */
  ```

  As utilities ficam disponíveis para as telas **novas** (`/admin`, `/conta`, `/carrinho`) e
  não encostam em uma linha do que já existe.
- **O `/admin` usa a paleta da Florenza**, não a do luxCar2026. Do luxCar vem a *estrutura*
  (abas em pílula, `StatCard`, `SectionCard`, listas flex, formulários inline); as cores saem
  dos tokens que já estão em `style.css`: ivory `#f4ede1`, gold `#b3854e`, ink `#2a1e13`, com
  Cormorant Garamond nos títulos e Inter no corpo. O painel tem que parecer a Florenza.
- **O bug conhecido do nav em ~390px fica como está.** Corrigi-lo é mudar estética; entra no
  Módulo 2 para você decidir.

O critério de aceite da migração é literal: `/` e `/aneis-formatura` no Next lado a lado com
o HTML antigo, mesma largura de janela, **sem diferença visível**.

### Decisões já tomadas

| Decisão | Escolha |
|---|---|
| Arquitetura | Migrar para Next.js — site público e `/admin` no mesmo projeto |
| Estética | Preservada; CSS atual reaproveitado sem reescrita. Só telas novas são desenhadas |
| Dados de venda | Checkout real no site **+** lançamento manual no painel. **Sem gateway no Módulo 1** — PagBank fica para o Módulo 2 |
| Clientes | Conta real com Supabase Auth (e-mail + senha), somada ao cadastro manual |
| Catálogo | Todo o catálogo no banco (formatura **e** alianças) + upload de foto pelo painel |

---

# MÓDULO 1 — O sistema pedido

## Etapa 0 — Fundação Next.js (portagem sem redesenho)

O repositório atual (`github.com/carusonumlock/florenza`, branch `main`) recebe a migração.

```
florenza/
  app/
    layout.tsx                    Navbar + Footer + fontes + imports de CSS
    page.tsx                      home            <- index.html
    globals.css                   só importa os 4 CSS atuais + camadas Tailwind
    estilos/                      style.css, aliancas.css, categoria.css, rings-3d.css (INTACTOS)
    aneis-formatura/page.tsx      <- aneis-formatura.html, grade agora do banco
    aliancas/[slug]/page.tsx      <- aliancas-ouro.html / aliancas-prata.html
    produto/[slug]/page.tsx       NOVA
    carrinho/page.tsx             NOVA
    conta/page.tsx                NOVA
    auth/callback/route.ts        NOVA
    admin/page.tsx                NOVA — dashboard
  components/
    Navbar.tsx  Footer.tsx  RingCard.tsx  Reveal.tsx  Rings3D.tsx  VideoAutoplay.tsx
    admin/{StatCard,SectionCard,MapaBrasil}.tsx
    admin/{Vendas,Catalogo,Clientes,Pedidos}Section.tsx
  lib/
    supabase/{client,server,middleware}.ts   types.ts (gerado)
    admin/dashboard-data.ts  admin/format.ts
    catalogo.ts  carrinho-context.tsx  geo/brasil-uf.ts
  supabase/migrations/*.sql
  proxy.ts                        middleware do Next 16 (nome novo, não middleware.ts)
  public/                         mídia atual movida sem alteração
```

Dependências (as mesmas do luxCar2026, sem inflar): `next@16`, `react@19`, `@supabase/ssr`,
`@supabase/supabase-js`, `recharts`, `lucide-react`, `gsap`, `three`; dev: `tailwindcss@4`,
`@tailwindcss/postcss`, `typescript`, `eslint-config-next`, `supabase`.

**Como cada peça de JS atual atravessa:**

- **`js/aliancas.js`** → `components/Reveal.tsx`, `"use client"`. O código do GSAP é copiado
  **sem alteração de parâmetro**: `.js-reveal` (opacity/y 26, 1.1s, start `top 85%`),
  `.js-reveal-stagger` (stagger .12, `top 82%`), `.js-parallax` (yPercent 6, scrub), carrossel
  `#categoryTrack`. Muda só quando roda: `useEffect` em vez de load da página. Duração,
  easing e thresholds iguais — são a assinatura da animação. Guard de
  `prefers-reduced-motion` preservado.
- **`js/main.js`** → o ciclo hero foto↔vídeo e o `IntersectionObserver` que dá `pause()` em
  `video[autoplay]` fora da viewport (`rootMargin: "600px 0px"`) vão para
  `components/VideoAutoplay.tsx`. Não é sobra: três decoders simultâneos travam a rolagem no
  celular.
- **`js/catalogo.js`** → some como arquivo, mas `cardDoProduto()` vira `RingCard.tsx` com o
  mesmo HTML. A função `revelar()` deixa de ser caso especial (no React a grade e o reveal
  montam juntos), e o `esc()` manual sai — JSX escapa sozinho.
- **`js/rings-3d.js` + `js/rings-3d-selector.js`** → `components/Rings3D.tsx` com
  `next/dynamic({ ssr: false })` e `three` vindo do npm em vez de CDN. **A separação atual é
  mantida de propósito:** o seletor continua só ligando/desligando classes de estado na
  `<section>`, e o efeito visual continua saindo do `:has` em `css/rings-3d.css`. Converter
  isso para estado do React obrigaria a reescrever aquele CSS — que é justamente o que não
  vamos fazer. **Ganho colateral: a seção 3D passa a funcionar,** o que hoje não acontece por
  `file://`.
- `js/bundle.js`, `js/main.js`, `js/aliancas.js` e `js/catalogo.js` são apagados no fim da
  etapa. O `npm run build` deixa de significar esbuild.

⚠️ **Mídia:** o repo carrega ~94 MB de `.mp4` na raiz. Vão para `public/` e continuam
funcionando na Vercel, mas engordam cada deploy. Não bloqueia o Módulo 1 — anotado no
Módulo 2.

## Etapa 1 — Supabase: schema, RLS e auth

Projeto novo no Supabase (conta nova já criada). CLI linkada, migrations versionadas em
`supabase/migrations/`, **seguindo as convenções do luxCar2026**, que são boas e devem ser
mantidas: cabeçalho em português explicando o *porquê*, comandos idempotentes
(`if not exists` / `on conflict`), `enable row level security` em toda tabela, views sempre
com `with (security_invoker = true)`, `revoke`/`grant` explícito nas funções, e um bloco de
`CONFERÊNCIA` no fim com o resultado esperado.

### `20260814000000_base.sql` — perfis e papéis

```sql
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nome text, telefone text, cep text, cidade text, uf text,
  role text not null default 'cliente' check (role in ('cliente','admin')),
  created_at timestamptz not null default now()
);
-- trigger on auth.users -> insert em profiles (nome/telefone vêm de raw_user_meta_data)
create function public.is_admin() returns boolean ...  -- security definer, igual ao luxCar
```

`is_admin()` é a mesma peça que sustenta toda a RLS do luxCar2026 — vale copiar a assinatura.

### `..._catalogo.sql` — produtos

Duas formas de produto convivem hoje: formatura tem `pedra`/`corPedra`/`lapidacao`; aliança
tem largura em mm. Resolvido com colunas nullable tipadas (são poucas e precisam ser
filtráveis), não `jsonb`:

```sql
create table public.categorias (
  slug text primary key,            -- 'aneis-formatura', 'aliancas-ouro', 'aliancas-prata'
  nome text not null,
  descricao text, imagem_url text,
  filtro_campo text,                -- 'cor_pedra' | 'material' | null
  ordem int not null default 0
);

create table public.filtro_opcoes (        -- espelha coresDePedra do arquivo atual
  categoria_slug text references public.categorias(slug) on delete cascade,
  slug text, nome text not null,
  amostra text,                            -- hex do swatch, alimenta --swatch no CSS atual
  ordem int not null default 0,
  primary key (categoria_slug, slug)
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,                -- chave de negócio (nome do arquivo da foto)
  slug text unique not null,               -- chave de URL
  categoria_slug text not null references public.categorias(slug),
  nome text not null,
  metal text, pedra text, cor_pedra text, lapidacao text, largura_mm numeric(4,1),
  material text,                           -- filtro das alianças ('ouro','ouro-diamantes','prata')
  descricao text,
  preco_centavos integer not null check (preco_centavos >= 0),   -- NUNCA float
  imagem_url text, imagem_sm_url text,
  estoque integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: leitura pública só de ativo = true; escrita só is_admin()
```

`preco_centavos` inteiro é regra dura do projeto (o rodapé de `js/data/aneis-formatura.js` já
explica: `0.1 + 0.2 !== 0.3`). Formatação só na exibição.

### `..._geografia.sql` — a base do mapa

```sql
create table public.ufs (
  uf char(2) primary key, nome text not null,
  regiao text not null check (regiao in ('Norte','Nordeste','Centro-Oeste','Sudeste','Sul'))
);
insert into public.ufs values ('AC','Acre','Norte'), ... ;  -- 27 linhas
```

Uma tabela em vez de um `case` espalhado: o mapa, a agregação e o formulário de pedido passam
a compartilhar a mesma verdade sobre qual UF é de qual região.

### `..._pedidos.sql` — vendas

```sql
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,       -- número curto pro cliente
  user_id uuid references auth.users on delete set null,   -- null = venda lançada à mão
  cliente_manual_id uuid references public.clientes_manuais(id) on delete set null,
  nome text not null, email text, telefone text,
  cep text, cidade text, uf char(2) references public.ufs(uf),   -- <- alimenta o mapa
  origem text,                       -- 'site' | 'whatsapp' | 'instagram' | 'loja' | 'indicacao'
  status text not null default 'aguardando_pagamento'
    check (status in ('aguardando_pagamento','pago','em_producao','enviado','entregue','cancelado')),
  total_centavos integer not null default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  sku text not null, nome text not null,           -- snapshot: o pedido não muda se o produto mudar
  preco_centavos integer not null, quantidade int not null default 1 check (quantidade > 0)
);
```

O snapshot de `sku`/`nome`/`preco_centavos` no item é deliberado: preço de joia muda com o
ouro, e um pedido de março não pode reescrever seu valor porque a etiqueta subiu em agosto.

RLS: o cliente lê **só os pedidos dele** (`user_id = auth.uid()`); admin lê e escreve tudo.

### `..._clientes.sql` — diretório unificado

```sql
create table public.clientes_manuais (       -- cadastro manual, sem conta
  id uuid primary key default gen_random_uuid(),
  nome text not null, telefone text, email text,
  cidade text, uf char(2) references public.ufs(uf),
  observacoes text,
  created_at timestamptz not null default now()
);

create view public.vw_clientes with (security_invoker = true) as
  select p.id, p.nome, u.email, p.telefone, p.cidade, p.uf,
         'site'::text as origem, p.created_at
    from public.profiles p join auth.users u on u.id = p.id where p.role = 'cliente'
  union all
  select c.id, c.nome, c.email, c.telefone, c.cidade, c.uf,
         'manual'::text as origem, c.created_at
    from public.clientes_manuais c;
```

É esta view que faz "a lista se atualizar conforme eles vão se cadastrando no site": quem cria
conta entra em `profiles` pelo trigger e aparece no painel sem nenhum passo manual. A coluna
`origem` deixa claro quem veio de onde.

`security_invoker = true` é obrigatório e não é detalhe: sem ele a view roda com os direitos
do dono, ignora a RLS de baixo, e qualquer visitante com a chave pública lê o e-mail e o
telefone de todos os clientes.

### `..._vendas_views.sql` — o que o dashboard lê

```sql
create view public.vw_vendas_por_uf with (security_invoker = true) as
  select u.uf, u.nome as uf_nome, u.regiao,
         count(distinct p.id) as pedidos,
         coalesce(sum(p.total_centavos), 0) as total_centavos,
         count(distinct coalesce(p.user_id::text, p.cliente_manual_id::text, p.email)) as clientes
    from public.ufs u
    left join public.pedidos p on p.uf = u.uf and p.status not in ('cancelado','aguardando_pagamento')
   group by u.uf, u.nome, u.regiao;
```

Mais `vw_vendas_por_regiao` e `vw_vendas_por_mes`. Agregar no Postgres (e não em JS) mantém o
painel rápido quando o volume crescer, e é o mesmo desenho de `vw_frete_leads` no luxCar.

### Storage

Bucket público `produtos`. Política: leitura para `anon`, escrita só para `is_admin()`.

## Etapa 2 — Migrar os dados existentes

Script `tools/seed-catalogo.mjs`, rodado uma vez:

1. Lê os 16 produtos de `js/data/aneis-formatura.js` e os 4 cards de aliança extraídos de
   `aliancas-ouro.html` / `aliancas-prata.html` (tabela abaixo).
2. Sobe os `.webp` de `produtos/formatura/` e os `.png` de `modelosalianca/` para o Storage.
3. Insere `categorias`, `filtro_opcoes` (as 6 cores de pedra, com os hex de `amostra`) e
   `produtos`.

| Categoria | material | nome | preço | imagem |
|---|---|---|---|---|
| aliancas-ouro | `ouro` | Aliança Essence — Ouro 18K · 3mm | 289000 | `modelosalianca/3mm.png` |
| aliancas-ouro | `ouro-diamantes` | Aliança Aurea — Ouro 18K + Diamantes · 5mm | 469000 | `modelosalianca/5mm.png` |
| aliancas-prata | `prata` | Aliança Elo — Prata 925 · 3mm | 34900 | `modelosalianca/3mmprata.png` |
| aliancas-prata | `prata` | Aliança Éter — Prata 925 · 6mm | 54900 | `modelosalianca/6mmprata.png` |

`tools/importar-aneis-formatura.py` continua útil como **importador em massa** (recorte do
alpha + geração 960/480px). Muda só o fim: hoje ele confere o preço do nome do arquivo contra
`precoCentavos` fazendo regex no arquivo JS; passa a conferir contra a coluna `preco_centavos`
do banco. A regra de negócio não muda — o preço no nome do arquivo segue sendo a fonte de
verdade da logística.

## Etapa 3 — Catálogo do banco, vitrine igual

- **`lib/catalogo.ts`** substitui `listarProdutos()`. A fronteira desenhada em
  `js/data/aneis-formatura.js` cumpre agora seu propósito: só esta função muda, e o mapeamento
  snake_case → camelCase (`paraFicha`, já previsto em comentário) entra aqui.
- **`RingCard.tsx`** reproduz `cardDoProduto()` **elemento por elemento**: `.ringCard`,
  `.ringCard__fav`, `.ringCard__media--produto`, `.ringCard__img--produto`, `.ringCard__body`,
  `.ringCard__name`, `.ringCard__material`, `.ringCard__desc`, `.ringCard__sku`,
  `.ringCard__foot`, `.ringCard__price`, `.ringCard__buy`. Inclusive o `srcset` de
  480w/960w e o `alt` descritivo. ⚠️ Único ajuste: `produto.lapidacao.toLowerCase()` no `alt`
  quebra se vier `null` do banco, o que é possível para aliança — precisa de guard.
- **Alianças passam a vir do banco** e param de ser markup duplicado, com as mesmas classes de
  hoje. Ganham de brinde o `.catalog__filters` por material, que as páginas atuais não têm
  (os cards já carregam `data-material`, mas nunca existiram botões acionando).
- **Filtros** dirigidos por `categorias.filtro_campo` + `filtro_opcoes`, preservando as regras
  atuais: só aparece o botão de uma cor que existe no acervo; o bloco some abaixo de 2 opções;
  a contagem alterna entre "16 peças nesta categoria" e "8 de 16 peças".
- **Página de produto** (`produto/[slug]`) — tela nova, montada com os componentes e as
  classes que já existem (`.ringCard__*`, `.categoryPage__*`), sem inventar linguagem visual.
  É o destino de "Ver detalhes", hoje `href="#"`.
- **`/conta`** com login, cadastro (`signUp` com `options.data = { nome, telefone }`), reset de
  senha e "meus pedidos". Depois do login usar `window.location.assign()` e não
  `router.replace()`, para o cookie de sessão existir antes do render no servidor.
- **Carrinho** em contexto React + `localStorage`; **checkout** coleta nome, e-mail, telefone e
  **CEP → cidade/UF via ViaCEP**, grava `pedidos` + `pedido_itens` com status
  `aguardando_pagamento` e mostra a confirmação com o número do pedido e o contato para fechar
  o pagamento. **É o CEP do checkout que alimenta o mapa** — sem ele o gráfico por região
  nasce vazio.

## Etapa 4 — `/admin`

Guarda de acesso em três camadas, como no luxCar2026: `proxy.ts` redireciona, `page.tsx`
reconfere `profiles.role` (nunca confiar só no proxy), e a RLS barra no banco.

Abas por querystring (`/admin?aba=catalogo`), server-rendered, sem estado de cliente:

| Aba | Conteúdo |
|---|---|
| **Dashboard** | 6 KPIs + mapa do Brasil + gráficos |
| **Pedidos** | Lista com filtro por status, troca de status, e **formulário de lançamento manual** (cliente, itens, valor, origem, cidade/UF) |
| **Catálogo** | CRUD completo: criar, editar, ativar/desativar, excluir, upload de foto |
| **Clientes** | `vw_clientes` + cadastro manual + gráfico de origem |

**Aba Dashboard**

KPIs (`StatCard`): faturamento do mês · pedidos do mês · ticket médio · clientes novos · peças
ativas no catálogo · região líder.

**`MapaBrasil.tsx` — a peça que não existe no luxCar2026** (aquele projeto não tem nenhuma
visualização geográfica; armazena lat/lng mas nunca desenha mapa). SVG inline, sem biblioteca
de mapa e sem CDN:

- `tools/gerar-mapa-brasil.mjs` roda **uma vez**, baixa a malha das UFs da API pública do
  IBGE, simplifica e grava `lib/geo/brasil-uf.ts` com os 27 paths. O arquivo é versionado —
  em runtime não há nenhum fetch externo.
- Coroplético na paleta que já é do site: escala do `--ivory-soft` ao `--gold-ink` conforme o
  faturamento; UF sem venda em `--ivory-line`. Contorno de região mais grosso, para "regiões"
  ser a leitura primária como pedido.
- Interação: hover mostra tooltip com UF, faturamento e nº de pedidos; clicar numa região
  filtra o resto do dashboard.
- Ao lado, um `BarChart` horizontal Recharts com as 5 regiões ordenadas — o mapa mostra
  *onde*, a barra mostra *quanto*, e responde "quem compra mais" sem obrigar a comparar tons.
- Legenda com a escala e, abaixo, o top 5 de cidades.

Mais: `LineChart` de faturamento por mês (12 meses), `BarChart` horizontal dos produtos mais
vendidos, e donut de origem do pedido. Todo gráfico precisa de **empty state textual** — com o
banco recém-criado todos nascem vazios, e um chart vazio parece bug.

**Aba Catálogo.** Upload manda o arquivo para o Storage e grava `imagem_url`. Para não perder
o `srcset` de hoje (480w/960w), o redimensionamento acontece no browser via `canvas` antes do
upload, gerando as duas versões. Preço digitado em reais, convertido para centavos na
gravação — o formulário nunca guarda float.

**Padrões de UI a copiar do luxCar2026** (`components/admin/*`): `StatCard`, `SectionCard` e
`MiniStat` como os três primitivos; abas em pílula; listas `<ul>` flex em vez de `<table>`;
formulários inline com `FormData` nativo, sem lib de forms; mutação pelo browser client
seguida de `router.refresh()`; **sempre conferir o `error` do insert** — sem isso uma RLS
bloqueando passa despercebida e o registro some em silêncio; sem modais. Repito porque é o
ponto que se perde: vem de lá a estrutura, não a paleta. As cores e as fontes são as da
Florenza.

---

# MÓDULO 2 — Sugestões

Ordenado por retorno para a Florenza, não por facilidade. Nada aqui está aprovado — é a pauta
da próxima conversa.

### A. Fechar o ciclo de venda

1. **PagBank** (já definido como gateway). Checkout PagBank + Webhook em Route Handler que
   promove o pedido de `aguardando_pagamento` para `pago`. O schema do Módulo 1 já nasce com o
   status certo — é plugar, não remodelar. Pix cai na conta no mesmo minuto.
2. **Frete por CEP** (Melhor Envio ou Correios). Joia é leve: quase sempre PAC/Sedex barato, e
   mostrar o valor antes do checkout derruba abandono. O CEP já está em mãos.
3. **Nota fiscal e etiqueta** a partir do pedido, evitando redigitar no sistema do contador.

### B. Vender melhor o que a Florenza já vende

4. **Personalizador de anel de formatura** — a maior oportunidade do negócio. O cliente
   escolhe curso, cor da pedra, metal, aro e gravação interna, e vê o preço mudar. A cena
   Three.js já existente (`js/rings-3d.js`, com troca de metal funcionando) é meio caminho:
   passa a servir o catálogo em vez de ser enfeite da home.
5. **Turmas de formatura.** É venda em lote e sazonal: uma página por turma
   (`/turma/medicina-ufmg-2027`), link único para o representante distribuir, preço fechado e
   prazo comum. Muda o ticket de "um anel" para "quarenta anéis".
6. **Favoritos.** O coração do `.ringCard__fav` já está desenhado e não faz nada. Com conta de
   cliente pronta, vira uma tabela de 3 colunas — e uma lista de intenção de compra real.
7. **Orçamento sob medida** para peça exclusiva: formulário → pedido em status `orcamento`.

### C. Fazer o painel trabalhar sozinho

8. **WhatsApp.** Notificar o pedido novo no celular do dono e mandar a confirmação para o
   cliente. Depois: recuperação de carrinho abandonado. É o canal onde a venda de joia
   realmente acontece.
9. **Alerta de estoque baixo** e reserva de peça enquanto o pedido está aberto. O campo
   `estoque` já existe no Módulo 1 e não está sendo usado para nada.
10. **Cupons e campanhas** com validade e limite de uso (Dia das Mães, Namorados, Natal —
    joalheria vive de data).
11. **Metas e comissão.** Meta mensal com barra de progresso no dashboard, e comissão por
    vendedor se houver equipe. O luxCar tem os dois; a peça `business_settings` copia bem.
12. **Financeiro:** despesas, custo da peça e margem real por produto. Faturamento sem custo
    do ouro conta metade da história.

### D. Confiança e operação

13. **Papéis além de admin/cliente** (vendedor vê pedidos mas não mexe em preço) e **log de
    auditoria** de quem mudou preço ou apagou produto.
14. **Exportar CSV** de pedidos e clientes — o contador vai pedir.
15. **Backup automático** do banco e política de retenção.
16. **LGPD:** aviso de cookies, consentimento no cadastro, e um caminho de exclusão de conta.

### E. Alcance e polimento visual

Tudo desta seção mexe em estética e por isso está aqui, para você aprovar item a item — nada
disso acontece no Módulo 1.

17. **SEO e Open Graph por produto** (`generateMetadata` + JSON-LD `Product`). Invisível para
    o usuário, mas uma vitrine que o Google não indexa não vende. Hoje não há uma única meta
    tag de produto.
18. **Nav no celular.** Bug conhecido e ainda aberto: em ~390px o logo e os links se
    sobrepõem, em todas as páginas.
19. **Otimização da mídia.** Os ~94 MB de `.mp4` na raiz vão para o Storage ou um CDN de
    vídeo, e as imagens passam pelo `next/image`. Deploy mais leve e celular mais rápido, sem
    mudar o que se vê.
20. **Analytics de vitrine:** peça mais vista × peça mais vendida. A diferença entre as duas
    listas diz o que está com preço errado ou foto ruim.
21. **PWA** para o painel — o dono abre no celular como app e recebe notificação de pedido.

---

## Verificação

**Etapa 0 — a que mais importa neste plano: provar que nada mudou de aparência**
- `npm run dev` em `localhost:3000` e o HTML antigo aberto lado a lado, mesma largura de
  janela, em 1440px / 768px / 390px. Comparar `/` e `/aneis-formatura`.
- Conferir explicitamente: corte das fotos de produto (`aspect-ratio: 5/4` + `contain` +
  `drop-shadow` — sem os modificadores `--produto` o `cover` corta o aro do anel), o gradiente
  dourado do `.nav__word`, os reveals do GSAP entrando no mesmo ponto de rolagem, o carrossel
  de categorias, e o hero alternando foto e vídeo.
- Abrir o DevTools e confirmar que **nenhuma regra do Tailwind está vencendo** uma regra dos
  CSS originais em elemento do site antigo. Se o preflight tiver escapado, aparece aqui.

**Etapa 1 (banco)**
- `npx supabase db push --linked` aplica limpo, e o bloco `CONFERÊNCIA` de cada migration
  devolve os valores esperados.
- Teste de RLS — o mais crítico: com a chave `anon` e **sem sessão**, tentar
  `select * from vw_clientes` e `select * from pedidos`. Ambos precisam voltar **vazios**. Se
  voltar dado, `security_invoker` ou a policy está errada.

**Etapas 2-3 (dados e vitrine)**
- Rodar `tools/seed-catalogo.mjs` e conferir 20 produtos (16 formatura + 4 alianças).
- `/aneis-formatura` mostra as 16 peças, a contagem certa e os 6 filtros de cor funcionando,
  visualmente idêntico ao de hoje.
- Criar uma conta de teste no site → a linha aparece em `profiles` **e** na aba Clientes do
  painel, com `origem = site`, sem nenhuma ação manual. É o requisito literal do pedido.
- Fazer um pedido pelo checkout com um CEP de São Paulo e outro do Ceará → duas UFs distintas
  acesas no mapa.

**Etapa 4 (painel)**
- Acessar `/admin` deslogado → redireciona para `/conta`. Logado como `role = 'cliente'` →
  bloqueia. Promover o usuário a `admin` no SQL Editor → libera.
- Lançar um pedido manual, mudar status para `pago`, e ver o faturamento do mês subir.
- Cadastrar um produto novo com foto pelo painel → aparece em `/aneis-formatura` sem deploy.
- Desativar um produto → some da vitrine e continua na lista do painel.
- Excluir um produto que já foi vendido → o pedido antigo mantém nome e preço (snapshot).
- Mapa: passar o mouse numa UF e conferir o valor contra
  `select * from vw_vendas_por_uf order by total_centavos desc`.
- Com o banco zerado, abrir o dashboard: todos os gráficos mostram frase de vazio, nenhum
  `NaN`, nenhum chart quebrado.
- Painel em 390px — é tela nova, então aqui a exigência é responsividade, não paridade.

**Antes de publicar**
- `.env.local` no `.gitignore`; só `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no projeto — **nenhuma service-role key**.
- `npm run build` sem erro de tipo, e deploy na Vercel com as mesmas env vars.
- Atualizar `CLAUDE.md`: a restrição do `file://` que hoje molda a arquitetura deixa de valer,
  e a seção "Dois mundos de JavaScript" perde o sentido. A convenção das camadas de CSS, essa,
  continua valendo e precisa ficar registrada como intencional.

