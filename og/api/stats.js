import { db } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

const FILTERS = {
  age_range: "Idade", sex_filter: "Sexo procurado", uf_filter: "UF",
  income_bucket: "Renda", edu: "Escolaridade", marital: "Estado civil",
  kids: "Filhos", bmi: "IMC", smoke: "Fumo", car: "Carro", home: "Casa",
  race: "Cor/raça", result_bucket: "Resultado",
};
const SAFE = new Set(Object.keys(FILTERS));

function daysOf(req) {
  const n = Number(new URL(req.url, "https://x").searchParams.get("days") || 30);
  return [7, 30, 90, 365].includes(n) ? n : 30;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  const days = daysOf(req);
  const sql = db();
  const since = sql`now() - (${days} || ' days')::interval`;

  const totals = await sql`select event, count(*)::int as n from analytics_events where created_at >= ${since} group by event order by n desc`;
  const enabled = (await sql`select value from settings where key='analytics_enabled' limit 1`)[0]?.value === "true";
  const rare = (await sql`select count(*)::int as n from analytics_events where created_at >= ${since} and rare = true`)[0]?.n || 0;

  const cities = await sql`
    select city, region, count(*)::int as n
    from analytics_events
    where created_at >= ${since} and city is not null and city <> ''
    group by city, region having count(*) >= 20
    order by n desc limit 30`;

  const regions = await sql`
    select region, count(*)::int as n from analytics_events
    where created_at >= ${since} and region is not null and region <> ''
    group by region order by n desc limit 30`;

  const utm = await sql`
    select utm_source, utm_medium, utm_campaign, count(*)::int as n
    from analytics_events
    where created_at >= ${since} and utm_source is not null and utm_source <> ''
    group by utm_source, utm_medium, utm_campaign order by n desc limit 30`;

  const daily = await sql`
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as n
    from analytics_events where created_at >= ${since}
    group by 1 order by 1`;

  const filters = {};
  for (const [col, label] of Object.entries(FILTERS)) {
    if (!SAFE.has(col)) continue;
    const rows = await sql.unsafe(
      `select ${col} as value, count(*)::int as n from analytics_events
       where created_at >= now() - make_interval(days => $1) and ${col} is not null and ${col} <> ''
       group by ${col} order by n desc limit 20`,
      [days]
    );
    filters[col] = { label, rows };
  }

  await sql`delete from analytics_events where created_at < now() - interval '90 days'`;
  await sql`delete from privacy_requests where created_at < now() - interval '365 days'`;

  const requests = await sql`
    select id, created_at, name, email, message, status
    from privacy_requests order by created_at desc limit 50`;

  return res.status(200).json({
    days, enabled, totals, rare, cities, regions, utm, daily, filters, requests,
    generated_at: new Date().toISOString(),
    note: "Cidades com menos de 20 eventos são omitidas (k-anonimato).",
  });
}
