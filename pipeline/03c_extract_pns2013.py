"""Extrai os campos de antropometria da PNS 2013 para data/pns2013.pkl.

A PNS 2013 mediu peso e altura de 59.592 adultos (18+), dez vezes mais que a
subamostra da PNS 2019 (6.672). Usamos as duas pesquisas para estimar os
gradientes socioeconômicos e regionais de altura/IMC com muito menos ruído.
"""
from __future__ import annotations

import os
import pickle

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "raw", "PNS_2013.txt")
OUT = os.path.join(ROOT, "data", "pns2013.pkl")

COLS = {
    "uf": (1, 2), "situacao": (38, 1), "sexo": (106, 1), "idade": (115, 3),
    "raca": (118, 1), "civil": (120, 1), "instrucao": (1458, 1),
    "altura": (1315, 5), "peso": (1300, 5), "peso_pessoa": (1405, 14),
    "renda_pc": (1469, 8),
}
NUM = [k for k in COLS if k != "uf"]


def main():
    data = {k: [] for k in COLS}
    with open(SRC, "r", encoding="latin-1") as f:
        for line in f:
            if len(line) < 1480:
                continue
            for k, (pos, size) in COLS.items():
                data[k].append(line[pos - 1:pos - 1 + size].strip())
    df = pd.DataFrame(data)
    for k in NUM:
        df[k] = pd.to_numeric(df[k], errors="coerce")
    df["uf"] = df["uf"].str.zfill(2)
    df["altura"] = df["altura"].where((df["altura"] > 100) & (df["altura"] < 250))
    df["peso"] = df["peso"].where((df["peso"] > 20) & (df["peso"] < 300))
    df["imc"] = df["peso"] / (df["altura"] / 100) ** 2
    with open(OUT, "wb") as f:
        pickle.dump(df, f, protocol=4)
    adult = df[(df.idade >= 18) & (df.idade <= 79)]
    print("linhas:", len(df))
    print("adultos 18-79:", len(adult))
    print("altura medida 18-79:", adult.altura.notna().sum())
    print("IMC:", adult.imc.notna().sum())
    print("salvo:", OUT)


if __name__ == "__main__":
    main()
