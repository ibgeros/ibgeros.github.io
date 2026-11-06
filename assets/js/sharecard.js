/* Gera o card compartilhável (1080×1350) com o resultado e, se for raro, o meme. */
import { fmtInt, fmtCompact, fmtPct, fmtOneIn, describe } from "./engine.js";

const W = 1080, H = 1350;
const PAPER = "#f4f1ea";
const INK = "#17140e";
const SOFT = "#464034";
const MUTED = "#7b7263";
const ACCENT = "#b23a1e";
const LINE = "#d7cfbf";

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
      line = words[i];
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight);
}

function fitFont(ctx, text, maxWidth, start, weight = "400", family = "Fraunces", step = 4) {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px ${family}, Georgia, serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= step;
  } while (size > 24);
  return size;
}

function drawCover(ctx, img, x, y, w, h, r) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s, ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = "rgba(23,20,14,.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export async function buildShareCard({ result, state, rare, ufName }) {
  await Promise.all([
    document.fonts.load('400 150px Fraunces'),
    document.fonts.load('600 30px Inter'),
    document.fonts.load('400 30px Inter'),
    document.fonts.ready,
  ]).catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // topo: marca
  ctx.save();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(84, 86, 25, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.beginPath(); ctx.arc(84, 86, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = PAPER; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(84, 86, 13, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.font = '500 34px Fraunces, Georgia, serif';
  ctx.fillText("Há homem ou mulher pra mim?", 124, 82);
  ctx.fillStyle = MUTED;
  ctx.font = '500 17px Inter, sans-serif';
  ctx.fillText("NO BRASIL · DADOS DO IBGE", 124, 110);

  // selo de delírio
  const badge = `delírio ${result.score}/10`;
  ctx.font = '600 18px Inter, sans-serif';
  const bw = ctx.measureText(badge).width + 34;
  ctx.fillStyle = "#efe7d8";
  roundRect(ctx, W - 64 - bw, 66, bw, 36, 18); ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.fillText(badge, W - 64 - bw + 17, 90);

  // divisor
  ctx.strokeStyle = LINE; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(64, 146); ctx.lineTo(W - 64, 146); ctx.stroke();

  // headline
  ctx.fillStyle = ACCENT;
  ctx.font = '700 20px Inter, sans-serif';
  ctx.save();
  ctx.letterSpacing = "3px";
  ctx.fillText("SOBREVIVERAM AO SEU FILTRO", 64, 208);
  ctx.restore();

  // número
  const alvo = state.sex === 0 ? "homens" : "mulheres";
  const alvoSing = state.sex === 0 ? "homem" : "mulher";
  const numero = result.match === 0 && result.upper95 ? "< " + fmtCompact(result.upper95) : fmtInt(result.match);
  const size = fitFont(ctx, numero, W - 128, 150);
  ctx.fillStyle = INK;
  ctx.font = `400 ${size}px Fraunces, Georgia, serif`;
  ctx.fillText(numero, 64, 368);

  ctx.fillStyle = SOFT;
  ctx.font = '400 30px Inter, sans-serif';
  ctx.fillText(`${alvo} de ${describe(state, "age")} ${ufName ? "em " + ufName : "no Brasil"}`, 64, 416);

  const pct = result.share > 0 ? fmtPct(result.share) : "0%";
  const odds = result.match > 0 ? fmtOneIn(result.oneIn) : "1 em —";
  const grupo = state.sex === 0 ? "todos os homens" : "todas as mulheres";
  ctx.fillStyle = ACCENT;
  ctx.font = '400 40px Fraunces, Georgia, serif';
  ctx.fillText(`${pct} de ${grupo} (20–79)  ·  ${odds}`, 64, 480);

  // resumo dos filtros
  if (result.counts && result.maxCount > result.minCount) {
    ctx.fillStyle = MUTED;
    ctx.font = '400 18px Inter, sans-serif';
    ctx.fillText(`faixa entre ${result.nImputacoes || 5} imputações: ${fmtInt(result.minCount)} – ${fmtInt(result.maxCount)}`, 64, 516);
  }
  ctx.fillStyle = MUTED;
  ctx.font = '400 24px Inter, sans-serif';
  const resumo = result.filters.length
    ? result.filters.map((f) => f.value).join("  ·  ")
    : "Sem filtros: basicamente todo mundo.";
  wrapText(ctx, resumo, 64, 548, W - 128, 33, 3);

  if (rare) {
    // imagem de humor
    let img;
    try {
      img = new Image();
      img.src = "assets/img/xuxa-1986.jpg";
      await img.decode();
      drawCover(ctx, img, 64, 670, W - 128, 470, 18);
    } catch (e) {
      ctx.fillStyle = "#efe7d8";
      roundRect(ctx, 64, 646, W - 128, 500, 18); ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.font = '400 34px Fraunces, Georgia, serif';
    ctx.fillText(`“No Brasil não há ${alvoSing} para mim.”`, 64, 1188);
    ctx.fillStyle = MUTED;
    ctx.font = '400 18px Inter, sans-serif';
    ctx.fillText(state.sex === 0
      ? "— Xuxa, 04/86. A gente só digitalizou."
      : "— Xuxa, 04/86, com adaptação livre para quem procura mulher.", 64, 1220);
  } else {
    // grade de pontos: visualiza a fração do grupo
    const cols = 24, rows = 12, step = 28, r = 6;
    const gridW = cols * step, gridX = (W - gridW) / 2, gridY = 640;
    const filled = Math.max(1, Math.round(result.share * cols * rows));
    for (let i = 0; i < cols * rows; i++) {
      const cx = gridX + (i % cols) * step + step / 2;
      const cy = gridY + Math.floor(i / cols) * step + step / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = i < filled ? ACCENT : "#ddd5c7";
      ctx.fill();
    }
    ctx.fillStyle = MUTED;
    ctx.font = '400 20px Inter, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("cada ponto = 0,35% do grupo", W / 2, 1012);
    ctx.textAlign = "left";

    ctx.fillStyle = INK;
    ctx.font = '400 46px Fraunces, Georgia, serif';
    ctx.fillText("Tem gente. Muita gente.", 64, 1100);
    ctx.fillStyle = SOFT;
    ctx.font = '400 30px Inter, sans-serif';
    ctx.fillText("A compatibilidade é outro departamento.", 64, 1146);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(64, 1182, 120, 5);
  }

  // rodapé
  ctx.strokeStyle = LINE; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(64, 1270); ctx.lineTo(W - 64, 1270); ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = '400 16px Inter, sans-serif';
  ctx.fillText("Fontes: IBGE — Censo 2022, PNS 2013/2019, PNAD 2025", 64, 1303);
  ctx.fillText("Estimativa amostral. Não mede atração, disponibilidade ou reciprocidade.", 64, 1326);

  return canvas;
}
