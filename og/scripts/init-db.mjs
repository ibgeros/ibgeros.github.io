import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL ausente");
  process.exit(1);
}
const sql = postgres(url, { ssl: "require", max: 1 });
const fs = await import("node:fs/promises");
const schema = await fs.readFile(new URL("../schema.sql", import.meta.url), "utf8");
await sql.unsafe(schema);
const rows = await sql`select key, value from settings order by key`;
console.log("schema ok", rows);
await sql.end();
