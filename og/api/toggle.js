import { db } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const value = body.enabled === true ? "true" : "false";
  await db()`insert into settings (key, value) values ('analytics_enabled', ${value})
    on conflict (key) do update set value = excluded.value`;
  return res.status(200).json({ enabled: value === "true" });
}
