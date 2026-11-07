import { db } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

function csv(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const n = Number(new URL(req.url, "https://x").searchParams.get("days") || 30);
  const days = [7, 30, 90, 365].includes(n) ? n : 30;
  const sql = db();
  const rows = await sql`
    select created_at, event, city, region, country, device, lang, referrer_host,
           utm_source, utm_medium, utm_campaign, age_range, sex_filter, uf_filter,
           income_bucket, edu, marital, kids, bmi, smoke, car, home, race,
           result_bucket, rare
    from analytics_events
    where created_at >= now() - (${days} || ' days')::interval
    order by created_at desc limit 50000`;
  const cols = ["created_at", "event", "city", "region", "country", "device", "lang", "referrer_host",
    "utm_source", "utm_medium", "utm_campaign", "age_range", "sex_filter", "uf_filter",
    "income_bucket", "edu", "marital", "kids", "bmi", "smoke", "car", "home", "race",
    "result_bucket", "rare"];
  const out = [cols.join(","), ...rows.map((r) => cols.map((c) => csv(r[c])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="ibgeros-eventos-${days}d.csv"`);
  return res.status(200).send(out);
}
