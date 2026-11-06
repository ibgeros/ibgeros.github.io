"""Constroi a base sintetica a partir dos microdados publicos do Censo 2022.

Entrada : raw/censo/uf/<UF>/Pessoas_<UF>_publico.csv e Domicilios_<UF>_publico.csv
Saida   : data/censo_base.pkl

Estrategia
----------
1. Le, para cada UF, apenas as colunas necessarias (P e D).
2. Mantem pessoas de 20 a 79 anos (faixas P0180 05..16) do sexo masculino/feminino.
3. Junta o registro de pessoas ao de domicilios pelo identificador P0100 = D0100,
   trazendo condicao de ocupacao (D0190) e renda domiciliar per capita (D0360).
4. Sorteia uma amostra estratificada por UF x sexo x faixa de idade, com quota
   fixa por estrato, e reescala os pesos para preservar o total populacional
   de cada estrato.

A amostra final tem ~227 mil pessoas e representa a populacao de 20 a 79 anos
do Censo 2022 (cerca de 150 milhoes de pessoas).
"""
from __future__ import annotations

import os
import pickle
import time

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw", "censo", "uf")
OUT = os.path.join(ROOT, "data", "censo_base.pkl")

QUOTA = 350  # por UF x sexo x faixa de 5 anos
SEED = 20221106

PCOLS = ["P0020", "P0100", "P0110", "P0140", "P0150", "P0180", "P0210",
         "P0280", "P0290", "P0340", "P0760", "P0950", "P1110"]
DCOLS = ["D0100", "D0190", "D0360"]
KEEP = ["uf", "sex", "band", "P0100", "w", "P0140", "P0210", "P0280",
        "P0290", "P0340", "P0760", "P0950", "P1110", "D0190", "D0360"]


def uf_dirs():
    for name in sorted(os.listdir(RAW)):
        d = os.path.join(RAW, name)
        if os.path.isdir(d) and name[:2].isdigit():
            yield name[:2], d


def main():
    rng = np.random.default_rng(SEED)
    parts = []
    t0 = time.time()
    for uf, d in uf_dirs():
        t = time.time()
        pf = os.path.join(d, f"Pessoas_{uf}_publico.csv")
        df_ = os.path.join(d, f"Domicilios_{uf}_publico.csv")
        if not (os.path.exists(pf) and os.path.exists(df_)):
            print(f"  !! {uf}: arquivos ausentes")
            continue
        p = pd.read_csv(pf, sep=";", usecols=PCOLS, dtype=str)
        dom = pd.read_csv(df_, sep=";", usecols=DCOLS, dtype=str)

        p = p[p["P0150"].isin(["1", "2"])].copy()
        p = p[p["P0180"].isin([f"{x:02d}" for x in range(5, 17)])].copy()

        dd = dom.drop_duplicates("D0100").set_index("D0100")
        p["D0190"] = p["P0100"].map(dd["D0190"])
        p["D0360"] = p["P0100"].map(dd["D0360"])

        p["sex"] = p["P0150"].astype(int) - 1          # 0 homem, 1 mulher
        p["band"] = p["P0180"].astype(int) - 5         # 0 = 20-24 ... 11 = 75-79
        p["w"] = pd.to_numeric(p["P0110"], errors="coerce")

        keep = []
        for _, g in p.groupby(["sex", "band"], sort=False):
            total_w = float(g["w"].sum())
            n = min(QUOTA, len(g))
            idx = rng.choice(g.index.to_numpy(), size=n, replace=False)
            samp = g.loc[idx].copy()
            sw = float(samp["w"].sum())
            if sw > 0:
                samp["w"] = samp["w"] * (total_w / sw)
            keep.append(samp)
        p = pd.concat(keep)
        p["uf"] = uf
        parts.append(p[KEEP])
        print(f"  {uf}: {len(p):>7,} pessoas amostradas  ({time.time() - t:.1f}s)")

    base = pd.concat(parts, ignore_index=True)
    print("total amostrado:", len(base), f"({time.time() - t0:.0f}s)")
    print("populacao representada:", f"{base['w'].sum() / 1e6:.2f} milhoes")
    with open(OUT, "wb") as f:
        pickle.dump(base, f, protocol=4)
    print("salvo:", OUT)


if __name__ == "__main__":
    main()
