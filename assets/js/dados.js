import { loadData } from "./data.js";
import { groupedBars, pyramid, hbar } from "./charts.js";
import { AGE_BANDS, fmtInt, fmtCompact, fmtPct, fmtMoney, RACA_NAMES } from "./engine.js";

const $ = (s) => document.querySelector(s);
const total = (arr) => arr.reduce((a, b) => a + b, 0);

function boot() {
  loadData().then((data) => {
    fillMeta(data);
    renderPyramid(data);
    renderRenda(data);
    renderAltura(data);
    renderAttrs(data);
    renderHabits(data);
    renderRace(data);
    renderUfs(data);
    renderValidation();
  }).catch((e) => {
    console.error(e);
    document.querySelectorAll(".chart").forEach((el) => {
      el.innerHTML = '<p style="font-size:12px;color:var(--muted)">Rode o site por HTTP (python3 serve.py).</p>';
    });
  });
}

function fillMeta(data) {
  const tot = data.meta.totais.homens + data.meta.totais.mulheres;
  document.querySelectorAll('[data-m="registros"]').forEach((el) => el.textContent = fmtInt(data.n));
  document.querySelectorAll('[data-m="populacao"]').forEach((el) => el.textContent =
    (tot / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi");
}

function byBandSex(data) {
  const out = { 0: new Float64Array(12), 1: new Float64Array(12) };
  for (let i = 0; i < data.n; i++) out[data.sex[i]][data.band[i]] += data.weight[i];
  return out;
}

function renderPyramid(data) {
  const b = byBandSex(data);
  pyramid($("#pyramid"), {
    men: Array.from(b[0]).map((v) => v / 1e6),
    women: Array.from(b[1]).map((v) => v / 1e6),
    labels: AGE_BANDS,
    format: (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
  });
}

function renderRenda(data) {
  const edges = [0, 1000, 2000, 3000, 5000, 10000, 20000, Infinity];
  const labels = ["até 1k", "1–2k", "2–3k", "3–5k", "5–10k", "10–20k", "20k+"];
  const m = new Float64Array(7), f = new Float64Array(7);
  for (let i = 0; i < data.n; i++) {
    let k = 0;
    while (k < edges.length - 2 && data.income[i] >= edges[k + 1]) k++;
    (data.sex[i] === 0 ? m : f)[k] += data.weight[i];
  }
  const sm = total(m), sf = total(f);
  groupedBars($("#rendaChart"), {
    labels,
    a: Array.from(m).map((v) => v / sm),
    b: Array.from(f).map((v) => v / sf),
    format: (v) => (v * 100).toFixed(0) + "%",
  });
  // mediana por sexo a partir dos quantis de renda
  const med = (sex) => {
    const vals = [];
    for (let i = 0; i < data.n; i++) if (data.sex[i] === sex) vals.push([data.income[i], data.weight[i]]);
    vals.sort((a, b) => a[0] - b[0]);
    const tot = vals.reduce((s, x) => s + x[1], 0);
    let acc = 0;
    for (const [v, w] of vals) { acc += w; if (acc >= tot / 2) return v; }
    return 0;
  };
  $("#rendaChart").insertAdjacentHTML("beforeend",
    `<div class="legend">
       <span><i style="background:var(--line)"></i>homens</span>
       <span><i style="background:var(--accent)"></i>mulheres</span>
       <span style="margin-left:auto">mediana: <b>${fmtMoney(med(0))}</b> · <b>${fmtMoney(med(1))}</b></span>
     </div>`);
}

function renderAltura(data) {
  const edges = [];
  for (let h = 145; h < 200; h += 5) edges.push(h);
  const m = new Float64Array(edges.length + 1), f = new Float64Array(edges.length + 1);
  for (let i = 0; i < data.n; i++) {
    const h = data.height[i];
    let k = edges.findIndex((e) => h < e + 5);
    if (k < 0) k = edges.length;
    (data.sex[i] === 0 ? m : f)[k] += data.weight[i];
  }
  const sm = total(m), sf = total(f);
  groupedBars($("#alturaChart"), {
    labels: [...edges.map((e) => String(e)), "200+"].map((x, i) => i % 2 ? "" : x),
    a: Array.from(m).map((v) => v / sm),
    b: Array.from(f).map((v) => v / sf),
    format: (v) => (v * 100).toFixed(0) + "%",
  });
}

function pctBySex(data, predicate, groupFn) {
  const m = {}, f = {};
  let sm = 0, sf = 0;
  for (let i = 0; i < data.n; i++) {
    if (!predicate(data, i)) continue;
    const g = groupFn(data, i);
    if (data.sex[i] === 0) { m[g] = (m[g] || 0) + data.weight[i]; sm += data.weight[i]; }
    else { f[g] = (f[g] || 0) + data.weight[i]; sf += data.weight[i]; }
  }
  const out = {};
  for (const k of new Set([...Object.keys(m), ...Object.keys(f)])) out[k] = [(m[k] || 0) / sm, (f[k] || 0) / sf];
  return out;
}

function renderAttrGroup(host, title, rows) {
  const block = document.createElement("div");
  block.innerHTML = `<div class="attr-group-title">${title}</div>
    <div class="attr-head"><span>categoria</span><span></span><span style="text-align:right">H · M</span></div>`;
  for (const [label, [pm, pf]] of rows) {
    const max = Math.max(pm, pf, 0.0001);
    block.insertAdjacentHTML("beforeend", `
      <div class="attr-row">
        <span class="attr-row__label">${label}</span>
        <span class="attr-bars">
          <i style="width:${(pm / max) * 100}%;background:var(--line)"></i>
          <i style="width:${(pf / max) * 100}%;background:var(--accent)"></i>
        </span>
        <span class="attr-vals"><span>${fmtPct(pm)}</span><span>${fmtPct(pf)}</span></span>
      </div>`);
  }
  host.appendChild(block);
}

function renderAttrs(data) {
  const host = $("#attrChart");
  const edu = pctBySex(data, () => true, (d, i) => d.edu[i]);
  renderAttrGroup(host, "Escolaridade", [
    ["Fundamental incompleto", edu[0] || [0, 0]],
    ["Fundamental completo", edu[1] || [0, 0]],
    ["Médio completo", edu[2] || [0, 0]],
    ["Superior completo", edu[3] || [0, 0]],
  ]);
  const mar = pctBySex(data, () => true, (d, i) => d.marital[i]);
  renderAttrGroup(host, "Estado civil", [
    ["Em união", mar[0] || [0, 0]],
    ["Já viveu em união", mar[1] || [0, 0]],
    ["Nunca viveu", mar[2] || [0, 0]],
  ]);
  const kids = pctBySex(data, () => true, (d, i) => Math.min(d.kids[i], 2));
  renderAttrGroup(host, "Filhos", [
    ["Nenhum", kids[0] || [0, 0]],
    ["Um", kids[1] || [0, 0]],
    ["Dois ou mais", kids[2] || [0, 0]],
  ]);
}

function renderHabits(data) {
  const host = $("#habitChart");
  const bmi = pctBySex(data, () => true, (d, i) => d.bmi[i]);
  renderAttrGroup(host, "IMC", [
    ["Baixo peso", bmi[0] || [0, 0]],
    ["Peso normal", bmi[1] || [0, 0]],
    ["Sobrepeso", bmi[2] || [0, 0]],
    ["Obesidade", bmi[3] || [0, 0]],
  ]);
  const smoke = pctBySex(data, () => true, (d, i) => (d.smoke[i] ? "Fuma" : "Não fuma"));
  const car = pctBySex(data, () => true, (d, i) => (d.car[i] ? "Com carro" : "Sem carro"));
  const home = pctBySex(data, () => true, (d, i) => (d.home[i] ? "Casa própria" : "Sem casa própria"));
  renderAttrGroup(host, "Hábitos e patrimônio", [
    ["Não fuma", smoke["Não fuma"] || [0, 0]],
    ["Fuma", smoke["Fuma"] || [0, 0]],
    ["Tem carro no domicílio", car["Com carro"] || [0, 0]],
    ["Mora em casa própria", home["Casa própria"] || [0, 0]],
  ]);
}

function renderRace(data) {
  const host = $("#raceChart");
  const race = pctBySex(data, () => true, (d, i) => d.race[i]);
  renderAttrGroup(host, "Cor/raça", RACA_NAMES.map((n, i) => [n, race[i] || [0, 0]]));
}

function renderUfs(data) {
  const counts = new Float64Array(27);
  for (let i = 0; i < data.n; i++) counts[data.uf[i]] += data.weight[i];
  const rows = data.ufName.map((n, i) => ({ label: n, value: counts[i] }))
    .sort((a, b) => b.value - a.value);
  hbar($("#ufChart"), rows.slice(0, 12), { format: (v) => fmtCompact(v), labelW: 150, valueW: 84 });
}

function renderValidation() {
  fetch("data/validacao.json").then((r) => r.json()).then((v) => {
    const rows = [];
    const push = (ind, est, off, diff, ok = true) => rows.push({ ind, est, off, diff, ok });
    push("População 20–79 (milhões)", (v.populacao_uf_sexo.total_estimado_mi).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
      (v.populacao_uf_sexo.total_censo_mi).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
      v.populacao_uf_sexo.erro_medio_abs_pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "% (média)", true);
    for (const [k, d] of Object.entries(v.altura_percentis)) {
      const sx = k.slice(0, 1), grp = k.slice(2);
      rows.push({
        ind: `Altura mediana · ${sx === "0" ? "homens" : "mulheres"} ${grp}`,
        est: d.estimado[1].toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " cm",
        off: d.oficial[1].toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " cm",
        diff: (d.estimado[1] - d.oficial[1]).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " cm",
        ok: Math.abs(d.estimado[1] - d.oficial[1]) <= 0.6,
      });
    }
    for (const [k, d] of Object.entries(v.obesidade)) {
      const sx = k.slice(0, 1), grp = k.slice(2);
      rows.push({
        ind: `Obesidade · ${sx === "0" ? "homens" : "mulheres"} ${grp}`,
        est: d.estimado.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%",
        off: d.oficial.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%",
        diff: (d.estimado - d.oficial).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " p.p.",
        ok: Math.abs(d.estimado - d.oficial) <= 0.5,
      });
    }
    rows.push({ ind: "Tabagismo (total)", est: v.fumo.estimado + "%", off: v.fumo.pns + "%", diff: (v.fumo.estimado - v.fumo.pns).toFixed(1) + " p.p.", ok: Math.abs(v.fumo.estimado - v.fumo.pns) <= 0.6 });
    rows.push({ ind: "Carro no domicílio (total)", est: v.carro.estimado + "%", off: v.carro.pns + "%", diff: (v.carro.estimado - v.carro.pns).toFixed(1) + " p.p.", ok: Math.abs(v.carro.estimado - v.carro.pns) <= 1.5 });
    if (v.casa_propria.oficial !== undefined) {
      rows.push({ ind: "Casa própria (total)", est: v.casa_propria.estimado + "%", off: v.casa_propria.oficial + "%",
        diff: (v.casa_propria.estimado - v.casa_propria.oficial).toFixed(1) + " p.p.",
        ok: Math.abs(v.casa_propria.estimado - v.casa_propria.oficial) <= 1 });
    }

    $("#validationTable tbody").innerHTML = rows.map((r) => `
      <tr>
        <td>${r.ind}</td>
        <td class="num">${r.est}</td>
        <td class="num">${r.off}</td>
        <td class="num">${r.diff}</td>
        <td class="${r.ok ? "ok" : "warn"}"><span class="check" style="background:${r.ok ? "var(--green)" : "var(--accent)"}"></span>${r.ok ? "confere" : "atenção"}</td>
      </tr>`).join("");
  }).catch((e) => console.warn(e));
}

boot();
