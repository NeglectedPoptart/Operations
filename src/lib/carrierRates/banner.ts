import fs from "node:fs";
import path from "node:path";
import { createCanvas, Image } from "@napi-rs/canvas";
import { ensureFonts } from "../deliveredSheetsServer";

// The picture across the top of the weekly rate email: Harvest Best's logo, the title, and a little truck on the
// road with a price tag. Drawn on the server and attached to the email, so it shows without anyone having to
// "load images". 1200 x 380, shown at 600 wide in the email so it is sharp on phones.

const W = 1200;
const H = 380;

const cache = new Map<string, Buffer>();

export function renderRateBanner(weekLabel: string): Buffer {
  const hit = cache.get(weekLabel);
  if (hit) return hit;
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#14532d");
  bg.addColorStop(0.55, "#16a34a");
  bg.addColorStop(1, "#84cc16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // soft shapes
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  for (const [x, y, r] of [
    [1080, 40, 190],
    [760, 360, 150],
    [200, 400, 120],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
    ctx.stroke();
  }

  // logo
  try {
    const logo = new Image();
    logo.src = fs.readFileSync(path.join(process.cwd(), "public", "logo-hbi-2025-white.png"));
    const lh = 78;
    ctx.drawImage(logo, 56, 40, lh * (logo.width / logo.height), lh);
  } catch {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 34px Georgia, serif";
    ctx.fillText("Harvest Best", 56, 90);
  }

  // words
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 60px Georgia, serif";
  ctx.fillText("WEEKLY RATE", 56, 214);
  ctx.fillText("UPDATE", 56, 280);
  ctx.fillStyle = "#d9f99d";
  ctx.font = "bold 25px Arial, sans-serif";
  ctx.fillText(weekLabel.toUpperCase(), 58, 322);

  // price tag with a dollar sign
  ctx.save();
  ctx.translate(1010, 108);
  ctx.rotate(-0.18);
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.moveTo(-64, -36);
  ctx.lineTo(40, -36);
  ctx.lineTo(74, 0);
  ctx.lineTo(40, 36);
  ctx.lineTo(-64, 36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#14532d";
  ctx.beginPath();
  ctx.arc(52, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#78350f";
  ctx.font = "bold 44px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$$$", -8, 2);
  ctx.restore();

  // little rising bars
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  [0, 1, 2, 3].forEach((i) => ctx.fillRect(790 + i * 30, 150 - i * 22, 20, 60 + i * 22));

  // the truck
  const roadY = 332;
  ctx.save();
  ctx.translate(0, 24);
  // trailer
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 700, 168, 330, 120, 14);
  ctx.fill();
  ctx.fillStyle = "#16a34a";
  ctx.fillRect(700, 236, 330, 16);
  ctx.fillStyle = "#14532d";
  ctx.font = "bold 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("HARVEST BEST", 865, 218);
  // cab
  ctx.fillStyle = "#fde68a";
  roundRect(ctx, 1044, 196, 96, 92, 16);
  ctx.fill();
  ctx.fillStyle = "#bae6fd";
  roundRect(ctx, 1088, 208, 44, 36, 8);
  ctx.fill();
  ctx.fillStyle = "#92400e";
  ctx.fillRect(1044, 270, 96, 18);
  // wheels
  for (const x of [770, 836, 1006, 1102]) {
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(x, 292, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9ca3af";
    ctx.beginPath();
    ctx.arc(x, 292, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // road
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(0, roadY + 4, W, H - roadY - 4);
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 4;
  ctx.setLineDash([36, 28]);
  ctx.beginPath();
  ctx.moveTo(0, roadY + 26);
  ctx.lineTo(W, roadY + 26);
  ctx.stroke();
  ctx.setLineDash([]);

  const png = canvas.toBuffer("image/png");
  cache.set(weekLabel, png);
  return png;
}

function roundRect(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
