# Tarefa: trocar as alianças de ouro do site pelas 9 do catálogo novo

Leia o CLAUDE.md antes de tudo e siga as regras dele (estética aditiva, preço em centavos, banco decide o dinheiro, migration com cabeçalho e CONFERÊNCIA, publicar código antes de escrever no banco).

## O que eu quero
1. Na categoria **Anéis de Ouro** (`/aliancas-ouro`), ficam **somente** as 9 alianças do catálogo `alianças de ouro/catalogo-ouro-2026-10.pdf` (fora do git). As duas atuais saem: **A301 Aliança Essence** (R$ 2.890,00) e **A501 Aliança Aurea** (R$ 4.690,00). No banco, elas passam a `ativo = false` e não são apagadas, porque `pedido_itens` aponta para `produtos`.
2. Cada peça tem duas fotos. A **foto do produto**, recortada, é a principal. A **foto na mão** aparece no card ao passar o mouse e na galeria da página da peça.
3. **Todas são ouro 18K** e vendidas em **par** (`aros: 2`, uma medida para cada pessoa).
4. **Preço e nome: pergunte para mim antes de publicar.** O site no ar (https://florenza-virid.vercel.app/aliancas-ouro) só tem as 2 antigas, sem preço das novas. Não pegue preço de outra loja.

## Dados do PDF (18 páginas: produto e mão de cada par, nesta ordem)
| SKU | Largura | Peso do par (aprox.) | Desenho | Nome provisório |
|---|---|---|---|---|
| 002 | 2,5 mm | 1,7 g | abaulada polida | Aliança Pétala |
| 003 | 3 mm | 2,3 g | abaulada polida | Aliança Essence (slug `alianca-essence-ouro`, porque `alianca-essence` é da A301) |
| 005 | 4 mm | 3,7 g | abaulada polida | Aliança Nobre |
| 033E | 3 mm | 2,0 g | diamantada em diagonal, bordas polidas | Aliança Brisa |
| 033 | 4 mm | 3,0 g | diamantada em diagonal, bordas polidas | Aliança Raio |
| 034 | 5 mm | 3,4 g | côncava diamantada | Aliança Onda |
| ESC3 ("3mm escrava") | 3 mm | 2 g | reta polida (escrava) | Aliança Linear |
| 6BVL | 6 mm | 7,0 g | frisos; feminina com 40 zircônias | Aliança Esplendor |
| X (pág. 17, **sem legenda**) | ? | ? | 3 frisos; feminina com 2 fileiras de pedras e ponto de luz | Aliança Celeste |

**Pergunte para mim:** o preço de cada par, o código, a largura e o peso da peça da página 17, e se os nomes provisórios ficam.

## O que JÁ ESTÁ FEITO nesta pasta (sem commit). Revise e continue, não refaça.
- `public/produtos/ouro/`: `<sku>.webp` e `<sku>-sm.webp` (recorte com fundo transparente, 960/480 px) e `<sku>-mao.webp` e `<sku>-mao-sm.webp` (foto na mão, quadrada). Os SKUs estão em minúsculo no nome do arquivo (`033e`, `esc3`, `6bvl`, `x`). Quando souber o código da pág. 17, renomeie os `x*.webp`.
- `tools/importar-aliancas-ouro.py`: regera as fotos a partir do PDF (usa `pdfimages`).
- `lib/data/catalogo-local.ts`:
  - O tipo `Produto` ganhou `imagemUsoUrl?` e `imagemUsoSmUrl?`.
  - A categoria `aliancas-ouro` passou a `variante: "produto"`, e a opção de filtro mudou de "Ouro + Diamantes" para `ouro-zirconias`.
  - A301 e A501 saíram.
  - Entraram o helper `ouro()` e as 9 fichas.
  - **Os preços estão em `PRECO_OURO`, todos 0**, e peça com preço 0 fica `ativo: false`.
  - As duas com zircônia usam metal "Ouro 18K + Zircônias".
- `lib/catalogo.ts`: a consulta lê `imagem_uso_url` e `imagem_uso_sm_url`.
- `components/RingCard.tsx` mais um bloco no fim de `app/estilos/categoria.css`: a segunda foto aparece por cima ao passar o mouse. Só vale com `@media (hover: hover)` e respeita `prefers-reduced-motion`.
- `components/GaleriaDaPeca.tsx` (novo), usado em `app/produto/[slug]/page.tsx`, mais um bloco no fim de `app/produto/produto.css`: foto principal e miniaturas. A foto de cena usa `cover`; o recorte usa `contain` com sombra.
- `supabase/migrations/20261017120000_foto_da_peca_em_uso.sql`: cria as colunas `imagem_uso_url` e `imagem_uso_sm_url`, ambas nulas.
- `tools/gerar-troca-ouro.mjs`: gera `supabase/trocar-aliancas-ouro.sql` a partir das fichas. Esse SQL desliga A301 e A501, faz o upsert das 9, ajusta a variante e o filtro, e traz a CONFERÊNCIA. **Recusa gerar se algum preço for 0.**
- `tools/seed-catalogo.mjs`: passou a incluir as colunas de foto em uso e `aros`.
- `.gitignore`: ignora `/alianças de ouro/`.
- Já passaram `tsc --noEmit` e `eslint`. Testei em modo demonstração com preços de mentira: vitrine, hover, galeria e celular funcionaram.

## O que falta
1. Receber de mim os preços e os dados da pág. 17. Preencher `PRECO_OURO` (centavos do par), renomear `x*.webp` e ajustar a ficha X.
2. Rodar `node tools/gerar-troca-ouro.mjs`.
3. Rodar `npm run build`. Atenção: com `.env.local` o build lê o banco, então ele só passa **depois** da migration aplicada.
4. **Ordem de publicação:**
   1. `npx supabase db push --linked` (a migration da coluna). Sem ela, o código novo quebra a vitrine.
   2. Commit e push. Esperar o deploy da Vercel e conferir se https://florenza-virid.vercel.app/produtos/ouro/002.webp abre.
   3. Só então rodar `supabase/trocar-aliancas-ouro.sql` no SQL Editor e conferir o bloco CONFERÊNCIA.
5. Conferir no ar `/aliancas-ouro` (9 peças) e uma página de peça com a galeria.

## Observações
- Os arquivos que já existiam aparecem como modificados no `git status` por causa de final de linha (CRLF/LF). Confira com `git diff --ignore-cr-at-eol` antes de commitar, para não levar ruído.
- Já existia antes (afeta prata também): no celular, a foto da página da peça passa cerca de 8 px da borda direita. Pela regra do CLAUDE.md, só corrigir com minha aprovação.
