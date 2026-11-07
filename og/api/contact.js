import { db, cors, clip, ORIGINS } from "../lib/db.js";

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!ORIGINS.has(req.headers.origin)) return res.status(403).json({ error: "origin" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (body.consent !== true) return res.status(400).json({ error: "consent" });
    if (body.website) return res.status(204).end();
    const message = clip(body.message, 4000).trim();
    if (message.length < 10) return res.status(400).json({ error: "message" });
    await db()`
      insert into privacy_requests (name, email, message)
      values (${clip(body.name, 120) || null}, ${clip(body.email, 160) || null}, ${message})`;
    return res.status(204).end();
  } catch (err) {
    console.error("contact", err?.message || err);
    return res.status(500).json({ error: "internal" });
  }
}
