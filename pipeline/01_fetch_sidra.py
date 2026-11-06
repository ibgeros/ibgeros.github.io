"""Baixa as tabelas do SIDRA usadas no projeto.

Fontes:
  9514  Censo 2022 - Populacao residente por sexo, idade e forma de declaracao
  8171  PNS 2019   - Percentis de altura por sexo e grupo de idade
  8168  PNS 2019   - Excesso de peso e obesidade por sexo e grupo de idade
  8303  PNS 2019   - Homens de 15+ que ja tiveram filhos, por grupo de idade
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib_sidra import fetch_agregado, flatten, num  # noqa: E402

AGE_GROUPS = [93087, 93088, 93089, 93090, 93091, 93092,
              93093, 93094, 93095, 93096, 93097, 93098]

TABLES = [
    dict(name="populacao_2022_uf", table="9514", period="2022", variables=["93"],
         localidades="N3[all]",
         classificacao="2[4,5]|287[" + ",".join(map(str, AGE_GROUPS)) + "]|286[113635]"),
    dict(name="altura_pns2019", table="8171", period="2019",
         variables=["11659", "11661", "11663"], localidades="N1[all]",
         classificacao="2[4,5]|58[all]"),
    dict(name="obesidade_pns2019", table="8168", period="2019",
         variables=["11675", "11683"], localidades="N1[all]",
         classificacao="2[4,5]|58[all]"),
    dict(name="filhos_homens_pns2019", table="8303", period="2019",
         variables=["12050"], localidades="N1[all]",
         classificacao="58[all]|1[all]"),
]


def main():
    for spec in TABLES:
        print("==", spec["name"])
        payload = fetch_agregado(spec["table"], spec["period"], spec["variables"],
                                 spec["localidades"], spec["classificacao"],
                                 cache_name=spec["name"])
        rows = flatten(payload)
        print("  linhas:", len(rows))
        # amostra legivel
        for r in rows[:3]:
            print("   ", r["variavel"][:55], "|", r["periodo"], "|", r["localidade"],
                  "|", {k: list(v["categoria"].values())[0] for k, v in r["classificacoes"].items()},
                  "=>", r["valores"])
        # checagem de nulos
        nulos = sum(1 for r in rows if num(r["valores"]) is None)
        print("  valores nulos:", nulos)


if __name__ == "__main__":
    main()
