import { db } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const sql = db();
  const events = await sql`delete from analytics_events where created_at < now() - interval '90 days' returning id`;
  const requests = await sql`delete from privacy_requests where created_at < now() - interval '365 days' returning id`;
  return res.status(200).json({ events: events.length, requests: requests.length });
}
