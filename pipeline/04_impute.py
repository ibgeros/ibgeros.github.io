"""Imputa os atributos que o Censo 2022 nao coleta e gera a base do aplicativo.

Base demografica e socioeconomica : Censo 2022 (amostra de 226.692 pessoas, 20-79 anos)
Renda                             : mapeada para reais de 2025 pela PNAD Continua 2025
Altura, IMC, fumo, filhos (homens),
carro no domicilio                : PNS 2019 (microdados), imputados por modelos
                                    documentados e calibrados nas tabelas oficiais

Saidas
------
data/population.bin     registros binarios (20 bytes por pessoa)
data/meta.json          metadados, niveis, totais, coeficientes dos modelos
data/marginais.json     distribuicoes para a pagina de dados
data/validacao.json     comparacoes com as fontes oficiais
"""
from __future__ import annotations

import json
import os
import pickle

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
RNG = np.random.default_rng(20221106)

UFS = ["11", "12", "13", "14", "15", "16", "17",
       "21", "22", "23", "24", "25", "26", "27", "28", "29",
       "31", "32", "33", "35", "41", "42", "43", "50", "51", "52", "53"]
UF_NOME = {
    "11": "Rondônia", "12": "Acre", "13": "Amazonas", "14": "Roraima", "15": "Pará",
    "16": "Amapá", "17": "Tocantins", "21": "Maranhão", "22": "Piauí", "23": "Ceará",
    "24": "Rio Grande do Norte", "25": "Paraíba", "26": "Pernambuco", "27": "Alagoas",
    "28": "Sergipe", "29": "Bahia", "31": "Minas Gerais", "32": "Espírito Santo",
    "33": "Rio de Janeiro", "35": "São Paulo", "41": "Paraná", "42": "Santa Catarina",
    "43": "Rio Grande do Sul", "50": "Mato Grosso do Sul", "51": "Mato Grosso",
    "52": "Goiás", "53": "Distrito Federal",
}
UF_REGIAO = {
    "11": "Norte", "12": "Norte", "13": "Norte", "14": "Norte", "15": "Norte",
    "16": "Norte", "17": "Norte",
    "21": "Nordeste", "22": "Nordeste", "23": "Nordeste", "24": "Nordeste",
    "25": "Nordeste", "26": "Nordeste", "27": "Nordeste", "28": "Nordeste",
    "29": "Nordeste",
    "31": "Sudeste", "32": "Sudeste", "33": "Sudeste", "35": "Sudeste",
    "41": "Sul", "42": "Sul", "43": "Sul",
    "50": "Centro-Oeste", "51": "Centro-Oeste", "52": "Centro-Oeste", "53": "Centro-Oeste",
}
REGIOES = ["Norte", "Nordeste", "Sudeste", "Sul", "Centro-Oeste"]

BANDS = [f"{a}-{a+4}" for a in range(20, 80, 5)]          # 20-24 ... 75-79
AGE_MID = {i: 22 + 5 * i for i in range(12)}

# escolaridade Censo P0760 -> 4 niveis
EDU4 = {1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3}
EDU_LABEL = ["Fundamental incompleto", "Fundamental completo / médio incompleto",
             "Médio completo / superior incompleto", "Superior completo"]
EDU_ANOS = {1: 0, 2: 4, 3: 8, 4: 9, 5: 11, 6: 13, 7: 16}

RACA = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4}
RACA_LABEL = ["Branca", "Preta", "Amarela", "Parda", "Indígena"]

MARITAL_LABEL = ["Em união", "Já viveu em união", "Nunca viveu em união"]
BMI_LABEL = ["Baixo peso", "Peso normal", "Sobrepeso", "Obesidade"]


# ----------------------------------------------------------------------------- util
def wmean(x, w):
    x = np.asarray(x, float); w = np.asarray(w, float)
    ok = np.isfinite(x) & np.isfinite(w)
    if not ok.any():
        return float("nan")
    return float(np.sum(x[ok] * w[ok]) / np.sum(w[ok]))


def wz(x, w):
    x = np.asarray(x, float); w = np.asarray(w, float)
    ok = np.isfinite(x) & np.isfinite(w)
    out = np.full(x.shape, np.nan)
    if not ok.any():
        return out
    m = np.sum(x[ok] * w[ok]) / np.sum(w[ok])
    sd = float(np.sqrt(np.sum(w[ok] * (x[ok] - m) ** 2) / np.sum(w[ok])))
    out[ok] = (x[ok] - m) / (sd if sd > 0 else 1.0)
    return out


def wquantile(x, q, w):
    x = np.asarray(x, float); w = np.asarray(w, float)
    ok = np.isfinite(x) & np.isfinite(w)
    x, w = x[ok], w[ok]
    order = np.argsort(x)
    xs, ws = x[order], w[order]
    cw = np.cumsum(ws)
    cw = cw / cw[-1]
    return np.interp(q, cw, xs)


def sm_rates(df, by, target, alpha=15.0, prior_by=None):
    """Taxa suavizada (empirical Bayes) por celula."""
    g = df.groupby(by)[target].agg(["sum", "count", "mean"])
    base = df[target].mean() if prior_by is None else None
    g["rate"] = (g["sum"] + alpha * (g["mean"].mean())) / (g["count"] + alpha)
    return g["rate"]


def shrink_rates(df, by, target, alpha=15.0, weight="peso_pessoa"):
    """Taxa por celula encolhida em direcao a taxa geral, com pesos amostrais."""
    d = df[df[target].notna() & df[weight].notna()]
    overall = float(np.average(d[target], weights=d[weight]))
    g = d.groupby(by).apply(
        lambda x: pd.Series({"k": float(np.sum(x[target] * x[weight])),
                             "n": float(np.sum(x[weight]))}), include_groups=False)
    g["rate"] = (g["k"] + alpha * overall) / (g["n"] + alpha)
    return g["rate"]


def sidra_rows(name):
    sys_path = os.path.dirname(os.path.abspath(__file__))
    if sys_path not in __import__("sys").path:
        __import__("sys").path.insert(0, sys_path)
    from lib_sidra import flatten
    with open(os.path.join(DATA, "raw_sidra", f"{name}.json"), encoding="utf-8") as f:
        return flatten(json.load(f)["data"])


def cat(row, cid):
    c = row["classificacoes"].get(cid)
    return next(iter(c["categoria"].values()), None) if c else None


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except Exception:
        return None


# ------------------------------------------------------------------- carrega dados
def load():
    with open(os.path.join(DATA, "censo_base.pkl"), "rb") as f:
        cen = pickle.load(f)
    with open(os.path.join(DATA, "pns2019.pkl"), "rb") as f:
        pns = pickle.load(f)
    with open(os.path.join(DATA, "pnad2025.pkl"), "rb") as f:
        pnad = pickle.load(f)
    with open(os.path.join(DATA, "pns2013.pkl"), "rb") as f:
        pns13 = pickle.load(f)
    return cen, pns, pnad, pns13


def prep_censo(cen):
    c = pd.DataFrame({
        "uf": cen["uf"],
        "sex": cen["sex"].astype(int),
        "band": cen["band"].astype(int),
        "w": cen["w"].astype(float),
        "urban": (cen["P0140"] == "1").astype(int),
        "raca": cen["P0210"].map(lambda v: RACA.get(int(v), 3) if str(v).isdigit() else 3).astype(int),
        "edu4": cen["P0760"].map(lambda v: EDU4.get(int(v), 0) if str(v).isdigit() else 0).astype(int),
        "marital": cen["P0280"].map({"1": 0, "2": 1, "3": 2}).fillna(2).astype(int),
        "kids_w": pd.to_numeric(cen["P0340"], errors="coerce"),
        "empregado": cen["P0950"].map({"1": 1, "0": 0}).fillna(0).astype(int),
        "renda2022": pd.to_numeric(cen["P1110"], errors="coerce").fillna(0.0).clip(lower=0),
        "renda_pc2022": pd.to_numeric(cen["D0360"], errors="coerce"),
        "dom": cen["D0190"],
    })
    c["regiao"] = c["uf"].map(UF_REGIAO)
    c["uf_idx"] = c["uf"].map({u: i for i, u in enumerate(UFS)}).astype(int)
    # domicilio próprio: 1/2 = próprio (pago ou pagando)
    c["home"] = c["dom"].map({"1": 1, "2": 1, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0})
    # renda domiciliar per capita ausente -> usa a renda individual como proxy
    c["renda_pc2022"] = c["renda_pc2022"].fillna(c["renda2022"])
    c["log_pc"] = np.log1p(c["renda_pc2022"].clip(lower=0))
    c["edu_anos"] = c["edu4"].map({0: 4, 1: 9, 2: 13, 3: 16})
    c["grp"] = c.band.map({0: "18-24", 1: "18-24", 2: "25-39", 3: "25-39", 4: "25-39",
                           5: "40-59", 6: "40-59", 7: "40-59", 8: "40-59",
                           9: "60+", 10: "60+", 11: "60+"})
    c["grp5"] = c.band.map(lambda b: "20-29" if b <= 1 else "30-39" if b <= 3 else
                           "40-49" if b <= 5 else "50-59" if b <= 7 else "60+")
    return c


def prep_pns(pns):
    p = pns.copy()
    p = p[(p.idade >= 18) & (p.idade <= 79)].copy()
    p["sex"] = (p.sexo.astype(int) - 1)                        # 0 homem, 1 mulher
    p["regiao"] = p.uf.map(UF_REGIAO)
    p["grp"] = pd.cut(p.idade, [17, 24, 39, 59, 120],
                      labels=["18-24", "25-39", "40-59", "60+"]).astype(str)
    p["grp5"] = pd.cut(p.idade, [19, 29, 39, 49, 59, 120],
                       labels=["20-29", "30-39", "40-49", "50-59", "60+"]).astype(str)
    inst = p.instrucao
    p["edu4"] = inst.map({1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3}).fillna(0).astype(int)
    p["edu_anos"] = inst.map(EDU_ANOS).fillna(4)
    p["civil3"] = p.civil.map({1: 0, 2: 1, 3: 1, 4: 2})     # 0 uniao, 1 ja viveu, 2 nunca
    p["log_pc"] = np.log1p(p.renda_pc.clip(lower=0))
    p["fumante"] = p.fuma.isin([1, 2]).astype(float)
    p["fumante"] = p.fumante.where(p.fuma.notna())
    p["tem_carro"] = p.carro.map({1: 1.0, 2: 0.0})
    p["tem_filho"] = p.filhos.map({1: 1.0, 2: 0.0})
    p["tem_filho"] = p.tem_filho.where((p.sex == 0) & p.filhos.notna())
    return p


def prep_pns2013(df):
    """Prepara a PNS 2013 (antropometria medida de 57.904 adultos 18-79)."""
    p = df[(df.idade >= 18) & (df.idade <= 79) & df.altura.notna() & (df.peso_pessoa > 0)].copy()
    p["sex"] = (p.sexo.astype(int) - 1)
    p["regiao"] = p.uf.map(UF_REGIAO)
    p["grp"] = pd.cut(p.idade, [17, 24, 39, 59, 120],
                      labels=["18-24", "25-39", "40-59", "60+"]).astype(str)
    p["grp5"] = pd.cut(p.idade, [19, 29, 39, 49, 59, 120],
                       labels=["20-29", "30-39", "40-49", "50-59", "60+"]).astype(str)
    p["edu4"] = p.instrucao.map({1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3}).fillna(0).astype(int)
    p["edu_anos"] = p.instrucao.map(EDU_ANOS).fillna(4)
    p["log_pc"] = np.log1p(p.renda_pc.clip(lower=0))
    p["peso_antro"] = p.peso_pessoa
    p["ano"] = 2013
    return p


# ---------------------------------------------------------------------- modelos
def map_income(cen, pnad):
    """Atualiza a renda do Censo 2022 para reais de 2025 (mapeamento de quantis)."""
    c = cen.copy()
    target = pnad[(pnad.idade >= 20) & (pnad.idade <= 79)].copy()
    target["sex"] = target.sexo.astype(int) - 1
    target["edu4"] = target.instrucao.map({1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3}).fillna(0).astype(int)
    target["age4"] = pd.cut(target.idade, [19, 29, 39, 49, 120], labels=False)
    target["renda"] = target.renda.fillna(0).clip(lower=0)

    c["age4"] = pd.cut(c.band, [-1, 1, 3, 5, 11], labels=False)  # 20-29,30-39,40-49,50+
    c["renda2025"] = c.renda2022.astype(float)

    for (sx, ed, ag), g in c.groupby(["sex", "edu4", "age4"]):
        t = target[(target.sex == sx) & (target.edu4 == ed) & (target.age4 == ag)]
        if len(t) < 50 or len(g) < 20:
            t = target[(target.sex == sx) & (target.edu4 == ed)]
        # ranks ponderados na origem
        order = np.argsort(g.renda2022.to_numpy())
        vals = g.renda2022.to_numpy()[order]
        wts = g.w.to_numpy()[order]
        cw = np.cumsum(wts) / wts.sum()
        ranks = (cw - wts / (2 * wts.sum()))
        # quantis ponderados no alvo
        order_t = np.argsort(t.renda.to_numpy())
        tv = t.renda.to_numpy()[order_t]
        tw = t.peso.to_numpy()[order_t]
        tcw = np.cumsum(tw) / tw.sum()
        mapped = np.interp(ranks, tcw, tv)
        out = np.empty(len(g))
        out[order] = mapped
        c.loc[g.index, "renda2025"] = out
    return c


def fit_height(c, p):
    """Altura: copula gaussiana com marginais oficiais da PNS (tabela 8171)."""
    m = p[(p.altura.notna()) & (p.peso_antro > 0)].copy()
    m["z_h"] = np.nan
    m["z_edu"] = np.nan
    m["z_inc"] = np.nan
    for (sx, grp), g in m.groupby(["sex", "grp"]):
        m.loc[g.index, "z_h"] = wz(g.altura, g.peso_antro)
        m.loc[g.index, "z_edu"] = wz(g.edu_anos, g.peso_antro)
        m.loc[g.index, "z_inc"] = wz(g.log_pc, g.peso_antro)
    m = m.dropna(subset=["z_h", "z_edu", "z_inc"])

    X = pd.DataFrame({"z_edu": m.z_edu, "z_inc": m.z_inc,
                      "ano2019": (m.ano == 2019).astype(float)})
    for r in REGIOES[1:]:
        X[f"reg_{r}"] = (m.regiao == r).astype(float)
    X = np.column_stack([np.ones(len(m)), X.to_numpy(float)])
    y = m.z_h.to_numpy()
    w = m.peso_antro.to_numpy()
    XtW = X.T * w
    beta = np.linalg.solve(XtW @ X, XtW @ y)
    resid = y - X @ beta
    sigma = float(np.sqrt(wmean(resid ** 2, w)))
    # coeficientes por regiao (para relatorio)
    reg_eff = {REGIOES[0]: 0.0}
    for i, r in enumerate(REGIOES[1:], start=4):
        reg_eff[r] = float(beta[i])
    return {"beta_edu": float(beta[1]), "beta_renda": float(beta[2]),
            "beta_ano2019": float(beta[3]),
            "regiao": reg_eff, "sigma": sigma, "n": int(len(m)),
            "n_2013": int((m.ano == 2013).sum()), "n_2019": int((m.ano == 2019).sum()),
            "mu_altura": {s: float(wmean(m[m.sex == s].altura, m[m.sex == s].peso_antro)) for s in [0, 1]}}


def apply_height(c, model, height_pct):
    """Gera altura para cada pessoa calibrada nos percentis oficiais 5/50/95."""
    grp_map = {0: "18-24", 1: "18-24", 2: "25-39", 3: "25-39", 4: "25-39",
               5: "40-59", 6: "40-59", 7: "40-59", 8: "40-59",
               9: "60+", 10: "60+", 11: "60+"}
    c = c.copy()
    c["grp"] = c.band.map(grp_map)
    c["z_edu"] = np.nan
    c["z_inc"] = np.nan
    for (sx, bd), g in c.groupby(["sex", "band"]):
        c.loc[g.index, "z_edu"] = wz(g.edu_anos, g.w)
        c.loc[g.index, "z_inc"] = wz(g.log_pc, g.w)
    reg = c.regiao.map(model["regiao"]).astype(float)
    reg = reg - np.average(reg, weights=c.w)     # centraliza o efeito regional
    z = (model["beta_edu"] * c.z_edu.fillna(0) +
         model["beta_renda"] * c.z_inc.fillna(0) + reg)
    z = z + RNG.normal(0, model["sigma"], len(c))
    zz = z.to_numpy()
    h = np.empty(len(c))
    for (sx, grp), pos in c.groupby(["sex", "grp"]).indices.items():
        p5, p50, p95 = height_pct[(sx, grp)]
        h[pos] = _piecewise_quantile(zz[pos], p5, p50, p95)
    c["altura"] = np.clip(h, 135, 210)
    return c


def _norm_cdf(z):
    from math import erf, sqrt
    return 0.5 * (1 + np.vectorize(erf)(z / sqrt(2)))


def _piecewise_quantile(z, p5, p50, p95):
    """Quantil ancorado em P5/P50/P95 oficiais, com caudas normais.

    No miolo (5%-95%) interpola linearmente em u = Phi(z). Nas caudas, extrapola
    em unidades de desvio-padrao (z), para nao truncar a distribuicao em +/- 5%
    da populacao. Sem isso, a altura maxima de mulheres ficaria em ~173 cm.
    """
    from math import erf, sqrt
    u = 0.5 * (1 + np.vectorize(erf)(z / sqrt(2)))
    z5 = 1.6448536269514722
    a = (p50 - p5) / 0.45
    b = (p95 - p50) / 0.45
    s_low = (p50 - p5) / z5
    s_high = (p95 - p50) / z5
    below = p5 + (z + z5) * s_low
    above = p95 + (z - z5) * s_high
    mid_lo = p5 + (u - 0.05) * a
    mid_hi = p50 + (u - 0.5) * b
    return np.where(u <= 0.05, below, np.where(u <= 0.5, mid_lo,
                     np.where(u <= 0.95, mid_hi, above)))


def fit_bmi(c, p):
    m = p[p.imc.notna()].copy()
    m["age"] = m.idade
    m["age2"] = (m.idade - 45) ** 2
    m["z_edu"] = np.nan
    m["z_inc"] = np.nan
    for (sx, grp), g in m.groupby(["sex", "grp"]):
        m.loc[g.index, "z_edu"] = wz(g.edu_anos, g.peso_antro)
        m.loc[g.index, "z_inc"] = wz(g.log_pc, g.peso_antro)
    m = m.dropna(subset=["z_edu", "z_inc", "imc"])
    X = np.column_stack([np.ones(len(m)), m.sex, (m.idade - 45) / 10,
                         ((m.idade - 45) / 10) ** 2, m.z_edu, m.z_inc,
                         (m.ano == 2019).astype(float)])
    y = np.log(m.imc.to_numpy())
    w = m.peso_antro.to_numpy()
    XtW = X.T * w
    beta = np.linalg.solve(XtW @ X, XtW @ y)
    resid = y - X @ beta
    return {"beta": beta.tolist(), "sigma": float(np.sqrt(wmean(resid ** 2, w))), "n": int(len(m))}


def apply_bmi(c, model, obesity_rate):
    c = c.copy()
    age = c.band.map(AGE_MID).astype(float)
    z_edu = np.zeros(len(c)); z_inc = np.zeros(len(c))
    for (sx, bd), g in c.groupby(["sex", "band"]):
        z_edu[g.index] = wz(g.edu_anos, g.w)
        z_inc[g.index] = wz(g.log_pc, g.w)
    X = np.column_stack([np.ones(len(c)), c.sex, (age - 45) / 10, ((age - 45) / 10) ** 2,
                         z_edu, z_inc, np.zeros(len(c))])
    pred = X @ np.array(model["beta"]) + RNG.normal(0, model["sigma"], len(c))
    grp_map = {0: "18-24", 1: "18-24", 2: "25-39", 3: "25-39", 4: "25-39",
               5: "40-59", 6: "40-59", 7: "40-59", 8: "40-59",
               9: "60+", 10: "60+", 11: "60+"}
    c["grp"] = c.band.map(grp_map)
    bmi = np.empty(len(c))
    for (sx, grp), pos in c.groupby(["sex", "grp"]).indices.items():
        rate = obesity_rate[(sx, grp)]
        q = wquantile(pred[pos], 1 - rate, c["w"].to_numpy()[pos])
        delta = np.log(30) - q
        bmi[pos] = np.exp(pred[pos] + delta)
    c["bmi"] = np.clip(bmi, 15, 55)
    cat_b = np.where(c.bmi < 18.5, 0, np.where(c.bmi < 25, 1, np.where(c.bmi < 30, 2, 3)))
    c["bmi_cat"] = cat_b
    return c


def apply_smoking(c, p):
    m = p[p.fumante.notna()].copy()
    rate = shrink_rates(m, ["sex", "grp5", "edu4"], "fumante", alpha=20)
    c = c.copy()
    c["grp5"] = c.band.map(lambda b: "20-29" if b <= 1 else "30-39" if b <= 3 else
                           "40-49" if b <= 5 else "50-59" if b <= 7 else "60+")
    keys = list(zip(c.sex, c.grp5, c.edu4))
    prob = np.array([rate.get(k, 0.12) for k in keys])
    c["smoke"] = (RNG.random(len(c)) < prob).astype(int)
    return c, rate


def apply_men_children(c, p, target_rates):
    m = p[(p.sex == 0) & p.tem_filho.notna()].copy()
    m["grp5"] = pd.cut(m.idade, [19, 29, 39, 49, 59, 120],
                       labels=["20-29", "30-39", "40-49", "50-59", "60+"]).astype(str)
    rate = shrink_rates(m, ["grp5", "civil3", "edu4"], "tem_filho", alpha=20)
    c = c.copy()
    c["kids"] = 0
    c.loc[c.sex == 1, "kids"] = c.loc[c.sex == 1, "kids_w"].fillna(0).map(
        lambda x: 0 if x <= 0 else (1 if x == 1 else 2)).astype(int)
    mask = c.sex == 0
    keys = list(zip(c.loc[mask, "grp5"], c.loc[mask, "marital"], c.loc[mask, "edu4"]))
    prob = np.array([rate.get(k, 0.4) for k in keys])
    has = (RNG.random(mask.sum()) < prob).astype(int)
    # calibra por grupo de idade para a tabela 8303
    tmp = c[mask].copy()
    tmp["has"] = has
    for grp, target in target_rates.items():
        idx = tmp.grp5 == grp
        if idx.sum() == 0:
            continue
        cur = np.average(tmp.loc[idx, "has"], weights=tmp.loc[idx, "w"])
        if 0 < cur < 1 and 0 < target < 1:
            shift = np.log(target / (1 - target)) - np.log(cur / (1 - cur))
            pr = 1 / (1 + np.exp(-(np.log(np.clip(prob[idx] / (1 - prob[idx]), 1e-6, 1e6)) + shift)))
            has[np.where(idx)[0]] = (RNG.random(idx.sum()) < pr).astype(int)
    n2 = RNG.random(mask.sum()) < 0.55
    kids = np.where(has == 0, 0, np.where(n2, 2, 1))
    c.loc[mask, "kids"] = kids
    return c, rate


def apply_car(c, p):
    m = p[(p.tem_carro.notna()) & (p.idade >= 20)].copy()
    m["dec"] = pd.qcut(m.renda_pc.rank(method="first"), 10, labels=False)
    rate = shrink_rates(m, ["regiao", "dec", "situacao"], "tem_carro", alpha=25)
    c = c.copy()
    # decis de renda domiciliar per capita (ponderados) na base do Censo
    cuts = np.array([wquantile(c.renda_pc2022.to_numpy(), q, c.w.to_numpy())
                     for q in np.linspace(0.1, 0.9, 9)])
    c["dec"] = np.searchsorted(cuts, c.renda_pc2022.to_numpy(), side="right")
    c["dec"] = np.clip(c["dec"], 0, 9)
    c["situacao"] = np.where(c.urban == 1, 1.0, 2.0)
    keys = list(zip(c.regiao, c.dec, c.situacao))
    prob = np.array([rate.get(k, rate.mean()) for k in keys])
    c["car"] = (RNG.random(len(c)) < prob).astype(int)
    return c, rate


def fill_home(c):
    c = c.copy()
    miss = c.home.isna()
    c["home"] = c.home.fillna(0).astype(int)
    if miss.any():
        m = c[~miss]
        rate = shrink_rates(m, ["uf", "dec", "urban"], "home", alpha=30, weight="w")
        keys = list(zip(c.loc[miss, "uf"], c.loc[miss, "dec"], c.loc[miss, "urban"]))
        prob = np.array([rate.get(k, rate.mean()) for k in keys])
        c.loc[miss, "home"] = (RNG.random(len(prob)) < prob).astype(int)
    return c


# --------------------------------------------------------------------- validacao
def validation(c, p, height_pct, obesity_rate, pop_ref):
    out = {}
    # populacao por UF x sexo
    pop = c.groupby(["uf", "sex"]).w.sum() / 1e6
    ref = pd.Series({k: v / 1e6 for k, v in pop_ref.items()})
    comp = pd.DataFrame({"estimado": pop, "censo": ref}).dropna()
    comp["erro_pct"] = (comp.estimado / comp.censo - 1) * 100
    out["populacao_uf_sexo"] = {
        "total_estimado_mi": float(c.w.sum() / 1e6),
        "total_censo_mi": float(sum(pop_ref.values()) / 1e6),
        "erro_medio_abs_pct": float(comp.erro_pct.abs().mean()),
        "erro_max_abs_pct": float(comp.erro_pct.abs().max()),
    }
    # altura
    alt = {}
    for sx in [0, 1]:
        for grp in ["18-24", "25-39", "40-59", "60+"]:
            g = c[(c.sex == sx) & (c.grp == grp)]
            if len(g) == 0:
                continue
            q = wquantile(g.altura, [0.05, 0.5, 0.95], g.w)
            alt[f"{sx}-{grp}"] = {"estimado": [round(float(x), 1) for x in q],
                                  "oficial": [round(float(x), 1) for x in height_pct[(sx, grp)]]}
    out["altura_percentis"] = alt
    # obesidade
    ob = {}
    for sx in [0, 1]:
        for grp in ["18-24", "25-39", "40-59", "60+"]:
            g = c[(c.sex == sx) & (c.grp == grp)]
            ob[f"{sx}-{grp}"] = {"estimado": round(float(np.average(g.bmi_cat == 3, weights=g.w)) * 100, 1),
                                 "oficial": round(float(obesity_rate[(sx, grp)]) * 100, 1)}
    out["obesidade"] = ob
    # fumo e carro contra estimativas ponderadas da PNS
    out["fumo"] = {
        "estimado": round(float(np.average(c.smoke, weights=c.w)) * 100, 1),
        "pns": round(float(np.average(p.fumante.dropna(), weights=p.loc[p.fumante.notna(), "peso_pessoa"])) * 100, 1),
    }
    pc = p[p.tem_carro.notna() & p.peso_pessoa.notna() & (p.idade >= 20)]
    out["carro"] = {
        "estimado": round(float(np.average(c.car, weights=c.w)) * 100, 1),
        "pns": round(float(np.average(pc.tem_carro, weights=pc.peso_pessoa)) * 100, 1),
    }
    mm = c[c.dom.notna()]
    out["casa_propria"] = {
        "estimado": round(float(np.average(c.home, weights=c.w)) * 100, 1),
        "oficial": round(float(np.average(mm.home, weights=mm.w)) * 100, 1),
    }
    out["sem_filhos"] = {
        "homens_pct": round(float(np.average(c.loc[c.sex == 0, "kids"] == 0,
                                             weights=c.loc[c.sex == 0, "w"])) * 100, 1),
        "mulheres_pct": round(float(np.average(c.loc[c.sex == 1, "kids"] == 0,
                                               weights=c.loc[c.sex == 1, "w"])) * 100, 1),
    }
    return out


def marginals(c):
    out = {}
    for sx, nome in [(0, "homens"), (1, "mulheres")]:
        g = c[c.sex == sx]
        out[nome] = {
            "populacao": float(g.w.sum()),
            "idade": [float(g.loc[g.band == i, "w"].sum()) for i in range(12)],
            "escolaridade": [float(g.loc[g.edu4 == i, "w"].sum()) for i in range(4)],
            "estado_civil": [float(g.loc[g.marital == i, "w"].sum()) for i in range(3)],
            "filhos": [float(g.loc[g.kids == i, "w"].sum()) for i in range(3)],
            "imc": [float(g.loc[g.bmi_cat == i, "w"].sum()) for i in range(4)],
            "fuma": float(g.loc[g.smoke == 1, "w"].sum()),
            "carro": float(g.loc[g.car == 1, "w"].sum()),
            "casa": float(g.loc[g.home == 1, "w"].sum()),
            "raca": [float(g.loc[g.raca == i, "w"].sum()) for i in range(5)],
            "altura_media": float(np.average(g.altura, weights=g.w)),
        }
        inc = g[["renda2025", "w"]].to_numpy()
        order = np.argsort(inc[:, 0])
        vals = inc[order, 0]; ws = inc[order, 1]
        cw = np.cumsum(ws) / ws.sum()
        out[nome]["renda_quantis"] = [float(np.interp(q, cw, vals)) for q in
                                      [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 0.95, 0.99]]
    out["ufs"] = [{"uf": u, "nome": UF_NOME[u],
                   "pop": float(c.loc[c.uf == u, "w"].sum())} for u in UFS]
    return out


def main():
    cen, pns, pnad, pns13 = load()
    c = prep_censo(cen).reset_index(drop=True)
    p = prep_pns(pns).reset_index(drop=True)
    p13 = prep_pns2013(pns13).reset_index(drop=True)
    p19 = p[(p.altura.notna()) & (p.peso_antro > 0)].copy()
    p19["ano"] = 2019
    anth = pd.concat([p13, p19], ignore_index=True)
    print("antropometria combinada:", len(anth), "| 2013:", int((anth.ano == 2013).sum()), "| 2019:", int((anth.ano == 2019).sum()))
    print("base censo:", len(c), "| pns:", len(p))

    # tabelas oficiais
    hp = {}
    grp_map = {"18 a 24 anos": "18-24", "25 a 39 anos": "25-39",
               "40 a 59 anos": "40-59", "60 anos ou mais": "60+"}
    for r in sidra_rows("altura_pns2019"):
        sx = 0 if cat(r, "2") == "Homens" else 1
        grp = grp_map.get(cat(r, "58"))
        if grp is None:
            continue
        name = r["variavel"]
        if "Percentil 5 " in name:
            key = "p5"
        elif "Percentil 50" in name:
            key = "p50"
        elif "Percentil 95" in name:
            key = "p95"
        else:
            continue
        hp.setdefault((sx, grp), {})[key] = num(r["valores"])
    height_pct = {k: (v["p5"], v["p50"], v["p95"]) for k, v in hp.items()}

    # mapeamento explicito de grupos
    ob = {}
    for r in sidra_rows("obesidade_pns2019"):
        if "obesidade" not in r["variavel"]:
            continue
        sx = 0 if cat(r, "2") == "Homens" else 1
        grp = {"18 a 24 anos": "18-24", "25 a 39 anos": "25-39",
               "40 a 59 anos": "40-59", "60 anos ou mais": "60+"}.get(cat(r, "58"))
        if grp:
            ob[(sx, grp)] = num(r["valores"]) / 100

    men_targets = {}
    for r in sidra_rows("filhos_homens_pns2019"):
        if cat(r, "1") != "Total":
            continue
        grp = {"15 a 29 anos": "20-29", "30 a 39 anos": "30-39",
               "40 a 59 anos": "40-49", "60 anos ou mais": "60+"}.get(cat(r, "58"))
        if grp:
            men_targets[grp] = num(r["valores"]) / 100
    men_targets["50-59"] = men_targets.get("40-49", 0.85)

    pop_ref = {}
    for r in sidra_rows("populacao_2022_uf"):
        uf = r["localidade_id"]
        sx = 0 if cat(r, "2") == "Homens" else 1
        pop_ref[(uf, sx)] = pop_ref.get((uf, sx), 0) + num(r["valores"])
    print("pop ref 20-79:", sum(pop_ref.values()) / 1e6)

    # modelos fixos entre as imputacoes; a incerteza vem das imputacoes e do bootstrap da PNAD
    hm = fit_height(c, anth)
    bm = fit_bmi(c, anth)
    print("altura modelo:", hm["n"], "| coef:", hm["beta_edu"], hm["beta_renda"], hm["beta_ano2019"])

    variants = []
    c0 = None
    for mi in range(5):
        globals()["RNG"] = np.random.default_rng(20221106 + mi)
        pnad_m = pnad if mi == 0 else pnad.sample(
            frac=1, replace=True, random_state=20221106 + mi).reset_index(drop=True)
        cm = map_income(c.copy(), pnad_m)
        cm = apply_height(cm, hm, height_pct)
        cm = apply_bmi(cm, bm, ob)
        cm, smoke_rate = apply_smoking(cm, p)
        cm, kids_rate = apply_men_children(cm, p, men_targets)
        cm, car_rate = apply_car(cm, p)
        cm = fill_home(cm)
        if mi == 0:
            c0 = cm
        else:
            variants.append({
                "height": np.clip(cm.altura.round().astype(int), 130, 220).astype(np.uint8),
                "bmi": cm.bmi_cat.astype(np.uint8).to_numpy(),
                "smoke": cm.smoke.astype(np.uint8).to_numpy(),
                "kids": cm.kids.astype(np.uint8).to_numpy(),
                "car": cm.car.astype(np.uint8).to_numpy(),
                "income": cm.renda2025.astype("<f4").to_numpy(),
            })
        print(f"  imputacao {mi + 1}/5: altura {np.average(cm.altura, weights=cm.w):.2f} cm | "
              f"obesidade {np.average(cm.bmi_cat == 3, weights=cm.w) * 100:.1f}% | "
              f"fumo {np.average(cm.smoke, weights=cm.w) * 100:.1f}%")
    c = c0

    # validacao e marginais (imputacao 1)
    val = validation(c, p, height_pct, ob, pop_ref)
    marg = marginals(c)
    print("populacao final:", f"{c.w.sum()/1e6:.2f} mi")
    print("altura media:", round(float(np.average(c.altura, weights=c.w)), 1))
    print("obesidade:", round(float(np.average(c.bmi_cat == 3, weights=c.w)) * 100, 1))
    print("fumo:", round(float(np.average(c.smoke, weights=c.w)) * 100, 1))
    print("carro:", round(float(np.average(c.car, weights=c.w)) * 100, 1))
    print("casa:", round(float(np.average(c.home, weights=c.w)) * 100, 1))

    # ------------------------------------------------------------------ binario
    n = len(c)
    base = np.zeros((n, 20), dtype=np.uint8)
    base[:, 0] = c.uf_idx.to_numpy()
    base[:, 1] = c.sex.to_numpy()
    base[:, 2] = c.band.to_numpy()
    base[:, 3] = c.raca.to_numpy()
    base[:, 4] = c.edu4.to_numpy()
    base[:, 5] = c.marital.to_numpy()
    base[:, 6] = c.kids.to_numpy()
    base[:, 7] = c.smoke.to_numpy()
    base[:, 8] = c.bmi_cat.to_numpy()
    base[:, 9] = c.car.to_numpy()
    base[:, 10] = c.home.to_numpy()
    base[:, 11] = np.clip(c.altura.round().astype(int), 130, 220).to_numpy()
    inc = c.renda2025.astype("<f4").to_numpy()
    base[:, 12:16] = inc.view(np.uint8).reshape(n, 4)
    w = c.w.astype("<f4").to_numpy()
    base[:, 16:20] = w.view(np.uint8).reshape(n, 4)
    with open(os.path.join(DATA, "population.bin"), "wb") as f:
        base.tofile(f)
        for v in variants:
            aux = np.zeros((n, 9), dtype=np.uint8)
            aux[:, 0] = v["height"]
            aux[:, 1] = v["bmi"]
            aux[:, 2] = v["smoke"]
            aux[:, 3] = v["kids"]
            aux[:, 4] = v["car"]
            inc_v = np.asarray(v["income"], dtype="<f4")
            aux[:, 5:9] = inc_v.view(np.uint8).reshape(n, 4)
            aux.tofile(f)
    print("binario:", os.path.getsize(os.path.join(DATA, "population.bin")) / 1e6, "MB | 5 imputacoes")

    meta = {
        "gerado_em": "2026-11-06",
        "n_registros": int(n),
        "populacao": float(c.w.sum()),
        "idade_min": 20, "idade_max": 79,
        "ufs": [{"codigo": u, "nome": UF_NOME[u], "regiao": UF_REGIAO[u]} for u in UFS],
        "faixas_idade": BANDS,
        "escolaridade": EDU_LABEL,
        "estado_civil": MARITAL_LABEL,
        "filhos": ["Nenhum", "Um", "Dois ou mais"],
        "imc": BMI_LABEL,
        "raca": RACA_LABEL,
        "renda_ano_referencia": 2025,
        "n_imputacoes": 5,
        "layout_version": 2,
        "modelos": {"altura": hm, "imc": {"beta": bm["beta"], "sigma": bm["sigma"], "n": bm["n"]}},
        "totais": {
            "homens": float(c.loc[c.sex == 0, "w"].sum()),
            "mulheres": float(c.loc[c.sex == 1, "w"].sum()),
        },
    }
    with open(os.path.join(DATA, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, "marginais.json"), "w", encoding="utf-8") as f:
        json.dump(marg, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DATA, "validacao.json"), "w", encoding="utf-8") as f:
        json.dump(val, f, ensure_ascii=False, indent=1)
    print("ok")


if __name__ == "__main__":
    main()
