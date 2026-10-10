import { commodityEmoji } from "./qcWhatsapp";
import { splitPoLot } from "./qcLot";
import type { QcLotInspection } from "./qcPlans";

// Subject lines for emailed inspection reports:
//
//   🥕 PO 15716 | LOT HOR-425 | HORTICAMPO CARROTS SJBO JBO 50 LBS (FAIL DUE TO DECAY FOUND AND QUALITY CONCERNS)
//
// and for a PO with several commodities (one email, one PDF each):
//
//   📦 PO 15751 | LOT FUE-44529 | FUENTES | RED LEAF (PASS), ROMAINE (CAUTION), CAULIFLOWER (FAIL)

function poLotParts(inspection: QcLotInspection): string[] {
  const text = (inspection.lot_number ?? "").trim();
  const { po, lot } = splitPoLot(text);
  const parts: string[] = [];
  if (po) parts.push(`PO ${po.toUpperCase()}`);
  const lotText = (lot || (po ? "" : text)).trim();
  if (lotText) parts.push(`LOT ${lotText.toUpperCase()}`);
  return parts;
}

function productText(inspection: QcLotInspection): string {
  const label = (inspection.product_label ?? "").trim();
  const commodity = inspection.commodity.trim();
  const joined = label.toLowerCase().startsWith(commodity.toLowerCase()) ? label : `${commodity} ${label}`;
  return joined.trim().toUpperCase();
}

function resultText(inspection: QcLotInspection, withReason: boolean): string {
  const result = (inspection.result ?? "").trim();
  if (!result) return "";
  const reason = withReason ? (inspection.header?.reason ?? "").trim() : "";
  return `${result.toUpperCase()}${reason ? ` DUE TO ${reason.toUpperCase()}` : ""}`;
}

export function reportSubject(inspection: QcLotInspection): string {
  const grower = (inspection.grower ?? "").trim().toUpperCase();
  const middle = [grower, productText(inspection)].filter(Boolean).join(" ");
  const result = resultText(inspection, true);
  const head = [...poLotParts(inspection), middle].filter(Boolean).join(" | ");
  return `${commodityEmoji(inspection.commodity)} ${head}${result ? ` (${result})` : ""}`.trim();
}

// Several commodities on the same PO / lot.
export function groupReportSubject(inspections: QcLotInspection[]): string {
  if (inspections.length === 1) return reportSubject(inspections[0]);
  const first = inspections[0];
  const emojis = new Set(inspections.map((i) => commodityEmoji(i.commodity)));
  const emoji = emojis.size === 1 ? [...emojis][0] : "📦";
  const grower = (first.grower ?? "").trim().toUpperCase();
  const items = inspections
    .map((i) => {
      const result = resultText(i, false);
      return `${productText(i)}${result ? ` (${result})` : ""}`;
    })
    .join(", ");
  return `${emoji} ${[...poLotParts(first), grower, items].filter(Boolean).join(" | ")}`;
}
