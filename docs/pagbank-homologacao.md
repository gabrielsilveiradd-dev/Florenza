# Homologação do PagBank: checklist e perguntas para o suporte

Para quem vai pedir a liberação de produção do PagBank para a Florenza.

**Situação:** a integração usa o Checkout PagBank (`POST /checkouts`), com webhook. A
documentação diz que a homologação é obrigatória, com prazo de até 4 dias úteis se os logs
forem enviados corretamente.

**Nada disto foi testado contra a API real ainda.** O site só foi exercitado com respostas
simuladas: o roteiro abaixo é o primeiro contato.

**Onde pedir:** [formulário de homologação](https://app.pipefy.com/public/form/2e56YZLK),
indicado em [Solicitar homologação](https://developer.pagbank.com.br/docs/solicitar-homologacao).

## Antes de pedir

- [ ] Migrations `20261031130000` a `20261031130300` aplicadas (DEPLOY.md, passo 5).
- [ ] Variáveis na Vercel, com `PAGBANK_ENV=sandbox` e `PAGBANK_ENABLED=true`.
- [ ] Painel → Pagamentos → **Status da integração**: "Testar token" e "Testar criação de
      checkout" dão OK.
- [ ] "Ligar avisos de contestação" dá OK.
- [ ] Roteiro de teste abaixo concluído no sandbox.
- [ ] Cada item marcado `SUPOSIÇÃO – validar no sandbox` no código (`git grep "SUPOSIÇÃO"`)
      conferido, com o resultado anotado aqui.

## O que enviar

- [ ] Logs de sandbox: Painel → Pagamentos → **Exportar logs (JSON)**, ou
      `/api/admin/pagbank/logs?formato=json&dias=30&ambiente=sandbox`.
- [ ] Logs de produção, se a primeira chamada já tiver sido tentada:
      `...&ambiente=production`. Um 403 nesse log é a evidência para a pergunta 1.
- [ ] Os dados da conta: e-mail da conta vendedora, razão social e CNPJ.
- [ ] Endereço do webhook: `https://florenza-virid.vercel.app/api/pagbank/webhook`.

**Os logs vão mascarados** (CPF, e-mail, telefone, nome e endereço) e sem token ou dados
de cartão. Se o PagBank exigir os valores completos, veja a pergunta 6 antes de enviar
qualquer coisa fora do export.

## Roteiro de teste no sandbox

Faça com uma conta de cliente em `/carrinho`. Depois de cada caso, confira a página do
pedido, a aba Pagamentos e o log.

| # | Caso | Como | O que deve acontecer |
|---|---|---|---|
| 0 | **Campo `orders` do checkout** | Pague um pedido e veja no log a resposta de `GET /checkouts/{id}` | Precisa trazer o id `ORDE_`. **Sem isso, os casos 3 e 4 não funcionam: pare e fale com o suporte (pergunta 2)** |
| 1 | Pagamento aprovado | Pague com Pix ou cartão de teste | Volta para o pedido, "Aguardando confirmação" vira "Pago" sozinho; pedido "Pago" no painel |
| 2 | Pagamento recusado | Cartão de teste de recusa | "Recusado"; "Pagar agora" abre um checkout novo, e o anterior fica INACTIVE |
| 3 | Webhook perdido, página | Com `PAGBANK_WEBHOOK_URL=https://exemplo.invalid/x`, crie o checkout e pague com a página do pedido aberta | Em até 20 segundos depois da aprovação a página vira "Pago", sem webhook |
| 4 | Webhook perdido, job | Igual ao 3, mas feche a página do pedido antes de pagar | Em até 5 minutos o painel mostra "Pago", com origem `job` no histórico |
| 5 | Reserva vencida sem pagamento | No SQL, antecipe `expira_em` de um pedido sem pagamento em mais de 10 minutos | O job expira, a peça volta ao estoque e o checkout fica INACTIVE |
| 6 | Reserva vencida e paga | Igual ao 5, mas com o pedido pago antes de o job rodar | Não expira; fica "Pago" |
| 7 | Webhook repetido | Reenvie o mesmo corpo para a URL de aviso | Resposta `repetido: true`; uma linha só em `payment_events`; nenhum e-mail a mais |
| 8 | Estorno parcial | Painel → Estornar, com metade do valor | "Estornado em parte", valor e autor no histórico |
| 9 | Estorno total | Painel → Estornar o restante | "Estornado"; pergunta ou aplica a regra de estoque, uma vez só |
| 10 | Contestação | Cartão de teste de chargeback ([guia](https://developer.pagbank.com.br/docs/chargeback)), com o caso "Ligar avisos" feito | "Em contestação", alerta no painel, e-mail ou n8n para a equipe |
| 11 | Evento desconhecido | Envie corpo `{"id":"XPTO"}` assinado com a URL de aviso | Alerta "tipo desconhecido" no painel |
| 12 | Flag desligada | `PAGBANK_ENABLED=false` e redeploy | Checkout fecha pelo WhatsApp, sem erro; pedidos abertos seguem sendo conferidos |
| 13 | Teste do 403 | `PAGBANK_ENV=production` antes da liberação, sem clientes no site | "Testar criação de checkout" mostra o 403 explicado, e o log guarda a resposta |

## Perguntas para o suporte

1. **Erro 403 em produção.** Se `POST /checkouts` responder 403 com o token de produção
   (há relatos com `allowlist_access_required`: "Allowlist access required. Contact
   PagBank."), o que falta? Precisa de liberação da conta em allowlist? A homologação já
   resolve, ou é um pedido separado? Quem faz e em quanto tempo? Anexe a resposta do log e
   diga se o mesmo fluxo passou no sandbox.
2. **Pagamentos de um checkout.** A referência de `GET /checkouts/{id}` diz que a resposta
   traz os pagamentos, mas o exemplo não mostra o campo. Qual é o nome e o formato? O site
   lê `orders[].id`. É a forma recomendada de reconciliar sem webhook?
3. **Vínculo.** O `reference_id` do checkout é copiado para a order e para as cobranças? E
   para `transaction.reference_id` do chargeback? O exemplo da consulta traz nulo.
4. **Autenticidade.** Avisos de checkout chegam com `x-authenticity-token`, com
   `x-payload-signature`, ou com os dois? Qual prevalece? Na comunidade há relato de assinatura
   que não confere.
5. **Eventos de pós-venda.** Qual é o corpo dos eventos `CHARGEBACK` e `CANCELLATION` da
   API de notificações? A documentação de criação usa `CHARGEBACK`, e a resposta de exemplo
   usa `CHARGEBACK.CREATED`. O formato antigo com `notificationCode` continua sendo enviado?
   Os códigos numéricos de `<status>` seguem 1 a 9?
6. **Logs.** Os logs mascarados (CPF, e-mail, telefone, nome e endereço) atendem à
   homologação? Qual o formato esperado?
7. **Reenvio de webhook.** Qual é a política de reenvio, e que códigos de resposta a
   interrompem? A documentação não diz.
8. **Estorno.** Há prazo, valor mínimo, ou limite de estornos parciais em
   `POST /charges/{id}/cancel`? Aceita chave de idempotência? Qual é o cabeçalho?
9. **Recusa.** Depois de um cartão recusado, o mesmo link de checkout continua servindo?
   O site inativa o checkout e abre outro.
10. **Sandbox.** O sandbox envia todos os webhooks, inclusive de contestação e estorno?
