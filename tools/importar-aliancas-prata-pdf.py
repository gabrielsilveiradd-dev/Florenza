#!/usr/bin/env python3
"""
Importador das alianças de prata do catálogo "Site" (PDF, novembro/2026).

O PDF tem 30 páginas aos pares: foto do produto (fundo branco ou cinza) e,
na página seguinte, a mesma peça na mão. A ordem não segue SKU, por isso o
mapa `PAGINAS` abaixo diz qual página é de qual peça — montado olhando foto
por foto e cruzando com o PDF de preços ("Alianças prata 950").

Dez dessas peças já estavam no site (9001-9014): aqui elas só ganham a foto
nova e a foto na mão. Cinco são novas (9015-9019).

Saída, em `public/produtos/prata/` (a pasta que o site serve):

    9015.webp / 9015-sm.webp           recorte com fundo transparente, 960 / 480 px
    9015-mao.webp / 9015-mao-sm.webp   foto na mão, quadrada, 960 / 480 px

Uso:
    python tools/importar-aliancas-prata-pdf.py "C:/caminho/Site (1).pdf"

Precisa de `pypdf`, `Pillow` e `numpy`. Idempotente: rodar de novo regrava.
"""

import os
import sys

import numpy as np
from PIL import Image
from pypdf import PdfReader

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, "public", "produtos", "prata")

# sku -> (página do produto, índice da imagem na página, página da foto na mão)
# Páginas contadas a partir de 1, como no leitor de PDF.
PAGINAS = {
    "9013": (1, 0, 2),    # 2mm polida, R$ 115
    "9014": (3, 0, 4),    # 4mm polida, R$ 149
    "9012": (5, 0, 6),    # sol e lua, R$ 390
    "9011": (7, 0, 8),    # 3mm fosca de bordas polidas, R$ 159
    # A página 9 tem duas imagens: a 0 traz um segundo aro mostrando a
    # gravação no canto; a 1 é só a peça, que recorta melhor para o card.
    "9019": (9, 1, 10),   # 7mm com gravação a laser, R$ 1.290
    "9009": (11, 0, 12),  # 3mm diamantada com frisos, R$ 220
    "9016": (13, 0, 14),  # 3mm, uma diamantada e uma fosca, R$ 159
    "9015": (15, 0, 16),  # 3mm riscadinha, R$ 169
    "9017": (17, 0, 18),  # 3mm riscada com frisos, R$ 249
    "9002": (19, 0, 20),  # 8mm, R$ 690
    "9018": (21, 0, 22),  # trio com solitário, R$ 490
    "9001": (23, 0, 24),  # 4mm friso dourado e coração, R$ 279
    # Mesmo desenho da foto antiga da 9005 (diamantada, coração vazado). O PDF
    # de preços marca esse desenho como R$ 299; a ficha da 9005 diz R$ 399.
    "9005": (25, 0, 26),  # 4mm diamantada, friso dourado
    "9007": (27, 0, 28),  # 6mm, R$ 369
    "9006": (29, 0, 30),  # 6mm friso dourado, R$ 399
}

LARGURAS = {"": 960, "-sm": 480}
QUALIDADE = 82

# Abaixo deste alpha (0-255) o pixel é névoa do fundo, não peça: não conta
# para o corte da moldura em `aparar`.
LIMIAR_MOLDURA = 40
# Distância mínima do branco (0-1) para o pixel deixar de ser fundo.
NEVOA = 0.06


def imagem_da_pagina(leitor, pagina, indice):
    return leitor.pages[pagina - 1].images[indice].image


def recortar(im):
    """
    "Cor para transparência" contra o branco do fundo (lido nos cantos).

    Preencher o fundo a partir da borda NÃO serve aqui: a prata reflete
    branco puro, e o reflexo encosta no fundo — o preenchimento entra pela
    peça e ela sai em pedaços. Em vez disso, cada pixel vira o par
    (cor, alpha) que, composto sobre o branco do fundo, devolve o pixel
    original. Branco do fundo -> transparente; prata -> opaca na medida do
    quanto ela se afasta do branco; sombra -> cinza translúcido, que sobre
    o marfim do card continua parecendo sombra.
    """
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    k = max(4, min(h, w) // 40)
    cantos = np.concatenate(
        [rgb[:k, :k].reshape(-1, 3), rgb[:k, -k:].reshape(-1, 3),
         rgb[-k:, :k].reshape(-1, 3), rgb[-k:, -k:].reshape(-1, 3)]
    )
    # Percentil alto, não média: o fundo tem vinheta, e o canto mais escuro
    # deixaria uma névoa no meio.
    branco = np.clip(np.percentile(cantos, 90, axis=0), 200, 255)
    bruto = np.clip(((branco - rgb) / branco).max(axis=2), 0, 1)
    # Degradê do estúdio: o fundo varia alguns tons ao longo da foto. O que
    # se afasta do branco menos que a variação dos próprios cantos (mais uma
    # folga, ou NEVOA no mínimo) é fundo e fica transparente — senão sobra
    # um retângulo enevoado em volta da peça no card.
    bruto_cantos = np.clip(((branco - cantos) / branco).max(axis=1), 0, 1)
    piso = max(NEVOA, float(np.percentile(bruto_cantos, 99)) + 0.03)
    alpha = np.clip((bruto - piso) / (1 - piso), 0, 1)
    seguro = np.maximum(alpha, 1e-3)[..., None]
    cor = np.clip(branco - (branco - rgb) / seguro, 0, 255)
    saida = np.dstack([cor, alpha * 255]).astype(np.uint8)
    return Image.fromarray(saida, "RGBA")


def aparar(im, folga=0.03):
    caixa = im.getchannel("A").point(lambda v: 255 if v > LIMIAR_MOLDURA else 0).getbbox()
    f = int(max(im.size) * folga)
    l, t, r, b = caixa
    return im.crop((max(0, l - f), max(0, t - f), min(im.width, r + f), min(im.height, b + f)))


def salvar(im, nome):
    for sufixo, largura in LARGURAS.items():
        escala = largura / im.width
        im.resize((largura, max(1, round(im.height * escala))), Image.LANCZOS).save(
            os.path.join(DESTINO, f"{nome}{sufixo}.webp"), "WEBP", quality=QUALIDADE, method=6
        )


def main():
    if len(sys.argv) < 2 or not os.path.isfile(sys.argv[1]):
        sys.exit('Uso: python tools/importar-aliancas-prata-pdf.py "caminho/do/Site.pdf"')
    leitor = PdfReader(sys.argv[1])
    os.makedirs(DESTINO, exist_ok=True)

    for sku, (pag, idx, pag_mao) in PAGINAS.items():
        original = imagem_da_pagina(leitor, pag, idx)
        # Duas fotos (9017, 9019) já vêm recortadas, com alpha: recortar de novo
        # comeria a peça, que é prata sobre transparente.
        if original.mode in ("RGBA", "LA") and np.asarray(original.getchannel("A")).min() < 8:
            produto = aparar(original.convert("RGBA"))
        else:
            produto = aparar(recortar(original))
        salvar(produto, sku)

        mao = imagem_da_pagina(leitor, pag_mao, 0).convert("RGB")
        lado = min(mao.size)
        mao = mao.crop(
            ((mao.width - lado) // 2, (mao.height - lado) // 2,
             (mao.width + lado) // 2, (mao.height + lado) // 2)
        )
        salvar(mao, f"{sku}-mao")

        kb = lambda n: os.path.getsize(os.path.join(DESTINO, f"{n}.webp")) // 1024
        print(f"{sku}  produto {produto.size[0]}x{produto.size[1]} ({kb(sku)} KB)  mão {kb(sku + '-mao')} KB")

    print(f"\n{len(PAGINAS)} peça(s) em {os.path.relpath(DESTINO, RAIZ)}")


if __name__ == "__main__":
    main()
