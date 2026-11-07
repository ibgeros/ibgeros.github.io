import { loadData } from "./data.js";
import {
  compute, matchAll, scoreFor, AGE_BANDS, RENDA_STEPS, LABELS, describe,
  fmtInt, fmtCompact, fmtMoney, fmtPct, fmtSignedPct, fmtOneIn, fmtRatio, scoreLabel,
} from "./engine.js";
import { hbar, groupedBars } from "./charts.js";
import { buildShareCard } from "./sharecard.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const isMobile = () => matchMedia("(max-width: 760px)").matches;
const SHARE_ORIGIN = "https://ibgeros-og.vercel.app";

const DEFAULT = {
  sex: 0, uf: "BR", ageMin: 1, ageMax: 3, altura: 175, renda: 3000,
  edu: 0, marital: 0, kids: false, bmi: 0, smoke: false, car: false,
  home: false, race: [],
};

let data = null;
let state = { ...DEFAULT };
let last = { computed: null };
let countGen = 0;

/* ------------------------------------------------------------- URL state */
function parseURL() {
  const p = new URLSearchParams(location.search);
  const s = { ...DEFAULT };
  if (p.has("sex")) s.sex = p.get("sex") === "1" ? 1 : 0;
  if (p.has("uf")) s.uf = p.get("uf");
  if (p.has("age")) {
    const [a, b] = p.get("age").split("-").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && a <= b) { s.ageMin = a; s.ageMax = b; }
  }
  if (p.has("h")) s.altura = Math.min(200, Math.max(150, Number(p.get("h")) || 175));
  if (p.has("r")) s.renda = Math.min(50000, Math.max(0, Number(p.get("r")) || 0));
  if (p.has("e")) s.edu = Number(p.get("e")) || 0;
  if (p.has("m")) s.marital = Number(p.get("m")) || 0;
  s.kids = p.get("kids") === "1";
  s.smoke = p.get("smoke") === "1";
  s.car = p.get("car") === "1";
  s.home = p.get("home") === "1";
  s.bmi = Number(p.get("bmi")) || 0;
  if (p.has("race")) s.race = p.get("race").split(",").map(Number).filter((x) => x >= 0 && x <= 4);
  return s;
}

function syncURL() {
  const p = new URLSearchParams();
  p.set("sex", String(state.sex));
  if (state.uf !== "BR") p.set("uf", state.uf);
  p.set("age", `${state.ageMin}-${state.ageMax}`);
  p.set("h", String(state.altura));
  p.set("r", String(state.renda));
  if (state.edu) p.set("e", String(state.edu));
  if (state.marital) p.set("m", String(state.marital));
  if (state.kids) p.set("kids", "1");
  if (state.smoke) p.set("smoke", "1");
  if (state.car) p.set("car", "1");
  if (state.home) p.set("home", "1");
  if (state.bmi) p.set("bmi", String(state.bmi));
  if (state.race.length) p.set("race", state.race.join(","));
  history.replaceState(null, "", `${location.pathname}?${p.toString()}`);
}

/* ------------------------------------------------------------- controles */
function populateUFs() {
  const sel = $("#uf");
  data.meta.ufs.forEach((u) => {
    const o = document.createElement("option");
    o.value = u.codigo;
    o.textContent = u.nome;
    sel.appendChild(o);
  });
}

function setSegmented(group, value) {
  $$(`.segmented[data-filter="${group}"] button`).forEach((b) => {
    b.classList.toggle("is-active", Number(b.dataset.value) === Number(value));
  });
}

function paintControls() {
  setSegmented("sex", state.sex);
  setSegmented("edu", state.edu);
  setSegmented("marital", state.marital);
  setSegmented("bmi", state.bmi);
  $("#uf").value = state.uf;

  const a = $("#ageMin"), b = $("#ageMax");
  a.value = state.ageMin; b.value = state.ageMax;
  $("#ageOut").textContent = describe(state, "age");
  $("#dualFill").style.left = (state.ageMin / 11) * 100 + "%";
  $("#dualFill").style.width = ((state.ageMax - state.ageMin) / 11) * 100 + "%";

  $("#altura").value = state.altura;
  $("#alturaOut").textContent = state.altura <= 150 ? "Qualquer" : `${state.altura} cm`;
  $("#altura").style.setProperty("--fill", ((state.altura - 150) / 50) * 100 + "%");

  const ridx = Math.max(0, RENDA_STEPS.indexOf(state.renda));
  $("#renda").value = ridx;
  $("#rendaOut").textContent = state.renda > 0 ? fmtMoney(state.renda) : "Qualquer";
  $("#renda").style.setProperty("--fill", (ridx / (RENDA_STEPS.length - 1)) * 100 + "%");

  $("#eduOut").textContent = ["Qualquer", "Médio completo", "Superior completo"][state.edu];
  $("#maritalOut").textContent = ["Qualquer", "Não está em união", "Nunca viveu em união"][state.marital];
  $("#bmiOut").textContent = ["Qualquer", "Não obeso", "IMC 18,5–25"][state.bmi];

  const nToggles = [state.kids, state.car, state.home, state.smoke].filter(Boolean).length;
  $("#kidsOut").textContent = nToggles ? `${nToggles} ativo${nToggles > 1 ? "s" : ""}` : "Nenhum";

  for (const [id, key] of [["kids", "kids"], ["car", "car"], ["home", "home"], ["smoke", "smoke"]]) {
    const el = $("#" + id);
    el.setAttribute("aria-pressed", String(!!state[key]));
    el.classList.toggle("is-on", !!state[key]);
  }
  $$("#racaGroup [data-raca]").forEach((b) => {
    const v = Number(b.dataset.raca);
    b.setAttribute("aria-pressed", String(state.race.includes(v)));
  });
}

let renderTimer = null;

function update(patch) {
  state = { ...state, ...patch };
  paintControls();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, 70);
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }

function combineResults(r0, counts, ns) {
  const M = counts.length;
  const base = r0.base;
  const match = mean(counts);
  const matchN = Math.round(mean(ns));
  const share = base > 0 ? match / base : 0;
  const within = Math.pow(r0.ci95 / 1.96, 2);
  const between = M > 1 ? counts.reduce((s, c) => s + (c - match) ** 2, 0) / (M - 1) : 0;
  const ci95 = 1.96 * Math.sqrt(Math.max(0, within + (1 + 1 / M) * between));
  const filters = r0.filters.map((f) => ({ ...f }));
  if (filters.length) filters[filters.length - 1].after = match;
  const funnel = r0.funnel.map((row, i) => ({
    ...row, count: i === r0.funnel.length - 1 ? match : row.count,
  }));
  return {
    ...r0, match, matchN, share, ci95,
    oneIn: share > 0 ? 1 / share : Infinity,
    score: scoreFor(share),
    upper95: match === 0 && r0.neff > 0 ? 3 * base / r0.neff : null,
    filters, funnel,
    counts,
    metaMatch: r0.match,
    minCount: Math.min(...counts),
    maxCount: Math.max(...counts),
    nImputacoes: M,
  };
}

function renderNow() {
  if (!data || !data.datasets) return;
  const prev = last.computed ? last.computed.match : 0;
  const r0 = compute(data.datasets[0], state);
  const others = data.datasets.slice(1).map((d) => matchAll(d, state));
  const counts = [r0.match, ...others.map((x) => x.count)];
  const ns = [r0.matchN, ...others.map((x) => x.n)];
  const r = combineResults(r0, counts, ns);
  last.computed = r;
  renderResult(r, prev);
  renderFunnel(r);
  paintControls();
  syncURL();
}

/* ------------------------------------------------------------- render */
function animateNumber(node, from, to, dur = 420) {
  const gen = ++countGen;
  if (from === to || to === 0) { node.textContent = fmtInt(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    if (gen !== countGen) return;
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    node.textContent = fmtInt(from + (to - from) * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function isRare(r) {
  return r.match === 0 || r.share <= 0.01 || r.match < 100000;
}


function renderResult(r, prevMatch) {
  const isMen = state.sex === 0;
  const gender = isMen ? "homens" : "mulheres";
  const genderSing = isMen ? "homem" : "mulher";
  const genderArticle = isMen ? "dos" : "das";
  const where = state.uf === "BR" ? "no Brasil" : "em " + data.ufName[data.ufIndex.get(state.uf)];

  const countEl = $("#count");
  if (r.match === 0 && r.upper95) {
    countGen++;
    countEl.textContent = "< " + fmtCompact(r.upper95);
  } else {
    animateNumber(countEl, prevMatch, r.match);
  }
  $("#barCount").textContent = r.match === 0 && r.upper95 ? "< " + fmtCompact(r.upper95) : fmtCompact(r.match);
  $("#barLabel").textContent = isRare(r) ? "modo Xuxa ativado" : "seu veredito";

  const ageLabel = describe(state, "age");
  const groupAll = isMen ? "todos os homens" : "todas as mulheres";
  const ageActive = state.ageMin > 0 || state.ageMax < 11;
  const scopeEl = $("#resultScope");
  if (ageActive) {
    scopeEl.hidden = false;
    scopeEl.textContent = `${isMen ? "Homens" : "Mulheres"} de ${ageLabel} ${where}`;
  } else {
    scopeEl.hidden = true;
  }
  $("#subCount").innerHTML = r.share > 0
    ? `<b>${fmtPct(r.share)}</b> de ${groupAll} de 20 a 79 anos ${where} · base de ${fmtCompact(r.base)}`
    : `Nenhum registro na amostra. A estimativa é de <b>menos de ~${fmtCompact(r.upper95 || 0)}</b> pessoas — o IBGE não achou, a Xuxa já sabia.`;

  const rangeEl = $("#rangeText");
  if (r.match > 0 && r.maxCount > r.minCount) {
    rangeEl.hidden = false;
    rangeEl.innerHTML = `<b>${r.nImputacoes} imputações:</b> entre ${fmtInt(r.minCount)} e ${fmtInt(r.maxCount)} pessoas`;
  } else {
    rangeEl.hidden = true;
  }
  $("#oneIn").textContent = r.match > 0 ? fmtOneIn(r.oneIn) : "1 em —";
  $("#oneInLabel").textContent = r.match > 0
    ? `${gender} ${where}`
    : "nem a amostra teve coragem";

  const [label, expl] = scoreLabel(r.score);
  $("#scoreLabel").textContent = `${r.score}/10 · ${label}`;
  $$("#scoreBars span").forEach((s, i) => s.classList.toggle("on", i < r.score));

  const dots = $("#dots");
  if (dots.children.length !== 400) {
    dots.innerHTML = "";
    for (let i = 0; i < 400; i++) dots.appendChild(document.createElement("i"));
  }
  let filled = Math.round(r.share * 400);
  const edge = r.share > 0 && filled === 0;
  if (edge) filled = 1;
  Array.from(dots.children).forEach((d, i) => {
    d.classList.toggle("on", i < filled);
    d.classList.toggle("edge", edge && i === 0);
  });
  $("#dotsCaption").textContent = `cada ponto = 0,25% do grupo · ${expl}`;
  $("#dotsCount").textContent = r.match > 0 ? `≈ ${fmtPct(r.share)} do grupo` : "menos de 1 em 400";

  // meme quando o número é baixo
  const meme = $("#xuxaMeme");
  if (isRare(r)) {
    meme.hidden = false;
    meme.querySelector("img").alt = `Recorte de revista de 1986 com Xuxa e a frase: No Brasil não há ${genderSing} para mim`;
    $("#xuxaQuote").textContent = `“No Brasil não há ${genderSing} para mim.”`;
    $("#xuxaCredit").textContent = isMen
      ? "— Xuxa, 04/86. A gente só digitalizou."
      : "— Xuxa, 04/86, com adaptação livre para quem procura mulher.";
  } else {
    meme.hidden = true;
  }

  // insight
  const activeFilters = r.filters.filter((f) => f.ratio > 1 && isFinite(f.ratio));
  let insight = "";
  if (!r.filters.length) {
    insight = "Zero critérios. O Brasil inteiro. Boa sorte na triagem.";
  } else if (r.match === 0) {
    insight = "Zero. Nem o IBGE achou. A Xuxa estava certa.";
  } else if (activeFilters.length) {
    const top = activeFilters.sort((a, b) => b.ratio - a.ratio)[0];
    insight = `O filtro que mais te machuca é <b>${top.label.toLowerCase()}</b>: sem ele, o pool seria <b>${fmtRatio(top.ratio)}</b> maior.`;
  } else {
    insight = "Os filtros ativos quase não mudam o tamanho do grupo. Aproveita.";
  }
  if (r.alternatives.length && r.match > 0) {
    const alt = r.alternatives[0];
    insight += ` Se você aceitasse ${alt.label.toLowerCase()}, entravam mais <b>${fmtCompact(alt.gain)}</b> pessoas (${fmtRatio(alt.ratio)}).`;
  }
  const ins = $("#insight");
  ins.innerHTML = insight;
  ins.classList.toggle("insight--green", r.match > 0 && r.share > 0.02);

  // margem
  if (r.match > 0 && r.matchN >= 30) {
    $("#ci").textContent = `Margem total (amostragem + imputação): ±${fmtInt(r.ci95)} pessoas (95%) · ${r.nImputacoes} imputações · ${fmtInt(r.matchN)} registros.`;
  } else if (r.match > 0) {
    $("#ci").textContent = `Margem total: ±${fmtInt(r.ci95)} pessoas (95%), mas só ${fmtInt(r.matchN)} registros passam — a margem real é maior.`;
  } else {
    $("#ci").textContent = r.upper95
      ? `Sem registros na amostra. Limite superior conservador: ${fmtInt(r.upper95)} pessoas (regra de três).`
      : "Amostra insuficiente para estimar esta combinação com precisão.";
  }

  updateFilterMeta(r);
  renderImpact(r);
  renderAge(r);
  renderGeo(r);
  renderAudit(r, gender, where);
}

function updateFilterMeta(r) {
  const active = Object.fromEntries(r.filters.map((f) => [f.key, f]));
  const cond = (key) => {
    const f = active[key];
    if (!f || f.without <= 0) return null;
    return (r.metaMatch ?? r.match) / f.without;
  };
  const setRow = (key, metaId, meterId) => {
    const p = cond(key);
    const el = $("#" + metaId);
    if (!el) return;
    if (p === null) {
      el.textContent = "sem restrição";
      $("#" + meterId).style.width = "0%";
    } else {
      el.textContent = `${fmtPct(p)} de quem já passa nos outros critérios`;
      $("#" + meterId).style.width = Math.min(100, p * 100) + "%";
    }
  };
  setRow("age", "ageMeta", "mAge");
  setRow("altura", "alturaMeta", "mAltura");
  setRow("renda", "rendaMeta", "mRenda");
  setRow("edu", "eduMeta", "mEdu");
  setRow("marital", "maritalMeta", "mMarital");
  setRow("bmi", "bmiMeta", "mBmi");

  for (const [id, key] of [["kids", "kids"], ["car", "car"], ["home", "home"], ["smoke", "smoke"]]) {
    const chip = $("#" + id);
    let small = chip.querySelector("small");
    if (!small) { small = document.createElement("small"); chip.appendChild(small); }
    small.textContent = fmtPct(r.marginals[key] || 0);
  }

  const toggles = ["kids", "car", "home", "smoke"].filter((k) => active[k]);
  if (toggles.length) {
    const p = Math.min(...toggles.map((k) => cond(k) ?? 1));
    $("#toggleMeta").textContent = `${toggles.map((k) => LABELS[k].toLowerCase()).join(", ")} · ${fmtPct(p)} passam`;
    $("#mToggle").style.width = Math.min(100, p * 100) + "%";
  } else {
    $("#toggleMeta").textContent = "Filtros opcionais — assuma o risco";
    $("#mToggle").style.width = "0%";
  }
}

function renderFunnel(r) {
  const host = $("#funnel");
  const base = r.funnel[0].count;
  host.innerHTML = "";
  r.funnel.forEach((row, i) => {
    const pct = base > 0 ? row.count / base : 0;
    const w = Math.max(1.2, (Math.log10(Math.max(row.count, 1)) / Math.log10(Math.max(base, 2))) * 100);
    const div = document.createElement("div");
    div.className = "funnel__row" + (i > 0 && pct < 0.2 ? " is-cut" : "");
    div.innerHTML = `
      <div class="funnel__label">${i === 0 ? "Base do grupo" : row.label}</div>
      <div class="funnel__track"><div class="funnel__bar" style="width:${w}%"></div></div>
      <div class="funnel__value">${fmtCompact(row.count)}<span>${i === 0 ? "100%" : fmtPct(pct)} da base</span></div>`;
    host.appendChild(div);
  });
}

function renderImpact(r) {
  const host = $("#impact");
  const rows = r.filters.filter((f) => f.without > 0 && isFinite(f.ratio))
    .sort((a, b) => b.ratio - a.ratio);
  host.innerHTML = "";
  if (!rows.length) {
    host.innerHTML = r.match === 0
      ? '<p class="impact-empty">Sem registros na amostra: não é possível atribuir o corte a um único filtro.</p>'
      : '<p class="impact-empty">Nenhum filtro ativo. O pool é a população inteira.</p>';
    return;
  }
  const max = Math.max(...rows.map((x) => x.ratio), 1.01);
  rows.forEach((f) => {
    const gain = f.without - r.match;
    const div = document.createElement("div");
    div.className = "impact";
    div.innerHTML = `
      <div>
        <div class="impact__name">${f.label} <span style="color:var(--muted);font-weight:400">· ${f.value}</span></div>
        <div class="impact__gain">sem ele: ${fmtCompact(f.without)} pessoas (+${fmtCompact(gain)})</div>
      </div>
      <div class="impact__ratio">${fmtRatio(f.ratio)}</div>
      <div class="impact__bar"><i style="width:${Math.min(100, (f.ratio / max) * 100)}%"></i></div>`;
    host.appendChild(div);
  });
}

function renderAge(r) {
  const sumM = r.ageMatch.reduce((a, b) => a + b, 0) || 1;
  const sumR = r.ageRef.reduce((a, b) => a + b, 0) || 1;
  groupedBars($("#ageChart"), {
    labels: AGE_BANDS,
    a: r.ageRef.map((v) => v / sumR),
    b: r.ageMatch.map((v) => v / sumM),
    format: (v) => (v * 100).toFixed(0) + "%",
  });
}

function renderGeo(r) {
  const host = $("#geoChart");
  if (state.uf === "BR") {
    if (r.match === 0) {
      host.innerHTML = '<p style="font-size:12px;color:var(--muted)">Nenhuma pessoa no país passa em todos esses filtros na amostra.</p>';
      return;
    }
    const rows = r.geo.map((v, i) => ({ label: data.ufName[i], value: v }))
      .sort((x, y) => y.value - x.value).slice(0, 8);
    $("#geoKicker").textContent = "Onde estão";
    $("#geoTitle").textContent = "Os estados que ainda têm esperança";
    $("#geoSub").textContent = "Pessoas que passam em todos os filtros, por unidade da federação.";
    hbar(host, rows, { format: (v) => fmtCompact(v), labelW: 132, valueW: 78 });
    return;
  }
  const nat = compute(data.datasets[0], { ...state, uf: "BR" });
  const idx = data.ufIndex.get(state.uf);
  const sorted = nat.geo.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  const rank = sorted.findIndex((x) => x.i === idx) + 1;
  $("#geoKicker").textContent = "Seu estado no ranking";
  $("#geoTitle").textContent = `${data.ufName[idx]} é o ${rank}º estado`;
  $("#geoSub").textContent = nat.match > 0
    ? `Com os mesmos critérios, ${fmtPct(nat.geo[idx] / nat.match)} do pool nacional está aqui.`
    : "Nenhuma pessoa no país atende a esses critérios.";
  const rows = sorted.slice(0, 8).map((x) => ({
    label: data.ufName[x.i], value: x.v,
    color: x.i === idx ? "var(--accent)" : "var(--green)",
  }));
  hbar(host, rows, { format: (v) => fmtCompact(v), labelW: 132, valueW: 78 });
}

function renderAudit(r, gender, where) {
  const tbody = $("#auditTable tbody");
  const rows = [{
    label: "População de referência",
    value: `${gender === "homens" ? "Homens" : "Mulheres"} de 20 a 79 anos ${where}`,
    pass: "—", rest: r.base, effect: "—",
  }];
  let prev = r.base;
  r.filters.forEach((f) => {
    const pass = prev > 0 ? f.after / prev : 0;
    rows.push({
      label: f.label,
      value: f.value,
      pass: fmtPct(pass),
      rest: f.after,
      effect: prev > 0 ? fmtSignedPct(f.after / prev - 1) : "—",
    });
    prev = f.after;
  });
  tbody.innerHTML = rows.map((row, i) => `
    <tr class="${i === rows.length - 1 ? "total" : ""}">
      <td>${row.label}</td>
      <td>${row.value}</td>
      <td class="num">${row.pass}</td>
      <td class="num">${fmtInt(row.rest)}</td>
      <td class="num">${row.effect}</td>
    </tr>`).join("");
  $("#formula").textContent =
    `total = Σ pesoᵢ · 1[passa em ${r.filters.length || "nenhum"} filtro(s)] = ${fmtInt(r.match)}`;
}

/* --------------------------------------------------------------- ações */
function sharePageUrl() {
  const r = last.computed;
  if (!r) return location.href;
  const to = new URL(location.href);
  to.searchParams.set("v", "2");
  const u = new URL(SHARE_ORIGIN + "/r");
  u.searchParams.set("v", "2");
  u.searchParams.set("to", to.toString());
  u.searchParams.set("n", r.match > 0 ? fmtInt(r.match) : "< " + fmtCompact(r.upper95 || 0));
  u.searchParams.set("pct", fmtPct(r.share));
  u.searchParams.set("od", r.match > 0 ? fmtOneIn(r.oneIn) : "1 em —");
  u.searchParams.set("age", describe(state, "age"));
  u.searchParams.set("where", state.uf === "BR"
    ? "no Brasil"
    : `em ${data.ufName[data.ufIndex.get(state.uf)]}`);
  u.searchParams.set("sex", state.sex === 0 ? "homens" : "mulheres");
  u.searchParams.set("filters", r.filters.map((f) => f.value).filter(Boolean).slice(0, 4).join(" · ").slice(0, 170));
  u.searchParams.set("rare", isRare(r) ? "1" : "0");
  return u.toString();
}

function shareText() {
  const r = last.computed;
  if (!r) return "";
  const alvo = state.sex === 0 ? "homens" : "mulheres";
  const where = state.uf === "BR"
    ? "no Brasil"
    : `em ${data.ufName[data.ufIndex.get(state.uf)]}`;
  const total = r.match > 0
    ? fmtInt(r.match)
    : `menos de ${fmtCompact(r.upper95 || 0)}`;
  const odds = r.match > 0 ? fmtOneIn(r.oneIn) : "quase nenhum";
  const meme = isRare(r) ? " E ainda saiu com meme." : "";
  const ageLabel = describe(state, "age");
  const groupAll = state.sex === 0 ? "todos os homens" : "todas as mulheres";
  return `Fiz o teste no "Há homem ou mulher pra mim no Brasil?" e ${total} ${alvo} de ${ageLabel} ${where} atendem aos meus critérios (${fmtPct(r.share)} de ${groupAll} de 20 a 79 anos, ${odds}).${meme} Faça o seu teste também: veja quantas pessoas atendem seus critérios em ${sharePageUrl()}`;
}

async function buildCardBlob() {
  const r = last.computed;
  if (!r) return null;
  const canvas = await buildShareCard({
    result: r, state, rare: isRare(r),
    ufName: state.uf === "BR" ? "" : data.ufName[data.ufIndex.get(state.uf)],
  });
  return new Promise((res) => canvas.toBlob(res, "image/png"));
}

async function doShareLink() {
  const r = last.computed;
  if (!r) return;
  const text = shareText();
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Há homem ou mulher pra mim no Brasil?",
        text,
      });
      toast("Link enviado com o preview do resultado.");
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Mensagem copiada. Agora é só colar no grupo.");
  } catch (e) {
    prompt("Copie a mensagem para compartilhar:", text);
  }
}

async function downloadCard() {
  try {
    const blob = await buildCardBlob();
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ha-homem-ou-mulher-pra-mim.png";
    a.click();
    URL.revokeObjectURL(a.href);
    toast(isRare(last.computed) ? "Card com meme baixado." : "Card baixado.");
  } catch (e) {
    console.error(e);
    toast("Não deu para gerar o card. Tenta de novo?");
  }
}

function downloadJson() {
  const r = last.computed;
  if (!r) return;
  const payload = {
    gerado_em: new Date().toISOString(),
    filtros: state,
    descricao_filtros: Object.fromEntries(r.filters.map((f) => [f.label, f.value])),
    resultado: {
      pessoas: Math.round(r.match),
      percentual_da_referencia: r.share,
      um_em: r.oneIn,
      nivel_delirio: r.score,
      margem_erro_95: Math.round(r.ci95),
      base_referencia: Math.round(r.base),
      registros_na_amostra: r.matchN,
      n_imputacoes: r.nImputacoes,
      contagens_por_imputacao: r.counts?.map((c) => Math.round(c)),
      margem_total_95: Math.round(r.ci95),
    },
    fontes: {
      censo: "IBGE, Censo Demográfico 2022, microdados da amostra (tabela 9514)",
      pns: "IBGE, PNS 2019, tabelas 8171 e 8168",
      pnad: "IBGE, PNAD Contínua 2025 (renda)",
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cenario-ha-homem-ou-mulher.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

/* --------------------------------------------------------------- eventos */
function wire() {
  $$(".segmented[data-filter]").forEach((group) => {
    const key = group.dataset.filter;
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-value]");
      if (!btn) return;
      update({ [key]: Number(btn.dataset.value) });
    });
  });
  $("#uf").addEventListener("change", (e) => update({ uf: e.target.value }));

  const a = $("#ageMin"), b = $("#ageMax");
  const onAge = () => {
    let lo = Number(a.value), hi = Number(b.value);
    if (lo > hi) [lo, hi] = [hi, lo];
    update({ ageMin: lo, ageMax: hi });
  };
  a.addEventListener("input", onAge);
  b.addEventListener("input", onAge);

  $("#altura").addEventListener("input", (e) => update({ altura: Number(e.target.value) }));
  $("#renda").addEventListener("input", (e) => update({ renda: RENDA_STEPS[Number(e.target.value)] }));

  for (const [id, key] of [["kids", "kids"], ["car", "car"], ["home", "home"], ["smoke", "smoke"]]) {
    $("#" + id).addEventListener("click", () => update({ [key]: !state[key] }));
  }

  $$("#racaGroup [data-raca]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = Number(btn.dataset.raca);
      const race = state.race.includes(v) ? state.race.filter((x) => x !== v) : [...state.race, v];
      update({ race });
    });
  });

  $("#reset").addEventListener("click", () => {
    state = { ...DEFAULT, sex: state.sex, uf: state.uf, ageMin: 0, ageMax: 11, altura: 150, renda: 0 };
    paintControls();
    renderNow();
  });

  $$(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.preset;
      if (p === "basico") {
        state = { ...DEFAULT, sex: state.sex, uf: state.uf, ageMin: 0, ageMax: 11, altura: 150, renda: 0 };
      } else if (p === "padrao") {
        state = { ...DEFAULT, sex: state.sex, uf: state.uf };
      } else if (p === "xuxa") {
        state = { ...DEFAULT, sex: state.sex, uf: state.uf, ageMin: 1, ageMax: 4,
          altura: 185, renda: 15000, edu: 2, marital: 1, kids: true, bmi: 1, smoke: true, car: true, home: true };
      } else {
        state = { ...DEFAULT, sex: state.sex, uf: state.uf, ageMin: 2, ageMax: 4,
          altura: 185, renda: 10000, edu: 2, marital: 1, kids: true, bmi: 1, smoke: true };
      }
      paintControls();
      renderNow();
    });
  });

  $("#shareLink").addEventListener("click", doShareLink);
  $("#downloadCard").addEventListener("click", downloadCard);
  $("#download").addEventListener("click", downloadJson);
}

/* ----------------------------------------------------------------- boot */
async function boot() {
  try {
    data = await loadData();
    populateUFs();
    state = parseURL();
    if (state.uf !== "BR" && !data.ufIndex.has(state.uf)) state.uf = "BR";
    if (!RENDA_STEPS.includes(state.renda)) {
      state.renda = RENDA_STEPS.reduce((best, v) =>
        Math.abs(v - state.renda) < Math.abs(best - state.renda) ? v : best, 0);
    }
    const total = data.meta.totais.homens + data.meta.totais.mulheres;
    $("#heroPop").textContent =
      (total / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " milhões";

    wire();
    paintControls();
    renderNow();
    requestAnimationFrame(() => $("#veil").classList.add("hide"));
    setTimeout(() => $("#veil").remove(), 600);
  } catch (err) {
    console.error(err);
    $("#veil").classList.add("hide");
    $("#subCount").innerHTML = `<strong>Não deu para abrir a base.</strong>
      O navegador bloqueou a leitura de <code>data/population.bin</code>.
      Rode <code>python3 serve.py</code> e abra o endereço indicado.`;
  }
}

boot();
