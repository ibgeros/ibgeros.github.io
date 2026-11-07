import {
  describe, EDU_OPTS, MARITAL_OPTS, BMI_OPTS, RACA_NAMES, RENDA_STEPS, fmtMoney,
} from "./engine.js";

const KEY = "ibgeros_consent_v1";
const API = "https://ibgeros-og.vercel.app/api/collect";
let started = false;
let filtersTimer = null;

function readConsent() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function writeConsent(value) {
  try { localStorage.setItem(KEY, value); } catch { /* modo privado */ }
}

function utm() {
  const p = new URLSearchParams(location.search);
  return {
    utm_source: p.get("utm_source") || "",
    utm_medium: p.get("utm_medium") || "",
    utm_campaign: p.get("utm_campaign") || "",
  };
}

function base() {
  let referrer_host = "";
  try { referrer_host = document.referrer ? new URL(document.referrer).host : ""; } catch { /* ignore */ }
  return {
    consent: true,
    device: matchMedia("(max-width: 760px)").matches ? "mobile" : "desktop",
    lang: navigator.language || "",
    referrer_host,
    ...utm(),
  };
}

function send(event, extra = {}) {
  if (readConsent() !== "accepted") return;
  try {
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base(), event, ...extra }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

export function trackEvent(event, extra = {}) {
  send(event, extra);
}

function bucket(n) {
  if (!n) return "0";
  if (n < 100) return "1-99";
  if (n < 1000) return "100-999";
  if (n < 10000) return "1k-9.9k";
  if (n < 100000) return "10k-99k";
  if (n < 1000000) return "100k-999k";
  return "1m+";
}

export function trackFilters(r, state, extra = {}) {
  if (readConsent() !== "accepted" || !r) return;
  clearTimeout(filtersTimer);
  filtersTimer = setTimeout(() => {
    const income = state.renda === 0 ? "qualquer" : fmtMoney(RENDA_STEPS[state.renda]);
    const race = state.race.length ? state.race.map((i) => RACA_NAMES[i]).join("+") : "qualquer";
    send("filters", {
      age_range: describe(state, "age"),
      sex_filter: state.sex === 0 ? "homens" : "mulheres",
      uf_filter: state.uf,
      income_bucket: income,
      edu: EDU_OPTS[state.edu],
      marital: MARITAL_OPTS[state.marital],
      kids: state.kids ? "sem filhos" : "qualquer",
      bmi: BMI_OPTS[state.bmi],
      smoke: state.smoke ? "não fuma" : "qualquer",
      car: state.car ? "tem carro" : "qualquer",
      home: state.home ? "casa própria" : "qualquer",
      race,
      result_bucket: bucket(r.match),
      result_pct: Number((r.share * 100).toFixed(2)),
      rare: extra.rare === true,
    });
  }, 1400);
}

function banner() {
  if (document.getElementById("consentBanner")) return;
  const el = document.createElement("div");
  el.id = "consentBanner";
  el.className = "consent-banner";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <div class="consent-copy">
      <b>Privacidade</b>
      <p>Com seu consentimento, registro de forma anônima a cidade aproximada, os filtros usados
      e o resultado, para entender o uso do site. Não guardo IP, localização precisa, nome ou e-mail.
      Você pode recusar e usar normalmente. <a href="privacidade.html">Política de Privacidade</a>.</p>
    </div>
    <div class="consent-actions">
      <button class="btn" type="button" id="consentAccept">Aceitar</button>
      <button class="btn btn--ghost" type="button" id="consentDecline">Recusar</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector("#consentAccept").addEventListener("click", () => {
    writeConsent("accepted");
    el.remove();
    send("view");
    window.dispatchEvent(new Event("ibgeros-consent"));
  });
  el.querySelector("#consentDecline").addEventListener("click", () => {
    writeConsent("declined");
    el.remove();
  });
}

export function initAnalytics() {
  if (started) return;
  started = true;
  const choice = readConsent();
  if (!choice) banner();
  if (choice === "accepted") send("view");
}
