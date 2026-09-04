"""Gera os arquivos servidos ao navegador a partir dos originais do repositório.

Roda sozinho, sem rede e sem ffmpeg: só Pillow. Idempotente — rodar de novo
sobrescreve os mesmos destinos com o mesmo conteúdo.

    python tools/preparar-imagens.py

DUAS COISAS SÃO FEITAS AQUI.

1. A MARCA (public/logoNova.jpg -> duas saídas)

   O arquivo que o cliente entregou é um JPEG retangular: o selo redondo no
   meio e cinza-escuro (#27282C a #404042) nos quatro cantos, 24% da imagem.
   JPEG não tem canal alfa, então esse cinza não some sozinho.

   Mas recortar o círculo não bastava. O miolo do selo é creme chapado
   (#F2EADD) e a barra do topo é quase preta: um disco claro numa faixa
   escura lê como adesivo colado, não como parte da barra. E o círculo trava
   o tamanho — crescer o disco numa nav de 76px o faz virar botão de avatar.

   Por isso saem DUAS COISAS daqui, que é o que toda identidade com selo tem:

   - `logo-marca.webp`: a versão para FUNDO ESCURO. O creme vira transparente
     e a arte preta (a gema e a script) vira champanhe, então o fundo da barra
     passa por trás dela. Como não há mais círculo, a marca ocupa a altura que
     quiser: a arte tem proporção 1,74:1, um lockup horizontal, que é
     justamente o formato de que uma barra precisa. É a que a nav e o rodapé
     usam.

   - `favicon.png` / `apple-icon.png`: o selo redondo INTEIRO, com disco e
     aro. Na aba do navegador o círculo é o formato certo — é ele que dá
     silhueta reconhecível ao lado de outras abas. PNG, não WebP: o Safari não
     aceita WebP como ícone.

   O alfa da arte sai de uma rampa entre a luminância do creme e a do preto,
   e não de um limiar duro: é isso que preserva o antisserrilhado da script e
   mantém a curva lisa em vez de escadinha.

   SOBRE A COR DA ARTE. O gradiente da marca antiga ia até #7D6330, que sobre
   a barra dá 3,21:1 — abaixo de qualquer mínimo legível. Na palavra de 28px
   isso não incomodava, porque o escuro era só a aresta de baixo das letras.
   Aqui a arte tem 504px de altura e a script ocupa a metade INFERIOR: com o
   gradiente original ela sairia inteira no tom ruim. A base foi levantada
   para #C8A961, que dá 8,08:1, mantendo a mesma família de dourado.

2. A HERO DO CELULAR (public/herome.png -> recorte retrato)

   herome.png é 1672x941, paisagem 16:9. O celular é retrato. Com
   `object-fit: cover` o telefone usa só uma fatia vertical da foto e estica:
   num iPhone 15 (393x852 @3x) sobravam 286x619 px reais para preencher
   1179x2556 — ampliação de 4,13x. No notebook a mesma foto aparece a 0,96x.
   Daí a diferença de nitidez que se vê entre os dois.

   A correção é cortar o quadro retrato de uma vez, do PNG original e não do
   JPEG já degradado, na região que o celular de fato mostra. O corte fica na
   proporção 1:2, e o `object-position: 62% center` do CSS continua valendo —
   com o quadro já retrato, sobra tão pouco a deslocar que a regra não precisa
   mudar. Nenhuma linha de CSS é tocada por causa deste arquivo.

   O teto é o original: 470x941 px verdadeiros não viram 1179x2556. O que dá
   para fazer é usar os pixels certos, sem artefato de JPEG, e ampliar uma vez
   só com Lanczos e máscara de nitidez em vez de deixar o navegador ampliar
   2,5x por conta. Nitidez de verdade só com uma foto de origem maior.
"""

import os

from PIL import Image, ImageDraw, ImageFilter

# Luminâncias medidas no arquivo do cliente: o miolo creme e a arte preta.
CREME, PRETO = 235.0, 12.0

# Dourado da arte sobre fundo escuro. Mesma família do --gold do site, com a
# base levantada de #7D6330 (3,21:1) para #C8A961 (8,08:1) — ver o cabeçalho.
GRADIENTE = [(0.00, (242, 228, 191)), (0.45, (229, 211, 166)), (1.00, (200, 169, 97))]

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(RAIZ, "public")


def kb(caminho):
    return os.path.getsize(caminho) / 1024


def salvar(imagem, nome, **kwargs):
    destino = os.path.join(PUBLIC, nome)
    imagem.save(destino, **kwargs)
    print(f"  {nome:<26} {imagem.width:>4} x {imagem.height:<4}  {kb(destino):>7.1f} KB")


# --------------------------------------------------------------------------
# 1. Marca
# --------------------------------------------------------------------------

def recortar_selo():
    origem = Image.open(os.path.join(PUBLIC, "logoNova.jpg")).convert("RGB")
    largura, altura = origem.size

    # O aro dourado e o creme passam de 110 de luminância; o cinza do fundo
    # fica em ~52. As letras pretas de dentro do círculo ficam de fora da
    # máscara, mas não atrapalham: o que interessa aqui é o bounding box, e
    # quem o define é o aro, que é a coisa clara mais externa.
    mascara = origem.convert("L").point(lambda v: 255 if v > 110 else 0)
    x0, y0, x1, y1 = mascara.getbbox()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    raio = min(x1 - x0, y1 - y0) / 2 - 1

    SUPER = 4
    alfa = Image.new("L", (largura * SUPER, altura * SUPER), 0)
    ImageDraw.Draw(alfa).ellipse(
        [(cx - raio) * SUPER, (cy - raio) * SUPER,
         (cx + raio) * SUPER, (cy + raio) * SUPER],
        fill=255,
    )
    alfa = alfa.resize((largura, altura), Image.LANCZOS)

    selo = origem.copy()
    selo.putalpha(alfa)
    return selo.crop((int(cx - raio), int(cy - raio), int(cx + raio), int(cy + raio)))


def cor_do_gradiente(t):
    for i in range(len(GRADIENTE) - 1):
        (p0, c0), (p1, c1) = GRADIENTE[i], GRADIENTE[i + 1]
        if p0 <= t <= p1:
            k = (t - p0) / (p1 - p0)
            return tuple(round(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
    return GRADIENTE[-1][1]


def marca_para_fundo_escuro(origem):
    """A arte do selo sem o disco: creme transparente, traço em champanhe."""
    luma = origem.convert("L")

    # Onde está a arte preta, ignorando o aro (fora de 92% do raio).
    largura, altura = origem.size
    bb = luma.point(lambda v: 255 if v > 110 else 0).getbbox()
    cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
    raio = min(bb[2] - bb[0], bb[3] - bb[1]) / 2
    px = origem.load()
    xs, ys = [], []
    for y in range(0, altura, 3):
        for x in range(0, largura, 3):
            r, g, b = px[x, y]
            if (r + g + b) / 3 < 90 and (x - cx) ** 2 + (y - cy) ** 2 < (raio * 0.92) ** 2:
                xs.append(x)
                ys.append(y)

    M = 14  # respiro, para o traço não encostar na borda do arquivo
    caixa = (min(xs) - M, min(ys) - M, max(xs) + M, max(ys) + M)

    # Rampa entre creme e preto: preserva o antisserrilhado da script.
    alfa = luma.crop(caixa).point(
        lambda v: max(0, min(255, round(255 * (CREME - v) / (CREME - PRETO))))
    )

    marca = Image.new("RGBA", alfa.size)
    pm, pa = marca.load(), alfa.load()
    for y in range(alfa.size[1]):
        cor = cor_do_gradiente(y / (alfa.size[1] - 1))
        for x in range(alfa.size[0]):
            pm[x, y] = cor + (pa[x, y],)
    return marca


def gerar_marca():
    print("marca (de public/logoNova.jpg)")
    origem = Image.open(os.path.join(PUBLIC, "logoNova.jpg")).convert("RGB")

    # A marca da barra e do rodapé. 224 de altura cobre os 56 px do rodapé até
    # 3x de DPR com folga; a largura sai da proporção da arte (~1,74:1).
    marca = marca_para_fundo_escuro(origem)
    alvo_h = 224
    salvar(marca.resize((round(alvo_h * marca.width / marca.height), alvo_h), Image.LANCZOS),
           "logo-marca.webp", format="WEBP", quality=92, method=6)

    # O selo redondo inteiro, só para o ícone de aba: ali o círculo é o
    # formato certo, e o disco creme é o que dá silhueta reconhecível.
    selo = recortar_selo()
    salvar(selo.resize((96, 96), Image.LANCZOS), "favicon.png", format="PNG", optimize=True)
    salvar(selo.resize((180, 180), Image.LANCZOS), "apple-icon.png", format="PNG", optimize=True)


# --------------------------------------------------------------------------
# 2. Hero do celular
# --------------------------------------------------------------------------

def gerar_hero_mobile():
    print("hero do celular (de public/herome.png)")
    origem = Image.open(os.path.join(PUBLIC, "herome.png")).convert("RGB")
    largura, altura = origem.size

    # Onde o celular olha hoje: proporção de tela 393/852 com
    # `object-position: 62%`, medido em pixels do original.
    janela = altura * (393 / 852)
    esquerda_atual = 0.62 * (largura - janela)
    centro = esquerda_atual + janela / 2

    # O corte que vai para o arquivo é 1:2 — um pouco mais largo que a janela
    # acima, para caber tanto o celular estreito (9:19.5) quanto o antigo
    # (9:16) sem faixa vazia, e mantendo as duas alianças dentro.
    corte_largura = altura / 2
    x0 = max(0, min(largura - corte_largura, centro - corte_largura / 2))
    corte = origem.crop((int(x0), 0, int(x0 + corte_largura), altura))
    print(f"  corte: x {int(x0)}..{int(x0 + corte_largura)} de {largura}"
          f"  ->  {corte.width} x {corte.height} px reais")

    for alvo in (940, 620):
        nome = "herome-mobile.webp" if alvo == 940 else f"herome-mobile-{alvo}.webp"
        img = corte.resize((alvo, int(alvo * corte.height / corte.width)), Image.LANCZOS)
        # Ampliação sempre amolece. A máscara devolve o contraste de borda das
        # alianças e da pedra sem cavar halo no tecido do terno, que é liso.
        img = img.filter(ImageFilter.UnsharpMask(radius=1.1, percent=62, threshold=3))
        salvar(img, nome, format="WEBP", quality=84, method=6)


if __name__ == "__main__":
    gerar_marca()
    print()
    gerar_hero_mobile()
