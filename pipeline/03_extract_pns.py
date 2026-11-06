"""Extrai os campos necessarios dos microdados da PNS 2019 para data/pns2019.pkl.

Fonte: raw/PNS_2019.txt (arquivo de largura fixa distribuido pelo IBGE,
layout em raw/dic/input_PNS_2019.txt). Peso do morador selecionado: V00291.

Variaveis usadas
----------------
V0001    UF
V0026    situacao censitaria (1 urbano, 2 rural)
C006     sexo (1 homem, 2 mulher)
C008     idade em anos
C009     cor ou raca (1 branca, 2 preta, 3 amarela, 4 parda, 5 indigena)
C011     estado civil (1 casado, 2 divorciado/separado, 3 viuvo, 4 solteiro)
VDD004A  nivel de instrucao (1..7)
P050     fuma atualmente (1 diariamente, 2 menos que diariamente, 3 nao)
A018027  existe automovel no domicilio (1 sim, 2 nao)
A018028  quantidade de automoveis
Z001     ja teve/tem filhos biologicos (1 sim, 2 nao) - homens 15+
W00103   peso medido (kg, 1 decimal)
W00203   altura medida (cm, 1 decimal)
VDF003   renda domiciliar per capita (R$)
E01602   rendimento do trabalho principal (R$)
E01802   rendimento de outros trabalhos (R$)
F001021  aposentadoria/pensao (R$)
F007021  pensao alimenticia/doacao (R$)
F008021  aluguel/arrendamento (R$)
VDF00102 outros rendimentos (R$)
V00291   peso amostral do morador selecionado (calibrado)
V00301   peso amostral do morador selecionado para antropometria
VDE001   condicao na forca de trabalho
VDE002   condicao de ocupacao
"""
from __future__ import annotations

import os
import pickle

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "raw", "PNS_2019.txt")
OUT = os.path.join(ROOT, "data", "pns2019.pkl")

COLS = {
    "uf": (1, 2), "situacao": (31, 1), "sexo": (108, 1), "idade": (117, 3),
    "raca": (120, 1), "civil": (133, 1), "instrucao": (1514, 1),
    "fuma": (711, 1), "carro": (78, 1), "carro_qtd": (79, 2),
    "moto": (75, 1), "filhos": (1223, 1),
    "altura": (1362, 5), "peso": (1347, 5),
    "renda_pc": (1527, 8),
    "rend_trab1": (187, 8), "rend_trab2": (209, 8),
    "rend_apos": (268, 8), "rend_alim": (277, 8),
    "rend_alug": (286, 8), "rend_outros": (295, 8),
    "peso_pessoa": (1426, 14), "peso_antro": (1440, 17),
    "forca": (1515, 1), "ocupacao": (1516, 1),
}
NUM = [k for k in COLS if k != "uf"]


def main():
    data = {k: [] for k in COLS}
    with open(SRC, "r", encoding="latin-1") as f:
        for line in f:
            if len(line) < 1500:
                continue
            for k, (pos, size) in COLS.items():
                data[k].append(line[pos - 1:pos - 1 + size].strip())
    df = pd.DataFrame(data)
    for k in NUM:
        df[k] = pd.to_numeric(df[k], errors="coerce")
    df["uf"] = df["uf"].str.zfill(2)

    # renda individual total (R$ de 2019)
    comps = ["rend_trab1", "rend_trab2", "rend_apos", "rend_alim", "rend_alug", "rend_outros"]
    df["renda_ind"] = df[comps].fillna(0).sum(axis=1)
    df.loc[df[comps].notna().sum(axis=1) == 0, "renda_ind"] = 0.0

    df["altura"] = df["altura"].where((df["altura"] > 100) & (df["altura"] < 250))
    df["peso"] = df["peso"].where((df["peso"] > 20) & (df["peso"] < 300))
    df["imc"] = df["peso"] / (df["altura"] / 100) ** 2

    with open(OUT, "wb") as f:
        pickle.dump(df, f, protocol=4)
    print("linhas:", len(df))
    print("adultos 20-79:", ((df.idade >= 20) & (df.idade <= 79)).sum())
    print("altura medida:", df.altura.notna().sum(), "| imc:", df.imc.notna().sum())
    print("fuma valido:", df.fuma.notna().sum(), "| carro valido:", df.carro.notna().sum())
    print("filhos valido (homens 15+):", ((df.sexo == 1) & df.filhos.notna()).sum())
    print("salvo:", OUT)


if __name__ == "__main__":
    main()
