import { APP_TIMEZONE } from "../dates";

// Small HTML builders for the weekly reports. The same HTML is shown as the page preview and sent
// as the email, so it uses inline styles only (email clients ignore stylesheets) and escapes
// everything that comes from the database.

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";
export const GREEN = "#2e7d32";

// "2026-11-04" -> "11/4"
export function md(date: string | null | undefined): string {
  if (!date) return "";
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// "2026-11-04" -> "Wed 11/4"
export function dayMd(date: string | null | undefined): string {
  if (!date) return "";
  const wd = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${wd} ${md(date)}`;
}

// A timestamptz as "Wed 11/4 6:12 AM" in the business timezone.
export function stamp(ts: string | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A row of big numbers: stats([["Call-outs", 4], ["Approved", 3]])
export function stats(items: [string, string | number][]): string {
  const cells = items
    .map(
      ([label, value]) =>
        `<td style="padding:8px 14px;border:1px solid #d0d7d0;background:#f4f8f4;text-align:center;${FONT}">` +
        `<div style="font-size:20px;font-weight:bold;color:${GREEN};">${esc(value)}</div>` +
        `<div style="font-size:11px;color:#555;">${esc(label)}</div></td>`,
    )
    .join('<td style="width:6px;"></td>');
  return `<table cellspacing="0" cellpadding="0" style="margin:6px 0 10px;"><tr>${cells}</tr></table>`;
}

export function heading(text: string): string {
  return `<h3 style="margin:14px 0 4px;font-size:14px;color:${GREEN};${FONT}">${esc(text)}</h3>`;
}

export function note(text: string): string {
  return `<p style="margin:4px 0 8px;font-size:12px;color:#666;${FONT}">${esc(text)}</p>`;
}

export function empty(text: string): string {
  return `<p style="margin:4px 0 8px;font-size:12px;color:#888;font-style:italic;${FONT}">${esc(text)}</p>`;
}

// A table. cells are plain strings, escaped here; pass { html: "..." } for pre-built markup.
export type Cell = string | number | null | undefined | { html: string };

export function table(headers: string[], rows: Cell[][], opts: { max?: number } = {}): string {
  if (rows.length === 0) return "";
  const max = opts.max ?? 80;
  const shown = rows.slice(0, max);
  const th = headers
    .map((h) => `<th style="padding:5px 8px;text-align:left;background:${GREEN};color:#fff;font-size:11px;white-space:nowrap;${FONT}">${esc(h)}</th>`)
    .join("");
  const body = shown
    .map((row, i) => {
      const bg = i % 2 === 0 ? "#ffffff" : "#f6f8f6";
      const tds = row
        .map((c) => {
          const inner = c && typeof c === "object" ? c.html : esc(c);
          return `<td style="padding:4px 8px;border-bottom:1px solid #e3e8e3;font-size:12px;vertical-align:top;${FONT}">${inner}</td>`;
        })
        .join("");
      return `<tr style="background:${bg};">${tds}</tr>`;
    })
    .join("");
  const more = rows.length > max ? `<p style="margin:2px 0 8px;font-size:11px;color:#888;${FONT}">...and ${rows.length - max} more not shown.</p>` : "";
  return `<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;margin:2px 0 8px;border:1px solid #d0d7d0;"><tr>${th}</tr>${body}</table>${more}`;
}

export function pill(text: string, color: string): string {
  return `<span style="display:inline-block;padding:1px 7px;border-radius:9px;background:${color};color:#fff;font-size:11px;font-weight:bold;">${esc(text)}</span>`;
}

// Counts of a list of strings, biggest first: [["PASS", 12], ["CAUTION", 3]]
export function tally(values: (string | null | undefined)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = (v ?? "").trim() || "(blank)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// The business-timezone date and minutes-after-midnight of a timestamptz.
export function centralParts(ts: string): { date: string; minutes: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const p = f.formatToParts(new Date(ts));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
