/* Gráficos SVG minimalistas, sem dependências. */
const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function hbar(host, rows, opts = {}) {
  const {
    width = 520, rowH = 34, labelW = 118, valueW = 96,
    color = "var(--accent)", colorAlt = "var(--line)",
    format = (v) => v,
  } = opts;
  host.innerHTML = "";
  if (!rows.length) {
    host.innerHTML = '<p style="font-size:12px;color:var(--muted)">Sem dados.</p>';
    return;
  }
  const height = rows.length * rowH + 8;
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", role: "img" });
  const max = Math.max(...rows.map((r) => r.value), 1);
  const barW = width - labelW - valueW;
  rows.forEach((r, i) => {
    const y = i * rowH + 6;
    const w = Math.max(2, (r.value / max) * barW);
    svg.appendChild(el("text", { x: 0, y: y + 15, class: "bar-label" }, r.label));
    svg.appendChild(el("rect", {
      x: labelW, y: y + 4, width: barW, height: 14, rx: 3,
      fill: "var(--paper-2)",
    }));
    svg.appendChild(el("rect", {
      x: labelW, y: y + 4, width: w, height: 14, rx: 3,
      fill: r.color || color,
    }));
    svg.appendChild(el("text", {
      x: width, y: y + 16, "text-anchor": "end", class: "bar-value",
    }, format(r.value)));
    if (r.sub) {
      svg.appendChild(el("text", {
        x: width, y: y + 29, "text-anchor": "end", class: "axis-label",
      }, r.sub));
    }
  });
  host.appendChild(svg);
}

export function groupedBars(host, { labels, a, b, labelA, labelB, format = (v) => v, width = 540, height = 300 }) {
  host.innerHTML = "";
  const padL = 42, padB = 34, padT = 14, padR = 8;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...a, ...b, 0.0001);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", role: "img" });
  for (let g = 0; g <= 3; g++) {
    const y = padT + innerH * (g / 3);
    svg.appendChild(el("line", { x1: padL, x2: width - padR, y1: y, y2: y, class: "gridline" }));
    svg.appendChild(el("text", { x: padL - 8, y: y + 3, "text-anchor": "end", class: "axis-label" },
      format(max * (1 - g / 3))));
  }
  const step = innerW / labels.length;
  const bw = Math.max(3, (step - 8) / 2);
  labels.forEach((lab, i) => {
    const x0 = padL + i * step;
    const hA = (a[i] / max) * innerH;
    const hB = (b[i] / max) * innerH;
    svg.appendChild(el("rect", {
      x: x0 + 2, y: padT + innerH - hA, width: bw, height: hA,
      rx: 2, fill: "var(--line)", opacity: .9,
    }));
    if (b) {
      svg.appendChild(el("rect", {
        x: x0 + 2 + bw + 2, y: padT + innerH - hB, width: bw, height: hB,
        rx: 2, fill: "var(--accent)",
      }));
    }
    if (labels.length <= 8 || i % 2 === 0) {
      svg.appendChild(el("text", {
        x: x0 + step / 2, y: height - 12, "text-anchor": "middle", class: "axis-label",
      }, lab));
    }
  });
  host.appendChild(svg);
}

export function histogram(host, { values, labels, color = "var(--blue)", width = 540, height = 260, format = (v) => v }) {
  host.innerHTML = "";
  const padL = 40, padB = 34, padT = 12, padR = 8;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...values, 1);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", role: "img" });
  for (let g = 0; g <= 3; g++) {
    const y = padT + innerH * (g / 3);
    svg.appendChild(el("line", { x1: padL, x2: width - padR, y1: y, y2: y, class: "gridline" }));
    svg.appendChild(el("text", { x: padL - 8, y: y + 3, "text-anchor": "end", class: "axis-label" }, format(max * (1 - g / 3))));
  }
  const step = innerW / values.length;
  values.forEach((v, i) => {
    const h = (v / max) * innerH;
    svg.appendChild(el("rect", {
      x: padL + i * step + 1, y: padT + innerH - h, width: Math.max(2, step - 2),
      height: h, rx: 2, fill: color,
    }));
    if (labels.length <= 14 || i % 2 === 0) {
      svg.appendChild(el("text", { x: padL + i * step + step / 2, y: height - 12, "text-anchor": "middle", class: "axis-label" }, labels[i]));
    }
  });
  host.appendChild(svg);
}

export function pyramid(host, { men, women, labels, width = 560, height = 330, format = (v) => Math.round(v) }) {
  host.innerHTML = "";
  const padL = 46, padR = 46, padT = 10, padB = 26;
  const mid = width / 2;
  const innerH = height - padT - padB;
  const max = Math.max(...men, ...women, 1);
  const svg = el("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", role: "img" });
  const gap = 26;
  labels.forEach((lab, i) => {
    const y = padT + (i / labels.length) * innerH;
    const h = innerH / labels.length - 2;
    const wm = (men[i] / max) * (mid - padL - gap);
    const ww = (women[i] / max) * (mid - padR - gap);
    svg.appendChild(el("rect", { x: mid - gap - wm, y, width: wm, height: h, rx: 2, fill: "var(--blue)", opacity: .85 }));
    svg.appendChild(el("rect", { x: mid + gap, y, width: ww, height: h, rx: 2, fill: "var(--accent)", opacity: .85 }));
    svg.appendChild(el("text", {
      x: mid - gap - wm - 6, y: y + h / 2 + 3, "text-anchor": "end", class: "axis-label",
    }, men[i] >= max * .02 ? format(men[i]) : ""));
    svg.appendChild(el("text", {
      x: mid + gap + ww + 6, y: y + h / 2 + 3, class: "axis-label",
    }, women[i] >= max * .02 ? format(women[i]) : ""));
    if (i % 2 === 0) {
      svg.appendChild(el("text", { x: mid, y: y + h / 2 + 3, "text-anchor": "middle", class: "axis-label", fill: "var(--muted)" }, lab));
    }
  });
  host.appendChild(svg);
}
