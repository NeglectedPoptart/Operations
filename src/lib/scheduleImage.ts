// A dedicated, branded renderer for a single person/role's schedule image -
// deliberately separate from fobPricing.ts's generic price-sheet renderer
// (shared by many other pages) rather than bolting a logo header onto that
// one and changing how every other Copy-as-Image button looks.
const BRAND_GREEN = "#8DC63F";
const HEADER_BG = "#14532d";
const FONT_FAMILY = "Arial, Helvetica, sans-serif";

const HEADER_H = 92;
const ACCENT_H = 4;
const PAD = 24;
const ROW_H = 30;
const COL_HEADER_H = 32;
const WEEK_COL_W = 132;
const DAY_COL_W = 108;
const FOOTER_H = 34;

export interface ScheduleDayCell {
  text: string;
  isException: boolean;
}

export interface ScheduleWeekRow {
  label: string;
  days: ScheduleDayCell[];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function renderScheduleImagePng(opts: {
  heading: string;
  subheading?: string;
  dayLabels: string[];
  weeks?: ScheduleWeekRow[];
  staticHours?: string;
  scale?: number;
}): Promise<Blob> {
  const { heading, subheading, dayLabels, weeks, staticHours, scale = 2 } = opts;
  const logo = await loadImage("/logo-harvest-best-white.png").catch(() => null);

  const isCalendar = !!weeks && weeks.length > 0;
  const tableWidth = WEEK_COL_W + DAY_COL_W * dayLabels.length;

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas is not supported in this browser");

  let bodyHeight: number;
  let staticLines: string[] = [];
  if (isCalendar) {
    bodyHeight = COL_HEADER_H + weeks.length * ROW_H;
  } else {
    mctx.font = `14px ${FONT_FAMILY}`;
    staticLines = (staticHours || "No hours set yet.").split("\n");
    bodyHeight = staticLines.length * 22 + 16;
  }

  const canvasWidth = Math.max(isCalendar ? tableWidth : 420, 420) + PAD * 2;
  const canvasHeight = HEADER_H + ACCENT_H + PAD + bodyHeight + PAD + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(canvasWidth * scale);
  canvas.height = Math.ceil(canvasHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(scale, scale);

  // Header
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = HEADER_BG;
  ctx.fillRect(0, 0, canvasWidth, HEADER_H);
  ctx.fillStyle = BRAND_GREEN;
  ctx.fillRect(0, HEADER_H, canvasWidth, ACCENT_H);

  let textX = PAD;
  if (logo) {
    const logoH = 46;
    const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
    ctx.drawImage(logo, PAD, (HEADER_H - logoH) / 2, logoW, logoH);
    textX = PAD + logoW + 18;
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(heading, textX, HEADER_H / 2 - (subheading ? 4 : -6));
  if (subheading) {
    ctx.font = `13px ${FONT_FAMILY}`;
    ctx.fillStyle = "#d1e7c9";
    ctx.fillText(subheading, textX, HEADER_H / 2 + 18);
  }

  let y = HEADER_H + ACCENT_H + PAD;
  const tableX = (canvasWidth - (isCalendar ? tableWidth : canvasWidth - PAD * 2)) / 2;

  if (isCalendar) {
    // Column header row
    ctx.fillStyle = "#eef6e5";
    ctx.fillRect(tableX, y, tableWidth, COL_HEADER_H);
    ctx.strokeStyle = "#d8e8cb";
    ctx.strokeRect(tableX, y, tableWidth, COL_HEADER_H);
    ctx.font = `bold 12px ${FONT_FAMILY}`;
    ctx.fillStyle = "#14532d";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Week", tableX + 10, y + COL_HEADER_H / 2);
    dayLabels.forEach((label, i) => {
      const colX = tableX + WEEK_COL_W + i * DAY_COL_W;
      ctx.textAlign = "center";
      ctx.fillText(label, colX + DAY_COL_W / 2, y + COL_HEADER_H / 2);
    });
    y += COL_HEADER_H;

    weeks.forEach((week, rowIndex) => {
      ctx.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#f7faf4";
      ctx.fillRect(tableX, y, tableWidth, ROW_H);
      ctx.strokeStyle = "#e7ede2";
      ctx.strokeRect(tableX, y, tableWidth, ROW_H);

      ctx.font = `bold 12px ${FONT_FAMILY}`;
      ctx.fillStyle = "#14532d";
      ctx.textAlign = "left";
      ctx.fillText(week.label, tableX + 10, y + ROW_H / 2);

      week.days.forEach((cell, i) => {
        const colX = tableX + WEEK_COL_W + i * DAY_COL_W;
        ctx.textAlign = "center";
        if (cell.isException) {
          ctx.fillStyle = "#fdf2d0";
          ctx.fillRect(colX + 2, y + 2, DAY_COL_W - 4, ROW_H - 4);
          ctx.fillStyle = "#92650a";
          ctx.font = `bold 11.5px ${FONT_FAMILY}`;
        } else {
          ctx.fillStyle = "#374151";
          ctx.font = `11.5px ${FONT_FAMILY}`;
        }
        ctx.fillText(cell.text || "-", colX + DAY_COL_W / 2, y + ROW_H / 2);
      });
      y += ROW_H;
    });
  } else {
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `14px ${FONT_FAMILY}`;
    ctx.fillStyle = "#374151";
    staticLines.forEach((line, i) => {
      ctx.fillText(line, PAD, y + 16 + i * 22);
    });
  }

  const footerY = canvasHeight - FOOTER_H / 2;
  ctx.strokeStyle = "#e7ede2";
  ctx.beginPath();
  ctx.moveTo(PAD, canvasHeight - FOOTER_H);
  ctx.lineTo(canvasWidth - PAD, canvasHeight - FOOTER_H);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = "#9ca3af";
  ctx.fillText(
    `Harvest Best Inc  •  Generated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    canvasWidth / 2,
    footerY,
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export schedule image"));
    }, "image/png");
  });
}
