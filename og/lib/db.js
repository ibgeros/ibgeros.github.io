import postgres from "postgres";

let client = null;
export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL ausente");
    client = postgres(url, { ssl: "require", max: 1 });
  }
  return client;
}

export const ORIGINS = new Set([
  "https://ibgeros.github.io",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
]);

export function cors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.has(origin) ? origin : "https://ibgeros.github.io");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function clip(value, max = 120) {
  return String(value ?? "").slice(0, max);
}

export function geo(req) {
  const decode = (v) => {
    try { return decodeURIComponent(String(v || "")); } catch { return String(v || ""); }
  };
  return {
    city: decode(req.headers["x-vercel-ip-city"]).slice(0, 80) || null,
    region: decode(req.headers["x-vercel-ip-country-region"]).slice(0, 40) || null,
    country: decode(req.headers["x-vercel-ip-country"]).slice(0, 8) || null,
  };
}

export async function enabled() {
  const rows = await db()`select value from settings where key = 'analytics_enabled' limit 1`;
  return rows[0]?.value === "true";
}
