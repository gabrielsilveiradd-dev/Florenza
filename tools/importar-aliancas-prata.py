#!/usr/bin/env python3
"""
Importador das fotos de alianças de prata.

Mesmo papel de `importar-aneis-formatura.py` — original pesado entra, WebP
recortado sai —, mas para uma pasta cujo nome de arquivo NÃO segue um padrão
único. Os 14 originais chegaram em três formatos diferentes:

    9001 aliança prata 950 4mm largura_friso banho dourado.png
    9008aliançachanfradaprata9503mmlarguraR$159,0.png
    90144aliançaprata95504mmlarguraR$149,0par.png

Por isso a leitura aqui é por partes (código, teor, largura, preço, "par"),
e não por um regex único como lá. O que o script NÃO consegue ler ele
imprime no fim, em vez de adivinhar: preço de peça é dado de negócio, e um
palpite silencioso vira anúncio errado na vitrine.

SAÍDA: `public/produtos/prata/`, direto — é a pasta que o site serve e a que
está versionada. (O importador de formatura escreve em `produtos/`, que é
ignorada pelo git, e alguém copia para `public/` depois; aqui esse passo
manual não existe.)

    9001.webp      960px de largura
    9001-sm.webp   480px de largura

Uso:
    python tools/importar-aliancas-prata.py

Idempotente: rodar de novo só regrava as saídas.
"""

import os
import re
import sys
import unicodedata

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGEM = os.path.join(RAIZ, "alianças de prata")
DESTINO = os.path.join(RAIZ, "public", "produtos", "prata")
FICHAS = os.path.join(RAIZ, "lib", "data", "catalogo-local.ts")

LARGURAS = {"": 960, "-sm": 480}
QUALIDADE = 82
FOLGA = 0.02
LIMIAR_ALPHA = 8

# Recorte do fundo branco (6 dos 14 originais vieram sem alpha, sobre #FEFEFE).
# A partir deste valor, e sendo cinza puro, o pixel é candidato a fundo.
LIMIAR_BRANCO = 244
# Quanto o cinza pode fugir de acromático e ainda ser fundo.
DESVIO_COR = 12
# Erosão que separa vão de aro (grande) de brilho na prata (pequeno). Um blob
# que sobrevive a 21px de erosão não é reflexo — é buraco.
EROSAO = 21

# O código é o bloco de dígitos que abre o nome. Vem antes de qualquer letra,
# em todos os 14 arquivos, com ou sem espaço depois.
CODIGO = re.compile(r"^(\d{4})")
# Largura do aro. O "mm" é obrigatório para não confundir com o teor da liga.
LARGURA_MM = re.compile(r"(\d{1,2})\s*mm", re.IGNORECASE)
# Teor da prata: 925, 950, 999. Procurado depois da palavra "prata" para não
# capturar o código do produto, que também tem três dígitos seguidos.
TEOR = re.compile(r"prata\s*(925|950|999)", re.IGNORECASE)
# `R$159,0` / `R$$390,0` / `R$ 220,00` -> reais. O cifrão dobrado é erro de
# digitação de um dos arquivos, não um formato.
PRECO = re.compile(r"R\$+\s*([\d.]+)(?:,(\d{1,2}))?", re.IGNORECASE)


def sem_acento(texto):
    """`aliançachanfrada` -> `aliancachanfrada`, para casar palavra-chave."""
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


def ler_nome(arquivo):
    """Extrai o que der do nome do arquivo. Campo ilegível volta como None."""
    base = os.path.splitext(arquivo)[0]
    plano = sem_acento(base).lower()

    codigo = CODIGO.match(base)
    largura = LARGURA_MM.search(base)
    teor = TEOR.search(plano)
    preco = PRECO.search(base)

    centavos = None
    if preco:
        inteiros = int(preco.group(1).replace(".", ""))
        decimais = (preco.group(2) or "0").ljust(2, "0")
        centavos = inteiros * 100 + int(decimais)

    return {
        "arquivo": arquivo,
        "sku": codigo.group(1) if codigo else None,
        "largura_mm": int(largura.group(1)) if largura else None,
        "teor": teor.group(1) if teor else None,
        "precoCentavos": centavos,
        # Detalhes que o nome carrega e que a descrição da ficha vai usar.
        "friso_dourado": "banho dourado" in plano or "friso" in plano,
        "chanfrada": "chanfrada" in plano,
        "par": plano.rstrip(".png").endswith("par"),
    }


def recortar_fundo_branco(im):
    """
    Devolve a foto com alpha, tirando o fundo branco chapado.

    NÃO é limiar global: um limiar puro comeria os reflexos da prata, que
    também são quase brancos. O fundo é encontrado por preenchimento a partir
    das bordas — só sai o branco que se conecta ao lado de fora.

    Os vãos dos aros são brancos e NÃO tocam a borda, então entram num segundo
    passo: o que sobrou de branco é erodido, e só o que sobrevive a `EROSAO`
    vira semente. Reflexo na peça não sobrevive; buraco de aliança sobrevive.

    O `.copy()` depois de `fromarray` não é sobra: a imagem que ele devolve é
    somente-leitura, e `floodfill` falha calada nela — a máscara volta intacta
    e a peça sai com o fundo branco de novo.
    """
    arr = np.asarray(im.convert("RGB")).astype(np.int16)
    branco = (arr.min(axis=2) >= LIMIAR_BRANCO) & (
        (arr.max(axis=2) - arr.min(axis=2)) <= DESVIO_COR
    )
    mascara = Image.fromarray((branco * 255).astype(np.uint8), "L").copy()

    largura, altura = mascara.size
    px = mascara.load()
    for x in range(0, largura, 3):
        for y in (0, altura - 1):
            if px[x, y] == 255:
                ImageDraw.floodfill(mascara, (x, y), 128)
    for y in range(0, altura, 3):
        for x in (0, largura - 1):
            if px[x, y] == 255:
                ImageDraw.floodfill(mascara, (x, y), 128)

    restante = Image.fromarray(((np.asarray(mascara) == 255) * 255).astype(np.uint8), "L")
    nucleos = np.asarray(restante.filter(ImageFilter.MinFilter(EROSAO))) > 0
    if nucleos.any():
        ys, xs = np.nonzero(nucleos)
        # Um a cada 300 basta: são poucos blobs e cada semente preenche o vão
        # inteiro. Varrer todos os pixels só repetiria o mesmo preenchimento.
        for y, x in zip(ys[::300], xs[::300]):
            if px[int(x), int(y)] == 255:
                ImageDraw.floodfill(mascara, (int(x), int(y)), 128)

    saida = im.convert("RGBA")
    saida.putalpha(
        Image.fromarray(np.where(np.asarray(mascara) == 128, 0, 255).astype(np.uint8), "L")
    )
    return saida


def aparar(im):
    """Corta a moldura transparente em volta da aliança e devolve com folga."""
    alpha = im.getchannel("A").point(lambda a: 255 if a > LIMIAR_ALPHA else 0)
    caixa = alpha.getbbox()
    if not caixa:
        return None
    folga = int(max(im.size) * FOLGA)
    esq, topo, dir_, base = caixa
    return im.crop(
        (
            max(0, esq - folga),
            max(0, topo - folga),
            min(im.width, dir_ + folga),
            min(im.height, base + folga),
        )
    )


def main():
    if not os.path.isdir(ORIGEM):
        sys.exit(f"Pasta de origem não encontrada: {ORIGEM}")

    os.makedirs(DESTINO, exist_ok=True)

    arquivos = sorted(f for f in os.listdir(ORIGEM) if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
    lidos, sem_codigo, sem_preco, opacos = [], [], [], []

    for arquivo in arquivos:
        ficha = ler_nome(arquivo)
        if not ficha["sku"]:
            sem_codigo.append(arquivo)
            continue

        original = Image.open(os.path.join(ORIGEM, arquivo)).convert("RGBA")

        # Metade das fotos veio recortada (alpha) e metade sobre fundo branco.
        # As duas precisam sair iguais no card, senão a grade mistura peça
        # flutuando no marfim com retângulo branco.
        if np.asarray(original.getchannel("A")).min() >= LIMIAR_ALPHA:
            opacos.append(arquivo)
            original = recortar_fundo_branco(original)

        recortado = aparar(original)
        if recortado is None:
            recortado = original

        for sufixo, largura in LARGURAS.items():
            escala = largura / recortado.width
            saida = recortado.resize(
                (largura, max(1, round(recortado.height * escala))), Image.LANCZOS
            )
            saida.save(
                os.path.join(DESTINO, f"{ficha['sku']}{sufixo}.webp"),
                "WEBP",
                quality=QUALIDADE,
                method=6,
            )

        peso = os.path.getsize(os.path.join(DESTINO, f"{ficha['sku']}.webp")) / 1024
        ficha["peso_kb"] = peso
        ficha["dimensoes"] = (original.size, recortado.size)
        lidos.append(ficha)

        preco = (
            f"R$ {ficha['precoCentavos'] / 100:>8,.2f}".replace(",", "@")
            .replace(".", ",")
            .replace("@", ".")
            if ficha["precoCentavos"] is not None
            else "     sem preço"
        )
        if ficha["precoCentavos"] is None:
            sem_preco.append(ficha["sku"])

        marcas = "".join(
            [
                " friso-dourado" if ficha["friso_dourado"] else "",
                " chanfrada" if ficha["chanfrada"] else "",
                " par" if ficha["par"] else "",
            ]
        )
        print(
            f"{ficha['sku']}  {preco}  prata {ficha['teor'] or '???'}"
            f"  {str(ficha['largura_mm'] or '?') + 'mm':>5}"
            f"  {original.size[0]}x{original.size[1]} -> {recortado.size[0]}x{recortado.size[1]}"
            f"  ({peso:.0f} KB){marcas}"
        )

    print(f"\n{len(lidos)} peça(s) em {os.path.relpath(DESTINO, RAIZ)}")

    if sem_codigo:
        print("\nSem código de 4 dígitos no início do nome — não importados:")
        for arquivo in sem_codigo:
            print(f"  - {arquivo}")

    if opacos:
        print(f"\nFundo branco removido por preenchimento ({len(opacos)}):")
        for arquivo in opacos:
            print(f"  - {arquivo}")

    # Mesmo guarda-corpo do importador de formatura: o nome do arquivo é a
    # fonte de verdade da logística, e ficha divergente passa despercebida.
    if not os.path.isfile(FICHAS):
        return

    ficha_txt = open(FICHAS, encoding="utf-8").read()
    faltando, divergentes, so_na_ficha = [], [], []

    for item in lidos:
        # Duas formas de ficha convivem no arquivo: o objeto literal das peças
        # antigas (`sku: "P301", ... precoCentavos: 34900`) e a chamada do
        # helper `prata("9001", …, 27900)`, onde o preço é o último número.
        bloco = re.search(
            r'sku:\s*"%s".*?precoCentavos:\s*(\d+)' % item["sku"], ficha_txt, re.S
        ) or re.search(
            r'prata\(\s*"%s"[^)]*?,\s*(\d+)\s*(?:,\s*"[^"]*"\s*)?\)' % item["sku"], ficha_txt
        )

        if not bloco:
            faltando.append(item["sku"])
        elif item["precoCentavos"] is None:
            # O nome do arquivo não trazia preço; quem preencheu foi a ficha.
            # Não é erro — é o caminho normal para foto que chegou sem preço —,
            # mas fica listado, porque aqui o arquivo deixou de ser conferível.
            so_na_ficha.append(f"{item['sku']} ({int(bloco.group(1)) / 100:.2f})")
        elif int(bloco.group(1)) != item["precoCentavos"]:
            divergentes.append((item["sku"], item["precoCentavos"], int(bloco.group(1))))

    sem_nada = [s for s in sem_preco if s in faltando]
    if sem_nada:
        print(f"\nSem preço no arquivo E sem ficha ({len(sem_nada)}) — não têm preço nenhum:")
        print("  " + ", ".join(sem_nada))
    if so_na_ficha:
        print(f"\nPreço veio só da ficha, não do nome do arquivo ({len(so_na_ficha)}):")
        print("  " + ", ".join(so_na_ficha))
    if faltando:
        print(f"\nSem ficha em lib/data/catalogo-local.ts ({len(faltando)}) — não aparecem no site:")
        print("  " + ", ".join(faltando))
    if divergentes:
        print("\nPreço do arquivo diferente do preço da ficha:")
        for sku, do_arquivo, da_ficha in divergentes:
            print(f"  - {sku}: arquivo {do_arquivo} vs ficha {da_ficha} (centavos)")
    if not faltando and not divergentes:
        print("\nAs 14 fichas conferem com os arquivos.")


if __name__ == "__main__":
    main()
