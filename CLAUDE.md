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
- Telas novas (`/admin`, `/conta`, `/entrar`) têm CSS próprio e usam os tokens existentes. Reset escopado com `:where()` (especificidade zero), senão `.adm button` vence `.adm-botao`.
- Exceção única: a nav em `app/globals.css`. Seletor lá precisa de **dois níveis** (`.nav .nav__pilula`) para vencer o `style.css`, importado depois.
- Bugs visuais conhecidos só se corrigem com aprovação — consertar é mudar estética.

## Regra de ouro do dinheiro: quem decide é o banco, não a tela

- `public.criar_pedido()` faz tudo numa transação, com `for update` na linha do produto. **Não aceita preço** — copia `preco_centavos` de `produtos`. Antes dava para fechar um anel de R$ 2.420 por R$ 1 mexendo na requisição.
- Percorre as peças **em ordem de SKU**, senão dois pedidos travam um no outro.
- Cancelar devolve estoque; sair de 'cancelado' desconta de novo.
- Cupom: **o navegador manda o código, nunca o valor.** `conferir_cupom()` é previsão para a tela; `criar_pedido()` recalcula do zero. `cupons` não é legível por `anon`, e código inexistente ou desativado dão a mesma resposta.
- Vitrine e carrinho são **aviso, não autorização**.
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
- **Cartão não entra neste banco** — "forma de pagamento" é preferência declarada.
- Logado, nome/telefone/e-mail não são editáveis no checkout (senão o mesmo cliente aparece com três grafias). Endereço é o único campo livre.
- A confirmação **não promete o que não acontece**: sem "pagamento aprovado", sem e-mail de pedido — o acerto é por WhatsApp.
- Datas de etapa vêm da trigger `pedidos_carimba_etapas`, nunca digitadas.

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
- Upload de foto pelo painel não está ligado — hoje a foto entra pelo script Python.
- "Entrar com Google" exige habilitar o provedor em Authentication → Providers.
- Mercado Pago fica para o Módulo 2.
- Sem os tipos gerados do banco, há um cast em `lib/admin/listas.ts`.
- Rastreio, transportadora, presente e mensagem do cartão ainda não aparecem em `PedidosSection` — só pelo SQL Editor.
- Projeto em us-east-2, não São Paulo (~120 ms a mais por consulta).
- Pense duas vezes antes de commitar mídia.
