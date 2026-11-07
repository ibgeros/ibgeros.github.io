import { requireAdmin } from "../lib/auth.js";

const HTML = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ibgeros · painel</title>
<style>
:root{--bg:#f4f1ea;--ink:#17140e;--soft:#464034;--muted:#7b7263;--line:#d7cfbf;--accent:#b23a1e;--green:#2f6b4f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,sans-serif}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 24px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
h1{font-size:18px;margin:0} .muted{color:var(--muted);font-size:12px}
main{padding:24px;max-width:1280px;margin:0 auto}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:18px}
button,select,a.btn{font:inherit;border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;color:var(--ink);text-decoration:none}
button.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
button.danger{color:var(--accent);border-color:#e0b9ae}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px}
.card b{display:block;font-size:28px;line-height:1.1}.card span{font-size:12px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px;overflow:auto}
section h2{font-size:14px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:6px 4px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:500}.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:8px;background:var(--line);border-radius:99px;overflow:hidden;min-width:80px}.bar i{display:block;height:100%;background:var(--green)}
.req{font-size:12px;border-bottom:1px solid #eee;padding:8px 0}.req b{font-size:13px}
.pill{display:inline-block;padding:3px 8px;border-radius:99px;background:#efe7d8;color:var(--accent);font-size:11px;font-weight:700}
.err{background:#fbe9e4;border:1px solid #e0b9ae;color:#8a2d16;padding:12px;border-radius:8px;margin-bottom:12px}
</style></head>
<body>
<header>
  <div><h1>ibgeros · painel de controle</h1><div class="muted">dados agregados · acesso restrito</div></div>
  <div id="status" class="muted">carregando…</div>
</header>
<main>
  <div class="controls">
    <select id="days"><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="90">90 dias</option><option value="365">365 dias</option></select>
    <button class="primary" id="refresh">Atualizar</button>
    <button id="toggle">Pausar coleta</button>
    <a class="btn" id="export" href="/api/export?days=30">Exportar CSV</a>
    <button class="danger" id="purge">Apagar antigos</button>
  </div>
  <div id="err" class="err" style="display:none"></div>
  <div class="cards" id="cards"></div>
  <div class="grid">
    <section><h2>Eventos por dia</h2><div id="daily"></div></section>
    <section><h2>Cidades (≥ 20 eventos)</h2><div id="cities"></div></section>
    <section><h2>Estados</h2><div id="regions"></div></section>
    <section><h2>UTM</h2><div id="utm"></div></section>
    <div id="filters"></div>
    <section><h2>Pedidos de privacidade</h2><div id="requests"></div></section>
  </div>
</main>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n) => new Intl.NumberFormat('pt-BR').format(n || 0);
let DATA = null;

function table(rows, cols) {
  if (!rows?.length) return '<p class="muted">Sem dados no período.</p>';
  const max = Math.max(...rows.map(r => +r[cols[1]] || 0), 1);
  return '<table><thead><tr>' + cols.map((c,i)=>'<th'+(i?' class="num"':'')+'>'+esc(c)+'</th>').join('') + '<th></th></tr></thead><tbody>' +
    rows.map(r => '<tr>' + cols.map((c,i)=>'<td'+(i?' class="num"':'')+'>'+esc(r[c])+'</td>').join('') +
    '<td><div class="bar"><i style="width:'+Math.round((+r[cols[1]]||0)/max*100)+'%"></i></div></td></tr>').join('') + '</tbody></table>';
}

async function load() {
  const days = $('#days').value;
  $('#export').href = '/api/export?days=' + days;
  $('#err').style.display = 'none';
  try {
    const res = await fetch('/api/stats?days=' + days, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
    render();
  } catch (e) {
    $('#err').textContent = 'Falha ao carregar: ' + e.message;
    $('#err').style.display = 'block';
  }
}

function render() {
  const d = DATA;
  $('#status').textContent = 'atualizado ' + new Date(d.generated_at).toLocaleString('pt-BR') + ' · ' + d.days + ' dias';
  $('#toggle').textContent = d.enabled ? 'Pausar coleta' : 'Retomar coleta';
  $('#cards').innerHTML = [
    ['Eventos', fmt(d.totals.reduce((a,x)=>a+x.n,0))],
    ['Views', fmt(d.totals.find(x=>x.event==='view')?.n)],
    ['Filtros', fmt(d.totals.find(x=>x.event==='filters')?.n)],
    ['Compartilhamentos', fmt(d.totals.find(x=>x.event==='share')?.n)],
    ['Downloads', fmt((d.totals.find(x=>x.event==='download')?.n||0)+(d.totals.find(x=>x.event==='download_json')?.n||0))],
    ['Raros', fmt(d.rare)],
    ['Coleta', d.enabled ? 'ativa' : 'pausada'],
  ].map(([k,v])=>'<div class="card"><b>'+esc(v)+'</b><span>'+esc(k)+'</span></div>').join('');
  $('#daily').innerHTML = table(d.daily, ['day','n']);
  $('#cities').innerHTML = table(d.cities, ['city','n']);
  $('#regions').innerHTML = table(d.regions, ['region','n']);
  $('#utm').innerHTML = table(d.utm, ['utm_source','n']);
  $('#filters').innerHTML = Object.values(d.filters).map(f =>
    '<section><h2>'+esc(f.label)+'</h2>'+table(f.rows, ['value','n'])+'</section>').join('');
  $('#requests').innerHTML = d.requests.length ? d.requests.map(r =>
    '<div class="req"><b>'+esc(r.name||'sem nome')+'</b> · '+esc(r.email||'sem e-mail')+' · '+new Date(r.created_at).toLocaleString('pt-BR')+'<br>'+esc(r.message)+'</div>').join('') : '<p class="muted">Nenhum pedido.</p>';
}

$('#refresh').onclick = load;
$('#days').onchange = load;
$('#toggle').onclick = async () => {
  if (!DATA) return;
  const res = await fetch('/api/toggle', {method:'POST', headers:{'content-type':'application/json'}, credentials:'same-origin', body: JSON.stringify({enabled: !DATA.enabled})});
  if (res.ok) load(); else alert('Falha ao alternar.');
};
$('#purge').onclick = async () => {
  if (!confirm('Apagar eventos com mais de 90 dias e pedidos com mais de 365 dias?')) return;
  const res = await fetch('/api/purge', {method:'POST', credentials:'same-origin'});
  if (res.ok) { const r = await res.json(); alert('Apagados: ' + r.events + ' eventos, ' + r.requests + ' pedidos.'); load(); }
  else alert('Falha ao apagar.');
};
load();
</script>
</body></html>`;

export default function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(HTML);
}
