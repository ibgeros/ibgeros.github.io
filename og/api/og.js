import { ImageResponse } from "@vercel/og";
import React from "react";

export const config = { runtime: "edge" };
const h = React.createElement;

function clampText(value, max) {
  return String(value || "").slice(0, max);
}

export default function handler(req) {
  const p = new URL(req.url).searchParams;
  const n = clampText(p.get("n") || "0", 18);
  const sex = clampText(p.get("sex") || "homens", 30);
  const age = clampText(p.get("age") || "20 a 79 anos", 40);
  const where = clampText(p.get("where") || "no Brasil", 60);
  const pct = clampText(p.get("pct") || "0%", 12);
  const od = clampText(p.get("od") || "1 em —", 20);
  const filters = clampText(p.get("filters") || "", 180);
  const rare = p.get("rare") === "1";

  return new ImageResponse(
    h("div", {
      style: {
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        backgroundColor: "#f4f1ea", color: "#17140e", padding: "48px 64px 28px",
        fontFamily: "sans-serif", position: "relative",
      },
    },
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "space-between" },
      },
        h("div", { style: { display: "flex", alignItems: "center" } },
          h("div", {
            style: {
              width: 34, height: 34, borderRadius: 17, border: "2px solid #17140e",
              display: "flex", alignItems: "center", justifyContent: "center", marginRight: 12,
            },
          }, h("div", { style: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#b23a1e" } })),
          h("div", { style: { display: "flex", flexDirection: "column" } },
            h("div", { style: { fontSize: 22, fontWeight: 700 } }, "Há homem ou mulher pra mim?"),
            h("div", { style: { fontSize: 13, color: "#7b7263", letterSpacing: "2px" } }, "NO BRASIL · DADOS DO IBGE")
          )
        ),
        rare
          ? h("div", {
              style: {
                display: "flex", backgroundColor: "#efe7d8", color: "#b23a1e",
                borderRadius: 20, padding: "8px 16px", fontSize: 16, fontWeight: 700,
              },
            }, "modo Xuxa")
          : null
      ),
      h("div", { style: { height: 1, backgroundColor: "#d7cfbf", marginTop: 26 } }),
      h("div", { style: { display: "flex", flexDirection: "column", marginTop: 34 } },
        h("div", { style: { display: "flex", color: "#b23a1e", fontSize: 20, fontWeight: 700, letterSpacing: "3px" } }, "SOBREVIVERAM AO SEU FILTRO"),
        h("div", { style: { display: "flex", fontSize: 132, fontWeight: 700, letterSpacing: "-5px", marginTop: 6 } }, n),
        h("div", { style: { display: "flex", fontSize: 38, color: "#464034", marginTop: 0 } }, `${sex} de ${age} ${where}`),
        h("div", { style: { display: "flex", fontSize: 42, color: "#b23a1e", marginTop: 12 } }, `${pct} de todos · ${od}`),
        filters
          ? h("div", { style: { display: "flex", fontSize: 18, color: "#7b7263", marginTop: 12, lineHeight: 1.3, overflow: "hidden" } }, filters)
          : null
      ),
      h("div", {
        style: {
          display: "flex", width: "100%", justifyContent: "space-between",
          borderTop: "1px solid #d7cfbf", paddingTop: 14, marginTop: "auto",
          fontSize: 16, color: "#7b7263",
        },
      },
        h("div", { style: { display: "flex" } }, "ibgeros.github.io"),
        h("div", { style: { display: "flex" } }, "Censo 2022 · PNS 2013/2019 · PNAD 2025")
      )
    ),
    { width: 1200, height: 630 }
  );
}
