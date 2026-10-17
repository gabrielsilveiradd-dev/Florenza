#!/usr/bin/env python3
"""
Importador das fotos das alianças de ouro (catálogo de outubro/2026).

A origem é um PDF (`alianças de ouro/catalogo-ouro-2026-10.pdf`, fora do git),
não uma pasta de fotos: 18 páginas, duas por par — a foto do produto (com a
legenda "Cod: ... / largura / peso" escrita como TEXTO do PDF, não na imagem) e
a foto do par na mão. As imagens embutidas saem inteiras com `pdfimages`
(poppler-utils), sem rasterizar a página — sem perda e sem a legenda.

Três das fotos de produto já vêm com máscara (smask) no PDF; as outras seis
estão sobre branco chapado e passam pelo mesmo recorte por preenchimento das
pratas (tools/importar-aliancas-prata.py): só sai o branco ligado à borda, e os
vãos dos aros entram pela erosão. Reflexo do ouro é amarelado, não cinza, e o
teste de acromático o protege.

SAÍDA, em public/produtos/ouro/ (versionada):
    002.webp / 002-sm.webp           recorte, 960 / 480 px
    002-mao.webp / 002-mao-sm.webp   foto na mão, quadrada, 960 / 480 px

Uso:
    python tools/importar-aliancas-ouro.py
Exige `pdfimages` no PATH. Idempotente.

A ordem das imagens no PDF é a de PECAS abaixo. Se o PDF mudar, confira com
`pdfimages -list` antes de rodar — o script não adivinha qual foto é de quem.
"""
import os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(RAIZ, "alianças de ouro", "catalogo-ouro-2026-10.pdf")
DST = os.path.join(RAIZ, "public", "produtos", "ouro")
if not os.path.isfile(PDF):
    sys.exit(f"PDF não encontrado: {PDF}")
os.makedirs(DST, exist_ok=True)
SRC = tempfile.mkdtemp(prefix="ouro-")
subprocess.run(["pdfimages", "-png", PDF, os.path.join(SRC, "img")], check=True)
# (sku, foto do produto, máscara, foto na mão) — números do `pdfimages -list`.
# "X" é a peça da página 17, que veio sem legenda: código a confirmar.
PECAS = [("002","000","001","002"),("003","003","004","005"),("005","006",None,"007"),
 ("033E","008",None,"009"),("033","010",None,"011"),("034","012","013","014"),
 ("ESC3","015",None,"016"),("6BVL","017",None,"018"),("X","019",None,"020")]
LIM, DESV, EROS = 238, 14, 21
def recorta(im):
    arr = np.asarray(im.convert("RGB")).astype(np.int16)
    br = (arr.min(2) >= LIM) & ((arr.max(2)-arr.min(2)) <= DESV)
    m = Image.fromarray((br*255).astype(np.uint8),"L").copy()
    w,h = m.size; px = m.load()
    for x in range(0,w,3):
        for y in (0,h-1):
            if px[x,y]==255: ImageDraw.floodfill(m,(x,y),128)
    for y in range(0,h,3):
        for x in (0,w-1):
            if px[x,y]==255: ImageDraw.floodfill(m,(x,y),128)
    rest = Image.fromarray(((np.asarray(m)==255)*255).astype(np.uint8),"L")
    nuc = np.asarray(rest.filter(ImageFilter.MinFilter(EROS)))>0
    ys,xs = np.nonzero(nuc)
    for y,x in zip(ys[::300],xs[::300]):
        if px[int(x),int(y)]==255: ImageDraw.floodfill(m,(int(x),int(y)),128)
    a = np.where(np.asarray(m)==128,0,255).astype(np.uint8)
    # borda suave: 1px de desfoque na máscara evita serrilhado
    a = np.asarray(Image.fromarray(a,"L").filter(ImageFilter.GaussianBlur(0.8)))
    o = im.convert("RGBA"); o.putalpha(Image.fromarray(a,"L")); return o
def apara(im, folga=0.03):
    bb = im.getchannel("A").point(lambda v:255 if v>8 else 0).getbbox()
    f = int(max(im.size)*folga); l,t,r,b = bb
    return im.crop((max(0,l-f),max(0,t-f),min(im.width,r+f),min(im.height,b+f)))
def salva(im, nome, larguras):
    for suf,lw in larguras.items():
        e = lw/im.width
        im.resize((lw, round(im.height*e)), Image.LANCZOS).save(f"{DST}/{nome}{suf}.webp","WEBP",quality=82,method=6)
for sku,p,mk,mao in PECAS:
    im = Image.open(f"{SRC}/img-{p}.png").convert("RGB")
    if mk:
        o = im.convert("RGBA"); o.putalpha(Image.open(f"{SRC}/img-{mk}.png").convert("L"))
    else:
        o = recorta(im)
    o = apara(o)
    salva(o, sku.lower(), {"":960,"-sm":480})
    m = Image.open(f"{SRC}/img-{mao}.png").convert("RGB")
    s = min(m.size); m = m.crop(((m.width-s)//2,(m.height-s)//2,(m.width+s)//2,(m.height+s)//2))
    salva(m, sku.lower()+"-mao", {"":960,"-sm":480})
    print(sku, o.size, os.path.getsize(f"{DST}/{sku.lower()}.webp")//1024,"KB", os.path.getsize(f"{DST}/{sku.lower()}-mao.webp")//1024,"KB")
