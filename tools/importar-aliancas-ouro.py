#!/usr/bin/env python3
"""
Importador das fotos das alianças de ouro (catálogo de outubro/2026).

A origem é um PDF (`alianças de ouro/catalogo-ouro-2026-10.pdf`, fora do git),
não uma pasta de fotos: 18 páginas, duas por par — a foto do produto (com a
legenda "Cod: ... / largura / peso" escrita como TEXTO do PDF, não na imagem) e
a foto do par na mão. As imagens embutidas saem inteiras com PyMuPDF, sem
rasterizar a página — sem perda e sem a legenda.

Três das fotos de produto já vêm com máscara (smask) no PDF; as outras seis
estão sobre branco e passam por um recorte por preenchimento: só sai o fundo
ligado à borda, e os vãos dos aros entram pela erosão.

O FUNDO NÃO É SÓ BRANCO (19/10/2026): essas seis fotos têm a sombra do par no
chão, um cinza neutro entre ~175 e 238. O primeiro recorte só tirava o branco
quase puro (>= 238), e a sombra ficou grudada na base das alianças, como uma
mancha clara sobre o marfim do card. Agora o fundo é todo pixel ACROMÁTICO e
claro ligado à borda; a sombra que reflete um pouco do ouro (levemente quente)
entra numa segunda faixa, mais clara e com um pouco mais de cor. O ouro, mesmo
no reflexo mais claro, é amarelo (croma bem acima disso), e as zircônias ficam
cercadas de ouro, sem ligação com a borda.

SAÍDA, em public/produtos/ouro/ (versionada):
    002.webp / 002-sm.webp           recorte, 960 / 480 px
    002-mao.webp / 002-mao-sm.webp   foto na mão, quadrada, 960 / 480 px

Uso:
    pip install pymupdf
    python tools/importar-aliancas-ouro.py
Idempotente.

Página 2k-1 é a foto do produto e 2k a da mão, na ordem de PECAS abaixo. Se o
PDF mudar, confira as páginas antes de rodar — o script não adivinha qual foto
é de quem.
"""
import io, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(RAIZ, "alianças de ouro", "catalogo-ouro-2026-10.pdf")
DST = os.path.join(RAIZ, "public", "produtos", "ouro")
if not os.path.isfile(PDF):
    sys.exit(f"PDF não encontrado: {PDF}")
try:
    import pymupdf
except ImportError:
    sys.exit("Falta o PyMuPDF: pip install pymupdf")
os.makedirs(DST, exist_ok=True)
DOC = pymupdf.open(PDF)
def imagem(xref):
    return Image.open(io.BytesIO(DOC.extract_image(xref)["image"]))
def da_pagina(n):
    """(foto, máscara ou None) da única imagem da página n (1 = primeira)."""
    xref, smask = DOC[n-1].get_images(full=True)[0][:2]
    return imagem(xref), (imagem(smask) if smask else None)
# Na ordem das páginas: a peça i ocupa as páginas 2i+1 (produto) e 2i+2 (mão).
# "X" é a peça da página 17, que veio sem legenda: código a confirmar.
PECAS = ["002","003","005","033E","033","034","ESC3","6BVL","X"]
# Fundo: (claridade mínima, croma máximo). A 1ª faixa é o branco e a sombra
# cinza; a 2ª, a sombra mais clara que puxa um pouco para o tom do ouro.
FAIXAS, EROS = ((170, 18), (205, 34)), 21
# Rente à peça a sombra fica bege, ex. (215, 201, 178): croma ~37, igual ao de
# borda de ouro, mas SATURAÇÃO (croma / canal mais claro) ~0,17, quando o ouro,
# mesmo escuro, passa de 0,30. O teto de claridade protege o brilho polido do
# ouro, que é quase branco (250+) e pouco saturado.
SOMBRA_SAT, SOMBRA_MAX, SOMBRA_MIN = 0.21, 238, 140
def recorta(im):
    arr = np.asarray(im.convert("RGB")).astype(np.int16)
    lo, cr = arr.min(2), arr.max(2)-arr.min(2)
    estrito = np.zeros(lo.shape, bool)
    for claro, croma in FAIXAS:
        estrito |= (lo >= claro) & (cr <= croma)
    hi = arr.max(2)
    # A sombra bege só existe por fora, no chão. Nos vãos dos aros, o mesmo
    # tom é reflexo da parede interna do ouro — por isso ela entra só no
    # preenchimento que parte da borda da foto, e os vãos usam o estrito.
    br = estrito | ((lo >= SOMBRA_MIN) & (hi <= SOMBRA_MAX) & (cr <= SOMBRA_SAT * hi))
    m = Image.fromarray((br*255).astype(np.uint8),"L").copy()
    w,h = m.size; px = m.load()
    for x in range(0,w,3):
        for y in (0,h-1):
            if px[x,y]==255: ImageDraw.floodfill(m,(x,y),128)
    for y in range(0,h,3):
        for x in (0,w-1):
            if px[x,y]==255: ImageDraw.floodfill(m,(x,y),128)
    fora = np.asarray(m)==128
    # .copy(): imagem vinda do numpy é só-leitura, e o floodfill falha calado.
    v = Image.fromarray((estrito & ~fora).astype(np.uint8)*255,"L").copy(); pv = v.load()
    nuc = np.asarray(v.filter(ImageFilter.MinFilter(EROS)))>0
    ys,xs = np.nonzero(nuc)
    for y,x in zip(ys[::300],xs[::300]):
        if pv[int(x),int(y)]==255: ImageDraw.floodfill(v,(int(x),int(y)),128)
    fundo = fora | (np.asarray(v)==128)
    a = np.where(fundo,0,255).astype(np.uint8)
    # A borda da peça é meio ouro, meio fundo: recuar 1px tira o halo claro.
    # Depois, 1px de desfoque na máscara evita serrilhado.
    a = Image.fromarray(a,"L").filter(ImageFilter.MinFilter(3))
    a = np.asarray(a.filter(ImageFilter.GaussianBlur(0.8)))
    o = im.convert("RGBA"); o.putalpha(Image.fromarray(a,"L")); return o
def apara(im, folga=0.03):
    bb = im.getchannel("A").point(lambda v:255 if v>8 else 0).getbbox()
    f = int(max(im.size)*folga); l,t,r,b = bb
    return im.crop((max(0,l-f),max(0,t-f),min(im.width,r+f),min(im.height,b+f)))
def salva(im, nome, larguras):
    for suf,lw in larguras.items():
        e = lw/im.width
        im.resize((lw, round(im.height*e)), Image.LANCZOS).save(f"{DST}/{nome}{suf}.webp","WEBP",quality=82,method=6)
for i, sku in enumerate(PECAS):
    im, mk = da_pagina(2*i+1)
    im = im.convert("RGB")
    if mk:
        o = im.convert("RGBA"); o.putalpha(mk.convert("L").resize(im.size))
    else:
        o = recorta(im)
    o = apara(o)
    salva(o, sku.lower(), {"":960,"-sm":480})
    m = da_pagina(2*i+2)[0].convert("RGB")
    s = min(m.size); m = m.crop(((m.width-s)//2,(m.height-s)//2,(m.width+s)//2,(m.height+s)//2))
    salva(m, sku.lower()+"-mao", {"":960,"-sm":480})
    print(sku, o.size, os.path.getsize(f"{DST}/{sku.lower()}.webp")//1024,"KB", os.path.getsize(f"{DST}/{sku.lower()}-mao.webp")//1024,"KB")
