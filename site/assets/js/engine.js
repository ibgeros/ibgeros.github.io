/* Motor de cálculo: uma passada sobre a base, máscaras de bits por pessoa. */
export const AGE_BANDS = ["20-24", "25-29", "30-34", "35-39", "40-44", "45-49",
  "50-54", "55-59", "60-64", "65-69", "70-74", "75-79"];

export const RENDA_STEPS = [0, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000,
  8000, 10000, 12000, 15000, 20000, 25000, 30000, 50000];

export const EDU_OPTS = ["Qualquer", "Ensino médio completo", "Ensino superior completo"];
export const MARITAL_OPTS = ["Qualquer", "Não está em união", "Nunca viveu em união"];
export const BMI_OPTS = ["Qualquer", "Não obeso", "IMC saudável (18,5–25)"];
export const RACA_NAMES = ["Branca", "Preta", "Amarela", "Parda", "Indígena"];

export const ORDER = ["age", "altura", "renda", "edu", "marital", "kids", "bmi",
  "smoke", "car", "home", "race"];

export const LABELS = {
  age: "Idade", altura: "Altura", renda: "Renda", edu: "Escolaridade",
  marital: "Estado civil", kids: "Filhos", bmi: "IMC", smoke: "Fuma",
  car: "Carro", home: "Casa própria", race: "Cor/raça",
};

export function isActive(state, key) {
  switch (key) {
    case "age": return state.ageMin > 0 || state.ageMax < 11;
    case "altura": return state.altura > 150;
    case "renda": return state.renda > 0;
    case "edu": return state.edu > 0;
    case "marital": return state.marital > 0;
    case "kids": return state.kids === true;
    case "bmi": return state.bmi > 0;
    case "smoke": return state.smoke === true;
    case "car": return state.car === true;
    case "home": return state.home === true;
    case "race": return Array.isArray(state.race) && state.race.length > 0;
    default: return false;
  }
}

export function describe(state, key) {
  switch (key) {
    case "age":
      return state.ageMin === state.ageMax
        ? `${AGE_BANDS[state.ageMin]} anos`
        : `${AGE_BANDS[state.ageMin].split("-")[0]} a ${AGE_BANDS[state.ageMax].split("-")[1]} anos`;
    case "altura": return state.altura <= 150 ? "Qualquer" : `${state.altura} cm ou mais`;
    case "renda": return state.renda > 0 ? `${fmtMoney(state.renda)} ou mais` : "Qualquer";
    case "edu": return EDU_OPTS[state.edu];
    case "marital": return MARITAL_OPTS[state.marital];
    case "kids": return state.kids ? "Sem filhos" : "Qualquer";
    case "bmi": return BMI_OPTS[state.bmi];
    case "smoke": return state.smoke ? "Não fuma" : "Qualquer";
    case "car": return state.car ? "Tem carro" : "Qualquer";
    case "home": return state.home ? "Casa própria" : "Qualquer";
    case "race":
      return state.race.length ? state.race.map((r) => RACA_NAMES[r]).join(" ou ") : "Qualquer";
    default: return "";
  }
}

/* predicao de um filtro para o registro i */
function pass(data, state, key, i) {
  switch (key) {
    case "age": return data.band[i] >= state.ageMin && data.band[i] <= state.ageMax;
    case "altura": return data.height[i] >= state.altura;
    case "renda": return data.income[i] >= state.renda;
    case "edu": return state.edu === 0 ? true : data.edu[i] >= (state.edu === 1 ? 2 : 3);
    case "marital": return state.marital === 0 ? true : (state.marital === 1 ? data.marital[i] !== 0 : data.marital[i] === 2);
    case "kids": return data.kids[i] === 0;
    case "bmi": return state.bmi === 0 ? true : (state.bmi === 1 ? data.bmi[i] < 3 : data.bmi[i] === 1);
    case "smoke": return data.smoke[i] === 0;
    case "car": return data.car[i] === 1;
    case "home": return data.home[i] === 1;
    case "race": return state.race.length === 0 ? true : state.race.includes(data.race[i]);
    default: return true;
  }
}

export function matchAll(data, state) {
  const { n, sex, uf } = data;
  const ufIdx = state.uf === "BR" ? -1 : data.ufIndex.get(state.uf);
  const active = ORDER.filter((k) => isActive(state, k));
  let count = 0, nRec = 0;
  for (let i = 0; i < n; i++) {
    if (sex[i] !== state.sex) continue;
    if (ufIdx >= 0 && uf[i] !== ufIdx) continue;
    let ok = true;
    for (let j = 0; j < active.length; j++) {
      if (!pass(data, state, active[j], i)) { ok = false; break; }
    }
    if (ok) { count += data.weight[i]; nRec++; }
  }
  return { count, n: nRec };
}

export function compute(data, state) {
  const { n, sex, uf, band, weight } = data;
  const ufIdx = state.uf === "BR" ? -1 : data.ufIndex.get(state.uf);
  const active = ORDER.filter((k) => isActive(state, k));
  const m = active.length;
  const fullMask = m === 0 ? 0 : (1 << m) - 1;

  let base = 0, baseN = 0, sumw2Base = 0;
  const solo = new Array(m).fill(0);
  const poolWithout = new Array(m).fill(0);
  const poolWithoutN = new Array(m).fill(0);
  const funnel = new Array(m).fill(0);       // apos cada filtro, na ordem
  const geo = new Float64Array(27);
  const ageMatch = new Float64Array(12);
  const ageRef = new Float64Array(12);
  let match = 0, matchN = 0, sumw2 = 0;

  for (let i = 0; i < n; i++) {
    if (sex[i] !== state.sex) continue;
    if (ufIdx >= 0 && uf[i] !== ufIdx) continue;
    const w = weight[i];
    base += w; baseN++; sumw2Base += w * w;
    ageRef[band[i]] += w;
    if (m === 0) {
      match += w; matchN++; sumw2 += w * w;
      geo[uf[i]] += w; ageMatch[band[i]] += w;
      continue;
    }
    let mask = 0;
    for (let j = 0; j < m; j++) {
      if (pass(data, state, active[j], i)) mask |= (1 << j);
    }
    for (let j = 0; j < m; j++) if (mask & (1 << j)) solo[j] += w;
    // funil: prefixos
    let pref = 0;
    for (let j = 0; j < m; j++) {
      if (mask & (1 << j)) pref |= (1 << j);
      else break;
      funnel[j] += w;
    }
    // todas as combinacoes "sem um filtro"
    for (let j = 0; j < m; j++) {
      if ((mask & ~(1 << j)) === (fullMask & ~(1 << j))) {
        poolWithout[j] += w; poolWithoutN[j]++;
      }
    }
    if (mask === fullMask) {
      match += w; matchN++; sumw2 += w * w;
      geo[uf[i]] += w; ageMatch[band[i]] += w;
    }
  }

  const neffBase = sumw2Base > 0 ? (base * base) / sumw2Base : 0;
  const share = base > 0 ? match / base : 0;
  const se = neffBase > 0 ? Math.sqrt(Math.max(share * (1 - share), 0) / neffBase) : 0;
  const ci95 = 1.96 * se * base;

  const filters = active.map((key, j) => ({
    key,
    label: LABELS[key],
    value: describe(state, key),
    solo: base > 0 ? solo[j] / base : 0,
    without: poolWithout[j],
    withoutN: poolWithoutN[j],
    ratio: match > 0 ? poolWithout[j] / match : Infinity,
    after: funnel[j],
  }));

  // prevalencia de cada criterio isolado na populacao de referencia
  const marg = {};
  for (const key of ORDER) marg[key] = 0;
  let sumRef = 0;
  for (let i = 0; i < n; i++) {
    if (sex[i] !== state.sex) continue;
    if (ufIdx >= 0 && uf[i] !== ufIdx) continue;
    const w = weight[i];
    sumRef += w;
    for (const key of ORDER) if (pass(data, state, key, i)) marg[key] += w;
  }
  for (const key of ORDER) marg[key] = sumRef > 0 ? marg[key] / sumRef : 0;

  const score = scoreFor(share);
  const alternatives = buildAlternatives(data, state, match);

  return {
    base, baseN, match, matchN, share, neff: neffBase, ci95, score, marginals: marg,
    upper95: match === 0 && neffBase > 0 ? 3 * base / neffBase : null,
    filters, funnel: buildFunnel(base, filters),
    geo: Array.from(geo),
    ageMatch: Array.from(ageMatch),
    ageRef: Array.from(ageRef),
    alternatives,
    oneIn: share > 0 ? 1 / share : Infinity,
  };
}

function buildFunnel(base, filters) {
  const rows = [{ label: "Base", count: base, delta: null }];
  let prev = base;
  for (const f of filters) {
    rows.push({ label: f.label, count: f.after, delta: prev > 0 ? f.after / prev - 1 : 0 });
    prev = f.after;
  }
  return rows;
}

function buildAlternatives(data, state, current) {
  const out = [];
  const consider = (label, next, key) => {
    if (!isActive(state, key)) return;
    const c = matchAll(data, next).count;
    if (c > current) out.push({ label, count: c, gain: c - current, ratio: current > 0 ? c / current : Infinity });
  };
  if (isActive(state, "altura") && state.altura > 155) {
    consider(`Altura ${state.altura - 5} cm`, { ...state, altura: state.altura - 5 }, "altura");
  }
  if (isActive(state, "renda") && state.renda > 0) {
    const idx = RENDA_STEPS.indexOf(state.renda);
    if (idx > 0) consider(`Renda ${fmtMoney(RENDA_STEPS[idx - 1])}`, { ...state, renda: RENDA_STEPS[idx - 1] }, "renda");
  }
  if (isActive(state, "age")) {
    const next = { ...state, ageMin: Math.max(0, state.ageMin - 1), ageMax: Math.min(11, state.ageMax + 1) };
    consider("Faixa de idade mais ampla", next, "age");
  }
  if (isActive(state, "edu") && state.edu > 0) {
    consider("Escolaridade menor", { ...state, edu: state.edu - 1 }, "edu");
  }
  if (isActive(state, "bmi") && state.bmi === 2) {
    consider("Aceitar não obeso", { ...state, bmi: 1 }, "bmi");
  }
  out.sort((a, b) => b.ratio - a.ratio);
  return out.slice(0, 2);
}

export function scoreFor(share) {
  if (!(share > 0)) return 10;
  const s = Math.round(2.2 * (-Math.log10(share)) - 0.6);
  return Math.max(0, Math.min(10, s));
}

export function scoreLabel(score) {
  if (score <= 2) return ["tá fácil", "Tem gente de sobra"];
  if (score <= 4) return ["seletivo", "Dá pra garimpar"];
  if (score <= 6) return ["garimpo", "Já é um nicho"];
  if (score <= 8) return ["agulha no palheiro", "Pouca gente no país inteiro"];
  return ["modo Xuxa", "No Brasil não há. Ou quase."];
}

/* ------------------------------------------------------------ formatação */
export function fmtInt(n) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(n));
}
export function fmtCompact(n) {
  if (n >= 1e9) return (n / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " bi";
  if (n >= 1e6) return (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi";
  if (n >= 1e3) return (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: n >= 1e5 ? 0 : 1 }) + " mil";
  return fmtInt(n);
}
export function fmtMoney(n) {
  return "R$ " + new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}
export function fmtPct(p) {
  if (!(p > 0)) return "0%";
  const v = p * 100;
  if (v >= 1) return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  if (v >= 0.1) return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
  return v.toLocaleString("pt-BR", { minimumSignificantDigits: 2, maximumSignificantDigits: 2 }) + "%";
}
export function fmtRatio(x) {
  if (!isFinite(x)) return "∞";
  return x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "×";
}
export function fmtSignedPct(p) {
  if (!isFinite(p)) return "—";
  const v = p * 100;
  const sign = v > 0 ? "+" : "";
  return sign + v.toLocaleString("pt-BR", { maximumFractionDigits: v > -10 ? 1 : 0 }) + "%";
}
export function fmtOneIn(x) {
  if (!isFinite(x)) return "—";
  if (x < 2) return "1 em 1";
  if (x >= 1e6) return "1 em " + (x / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
  return "1 em " + fmtInt(x);
}
