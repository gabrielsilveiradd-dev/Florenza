# Publicar na Vercel

Passo a passo do que falta. Leva uns 10 minutos, e nenhum passo depende do
anterior estar perfeito — se algo der errado, dá para voltar.

O código já está pronto e testado. O que falta é ligar três coisas: o
repositório na Vercel, as chaves do banco, e os endereços de retorno do login.

## O sistema é duas peças, não uma

**O repositório** carrega tudo que é código: a vitrine, o painel `/admin`, o
carrinho, o checkout, a conta de cliente, toda a mídia, e o banco escrito como
migrations. Publicar na Vercel publica isso inteiro — não só o site.

**O Supabase** guarda os dados: produtos, clientes, pedidos, contas. Já está no
ar, com o catálogo carregado e a proteção conferida. Ele não sobe junto com o
código; a Vercel conversa com ele pelas duas chaves do passo 2.

Fora do repositório, de propósito: as chaves (que vão na Vercel, nunca no git) e
as fotos originais de 33 MB, que alimentam o script Python e não o site.

---

## Antes de tudo: os dois valores que você vai colar

Guarde esta caixa aberta, ela é usada duas vezes.

```
NEXT_PUBLIC_SUPABASE_URL
https://jydcgsxzinrguounnmpi.supabase.co
```

```
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
sb_publishable_JPFDQipjVf7zjJOi6tFWIQ_1HxWuFVY
```

Essas duas podem circular no navegador — é para isso que foram feitas. Quem
protege os dados é a Row Level Security no banco, não o segredo da chave.

**A chave `service_role` não entra aqui.** Se algum tutorial mandar colar uma
chave "secreta" ou "service role", não cole: ela ignora toda a proteção do
banco. Este projeto foi escrito para nunca precisar dela.

---

## 1. Importar o repositório

1. Entre em [vercel.com](https://vercel.com) com a conta que você já tem.
2. **Add New → Project**.
3. Se o repositório `Florenza` não aparecer na lista, clique em **Adjust GitHub
   App Permissions** e libere o acesso a ele. É o tropeço mais comum aqui.
4. **Import**.

Não mexa em Framework Preset, Build Command nem Output Directory. A Vercel
reconhece Next.js sozinha, e qualquer ajuste manual aí costuma quebrar.

## 2. Colar as chaves — antes do primeiro deploy

Ainda na tela de importação, abra **Environment Variables** e cole as duas
variáveis da caixa lá em cima.

Marque os três ambientes: **Production**, **Preview** e **Development**.

> **Se você já tiver feito o deploy sem elas**, o build vai falhar com uma
> mensagem dizendo exatamente isso. É de propósito. Sem essa trava, o site
> subiria verde servindo um catálogo de mentira, com o painel cheio de pedidos
> de exemplo — parecendo certo. Cole as variáveis em **Settings → Environment
> Variables** e depois **Deployments → ⋯ → Redeploy**. A Vercel não reaproveita
> variáveis num build que já rodou.

## 3. Deploy

Clique em **Deploy** e espere. No fim você recebe uma URL parecida com
`https://florenza-xxxx.vercel.app`. **Anote, ela é usada no passo 4.**

## 4. Ensinar o Supabase o endereço novo

Sem este passo o cadastro de cliente parece funcionar e não funciona: a pessoa
se cadastra, recebe o e-mail, clica no link — e cai em `localhost`, que só
existe no seu computador.

No painel do Supabase → **Authentication → URL Configuration**:

| Campo | O que pôr |
|---|---|
| **Site URL** | a URL da Vercel, sem barra no fim |
| **Redirect URLs** | `https://SUA-URL.vercel.app/**` |
| **Redirect URLs** | `http://localhost:3000/**` |

Os dois asteriscos no fim não são enfeite: sem eles só a raiz é aceita, e o
retorno acontece em `/auth/callback`.

Mantenha o `localhost` na lista — é o que deixa você continuar testando aqui.

---

## Conferir que subiu certo

Abra a URL da Vercel e passe por estes cinco pontos, nesta ordem:

1. **A home abre** e a seção 3D dos anéis gira.
2. **`/aneis-formatura` mostra 16 peças** e os filtros de cor funcionam.
   → Se aparecerem produtos mas o painel disser "modo demonstração", as
   variáveis não pegaram. Volte ao passo 2.
3. **`/admin` abre** e mostra "Peças à venda: 20", sem aviso amarelo.
   → Se pedir login, entre com seu e-mail. Você já é admin.
4. **Crie uma conta de teste** em `/conta` com outro e-mail e confirme pelo
   link. Se o link abrir o site publicado (e não localhost), o passo 4 deu
   certo.
5. **Volte em `/admin?aba=clientes`**: a conta de teste tem que estar lá,
   marcada "Conta no site". Ninguém sincronizou nada — é a trigger do banco.

---

## O que ainda não existe

Nenhum destes bloqueia o lançamento, mas é melhor você saber antes de mostrar
para alguém:

- **Pagamento.** O pedido nasce em "aguardando pagamento" e o combinado é por
  WhatsApp. O Mercado Pago é o Módulo 2 — o banco já está no formato certo para
  recebê-lo, é plugar o webhook.
- **Upload de foto pelo painel.** O formulário existe e o bucket também, mas o
  envio do arquivo ainda não está ligado. Peça nova hoje entra pelo script
  Python.
- **E-mail em volume.** O envio usa o SMTP embutido do Supabase, que tem limite
  de poucas mensagens por hora e não é para produção. Com movimento de verdade,
  clientes param de receber o link de confirmação. Quando chegar essa hora,
  plugue um serviço de e-mail (Resend, Brevo) em **Authentication → Emails →
  SMTP Settings**.
- **Nav no celular.** Em telas de ~390px o logo e os links se sobrepõem. É bug
  de estética e você pediu para não mexer sem falar antes.

## Duas coisas que valem cuidado agora

**O banco é gratuito e pausa sozinho** depois de uma semana sem nenhuma
atividade. Com o site no ar recebendo visita, não acontece. Mas se ficar parado
até o lançamento, o banco dorme e o site cai junto — despausar é um clique no
painel, só não pode ser surpresa.

**Sua entrada no Supabase é a conta do GitHub** `gabrielsouzasilveiramkt-debug`.
Perder o acesso a ela é perder o banco, com os dados dos clientes dentro. Em
*Account Settings* do Supabase, adicione e-mail e senha como segunda porta de
entrada e ligue 2FA. Dois minutos, de graça.

---

## Se precisar recriar o banco do zero

Todo o schema está versionado. No SQL Editor de um projeto novo, cole
`supabase/aplicar-tudo.sql` inteiro e execute: são as 7 migrations mais o
catálogo. Termina numa conferência de 16 linhas — todas precisam vir `ok`.

Depois troque as duas variáveis da caixa lá de cima pelas do projeto novo.
