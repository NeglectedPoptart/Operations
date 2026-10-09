// "PO 15719 | LOT FCON-28" -> po 15719, lot FCON-28 (the history sheet keeps
// them in separate columns); anything else goes in Lot whole.
export function splitPoLot(lotNumber: string): { po: string; lot: string } {
  const text = lotNumber.trim();
  const po = text.match(/\bPO\s*#?\s*([A-Za-z0-9-]+)/i)?.[1] ?? "";
  const lot = text.match(/\bLOT\s*#?\s*(.+)$/i)?.[1]?.trim();
  if (po || lot) return { po, lot: lot ?? "" };
  return { po: "", lot: text };
}
