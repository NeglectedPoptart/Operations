import {
  GREY_ROW,
  blendOverWhite,
  qty,
  shortDay,
  type OrderLegendItem,
  type PendingOrder,
} from "./pendingOrders";

// Copy-as-image, copy-for-Excel/email and .xlsx download of the Orders page.
// All three show the same thing: the legend colours as the rows are coloured,
// greyed orders in grey, the notes beside each order, the "moved" list below.

export interface OrderSection {
  title: string;
  // Orders grouped by ship date, oldest first.
  groups: { date: string | null; orders: PendingOrder[] }[];
}

export function groupByShipDate(orders: PendingOrder[]): OrderSection["groups"] {
  const map = new Map<string, PendingOrder[]>();
  for (const o of orders) {
    const k = o.ship_date ?? "";
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({ date: date || null, orders: list.sort((a, b) => a.order_no.localeCompare(b.order_no)) }));
}

export const ORDER_HEADERS = ["Order No", "Status", "Customer", "Salesperson", "Terms", "Freight", "Ordered", "Shipped", "Notes"];

function customerOf(o: PendingOrder): string {
  const code = o.customer_code ?? "";
  const name = o.customer_name ?? "";
  return code && name && code !== name ? `${code} - ${name}` : code || name;
}

export function orderCells(o: PendingOrder): string[] {
  return [
    o.order_no,
    o.status ?? "",
    customerOf(o),
    o.salesperson ?? "",
    o.terms ?? "",
    o.freight ?? "",
    qty(o.ordered),
    qty(o.shipped),
    (o.notes ?? "").trim(),
  ];
}

// The solid background a row gets in the exports (null = plain white).
export function rowFill(o: PendingOrder, legend: Map<string, OrderLegendItem>): string | null {
  if (o.greyed) return GREY_ROW;
  const item = o.legend_id ? legend.get(o.legend_id) : undefined;
  return item ? blendOverWhite(item.color, item.opacity) : null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------------------
// Excel / email: HTML table (keeps the colours when pasted into Excel or an
// email) plus tab-separated text.

export function buildOrdersHtmlAndText(
  sections: OrderSection[],
  legend: OrderLegendItem[],
  heading: string,
): { html: string; text: string } {
  const byId = new Map(legend.map((l) => [l.id, l]));
  const cell = "padding:3px 6px;border:1px solid #000;color:#000;vertical-align:top;";
  const numCell = `${cell}text-align:right;`;
  const cols = ORDER_HEADERS.length;
  let html = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:12.5px;">`;
  html += `<tr><td colspan="${cols}" style="background:#8DC63F;color:#000;font-weight:bold;text-align:center;padding:6px;border:1px solid #000;">${esc(heading)}</td></tr>`;
  html += `<tr>${ORDER_HEADERS.map((h, i) => `<td style="${i === 6 || i === 7 ? numCell : cell}font-weight:bold;background:#dddddd;">${esc(h)}</td>`).join("")}</tr>`;
  const textLines = [heading, ORDER_HEADERS.join("\t")];

  const legendUsed = new Set<string>();
  for (const section of sections) {
    if (section.groups.length === 0) continue;
    html += `<tr><td colspan="${cols}" style="background:#14532d;color:#fff;font-weight:bold;padding:5px 6px;border:1px solid #000;">${esc(section.title)}</td></tr>`;
    textLines.push("", section.title);
    for (const g of section.groups) {
      const total = g.orders.reduce((s, o) => s + o.ordered, 0);
      html += `<tr><td colspan="${cols}" style="background:#f0f0f0;font-weight:bold;padding:4px 6px;border:1px solid #000;">Ship date ${esc(shortDay(g.date))} - ${g.orders.length} order${g.orders.length === 1 ? "" : "s"}, ${qty(total)} ordered</td></tr>`;
      textLines.push(`Ship date ${shortDay(g.date)}`);
      for (const o of g.orders) {
        const fill = rowFill(o, byId);
        if (o.legend_id && !o.greyed) legendUsed.add(o.legend_id);
        const bg = fill ? `background:${fill};` : "background:#ffffff;";
        const fg = o.greyed ? "color:#6b7280;" : "";
        html += `<tr>${orderCells(o)
          .map((c, i) => `<td style="${i === 6 || i === 7 ? numCell : cell}${bg}${fg}">${esc(c)}</td>`)
          .join("")}</tr>`;
        textLines.push(orderCells(o).join("\t"));
      }
    }
  }

  // The legend, so whoever reads the email knows what each colour means.
  const used = legend.filter((l) => legendUsed.has(l.id));
  if (used.length > 0) {
    html += `<tr><td colspan="${cols}" style="padding:4px 6px;border:1px solid #000;background:#fff;"><b>Legend:</b> ${used
      .map((l) => `<span style="background:${blendOverWhite(l.color, l.opacity)};border:1px solid #000;padding:1px 8px;margin-right:6px;">${esc(l.name)}</span>`)
      .join("")}</td></tr>`;
    textLines.push("", "Legend: " + used.map((l) => l.name).join(", "));
  }
  html += "</table>";
  return { html, text: textLines.join("\n") };
}

export async function copyOrdersForExcel(sections: OrderSection[], legend: OrderLegendItem[], heading: string): Promise<void> {
  const { html, text } = buildOrdersHtmlAndText(sections, legend, heading);
  if (typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

// ---------------------------------------------------------------------------
// .xlsx download (real colours, column widths, wrapped notes).

export async function downloadOrdersXlsx(sections: OrderSection[], legend: OrderLegendItem[], heading: string, fileName: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const byId = new Map(legend.map((l) => [l.id, l]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Orders");
  ws.columns = [14, 12, 40, 18, 11, 24, 10, 10, 50].map((width) => ({ width }));
  const cols = ORDER_HEADERS.length;
  const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
  const border = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };

  const title = ws.addRow([heading]);
  ws.mergeCells(title.number, 1, title.number, cols);
  title.font = { bold: true, size: 13 };
  title.alignment = { horizontal: "center" };
  title.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8DC63F" } };
  const head = ws.addRow(ORDER_HEADERS);
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDDDDD" } };
    c.border = border;
  });

  for (const section of sections) {
    if (section.groups.length === 0) continue;
    const s = ws.addRow([section.title]);
    ws.mergeCells(s.number, 1, s.number, cols);
    s.font = { bold: true, color: { argb: "FFFFFFFF" } };
    s.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14532D" } };
    for (const g of section.groups) {
      const total = g.orders.reduce((sum, o) => sum + o.ordered, 0);
      const r = ws.addRow([`Ship date ${shortDay(g.date)} - ${g.orders.length} order${g.orders.length === 1 ? "" : "s"}, ${qty(total)} ordered`]);
      ws.mergeCells(r.number, 1, r.number, cols);
      r.font = { bold: true };
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
      for (const o of g.orders) {
        const row = ws.addRow([o.order_no, o.status ?? "", customerOf(o), o.salesperson ?? "", o.terms ?? "", o.freight ?? "", o.ordered, o.shipped, (o.notes ?? "").trim()]);
        const fill = rowFill(o, byId);
        row.eachCell({ includeEmpty: true }, (c, col) => {
          c.border = border;
          c.alignment = { vertical: "top", wrapText: col === 9 };
          if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fill) } };
          if (o.greyed) c.font = { color: { argb: "FF6B7280" } };
        });
        row.getCell(7).numFmt = "#,##0";
        row.getCell(8).numFmt = "#,##0";
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Image.

const FONT = "13px Arial, Helvetica, sans-serif";
const FONT_BOLD = "bold 13px Arial, Helvetica, sans-serif";
const PAD_X = 8;
const LINE_H = 17;
const MIN_ROW_H = 26;
const COL_W = [86, 78, 290, 120, 74, 150, 66, 66, 300];

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of (text || "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = w;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

export async function renderOrdersPng(
  sections: OrderSection[],
  legend: OrderLegendItem[],
  heading: string,
  subheading: string,
  scale = 2,
): Promise<Blob> {
  const byId = new Map(legend.map((l) => [l.id, l]));
  const width = COL_W.reduce((a, b) => a + b, 0);
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas is not supported in this browser");
  measure.font = FONT;

  type Line =
    | { kind: "section"; text: string }
    | { kind: "group"; text: string }
    | { kind: "head" }
    | { kind: "order"; order: PendingOrder; cells: string[]; notesLines: string[]; h: number };
  const lines: Line[] = [{ kind: "head" }];
  const legendUsed = new Set<string>();
  for (const section of sections) {
    if (section.groups.length === 0) continue;
    lines.push({ kind: "section", text: section.title });
    for (const g of section.groups) {
      const total = g.orders.reduce((s, o) => s + o.ordered, 0);
      lines.push({ kind: "group", text: `Ship date ${shortDay(g.date)}  -  ${g.orders.length} order${g.orders.length === 1 ? "" : "s"}, ${qty(total)} ordered` });
      for (const o of g.orders) {
        const cells = orderCells(o);
        if (o.legend_id && !o.greyed) legendUsed.add(o.legend_id);
        const notesLines = wrap(measure, cells[8], COL_W[8] - PAD_X * 2);
        lines.push({ kind: "order", order: o, cells, notesLines, h: Math.max(MIN_ROW_H, notesLines.length * LINE_H + 9) });
      }
    }
  }
  const usedLegend = legend.filter((l) => legendUsed.has(l.id));

  const TITLE_H = 54;
  const heightOf = (l: Line) => (l.kind === "order" ? l.h : l.kind === "head" ? 28 : 28);
  const legendH = usedLegend.length > 0 ? 40 : 0;
  const height = TITLE_H + lines.reduce((s, l) => s + heightOf(l), 0) + legendH + 12;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000000";
  ctx.font = "bold 18px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(heading, width / 2, 20);
  ctx.font = "12px Arial, Helvetica, sans-serif";
  ctx.fillStyle = "#555555";
  ctx.fillText(subheading, width / 2, 41);

  let y = TITLE_H;
  for (const l of lines) {
    const h = heightOf(l);
    if (l.kind === "section") {
      ctx.fillStyle = "#14532d";
      ctx.fillRect(0, y, width, h);
      ctx.fillStyle = "#ffffff";
      ctx.font = FONT_BOLD;
      ctx.textAlign = "left";
      ctx.fillText(l.text, PAD_X, y + h / 2);
    } else if (l.kind === "group") {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, y, width, h);
      ctx.strokeStyle = "#000000";
      ctx.strokeRect(0, y, width, h);
      ctx.fillStyle = "#000000";
      ctx.font = FONT_BOLD;
      ctx.textAlign = "left";
      ctx.fillText(l.text, PAD_X, y + h / 2);
    } else if (l.kind === "head") {
      ctx.fillStyle = "#dddddd";
      ctx.fillRect(0, y, width, h);
      let x = 0;
      ORDER_HEADERS.forEach((t, i) => {
        ctx.strokeStyle = "#000000";
        ctx.strokeRect(x, y, COL_W[i], h);
        ctx.fillStyle = "#000000";
        ctx.font = FONT_BOLD;
        ctx.textAlign = i === 6 || i === 7 ? "right" : "left";
        ctx.fillText(t, i === 6 || i === 7 ? x + COL_W[i] - PAD_X : x + PAD_X, y + h / 2);
        x += COL_W[i];
      });
    } else {
      const fill = rowFill(l.order, byId);
      ctx.fillStyle = fill ?? "#ffffff";
      ctx.fillRect(0, y, width, h);
      let x = 0;
      l.cells.forEach((c, i) => {
        ctx.strokeStyle = "#000000";
        ctx.strokeRect(x, y, COL_W[i], h);
        ctx.fillStyle = l.order.greyed ? "#6b7280" : "#000000";
        ctx.font = FONT;
        ctx.textAlign = i === 6 || i === 7 ? "right" : "left";
        const tx = i === 6 || i === 7 ? x + COL_W[i] - PAD_X : x + PAD_X;
        if (i === 8) {
          l.notesLines.forEach((t, n) => ctx.fillText(t, tx, y + 13 + n * LINE_H));
        } else {
          ctx.fillText(c, tx, y + MIN_ROW_H / 2, COL_W[i] - PAD_X * 2);
        }
        x += COL_W[i];
      });
    }
    y += h;
  }

  if (usedLegend.length > 0) {
    ctx.font = FONT_BOLD;
    ctx.textAlign = "left";
    ctx.fillStyle = "#000000";
    ctx.fillText("Legend:", PAD_X, y + 22);
    let x = PAD_X + 60;
    ctx.font = FONT;
    for (const l of usedLegend) {
      const w = ctx.measureText(l.name).width + 20;
      ctx.fillStyle = blendOverWhite(l.color, l.opacity);
      ctx.fillRect(x, y + 10, w, 24);
      ctx.strokeStyle = "#000000";
      ctx.strokeRect(x, y + 10, w, 24);
      ctx.fillStyle = "#000000";
      ctx.fillText(l.name, x + 10, y + 22);
      x += w + 8;
    }
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Failed to export the image"))), "image/png");
  });
}
