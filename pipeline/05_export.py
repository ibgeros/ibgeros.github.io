"""Copia os artefatos para o site e gera os arquivos de auditoria.

Saidas em site/data/:
  meta.json, marginais.json, validacao.json, population.bin
  fontes.json         catalogo de fontes, tabelas e transformacoes
  amostra_20k.csv     amostra legivel para inspecao (nao usar para estimativas)
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SITE = os.path.join(ROOT, "site", "data")

COLS = ["uf", "sexo", "faixa_idade", "cor_raca", "escolaridade", "estado_civil",
        "filhos", "imc", "fuma", "carro", "casa_propria", "altura_cm",
        "renda_mensal_2025", "peso_amostral"]

FONTES = [
    {
        "id": "censo2022",
        "nome": "Censo Demográfico 2022",
        "orgao": "IBGE",
        "papel": "Base demográfica: sexo, idade, cor/raça, escolaridade, estado civil, filhos (mulheres), renda, condição de ocupação do domicílio e pesos amostrais.",
        "periodo": "2022",
        "microdados": "https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Microdados_e_Areas_de_Ponderacao/Microdados_de_acesso_Publico/",
        "layout": "https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Microdados_e_Areas_de_Ponderacao/Documentacao/Layout%20e%20dicion%C3%A1rio/Layout%20Microdados%20CD2022%20-%20acesso%20P%C3%BAblico.xlsx",
        "tabelas": [
            {"id": "9514", "nome": "População residente, por sexo, idade e forma de declaração da idade",
             "url": "https://sidra.ibge.gov.br/tabela/9514"},
        ],
        "variaveis": [
            ["P0150", "Sexo"], ["P0180", "Idade (faixas de 5 anos)"],
            ["P0210", "Cor ou raça"], ["P0280", "Convivência com cônjuge/companheiro"],
            ["P0340", "Filhos nascidos vivos (mulheres)"], ["P0760", "Nível de instrução"],
            ["P1110", "Rendimento em todas as fontes"], ["D0190", "Condição de ocupação do domicílio"],
            ["D0360", "Rendimento domiciliar per capita"], ["P0110", "Peso amostral"],
        ],
    },
    {
        "id": "pns2013",
        "nome": "Pesquisa Nacional de Saúde 2013",
        "orgao": "IBGE",
        "papel": "Antropometria medida de 59.592 adultos. Usada em conjunto com a PNS 2019 para estimar os gradientes socioeconômicos e regionais de altura e IMC com muito menos ruído.",
        "periodo": "2013",
        "microdados": "https://ftp.ibge.gov.br/PNS/2013/Microdados/Dados/PNS_2013.zip",
        "dicionario": "https://ftp.ibge.gov.br/PNS/2013/Microdados/Documentacao/Dicionario_e_input_20200930.zip",
        "variaveis": [["W00203", "Altura medida (cm)"], ["W00103", "Peso medido (kg)"],
                      ["VDF003", "Rendimento domiciliar per capita"], ["V00291", "Peso amostral"]],
    },
    {
        "id": "pns2019",
        "nome": "Pesquisa Nacional de Saúde 2019",
        "orgao": "IBGE",
        "papel": "Altura e IMC medidos na subamostra de 2019 (6.672 adultos), tabagismo, filhos (homens) e existência de automóvel no domicílio.",
        "periodo": "2019",
        "microdados": "https://ftp.ibge.gov.br/PNS/2019/Microdados/Dados/PNS_2019_20220525.zip",
        "dicionario": "https://ftp.ibge.gov.br/PNS/2019/Microdados/Documentacao/Dicionario_e_input_20220530.zip",
        "tabelas": [
            {"id": "8171", "nome": "Percentis da altura das pessoas de 15 anos ou mais, por sexo e grupo de idade",
             "url": "https://sidra.ibge.gov.br/tabela/8171"},
            {"id": "8168", "nome": "Pessoas de 18 anos ou mais com excesso de peso ou obesidade, por sexo e grupo de idade",
             "url": "https://sidra.ibge.gov.br/tabela/8168"},
            {"id": "8303", "nome": "Homens de 15 anos ou mais que já tiveram filhos, por grupo de idade",
             "url": "https://sidra.ibge.gov.br/tabela/8303"},
        ],
        "variaveis": [
            ["W00203", "Altura medida (cm)"], ["W00103", "Peso medido (kg)"],
            ["P050", "Fuma atualmente"], ["Z001", "Já teve/tem filhos (homens)"],
            ["A018027", "Existe automóvel no domicílio"], ["VDF003", "Rendimento domiciliar per capita"],
            ["V00291", "Peso amostral do morador selecionado"], ["V00301", "Peso amostral da antropometria"],
        ],
    },
    {
        "id": "pnad2025",
        "nome": "PNAD Contínua — microdados anuais 2025",
        "orgao": "IBGE",
        "papel": "Atualiza a distribuição de renda do Censo 2022 para reais de 2025, por sexo, escolaridade e faixa de idade.",
        "periodo": "2025 (visita 1)",
        "microdados": "https://ftp.ibge.gov.br/Trabalho_e_Rendimento/Pesquisa_Nacional_por_Amostra_de_Domicilios_continua/Anual/Microdados/Visita/Visita_1/Dados/",
        "variaveis": [["VD4046", "Rendimento habitual de todas as fontes"], ["V1032", "Peso amostral calibrado"]],
    },
]

MODELOS = [
    {
        "atributo": "Altura",
        "fonte": "PNS 2013 + PNS 2019 (64.209 adultos com altura medida) + tabela 8171",
        "metodo": "Cópula gaussiana. A margem oficial de 2019 (P5, P50, P95 por sexo e grupo de idade) é preservada; a ordem relativa vem de uma regressão da altura padronizada contra escolaridade, renda domiciliar per capita e região, com efeito de ano. A PNS 2013 (57.904 adultos) dá precisão aos gradientes; a PNS 2019 ancora o nível.",
    },
    {
        "atributo": "IMC",
        "fonte": "PNS 2013 + PNS 2019 (IMC medido, 64.209 adultos) + tabela 8168",
        "metodo": "Regressão de log(IMC) contra idade, escolaridade, renda, sexo e ano; deslocamento por grupo para reproduzir exatamente a prevalência oficial de obesidade de 2019 por sexo e faixa de idade.",
    },
    {
        "atributo": "Tabagismo",
        "fonte": "PNS 2019 (P050)",
        "metodo": "Taxas por sexo × faixa de idade × escolaridade, com suavização empírico-bayesiana (α = 20) e sorteio Bernoulli.",
    },
    {
        "atributo": "Filhos (homens)",
        "fonte": "PNS 2019 (Z001, n = 42.799 homens 15+)",
        "metodo": "Taxas por faixa de idade × estado civil × escolaridade, suavizadas e calibradas por faixa de idade na tabela 8303. Mulheres usam o número de filhos nascidos vivos do Censo 2022.",
    },
    {
        "atributo": "Automóvel no domicílio",
        "fonte": "PNS 2019 (A018027)",
        "metodo": "Taxas por região × decil de renda domiciliar per capita × urbano/rural, suavizadas (α = 25).",
    },
    {
        "atributo": "Renda em reais de 2025",
        "fonte": "Censo 2022 + PNAD Contínua 2025",
        "metodo": "Mapeamento de quantis por sexo × escolaridade × faixa de idade: cada pessoa mantém sua posição relativa, mas a distribuição passa a ser a da PNAD 2025.",
    },
]


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def decode():
    allb = np.fromfile(os.path.join(DATA, "population.bin"), dtype=np.uint8)
    n = allb.size // (20 + 4 * 9)
    raw = allb[:20 * n].reshape(n, 20)
    return {
        "uf": raw[:, 0], "sexo": raw[:, 1], "band": raw[:, 2], "raca": raw[:, 3],
        "edu": raw[:, 4], "marital": raw[:, 5], "kids": raw[:, 6], "smoke": raw[:, 7],
        "bmi": raw[:, 8], "car": raw[:, 9], "home": raw[:, 10], "altura": raw[:, 11],
        "renda": raw[:, 12:16].copy().view("<f4").reshape(-1),
        "peso": raw[:, 16:20].copy().view("<f4").reshape(-1),
    }


def main():
    os.makedirs(SITE, exist_ok=True)
    for f in ["meta.json", "marginais.json", "validacao.json", "population.bin"]:
        shutil.copyfile(os.path.join(DATA, f), os.path.join(SITE, f))
    meta = json.load(open(os.path.join(DATA, "meta.json"), encoding="utf-8"))
    val = json.load(open(os.path.join(DATA, "validacao.json"), encoding="utf-8"))
    fontes = {
        "gerado_em": meta.get("gerado_em"),
        "universo": {
            "descricao": "Pessoas de 20 a 79 anos residentes no Brasil",
            "populacao": meta["populacao"],
            "registros": meta["n_registros"],
            "idade_min": meta["idade_min"], "idade_max": meta["idade_max"],
        },
        "fontes": FONTES,
        "modelos": MODELOS,
        "validacao": val,
        "arquivos": {
            "population.bin": {"sha256": sha256(os.path.join(DATA, "population.bin")),
                               "layout": "56 bytes por registro: bloco base de 20 B (uf, sexo, faixa, raça, escolaridade, estado civil, filhos, fuma, imc, carro, casa, altura, renda f32, peso f32) + 4 blocos de imputação de 9 B (altura, imc, fuma, filhos, carro, renda f32)"},
            "meta.json": {"sha256": sha256(os.path.join(DATA, "meta.json"))},
        },
    }
    with open(os.path.join(SITE, "fontes.json"), "w", encoding="utf-8") as f:
        json.dump(fontes, f, ensure_ascii=False, indent=1)

    # amostra legivel
    d = decode()
    rng = np.random.default_rng(42)
    n = len(d["peso"])
    idx = rng.choice(n, size=min(20000, n), replace=False)
    df = pd.DataFrame({
        "uf": [meta["ufs"][i]["nome"] for i in d["uf"][idx]],
        "sexo": np.where(d["sexo"][idx] == 0, "Homem", "Mulher"),
        "faixa_idade": [meta["faixas_idade"][i] for i in d["band"][idx]],
        "cor_raca": [meta["raca"][i] if i < len(meta["raca"]) else "" for i in d["raca"][idx]],
        "escolaridade": [meta["escolaridade"][i] for i in d["edu"][idx]],
        "estado_civil": [meta["estado_civil"][i] for i in d["marital"][idx]],
        "filhos": [meta["filhos"][i] if i < 3 else "" for i in d["kids"][idx]],
        "imc": [meta["imc"][i] for i in d["bmi"][idx]],
        "fuma": np.where(d["smoke"][idx] == 1, "Sim", "Não"),
        "carro": np.where(d["car"][idx] == 1, "Sim", "Não"),
        "casa_propria": np.where(d["home"][idx] == 1, "Sim", "Não"),
        "altura_cm": d["altura"][idx],
        "renda_mensal_2025": np.round(d["renda"][idx], 2),
        "peso_amostral": np.round(d["peso"][idx], 4),
    })
    df.to_csv(os.path.join(SITE, "amostra_20k.csv"), index=False, sep=";", encoding="utf-8-sig")
    print("exportado para", SITE)


if __name__ == "__main__":
    main()
