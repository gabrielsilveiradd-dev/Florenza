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

## Setembro de 2026 — abrir a loja para vender

O site já está publicado. Esta atualização traz compra com conta, endereço
completo e CPF, medida do aro, reserva de 48 horas, a ficha completa do pedido
no painel, edição de preço e estoque, envio de foto, cupons, avisos de pedido,
páginas legais e o Mercado Pago pronto para ligar. **A ordem abaixo importa.**

### 1. Preencher os dados da loja

Em `lib/loja.ts`: razão social, CNPJ, endereço, e-mail, WhatsApp e como a
entrega funciona. A lei do comércio eletrônico (Decreto 7.962/2013) exige esses
dados à vista.

A loja foi publicada em 14/09/2026 **antes** de eles existirem: o build de
produção deixa um aviso no log (antes era erro) e o que falta aparece marcado
"a preencher" nas páginas legais. Preencha antes de vender de verdade — é só
editar o arquivo, commitar e publicar.

Leia também `/termos-de-compra`, `/trocas-e-devolucoes` e `/privacidade`. São
texto-base, escrito a partir do que o sistema faz — passe pelo advogado ou pelo
contador antes de abrir.

### 2. Aplicar as migrations e publicar o código — juntos

```bash
npx supabase db push --linked --dry-run   # lista o que vai subir, sem aplicar
npx supabase db push --linked
```

Todas as migrations do repositório estão aplicadas: `20260914120000` e
`20260914120100` em 14/09/2026, e **`20260914140000_frete_e_medida_obrigatoria.sql`**
(frete, medida obrigatória, `criar_pedido` com `p_frete`) em 16/09/2026, minutos
antes do push do código. O `--dry-run` deve dizer que não há nada para subir.
Cada migration termina numa conferência; tudo precisa vir `ok`, com duas exceções
esperadas: o segredo dos pagamentos fica `PENDENTE` até o passo 5, e os
**valores de frete** ficam `PENDENTE` enquanto forem os fictícios.

**Regra para a próxima migration que mude o formato de uma função ou coluna
lida pelo site:** banco primeiro, código logo depois, sem intervalo. Com o banco
novo e o código velho, só a função que mudou falha. Com o código novo e o banco
velho, quebram todas as telas que leem o que ainda não existe.

Se a conferência disser que o **pg_cron** não está ligado: Supabase →
**Database → Extensions → pg_cron → Enable**, e rode o push de novo (a migration
é idempotente). Sem ele, reserva vencida não volta sozinha para o estoque.

### 3. Conferir o banco e acertar o estoque

Abra `supabase/antes-de-abrir.sql` no SQL Editor e rode bloco a bloco. Ele
confere as migrations e o agendamento, lista os pedidos de teste (com o comando
para cancelar e apagar, comentado) e lista o estoque para você acertar com o que
existe de verdade.

O **bloco 10** é o frete. Os valores de hoje são **fictícios** — duas
modalidades (Econômica e Expressa) com preço e prazo por região, só para o
cliente ver o frete somar no total. Quando a transportadora estiver escolhida,
troque preço e prazo ali (os comandos estão prontos, comentados), desative o que
não for usar ou crie uma modalidade nova. Frete grátis é preço `0`.

### 4. Testar no site publicado

Com uma conta de cliente: escolha uma aliança em par, as duas medidas, e feche o
pedido com o cupom `BEMVINDO10` e uma forma de envio. Confira que o desconto sai
só das peças e o frete soma no total. Em `/admin?aba=pedidos`, abra a **Ficha** e
confira medidas, frete, CPF e endereço. Cancele pelo painel e veja o estoque voltar.

### 5. Ligar o Mercado Pago

1. Em [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers)
   → **Suas integrações → Criar aplicação**, para pagamentos online (Checkout
   Pro).
2. Invente um segredo aleatório com 32 caracteres ou mais e grave no Supabase,
   pelo SQL Editor:
   ```sql
   select vault.create_secret('COLE-AQUI-O-SEGREDO', 'florenza_pagamentos');
   ```
3. No Mercado Pago → **Webhooks → Configurar notificações**: URL
   `https://florenza-virid.vercel.app/api/mercadopago/webhook`, evento **Pagamentos**. Guarde a
   **assinatura secreta** que ele mostra.
4. Na Vercel → **Settings → Environment Variables**, em Production:

   | Variável | Valor |
   |---|---|
   | `MP_ACCESS_TOKEN` | Access Token da aplicação — comece pelo de **teste** (`TEST-…`) |
   | `PAGAMENTO_SEGREDO_BANCO` | o mesmo segredo do item 2 |
   | `MP_WEBHOOK_SECRET` | a assinatura secreta do item 3 |
   | `NEXT_PUBLIC_SITE_URL` | `https://florenza-virid.vercel.app`, sem barra no fim |

   Nenhuma delas leva `NEXT_PUBLIC_` além da última — com o prefixo, o valor
   iria parar no navegador.
5. **Redeploy** — variável nova só vale em build novo.
6. Compre com um cartão de teste do Mercado Pago. O pedido tem que virar
   **Pago** sozinho, e a ficha no painel mostra o pagamento. O quadro "Ligações
   da loja", na aba Pedidos, diz **Teste** enquanto a credencial for de teste.
7. Deu certo: troque `MP_ACCESS_TOKEN` pela credencial de **produção** e faça
   redeploy.

Enquanto este passo não for feito, nada quebra: o pedido nasce aguardando
pagamento e o acerto é por WhatsApp, como hoje.

### 6. Avisos de pedido

A loja fica em `florenza-virid.vercel.app`, **sem domínio próprio** (a Vercel
importa o repositório do GitHub). Isso muda o plano de e-mail: o Resend só envia
de domínio verificado, e `vercel.app` não é seu para verificar.

- **Aviso para a loja, sem domínio:** `AVISO_PEDIDO_WEBHOOK_URL` e
  `AVISO_WEBHOOK_SEGREDO` na Vercel, apontando para um fluxo do n8n que manda a
  mensagem no WhatsApp (ou no e-mail) da Florenza a cada pedido e pagamento.
- **Resend sem domínio:** o remetente de teste `onboarding@resend.dev` só entrega
  no e-mail da própria conta do Resend. Serve para o aviso da loja
  (`AVISO_EMAIL_REMETENTE` = `Florenza <onboarding@resend.dev>`,
  `AVISO_PEDIDO_EMAIL` = o e-mail dessa conta), mas o e-mail para o cliente é
  recusado — fica só o registro no log da Vercel, o pedido não é afetado.
- **Com domínio próprio, um dia:** verifique-o no Resend, troque o remetente, e o
  e-mail para o cliente passa a sair. Nenhuma linha de código muda.

Variável nova só vale depois de um **Redeploy**.

### 7. E-mails de cadastro e de senha — Gmail da loja

O SMTP embutido do Supabase **só entrega para os membros da equipe do projeto**.
Por isso os e-mails de conta saem de um Gmail da loja.

**O primeiro Gmail foi suspenso pelo Google no mesmo dia em que foi criado**
("suspeita de bots"). Tinha sido configurado por automação, ganhou senha de app
na hora e recebeu logins SMTP recusados. Com o Gmail novo:

1. Crie e use a conta **à mão**, pelo celular ou pelo navegador de sempre. Nada
   de ferramenta automática nas páginas do Google.
2. Deixe a conta com alguns dias de uso normal antes de ligar o SMTP.
3. Ligue a verificação em duas etapas e crie uma **senha de app** ("Supabase").
   Copie as 16 letras **sem os espaços**.
4. Supabase → **Authentication → Emails → SMTP Settings**: host `smtp.gmail.com`,
   porta `465`, **Sender email** e **Username** = o Gmail novo, nome "Florenza
   Joalheria", **Password** = a senha de app. Salve.
5. Crie uma conta de teste no site com outro e-mail e veja o link chegar. Se não
   chegar, o motivo aparece em **Logs → Auth** no Supabase, na linha `/signup`.

Enquanto o SMTP apontar para uma conta sem senha de app válida, **todo cadastro
dá erro 500** ("Error sending confirmation email", e o registro mostra
`535 Username and Password not accepted`). A saída provisória é desligar
**Confirm email** em Authentication → Sign In / Providers → Email.

Outros detalhes do e-mail:
- **Templates** "Confirm sign up" e "Reset password" estão em português, no mesmo
  visual dos avisos de pedido. Os dois usam `{{ .ConfirmationURL }}`, que passa
  pelo `/auth/callback` do site. Os outros modelos ficam em inglês: o site não usa.
- **Se a senha da conta Google mudar,** a senha de app morre junto e os e-mails
  param sem aviso. Gere outra e cole em SMTP Settings.
- Com SMTP próprio, o limite começa em 30 e-mails por hora (**Rate Limits**), e o
  Gmail envia cerca de 500 por dia. Sobra para uma loja pequena. O caminho
  definitivo, se um dia houver domínio, é o Resend (host `smtp.resend.com`,
  usuário `resend`, senha = a `RESEND_API_KEY`).

O template "Reset password" já fala da tela de nova senha (`/conta/nova-senha`,
publicada em 16/09/2026): assunto "Crie uma nova senha na Florenza", botão "Criar
nova senha". Ele avisa que o link só funciona no mesmo navegador em que a troca foi
pedida. É o limite do fluxo PKCE atual.

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

Não mexa em Framework Preset, Build Command nem Output Directory — o
`vercel.json` na raiz já fixa os três.

> **Por que esse arquivo existe.** Se o Framework Preset ficar em **Other**, a
> Vercel roda o build normalmente (o Next compila, conecta no banco, gera as 23
> páginas) e depois **descarta o `.next` e publica a pasta `public/`** como se
> fosse um site estático — é o padrão dela quando não sabe qual framework é.
> O resultado engana: deploy verde, `/herome.png` e `/favicon.svg` abrindo
> normalmente, e **toda página dando 404**, porque não existe `index.html` em
> `public/`. Já aconteceu neste projeto. O `vercel.json` tem precedência sobre o
> painel, então agora o preset certo vem junto com o código.

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

### Se der 404, veja qual dos dois é

São dois erros diferentes com a mesma cara no navegador, e a distinção diz onde
está o problema:

| O que aparece | O que significa |
|---|---|
| Página 404 **com o layout da Florenza** | O site está no ar. A rota é que não existe |
| Texto cru **"The page could not be found / NOT_FOUND"** | O site **não** está no ar. Quem respondeu foi a Vercel, não o Next |

No segundo caso, teste um arquivo de `public/` — por exemplo
`SUA-URL.vercel.app/favicon.svg`. Se ele abrir e as páginas não, é o Framework
Preset em "Other": a Vercel está publicando `public/` no lugar do Next. O
`vercel.json` resolve; confira em **Settings → Build and Deployment** se o
Framework Preset aparece como **Next.js** e o Output Directory está no padrão
(vazio). Depois **Redeploy**, com a caixa *Use existing Build Cache*
desmarcada.

---

## O que ainda não existe

Nenhum destes bloqueia o lançamento, mas é melhor você saber antes de mostrar
para alguém:

- **Entrar com Google.** O botão está na tela `/entrar`, mas o provedor ainda
  não foi ligado. Para ativar: Supabase → **Authentication → Providers →
  Google**, com o Client ID e o Secret de um projeto no Google Cloud, e a URL de
  retorno `https://jydcgsxzinrguounnmpi.supabase.co/auth/v1/callback`. Enquanto
  não estiver ligado, o botão avisa e manda usar e-mail e senha — ninguém fica
  travado.
- **Pagamento online, enquanto a conta do Mercado Pago não for ligada.** O
  código está pronto; sem as credenciais, o pedido nasce em "aguardando
  pagamento" e o combinado é por WhatsApp. Passo 5 lá em cima.
- **Cadastro de cliente parado até o Gmail novo.** O SMTP ainda aponta para o
  Gmail suspenso, e todo cadastro dá erro 500. O passo 7 resolve.
- **Frete de verdade.** A cotação por CEP funciona, mas os valores são
  fictícios até a escolha da transportadora (passo 3, bloco 10). Não há
  etiqueta nem rastreio automático: o código de rastreio continua digitado no
  painel.
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

**Esse arquivo parou em agosto de 2026** e não tem as migrations mais recentes.
Com o projeto novo linkado, prefira `npx supabase db push --linked`, que aplica
todas as de `supabase/migrations/` na ordem.

Depois troque as duas variáveis da caixa lá de cima pelas do projeto novo.
