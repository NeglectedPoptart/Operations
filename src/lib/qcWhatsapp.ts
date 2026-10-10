import { splitPoLot } from "./qcLot";
import type { QcLotInspection } from "./qcPlans";

// The WhatsApp message QC posts after an inspection:
//
//   🥦 LOT ABG-01
//   BROCCOLI GEN
//   ⚠️ CAUTION DUE TO MIXED WEIGHTS AND LOW PACKED ICE
//
//   TOP ICE: LOW
//
//   WEIGHTS: 28.1 - 29.6 - 28.9
//   TEMPS: 36.2 - 36.3 - 36.3
//   COUNTS: 19 - 21 - 17
//   NET WEIGHTS: 26.5 - 27.7 - 23.5
//
//   ISSUES:
//   MIXED SIZES
//   PURPLING
//
// Built from the saved inspection, then shown to the person to edit before it
// is sent.

// The header fields that describe the lot itself and are already in the first
// lines. Anything else on the plan (Top Ice, Packed Ice...) is printed as its own line.
const STANDARD_HEADER_KEYS = new Set([
  "facility",
  "grower",
  "product_label",
  "product_pack_style",
  "pack_style",
  "receive_date",
  "pack_date",
  "variety",
  "lot_number",
  "reason",
]);

const COMMODITY_EMOJI: [RegExp, string][] = [
  [/broccoli/i, "🥦"],
  [/lettuce|romaine|leaf|leafy|iceberg|spinach|kale/i, "🥬"],
  [/carrot/i, "🥕"],
  [/chili|hot pepper|jalape|serrano/i, "🌶️"],
  [/pepper|bell/i, "🫑"],
  [/cucumber/i, "🥒"],
  [/squash|zucchini/i, "🥒"],
];

export function commodityEmoji(commodity: string): string {
  return COMMODITY_EMOJI.find(([re]) => re.test(commodity))?.[1] ?? "🌿";
}

function resultEmoji(result: string): string {
  const r = result.toLowerCase();
  if (r.includes("urgent") || r.includes("fail")) return "🚨";
  if (r.includes("caution")) return "⚠️";
  if (r.includes("pass")) return "✅";
  return "";
}

// "Purpling/Morado" -> "PURPLING", "Mechanical Damage (Q)" -> "MECHANICAL DAMAGE":
// the English half of the LotPath bilingual names, without the (Q) / (Q/C) tags.
function issueName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .split("/")[0]
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function numbersLine(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? String(Number(Number(v).toFixed(2))) : String(v).trim()))
    .filter((v): v is string => !!v)
    .join(" - ");
}

export function buildWhatsappText(inspection: QcLotInspection): string {
  const config = inspection.plan_snapshot?.config;
  const lines: string[] = [];

  // LOT line
  const lotText = inspection.lot_number ?? "";
  const { lot } = splitPoLot(lotText);
  const lotShown = (lot || lotText).trim().toUpperCase();
  lines.push(`${commodityEmoji(inspection.commodity)} LOT ${lotShown}`.trim());

  // Product line: commodity + the label / pack style
  const label = (inspection.product_label ?? "").trim();
  const commodity = inspection.commodity.trim();
  const product = label.toLowerCase().startsWith(commodity.toLowerCase()) ? label : `${commodity} ${label}`;
  lines.push(product.trim().toUpperCase());

  // Result + reason
  const result = (inspection.result ?? "").trim();
  if (result) {
    const reason = (inspection.header?.reason ?? "").trim();
    lines.push([resultEmoji(result), result.toUpperCase(), reason ? `DUE TO ${reason.toUpperCase()}` : ""].filter(Boolean).join(" "));
  }

  // Plan-specific lines about the whole lot (Top Ice: LOW ...)
  const extras: string[] = [];
  for (const f of config?.headerFields ?? []) {
    if (STANDARD_HEADER_KEYS.has(f.key)) continue;
    const value = (inspection.header?.[f.key] ?? "").trim();
    if (value) extras.push(`${f.label.toUpperCase()}: ${value.toUpperCase()}`);
  }
  if (extras.length > 0) lines.push("", ...extras);

  // Per-sample readings
  const fields = config?.sampleFields ?? [];
  const pick = (re: RegExp) => fields.find((f) => re.test(f.label) || re.test(f.key));
  const readings: [string, RegExp][] = [
    ["WEIGHTS", /^(box[ _]?weight|weight)$/i],
    ["TEMPS", /temp/i],
    ["COUNTS", /^(quantity|count|counts)$/i],
    ["NET WEIGHTS", /net[ _]?weight/i],
  ];
  const readingLines: string[] = [];
  for (const [title, re] of readings) {
    const f = pick(re);
    if (!f) continue;
    const values = numbersLine(inspection.samples.map((s) => s[f.key]));
    if (values) readingLines.push(`${title}: ${values}`);
  }
  if (readingLines.length > 0) lines.push("", ...readingLines);

  // Issues: every defect that was counted, biggest first
  const issues = inspection.defects
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((d) => issueName(d.name))
    .filter(Boolean);
  if (issues.length > 0) lines.push("", "ISSUES:", ...issues);

  return lines.join("\n");
}
