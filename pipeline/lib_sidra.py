"""Utilitarios para consultar a API de agregados do IBGE (SIDRA v3) e cachear respostas.

Toda consulta feita aqui gera um arquivo em data/raw_sidra/ com a resposta bruta,
para que o build seja reproduzivel e auditavel offline.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

BASE = "https://servicodados.ibge.gov.br/api/v3/agregados"
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw_sidra")


def _cache_path(name: str) -> str:
    os.makedirs(RAW_DIR, exist_ok=True)
    return os.path.join(RAW_DIR, f"{name}.json")


def fetch_agregado(table: str, period: str, variables: list[str],
                   localidades: str, classificacao: str | None = None,
                   cache_name: str | None = None, force: bool = False) -> list[dict]:
    """Baixa (ou le do cache) um agregado do SIDRA.

    localidades: ex. "N3[all]" ou "N1[all]"
    classificacao: ex. "2[4,5]|287[93087,93088]"
    """
    qs = [f"localidades={urllib.parse.quote(localidades, safe='[]')}"]
    if classificacao:
        qs.append(f"classificacao={urllib.parse.quote(classificacao, safe='[]|,')}")
    url = f"{BASE}/{table}/periodos/{period}/variaveis/{','.join(variables)}?" + "&".join(qs)
    name = cache_name or f"{table}_{period}"
    path = _cache_path(name)
    if force or not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": "delusionometro-br/1.0 (pesquisa)"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        payload = {"url": url, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "data": payload}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)
        print("  baixado:", name, len(json.dumps(payload)), "bytes")
    with open(path, encoding="utf-8") as f:
        cached = json.load(f)
    return cached["data"] if isinstance(cached, dict) and "data" in cached else cached


def flatten(payload: list[dict]) -> list[dict]:
    """Converte a resposta aninhada do SIDRA em linhas planas."""
    out = []
    for var in payload:
        for res in var.get("resultados", []):
            cls = {c["id"]: {"nome": c["nome"], "categoria": c["categoria"]}
                   for c in res.get("classificacoes", [])}
            for ser in res.get("series", []):
                loc = ser["localidade"]
                for period, value in ser["serie"].items():
                    out.append({
                        "variavel_id": var["id"],
                        "variavel": var["variavel"],
                        "unidade": var.get("unidade"),
                        "periodo": period,
                        "localidade_id": loc["id"],
                        "localidade": loc["nome"],
                        "nivel": loc.get("nivel", {}).get("id"),
                        "valores": value,
                        "classificacoes": cls,
                    })
    return out


def cat(row: dict, class_id: str) -> str | None:
    c = row["classificacoes"].get(class_id)
    if not c:
        return None
    # categoria tem normalmente uma unica chave
    return next(iter(c["categoria"].values()), None)


def cat_id(row: dict, class_id: str) -> str | None:
    c = row["classificacoes"].get(class_id)
    if not c:
        return None
    return next(iter(c["categoria"].keys()), None)


def num(value: str | None) -> float | None:
    if value in (None, "", "...", "..", "-", "X"):
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None
