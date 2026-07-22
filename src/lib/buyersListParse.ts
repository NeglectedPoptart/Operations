// Parses a paste of the inventory pivot report: a header row (Whse, Comm,
// Var, PStyle, Size, Label, Grade, ..., Avl), then one row per size/label
// variant, with Whse/Comm/Var/PStyle/Size/Label all blank-means-inherit
// (merged-cell) from the row above - a new explicit value in any of those
// columns starts a fresh group at that level. "Sub" subtotal rows are
// skipped entirely. Only rows where Avl (available) is negative are kept -
// that's the shortage this page exists to track.
export interface ParsedBuyersItem {
  whse: string;
  comm: string;
  variety: string;
  pstyle: string;
  size: string;
  label: string;
  qtyNeeded: number;
}

function normCell(s: string | undefined): string {
  return (s ?? "").trim();
}

function findCol(header: string[], keyword: string): number {
  return header.findIndex((c) => normCell(c).toLowerCase().includes(keyword));
}

export function parseBuyersListPaste(raw: string): { items: ParsedBuyersItem[]; error: string | null } {
  const lines = raw.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { items: [], error: "Not enough rows - paste the full report including the header row." };
  }
  const rows = lines.map((l) => l.split("\t"));
  const header = rows[0];

  const col = {
    whse: findCol(header, "whse"),
    comm: findCol(header, "comm"),
    variety: findCol(header, "var"),
    pstyle: findCol(header, "pstyle"),
    size: findCol(header, "size"),
    label: findCol(header, "label"),
    avl: findCol(header, "avl"),
  };

  const missing = Object.entries(col)
    .filter(([, i]) => i === -1)
    .map(([key]) => key);
  if (missing.length > 0) {
    return { items: [], error: `Could not find these columns in the header row: ${missing.join(", ")}.` };
  }

  const state = { whse: "", comm: "", variety: "", pstyle: "", size: "", label: "" };
  const items: ParsedBuyersItem[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.some((c) => normCell(c).toLowerCase() === "sub")) continue;

    const carry = (i: number, key: keyof typeof state) => {
      const v = normCell(row[i]);
      if (v !== "") state[key] = v;
      return state[key];
    };

    const whse = carry(col.whse, "whse");
    const comm = carry(col.comm, "comm");
    const variety = carry(col.variety, "variety");
    const pstyle = carry(col.pstyle, "pstyle");
    const size = carry(col.size, "size");
    const label = carry(col.label, "label");

    if (!comm) continue;

    const avlRaw = normCell(row[col.avl]);
    if (avlRaw === "") continue;
    const avl = Number(avlRaw.replace(/,/g, ""));
    if (!Number.isFinite(avl) || avl >= 0) continue;

    items.push({ whse, comm, variety, pstyle, size, label, qtyNeeded: Math.abs(avl) });
  }

  if (items.length === 0) {
    return { items: [], error: "No rows with a negative Avl (available) were found in the pasted data." };
  }

  return { items, error: null };
}
