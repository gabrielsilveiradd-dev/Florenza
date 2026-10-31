# Teste manual no sandbox do PagBank

Para quem vai validar o pagamento com a conta de testes. Leva cerca de uma hora.

`npm test` cobre a lógica com um PagBank simulado. **Este roteiro é o que descobre se o
simulador está certo**: cada passo diz qual suposição do código ele confirma. Anote o
resultado, porque ele alimenta a homologação ([checklist](pagbank-homologacao.md)).

## Antes de começar

1. Faça o passo 5 de `DEPLOY.md`, até `PAGBANK_ENABLED=true`, com `PAGBANK_ENV=sandbox`. O
   webhook precisa de um endereço HTTPS público: use a Vercel, não o localhost.
2. Tenha uma conta de cliente no site e uma conta de admin no painel.
3. Pegue os cartões de teste em
   [Ambientes disponíveis](https://developer.pagbank.com.br/docs/ambientes-disponiveis).
4. Os testes `token` e `checkout` precisam responder `ok: true`, pelo console do navegador
   (`DEPLOY.md`, passo 5, item 7).

Consulta útil no SQL Editor, depois de cada teste:

```sql
select p.numero, p.status, p.pagamento_estado, p.estornado_centavos, p.reconciliado_em
  from pedidos p where p.numero = NUMERO;

select e.created_at, e.origem, e.tipo, e.assinatura, e.recurso_id, e.processado_em, e.alerta, e.erro
  from payment_events e join pedidos p on p.id = e.pedido_id
 where p.numero = NUMERO order by e.created_at;
```

## Teste 1: pagamento aprovado

1. Compre uma peça e pague com o cartão de teste de aprovação, ou com Pix.
2. Volte para a página do pedido.

**Esperado:** "Aguardando confirmação" vira "Pago" sem recarregar. O painel mostra o pedido
"Pago", e o estoque não muda. Em `payment_events` há uma linha de origem `webhook`.

**Confirma, anote:**

- [ ] Em `/api/admin/pagbank/logs?formato=json&dias=30`, logado como admin, a resposta de `GET /checkouts/{id}` traz o campo
      `orders`. **Se não trouxer, pare aqui:** os testes 3 e 4 não vão funcionar, e o pedido
      não expira. Veja a pergunta 2 da homologação.
- [ ] A coluna `assinatura` do evento diz `ecdsa` ou `token`. Se disser
      `url (assinatura não conferiu)`, a validação de assinatura não bate com o que o PagBank
      envia: o pagamento funciona, mas anote para a pergunta 4.
- [ ] O `reference_id` da order é o id do pedido.

## Teste 2: pagamento recusado

1. Compre outra peça e pague com o cartão de teste de recusa.
2. Volte para a página do pedido, e clique em **Pagar agora**.

**Esperado:** o pedido mostra "Recusado", com o botão disponível. O botão abre um checkout
novo. No log, o anterior recebeu `POST /checkouts/{id}/inactivate`. Pague este com o cartão
de aprovação: o pedido vira "Pago".

## Teste 3: webhook perdido, com a página aberta

1. Na Vercel, ponha `PAGBANK_WEBHOOK_URL=https://exemplo.invalid/x` e faça redeploy.
2. Compre e pague, e volte para a página do pedido.
3. Deixe a página aberta.

**Esperado:** em até 20 segundos depois da aprovação, a página vira "Pago". Nenhum evento de
origem `webhook` para este pedido.

## Teste 4: webhook perdido, com a página fechada

1. Ainda com o webhook inválido, compre, abra o pagamento e **feche a aba do pedido**.
2. Pague, e não volte para o site.
3. Aguarde até 5 minutos e olhe o painel.

**Esperado:** o pedido fica "Pago". Se não ficar, confira `select * from cron.job`, e os
segredos `florenza_job_url` e `florenza_job_pagbank` no Vault.

**Ao terminar:** apague `PAGBANK_WEBHOOK_URL`, ou volte ao endereço certo, e faça redeploy.

## Teste 5: reserva vencida

1. Compre sem pagar, e antecipe a reserva em mais de 10 minutos:
   ```sql
   update pedidos set expira_em = now() - interval '11 minutes' where numero = NUMERO;
   ```
2. Aguarde até 5 minutos.

**Esperado:** o pedido é cancelado com "Reserva expirada", a peça volta ao estoque e o
checkout fica `INACTIVE`. Se aparecer o alerta "não foi expirado" na aba Pagamentos, o campo
`orders` não está vindo: volte ao teste 1.

## Teste 6: estorno parcial

1. Painel → Pagamentos → abra um pedido pago → Estornar, com metade do valor.
2. Confirme.

**Esperado:** "Estornado em parte", com o valor certo, e o seu e-mail no histórico. A página
do pedido, para o cliente, mostra o mesmo.

**Confirma, anote:**

- [ ] `POST /charges/{id}/cancel` respondeu 201, com `amount.summary.refunded` na consulta
      seguinte.
- [ ] A cobrança continua `PAID` depois do parcial.

## Teste 7: estorno total

1. No mesmo pedido, estorne o restante.

**Esperado:** "Estornado". A regra de estoque se aplica uma vez: em "Perguntar", aparece um
alerta com os botões. Clique em "Reconciliar agora" várias vezes: o estoque não muda de novo.

**Confirma, anote:**

- [ ] A cobrança fica `CANCELED` depois do total.

## Teste 8: webhook repetido

1. No log do Vercel ou no webhook.site, copie o corpo de um aviso já recebido, com os
   cabeçalhos.
2. Reenvie o mesmo corpo para a mesma URL, com a query completa.

**Esperado:** a resposta traz `"repetido": true`, e não há linha nova em `payment_events` nem
e-mail novo.

## Se algo falhar

Exporte os logs do dia, copie as linhas de `payment_events` do pedido e abra um chamado com
as [perguntas para o suporte](pagbank-homologacao.md#perguntas-para-o-suporte). Com o
sandbox instável, `PAGBANK_ENABLED=false` volta o checkout para o WhatsApp.
