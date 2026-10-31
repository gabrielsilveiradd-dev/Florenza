# Comece aqui

O site é uma aplicação Next.js com painel administrativo, e **o banco já está no
ar**: projeto `FLORENZA` no Supabase, schema aplicado, catálogo carregado, RLS
conferida contra a API pública.

```bash
npm install
npm run dev      # http://localhost:3000
```

As chaves já estão em `.env.local` (ignorado pelo git). A vitrine agora lê os
produtos do Supabase, não mais do arquivo do repositório.

| Endereço | O que é |
|---|---|
| `/` | a home, igual a antes — e a seção 3D agora funciona |
| `/aneis-formatura` | a vitrine, com os filtros de cor |
| `/produto/anel-rubi-classico` | página de produto |
| `/carrinho` | carrinho e checkout |
| `/conta` | login e cadastro de cliente |
| `/admin` | **o painel**, com o mapa do Brasil |

---

## Falta só uma coisa para o painel abrir: te tornar admin

Não dá para eu fazer isso por você — depende de uma conta criada com o seu
e-mail e a sua senha.

### 1. Crie sua conta no site

`http://localhost:3000/conta` → **Criar conta**. Use um e-mail que você acessa;
o Supabase valida o domínio e manda confirmação.

### 2. Se promova a admin

No **SQL Editor** do Supabase, troque o e-mail e execute:

```sql
update public.profiles set role = 'admin'
 where id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');

-- Confere: precisa devolver uma linha com role = admin
select u.email, p.role from public.profiles p
  join auth.users u on u.id = p.id where p.role = 'admin';
```

Pronto: `/admin` abre para você e segue fechado para todo mundo.

### 3. Teste de ponta a ponta

1. `/aneis-formatura` → **Comprar** em duas peças
2. `/carrinho` → preencha com um **CEP de São Paulo** e envie
3. Repita com um **CEP do Ceará**
4. `/admin` → aba **Pedidos**: os dois em "aguardando pagamento"
5. Mude os dois para **Pago**
6. Aba **Vendas**: São Paulo e Ceará acesos no mapa

E o requisito que você pediu literalmente: a conta que você criou no passo 1 já
deve estar na aba **Clientes** marcada como "Conta no site", sem nenhum botão de
sincronizar. Isso está testado — a trigger foi verificada no banco real.

---

## O estado do banco

Projeto `FLORENZA` (`jydcgsxzinrguounnmpi`), Postgres 17. Sete migrations
aplicadas e versionadas em `supabase/migrations/` — os nomes dos arquivos batem
com as versões registradas no banco, então `npx supabase db push --linked` vê
tudo como já aplicado e não repete nada.

O que está lá dentro: 8 tabelas, 7 views, 27 UFs, 3 categorias, 9 opções de
filtro e 20 produtos. Conferido por 16 checagens automáticas, todas passando.

**A verificação de segurança que mais importa** foi feita com a chave publicável
de verdade, pela API pública, e com um cliente cadastrado no banco:

| Consulta anônima | Resultado |
|---|---|
| `vw_clientes` | 0 linhas |
| `profiles` | 0 linhas |
| `pedidos`, `pedido_itens` | 0 linhas |
| `clientes_manuais` | 0 linhas |
| `rpc/email_dos_clientes` (contornando a view) | `[]` |
| `produtos` | 20 — é a vitrine, tem que aparecer |

Se algum dia essa tabela mudar, pare e me avise.

### Se precisar recriar o banco do zero

`supabase/aplicar-tudo.sql` é as 7 migrations mais o catálogo numa colada só.
SQL Editor → cola → Run. Termina numa conferência de 16 linhas, todas `ok`.

---

## O que ficou de fora

- **PagBank.** Código pronto, falta a conta — DEPLOY.md, "Ligar o PagBank". O
  pedido nasce em `aguardando_pagamento`, e a confirmação vem do PagBank, por
  webhook, pela página do pedido ou pelo agendamento.
- **Upload de foto pelo painel.** O formulário de cadastro está lá, o bucket do
  Storage existe e as permissões estão escritas, mas o envio do arquivo ainda
  não está ligado. Por enquanto a foto entra pelo script Python.
- **Tipos gerados do banco.** Some um cast em `lib/admin/listas.ts` quando você
  rodar:
  ```bash
  npx supabase login
  npx supabase gen types typescript --project-id jydcgsxzinrguounnmpi > lib/supabase/types.ts
  ```
  Não fiz porque exige um login interativo que só você pode dar.
- **Nav no celular.** Logo e links se sobrepõem em ~390px. É bug de estética e
  você pediu para eu não mexer nisso sem falar antes.

## Uma decisão que vale revisar

O projeto foi criado na região **us-east-2 (Ohio)**, não em São Paulo. Cada
consulta atravessa o continente: uns 120 ms a mais por ida e volta, que o
cliente sente como lentidão na vitrine.

Trocar região exige criar outro projeto e migrar — o schema inteiro está
versionado, então seria colar `aplicar-tudo.sql` no projeto novo e trocar duas
variáveis. Enquanto o movimento é pequeno, não é urgente. Mas quanto mais tarde,
mais caro.

## Sobre o site antigo

Os arquivos do protótipo (`index.html`, `css/`, `js/`) saíram no commit
`2ec9bb6`, depois da conferência visual. Nada se perdeu:

```bash
git show e37a416:index.html
git show e37a416:css/style.css
```

A estética não mudou: os quatro arquivos de `css/` foram para `app/estilos/` sem
uma linha alterada, e as páginas saem com a mesma altura ao pixel — 5246 na
home, 3788 na formatura, 2119 nas alianças.
