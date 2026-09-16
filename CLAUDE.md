# CLAUDE.md

Site da **Florenza Joalheria** — vitrine, conta do cliente e painel admin.
Next.js 16 (App Router) + Supabase + Vercel. Código, comentários e interface em **português do Brasil**.

## Comandos

```bash
npm run dev      # localhost:3000
npm run build    # A VERIFICAÇÃO REAL antes de commitar — é ela que roda o TypeScript
npm run lint
npm run seed     # gera supabase/seed-catalogo.sql das fichas locais
npm run mapa     # regera lib/geo/brasil-uf.ts da malha do IBGE
python tools/importar-aneis-formatura.py   # fotos originais -> WebP em public/produtos/
```

Não há testes nem formatter configurados.

## Estética: mudança é aditiva

- **`app/estilos/`** (`style.css`, `aliancas.css`, `categoria.css`, `rings-3d.css`) é a identidade visual. Os dois `:root` são a **fonte única** de cores, fontes e `--nav-h`. Trocar o valor de um token ali, só a pedido explícito; escrever cor solta fora dele, nunca — use `var(--…)`.
- Cascata aditiva: `style` → `aliancas` → `categoria`. Nenhuma camada redefine a anterior.
- **Tailwind entra sem preflight**, de propósito — o reset desmontaria o site. Por viver em `@layer utilities`, ele perde de qualquer CSS comum: as utilities servem às telas novas e não alcançam a vitrine nem por acidente.
- **Não rode `shadcn init`**: ele escreve `@layer base` com `*` e `body`, que é o preflight por outro nome. `components/ui/` é só uma pasta.
- **Toda tela de entrada e de senha usa o mesmo desenho:** cartão de vidro sobre a fumaça (`SmokeyBackground` + `app/entrar/entrar.css`). Isso vale para `/entrar`, `/conta` sem sessão (renderiza o mesmo `LoginForm`) e `/conta/nova-senha`. Tela nova desse tipo segue igual. `conta.css` fica só para a área logada.
- Telas novas (`/admin`, `/conta`, `/entrar`) têm CSS próprio e usam os tokens existentes. Reset escopado com `:where()` (especificidade zero), senão `.adm button` vence `.adm-botao`.
- Exceção única: a nav em `app/globals.css`. Seletor lá precisa de **dois níveis** (`.nav .nav__pilula`) para vencer o `style.css`, importado depois.
- Bugs visuais conhecidos só se corrigem com aprovação — consertar é mudar estética.

## Regra de ouro do dinheiro: quem decide é o banco, não a tela

- `public.criar_pedido()` faz tudo numa transação, com `for update` na linha do produto. **Não aceita preço** — copia `preco_centavos` de `produtos`. Antes dava para fechar um anel de R$ 2.420 por R$ 1 mexendo na requisição.
- Percorre as peças **em ordem de SKU**, senão dois pedidos travam um no outro.
- Cancelar devolve estoque; sair de 'cancelado' desconta de novo.
- Cupom: **o navegador manda o código, nunca o valor.** `conferir_cupom()` é previsão para a tela; `criar_pedido()` recalcula do zero. `cupons` não é legível por `anon`, e código inexistente ou desativado dão a mesma resposta.
- Vitrine e carrinho são **aviso, não autorização**.
- **Compra só com conta.** `criar_pedido()` exige `auth.uid()`, e cliente **não tem INSERT** em `pedidos`/`pedido_itens` — as policies antigas deixavam criar pedido "pago" por qualquer valor direto na API. Pedido de cliente nasce só pela função; venda manual, pelo painel (policy de admin).
- Reserva de **48 h** (`expira_em`, espelhada em `RESERVA_HORAS` de `lib/loja.ts`). `expirar_pedidos_vencidos()` roda a cada 10 min no pg_cron: cancela, devolve estoque e uso do cupom. Cartão `in_process`/`authorized` segura a reserva. Limites: 10 por peça, 20 linhas, 3 pedidos aguardando por conta.
- Cupom passa por `avaliar_cupom()` (EXECUTE de ninguém): validade no fuso de São Paulo; `so_primeira_compra` e `um_por_cliente` conferidos por **conta OU CPF**. Cancelar devolve o uso.
- **Pago, só o banco marca.** `registrar_pagamento()` exige o segredo do Vault (`florenza_pagamentos`), que o servidor tem em `PAGAMENTO_SEGREDO_BANCO`. A prova é `GET /v1/payments/{id}` do Mercado Pago — nem o corpo do webhook nem a URL de retorno valem. Valor a menor, estorno e contestação viram `pagamentos.pendencia` para a equipe, não mudança de status.
- Categoria e produto usam `export const revalidate = 60`: sem isso o HTML congela no build e o site oferece "Comprar" em peça esgotada.

## Banco (`FLORENZA`, jydcgsxzinrguounnmpi, Postgres 17)

Migrations em `supabase/migrations/`, por `npx supabase db push --linked`. **O nome do arquivo começa com a versão registrada no banco** — se divergir, o push reaplica tudo. `supabase/aplicar-tudo.sql` recria o banco do zero.

Toda migration nova: cabeçalho em pt-BR com **o porquê**; idempotente; `enable row level security` em toda tabela; view sempre com `with (security_invoker = true)`; `revoke`/`grant` explícito em `security definer`; bloco `CONFERÊNCIA` no fim.

- Em policy use `(select auth.uid())`, não `auth.uid()` solto — evita uma chamada por linha.
- **RLS decide linha, não coluna.** UPDATE na própria linha de `profiles`, somado ao grant de tabela inteira, fazia qualquer cliente virar admin com `PATCH {"role":"admin"}`. O conserto é privilégio de coluna. Ao abrir coluna sensível, pergunte *qual coluna*, não qual linha.
- `is_admin()` é `security definer` com `set search_path = ''` — sem isso, recursão infinita na policy de `profiles` e porta de escalada. Tem **EXECUTE para `anon` de propósito**: as policies são `<condição> or is_admin()` e sem sessão a primeira dá NULL. Idem `email_dos_clientes()`. O linter reclama das duas; as duas ficam.
- `auth.users` é inalcançável por `anon`/`authenticated` — e-mail sai só por `email_dos_clientes()`.
- **Função de trigger não recebe EXECUTE** (o PostgREST expõe tudo em `/rpc/`).
- **Índice em toda chave estrangeira** — o Postgres não cria sozinho.
- Rode os Advisors depois de mexer no schema.
- **Nenhuma service-role key entra no projeto.** Quem protege os dados é a RLS.

## Catálogo e dados

- **`lib/catalogo.ts` é a fronteira** — as páginas não sabem de onde vêm os produtos.
- Cai para `lib/data/catalogo-local.ts` **só se o Supabase não estiver configurado**. Configurado e falhando, o erro sobe: servir preço velho em silêncio é pior, porque o ouro muda de preço e a peça sairia pelo valor errado.
- A vitrine usa `lib/supabase/publico.ts`, não `server.ts` — este lê cookie, e cookie torna dinâmicas as 23 páginas pré-renderizadas.
- **Preço sempre em centavos inteiros**, nunca float.
- **SKU é chave de negócio** (vem do nome do arquivo da foto) e **não aparece ao público**.
- `categorias[].variante` decide o corte da foto: `produto` (5/4 + contain) x `foto` (4/5 + cover). Errado, o `cover` corta justamente o aro do anel.

## Conta e checkout

- Consultas em `lib/conta-servidor.ts`, separadas de `lib/conta.ts` porque este é importado por componente de cliente e aquele puxa `next/headers` — juntos, o build quebra.
- **Nenhuma consulta filtra por `user_id`**: quem filtra é a RLS. Repetir o filtro daria a impressão de que ele é a proteção.
- Links de e-mail (confirmação, recuperação) voltam por `/auth/callback`, que troca o código por sessão. "Esqueci minha senha" leva a `/conta/nova-senha` (`trocarSenha` → `updateUser`). Link vencido ou já usado cai em `/conta?erro=link_invalido`, que explica o que houve. Os textos dos e-mails moram no painel do Supabase (Authentication → Emails → Templates), não no repositório.
- **Cartão não entra neste banco** — "forma de pagamento" é preferência declarada.
- Nome/telefone/e-mail/CPF não são editáveis no checkout (senão o mesmo cliente aparece com três grafias); o que a conta ainda não tem é pedido uma vez e gravado nela. Endereço completo é livre a cada pedido.
- CPF: `cpf_valido()` no banco (CHECK em `profiles` e `pedidos`), espelhado em `lib/documentos.ts` só por cortesia.
- Medida do aro: `produtos.aros` (0, 1 ou 2) decide quantos seletores a página da peça mostra. **A medida é obrigatória** (desde 14/09/2026): `criar_pedido()` recusa peça com aro sem `tamanho`, e par sem `tamanho_par`. Nulo em `pedido_itens` só existe em pedido antigo e aparece como "a combinar". No carrinho, a linha é `sku|tamanho|tamanhoPar` e aceita medida vazia — o fechamento, não. O seletor é `components/SeletorDeAro.tsx` (combobox no padrão APG, sem `<select>` nativo; CSS `.aro` em `app/produto/produto.css`). "Veja como medir" abre `GuiaDeMedidas` (`<dialog>` nativo; regra brasileira, aro = circunferência − 40 mm), e tocar numa linha da tabela preenche o seletor.
- Frete: tabela `fretes` (modalidade × região), `uf_do_cep()` e `cotar_frete()` (anon pode cotar). **O navegador manda só a modalidade**, como no cupom; `criar_pedido()` confere se o CEP é do estado escolhido, busca preço e prazo pela região da UF e grava `frete_*` no pedido. Total = máx(0, subtotal − desconto) + frete — **cupom não desconta frete**. Cotação na página da peça (`CalculadoraDeFrete`) e no checkout, ambos por `lib/frete.ts`. Os valores atuais são **fictícios** (`supabase/antes-de-abrir.sql`, bloco 10).
- A confirmação **não promete o que não acontece**: nada de "pagamento aprovado" antes da confirmação real, e toda copy sobre pagamento depende de `pagamentoOnlineAtivo()`.
- `/conta/pedido/[numero]` também sincroniza o pagamento na volta do Mercado Pago — o webhook não chega no localhost e não tem hora marcada.
- Datas de etapa vêm da trigger `pedidos_carimba_etapas`, nunca digitadas.

## Pagamento, avisos e dados da loja

- `lib/pagamento/`: `config.ts` (liga com `MP_ACCESS_TOKEN` + `PAGAMENTO_SEGREDO_BANCO`), `mercado-pago.ts` (preferência, consulta, assinatura do webhook), `sincronizar.ts`. Rotas: `POST /api/pedidos`, `POST /api/pedidos/[numero]/pagamento`, `POST /api/mercadopago/webhook`.
- Segredo é **só servidor** — nenhum `NEXT_PUBLIC_` além da URL do site. Lista em `.env.local.example`.
- `lib/avisos.ts` (Resend + webhook) **nunca derruba o pedido**: roda em `after()`, erro vai para o log.
- `lib/loja.ts`: razão social, CNPJ, endereço, contatos, entrega. Rodapé e páginas legais leem de lá. Vazio, o build de produção **avisa no log** — era erro até 14/09/2026, quando se decidiu publicar antes de ter os dados; a lei (Decreto 7.962/2013) continua exigindo.
- `/termos-de-compra`, `/trocas-e-devolucoes`, `/privacidade`: texto-base escrito a partir do que o código faz. Mudou a regra no código, muda o texto.

## Deploy

- `vercel.json` fixa `framework: "nextjs"` e **não é enfeite**: com o preset em "Other" a Vercel descarta o `.next`, publica `public/` como estático e **toda página dá 404**.
- `lib/supabase/config.ts` **estoura** se `VERCEL_ENV === "production"` sem as chaves — senão a loja real serviria o catálogo do repositório em silêncio, com build verde.
- Sem chaves em `.env.local` o site abre em modo demonstração. Não é plano B de produção.

## Gráficos e animações

- Mapa do Brasil: **SVG inline** de `lib/geo/brasil-uf.ts`, versionado. Sem biblioteca de mapa, sem rede em runtime. Coroplético em **raiz quadrada** do faturamento — linear, o estado líder apaga o resto do país.
- A paleta categórica de `lib/admin/format.ts` foi conferida por script; ao mexer, rode o validador (o comando está no comentário do arquivo).
- Todo gráfico precisa de **estado vazio textual** — gráfico vazio parece defeito.
- Reveals GSAP em `components/Reveal.tsx`, **sem alterar parâmetro**: duração, easing e gatilho são a assinatura do site.
- `VideoAutoplay.tsx` pausa vídeo fora da viewport — três decoders travam o celular.
- Tudo respeita `prefers-reduced-motion`.

## Pendências

- **Ninguém é admin ainda**: o painel só abre após `update public.profiles set role = 'admin'`.
- "Entrar com Google" exige habilitar o provedor em Authentication → Providers.
- Mercado Pago: código pronto, falta a conta — credenciais, segredo no Vault e webhook (DEPLOY.md).
- **Frete fictício** até escolher transportadora. A migration `20260914140000_frete_e_medida_obrigatoria.sql` **não está aplicada** em produção e sobe junto com o código — a assinatura de `criar_pedido` mudou e as consultas leem as colunas `frete_*`.
- Domínio: fica `florenza-virid.vercel.app` (Vercel ligada ao GitHub). Sem domínio próprio o Resend não envia (não se verifica `vercel.app`). Os e-mails de conta saem pelo SMTP de um Gmail da loja — DEPLOY.md, passo 7. **Nas páginas da conta Google só o dono mexe, à mão**: o primeiro Gmail foi suspenso por "suspeita de bots" no dia em que foi criado, depois de configurado por automação. Enquanto o SMTP apontar para uma conta sem senha de app válida, todo cadastro no site dá erro 500 ("Error sending confirmation email").
- `lib/loja.ts` vazio: o site está no ar com "a preencher" nas páginas legais. Textos legais precisam de revisão de advogado.
- Sem os tipos gerados do banco, há casts em `lib/admin/listas.ts` e `lib/conta-servidor.ts`.
- `supabase/aplicar-tudo.sql` está desatualizado (não tem as migrations de 14/09/2026) — use `db push`.
- Projeto em us-east-2, não São Paulo (~120 ms a mais por consulta).
- Pense duas vezes antes de commitar mídia.
