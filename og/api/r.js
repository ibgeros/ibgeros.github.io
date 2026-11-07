export const config = { runtime: "edge" };

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export default function handler(req) {
  const u = new URL(req.url);
  const p = u.searchParams;
  const toRaw = p.get("to") || "https://ibgeros.github.io/";
  const to = toRaw.startsWith("https://ibgeros.github.io/") ? toRaw : "https://ibgeros.github.io/";
  const q = new URLSearchParams();
  for (const k of ["n", "sex", "age", "where", "pct", "od", "filters", "rare"]) {
    q.set(k, p.get(k) || "");
  }
  const image = `${u.origin}/og.png?${q.toString()}`;
  const n = p.get("n") || "—";
  const sex = p.get("sex") || "pessoas";
  const where = p.get("where") || "no Brasil";
  const age = p.get("age") || "20 a 79 anos";
  const pct = p.get("pct") || "";
  const od = p.get("od") || "";
  const title = `Sobreviveram ao meu filtro: ${n} ${sex} ${where}`;
  const desc = `${sex} de ${age} ${where}${pct ? ` · ${pct} de todos` : ""}${od ? ` · ${od}` : ""}. Faça o seu teste.`;
  return new Response(`<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(image)}">
<style>
body{margin:0;background:#f4f1ea;color:#17140e;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}
main{max-width:560px;padding:40px} a{color:#b23a1e}
</style>
</head><body><main>
<p>Redirecionando para o resultado…</p>
<p><a href="${esc(to)}">Abrir a calculadora</a></p>
</main>
<script>location.replace(${JSON.stringify(to).replace(/</g, "\\u003c")});</script>
</body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
