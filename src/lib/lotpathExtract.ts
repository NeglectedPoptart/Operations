import { getDocumentProxy } from "unpdf";
import type { LotpathRow } from "./lotpathParse";

// PDF -> positioned rows, for parseLotpathRows. Server-side only (unpdf wraps
// pdf.js for serverless, same as every other PDF import in the app).
export async function extractLotpathRows(bytes: Uint8Array): Promise<LotpathRow[]> {
  const pdf = await getDocumentProxy(bytes);
  const rows: LotpathRow[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY: { y: number; cells: { x: number; str: string }[] }[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      // Items on the same baseline (within a point or two) are one line.
      let row = byY.find((r) => Math.abs(r.y - y) < 2);
      if (!row) {
        row = { y, cells: [] };
        byY.push(row);
      }
      row.cells.push({ x, str: item.str });
    }
    byY.sort((a, b) => b.y - a.y);
    for (const r of byY) rows.push({ page: p, y: r.y, cells: r.cells });
  }
  return rows;
}
