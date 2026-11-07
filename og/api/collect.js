import { db, cors, clip, geo, enabled, ORIGINS } from "../lib/db.js";

const EVENTS = new Set(["view", "filters", "share", "download", "download_json"]);

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!ORIGINS.has(req.headers.origin)) return res.status(403).json({ error: "origin" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (body.consent !== true) return res.status(204).end();
    const event = clip(body.event, 20);
    if (!EVENTS.has(event)) return res.status(400).json({ error: "event" });
    if (!(await enabled())) return res.status(204).end();

    const g = geo(req);
    await db()`
      insert into analytics_events (
        event, city, region, country, device, lang, referrer_host,
        utm_source, utm_medium, utm_campaign,
        age_range, sex_filter, uf_filter, income_bucket, edu, marital,
        kids, bmi, smoke, car, home, race, result_bucket, rare
      ) values (
        ${event}, ${g.city}, ${g.region}, ${g.country},
        ${clip(body.device, 20)}, ${clip(body.lang, 20)}, ${clip(body.referrer_host, 120)},
        ${clip(body.utm_source, 80)}, ${clip(body.utm_medium, 80)}, ${clip(body.utm_campaign, 120)},
        ${clip(body.age_range, 40)}, ${clip(body.sex_filter, 30)}, ${clip(body.uf_filter, 10)},
        ${clip(body.income_bucket, 40)}, ${clip(body.edu, 60)}, ${clip(body.marital, 40)},
        ${clip(body.kids, 30)}, ${clip(body.bmi, 40)}, ${clip(body.smoke, 20)},
        ${clip(body.car, 20)}, ${clip(body.home, 20)}, ${clip(body.race, 80)},
        ${clip(body.result_bucket, 30)}, ${body.rare === true}
      )`;
    return res.status(204).end();
  } catch (err) {
    console.error("collect", err?.message || err);
    return res.status(500).json({ error: "internal" });
  }
}
