"""Extrai os campos necessarios dos microdados da PNAD Continua anual 2025.

Fonte: raw/PNADC_2025_visita1.txt (largura fixa; layout em
raw/dic/input_PNADC_2025.txt).

Usado para atualizar a distribuicao de renda do Censo 2022 para reais de 2025
(mapeamento de quantis por sexo x escolaridade), preservando a ordem relativa
das rendas dentro de cada grupo.
"""
from __future__ import annotations

import os
import pickle

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "raw", "PNADC_2025_visita1.txt")
OUT = os.path.join(ROOT, "data", "pnad2025.pkl")

COLS = {
    "uf": (6, 2), "peso": (58, 15), "sexo": (94, 1), "idade": (103, 3),
    "raca": (106, 1), "instrucao": (529, 1),
    "forca": (533, 1), "ocupacao": (534, 1),
    "renda_trab": (567, 8), "renda_total": (600, 8),
}
NUM = [k for k in COLS if k != "uf"]


def main():
    data = {k: [] for k in COLS}
    with open(SRC, "r", encoding="latin-1") as f:
        for line in f:
            for k, (pos, size) in COLS.items():
                data[k].append(line[pos - 1:pos - 1 + size].strip())
    df = pd.DataFrame(data)
    for k in NUM:
        df[k] = pd.to_numeric(df[k], errors="coerce")
    df["uf"] = df["uf"].str.zfill(2)
    df["renda"] = df["renda_total"].fillna(0)
    with open(OUT, "wb") as f:
        pickle.dump(df, f, protocol=4)
    print("linhas:", len(df))
    print("populacao:", f"{df.peso.sum()/1e6:.1f} mi")
    print("renda total > 0:", (df.renda > 0).mean().round(3))
    print("salvo:", OUT)


if __name__ == "__main__":
    main()
