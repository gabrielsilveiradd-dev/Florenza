# CLAUDE.md

Guia para o Claude Code (claude.ai/code) trabalhar neste repositório.

Site da **Florenza Joalheria**: vitrine, conta do cliente e painel administrativo.
Next.js 16 (App Router) + Supabase + Vercel. Código, comentários e interface em
português do Brasil — mantenha o idioma ao escrever qualquer coisa nova.

## Comandos

```bash
npm install
npm run dev              # localhost:3000
npm run build            # build de produção — roda a checagem de tipos
npm run lint

npm run seed             # gera supabase/seed-catalogo.sql das fichas locais
npm run mapa             # regera lib/geo/brasil-uf.ts da malha do IBGE (roda uma vez)

python tools/importar-aneis-formatura.py   # fotos originais -> WebP em public/produtos/
```

Não há testes nem formatter configurados. **A verificação de verdade antes de
qualquer commit é `npm run build`** — é ela que roda o TypeScript.

## Regra que molda tudo: a estética pronta não se mexe

O visual do site é trabalho concluído e não está em discussão. Toda mudança é
**aditiva**.

- **`app/estilos/` é intocável.** `style.css`, `aliancas.css`, `categoria.css` e
  `rings-3d.css` vieram do protótipo sem uma linha alterada e continuam sendo a
  fonte da identidade visual. Os dois `:root` com os tokens (cores e `--nav-h` em
  `style.css`; fontes e linhas em `aliancas.css`) ficam onde estão.
- **A cascata é aditiva:** `style` → `aliancas` → `categoria`. Cada camada só
  soma; nenhuma redefine regra da anterior. `layout.tsx` importa as duas
  primeiras; a página de categoria importa a terceira; a home importa
  `rings-3d.css`.
- **O Tailwind entra sem preflight**, de propósito (ver `app/globals.css`). O
  reset dele desmontaria o site. E, por estar em `@layer utilities`, ele **perde
  de qualquer regra** dos CSS acima, que são CSS comum sem camada. Isso é a
  garantia, não um efeito colateral: as utilities existem para as telas novas e
  não alcançam a vitrine nem por acidente.
- Telas novas (`/admin`, `/conta`) têm CSS próprio — `app/admin/admin.css`,
  `app/conta/conta.css` — usando **as variáveis que já existem**. Nenhuma cor
  nova entra no projeto.
- No CSS dessas telas, o reset escopado usa `:where()` para ter especificidade
  zero. Sem isso `.adm button` venceria `.adm-botao` e o botão perde o fundo —
  já aconteceu uma vez.

Bugs visuais conhecidos (o nav sobreposto em ~390px) só se corrigem com
aprovação explícita: consertar é mudar estética.

## Catálogo dirigido a dados

Fluxo: Supabase → `lib/catalogo.ts` → páginas.

**`lib/catalogo.ts` é a fronteira.** As páginas não sabem de onde os produtos
vêm. Com as chaves configuradas vêm do banco; sem elas, de
`lib/data/catalogo-local.ts`.

A queda para o catálogo local só acontece quando o Supabase **não está
configurado** — serve para quem clona o repositório sem `.env.local`. Se estiver
configurado e a consulta falhar, o erro sobe em vez de cair no local: numa
joalheria, servir preço velho em silêncio é pior que mostrar erro, porque o
preço do ouro muda e a peça sairia pelo valor errado.

A vitrine usa `lib/supabase/publico.ts`, não o cliente de `server.ts`. O motivo é
de renderização: `server.ts` lê os cookies da requisição, e ler cookie faz o Next
marcar a página como dinâmica — as três páginas de categoria e as 20 de produto
deixariam de ser pré-renderizadas. Conteúdo público não depende de quem olha.

Regras do dado, todas duras:
- **Preço sempre em centavos inteiros** (`precoCentavos: 317900`), nunca float.
  Formatação só na exibição. Vale igual na coluna do banco (`integer`).
- **O SKU é chave de negócio**, não detalhe visual: vem do nome do arquivo da
  foto original (`3187_R$2420.png` → `3187`) e é por ele que a peça é encontrada
  na gaveta.
- Duas formas de produto convivem: anel de formatura tem pedra/cor/lapidação;
  aliança tem largura em mm. São colunas nulas tipadas, não `jsonb` — precisam
  ser filtráveis e conferíveis pelo banco.

Detalhe fácil de errar: `categorias[].variante` decide o corte da foto.
`produto` são as fotos recortadas, deitadas (`5/4` + `contain` + `drop-shadow`,
modificadores `--produto`); `foto` são as de aliança, em pé (`4/5` + `cover`).
Sem o modificador certo, o `cover` corta justamente o aro do anel.

## Banco

O projeto existe: `FLORENZA` (`jydcgsxzinrguounnmpi`), Postgres 17. Sete
migrations aplicadas.

Migrations versionadas em `supabase/migrations/`, aplicadas por
`npx supabase db push --linked` ou coladas no SQL Editor. **O nome do arquivo
começa com a versão registrada no banco** — se divergir, um `db push` reaplica
tudo. `supabase/aplicar-tudo.sql` é a concatenação de todas mais o catálogo,
gerada, para recriar o banco do zero numa colada só.

Convenções que valem para toda migration nova:

- cabeçalho em português explicando **o porquê**, não o quê;
- idempotente (`if not exists` / `create or replace` / `on conflict`);
- `enable row level security` em **toda** tabela;
- toda view com `with (security_invoker = true)` — sem isso a view roda com os
  direitos do dono, ignora a RLS de baixo e vaza dado de cliente;
- `revoke`/`grant` explícito em função `security definer`;
- bloco `CONFERÊNCIA` no fim, com a linha do resultado esperado.

Em policy, use `(select auth.uid())` e não `auth.uid()` solto: dentro do
parêntese o Postgres avalia uma vez; solto, chama a função uma vez por linha.

`public.is_admin()` sustenta a RLS do painel inteiro. É `security definer` com
`set search_path = ''` — sem isso, a policy de `profiles` chamaria `is_admin()`
em recursão infinita, e o search_path aberto é porta de escalada de privilégio.

**`is_admin()` tem EXECUTE para `anon` de propósito.** As policies têm a forma
`<condição> or is_admin()`; sem sessão a primeira parte dá `NULL`, então o
Postgres precisa avaliar a segunda. Sem o grant, a consulta anônima morre com
"permission denied for function" em vez de devolver lista vazia. Conceder não
abre nada: a função só responde sobre quem chama. Vale o mesmo para
`email_dos_clientes()`. O linter do Supabase aponta as duas; as duas ficam.

**`auth.users` é inalcançável pelos papéis do cliente.** Nem `anon` nem
`authenticated` têm SELECT ali. Uma view com `security_invoker` que leia aquela
tabela direto falha com *permission denied* até para o admin. Por isso o e-mail
sai por `public.email_dos_clientes()` — `security definer`, com a checagem de
admin dentro do corpo.

**Função de trigger não recebe EXECUTE.** O PostgREST expõe toda função de
`public` em `/rest/v1/rpc/<nome>`, e as de trigger são `security definer`.
Revogar não desliga a trigger: o Postgres confere essa permissão ao criar a
trigger, não a cada disparo.

**Índice em toda coluna de chave estrangeira.** O Postgres não cria sozinho.

Depois de mexer no schema, rode os Advisors (segurança e performance). Foi o
que apontou os três achados corrigidos na migration `..._endurecimento`.

## Modo demonstração

Sem `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` em
`.env.local`, o site continua abrindo: a vitrine lê o catálogo local e o painel
usa `lib/admin/dados-demo.ts`, com um aviso na tela. Serve para conferir layout
sem banco, e para quem clonar o repositório sem as chaves.
`lib/supabase/config.ts` é quem decide.

Com o banco ligado — que é o estado atual — esse caminho não roda. Ele não é
plano B de produção: ver a regra em "Catálogo dirigido a dados".

E não pode virar: `config.ts` **estoura** se `VERCEL_ENV === "production"` sem
as chaves. Sem essa trava, o pior caso é silencioso — build verde, site no ar, e
a loja de verdade servindo o catálogo do repositório com o painel cheio de
pedidos de exemplo. Preview segue permissivo, que é onde se confere layout.

`vercel.json` fixa `framework: "nextjs"` e não é enfeite. Com o preset em
**Other**, a Vercel roda o build inteiro — o Next compila e gera as páginas —
e depois **descarta o `.next` e publica `public/`** como site estático. O deploy
fica verde, os arquivos de `public/` respondem 200, e **toda página dá 404**
com o texto cru `NOT_FOUND` da plataforma, não com a página de erro do site.
Foi exatamente isso que segurou a primeira publicação. O `vercel.json` tem
precedência sobre o painel, então o preset viaja com o código.

**Nenhuma service-role key entra neste projeto.** Quem protege os dados é a RLS.
A carga inicial do catálogo é SQL colado no SQL Editor (`npm run seed`),
justamente para não precisar dessa chave.

## Gráficos e mapa

- O mapa do Brasil é **SVG inline** de `lib/geo/brasil-uf.ts`, gerado uma vez da
  malha do IBGE e versionado. Sem biblioteca de mapa, sem rede em runtime.
- A escala do coroplético é por **raiz quadrada** do faturamento. Linear, o
  estado líder apaga o resto do país.
- A paleta categórica de `lib/admin/format.ts` foi **conferida por script**
  (skill `dataviz`), não escolhida no olho. Ao mexer nela, rode o validador de
  novo — o comentário no arquivo traz o comando. Vermelho e verde nunca ficam
  adjacentes, e os pares críticos se separam por luminosidade.
- Todo gráfico precisa de **estado vazio textual**: com banco novo eles nascem
  sem dado, e um gráfico vazio parece defeito.

## Animações

Os reveals GSAP vivem em `components/Reveal.tsx`, portados do protótipo **sem
alteração de parâmetro** — duração, easing e pontos de gatilho são a assinatura
do site. `.js-reveal-catalogo` existe separado de `.js-reveal-stagger` porque a
grade do catálogo tinha stagger e gatilho próprios.

`components/VideoAutoplay.tsx` dá `pause()` nos vídeos fora da viewport. Não é
sobra: três decoders simultâneos travam a rolagem no celular.

Tudo respeita `prefers-reduced-motion`.

## Pendências conhecidas

- **Ninguém é admin ainda.** O painel só abre depois de um `update
  public.profiles set role = 'admin'` — passo manual e consciente, de propósito.
- **Upload de foto pelo painel** não está ligado. O formulário existe, o bucket
  e as policies também; falta o envio do arquivo. Hoje a foto entra pelo script
  Python.
- Mercado Pago (gateway escolhido) fica para o Módulo 2.
- Sem os tipos gerados do banco (`supabase gen types --project-id
  jydcgsxzinrguounnmpi`), há um cast em `lib/admin/listas.ts`. Exige
  `supabase login`, que é interativo.
- O projeto nasceu em **us-east-2**, não em São Paulo: ~120 ms a mais por
  consulta. Trocar exige projeto novo — o schema está todo versionado, então é
  colar `aplicar-tudo.sql` e trocar duas variáveis.
- No celular (~390px) o logo e os links do nav se sobrepõem.
- `aneisFormatura/` (33 MB de fotos originais) e `public/produtos/` seguem fora
  e dentro do git respectivamente; pense duas vezes antes de commitar mídia.
