// Warehouse > Orders: the "Orders Summary" PDF out of the order system, and the
// types the Orders page and the follow-up agent share. No Supabase / unpdf
// imports here so the parsing can be checked on its own.

export interface PdfRow {
  y: number;
  // Text fragments on this line: left edge, width, text.
  cells: { x: number; w: number; str: string }[];
}

export interface ParsedOrder {
  order_no: string;
  warehouse: string;
  ship_date: string | null; // YYYY-MM-DD
  status: string;
  customer_code: string;
  customer_name: string;
  salesperson: string;
  terms: string;
  truck: string;
  freight: string;
  ordered: number;
  shipped: number;
}

export interface ParsedOrdersReport {
  orders: ParsedOrder[];
  parameters: string;
  // Total the report prints at the bottom, to catch a row that was misread.
  reportedOrders: number | null;
  warnings: string[];
}

export interface PendingOrder {
  id: string;
  order_no: string;
  warehouse: string | null;
  ship_date: string | null;
  status: string | null;
  customer_code: string | null;
  customer_name: string | null;
  salesperson: string | null;
  terms: string | null;
  truck: string | null;
  freight: string | null;
  ordered: number;
  shipped: number;
  notes: string;
  legend_id: string | null;
  greyed: boolean;
  moved_to: string | null;
  first_seen_at: string;
  last_seen_at: string;
  updated_at: string;
}

export interface OrderLegendItem {
  id: string;
  name: string;
  color: string; // #rrggbb
  opacity: number; // 0.05 - 1
  position: number;
  // One of the always-there labels: can't be deleted or renamed.
  is_preset?: boolean;
}

export interface OrderReportMeta {
  uploaded_at: string | null;
  uploaded_by: string | null;
  source_file: string | null;
  report_parameters: string | null;
  order_count: number;
}

// Column edges in the report (points from the left of the page). The numbers
// are right-aligned so they are placed by their right edge.
const COL = {
  status: 80,
  customer: 130,
  salesperson: 295,
  terms: 370,
  truck: 405,
  freight: 450,
  orderedRightMax: 545, // a number ending before this is "Ordered"
};

function isoDate(text: string): string | null {
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function toNumber(text: string): number {
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const NUMERIC = /^-?[\d,]+(\.\d+)?$/;

function textOf(cells: { x: number; str: string }[]): string {
  return cells
    .sort((a, b) => a.x - b.x)
    .map((c) => c.str.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseOrdersReport(rows: PdfRow[]): ParsedOrdersReport {
  const warnings: string[] = [];
  const orders: ParsedOrder[] = [];
  let parameters = "";
  let reportedOrders: number | null = null;
  let warehouse = "";
  let shipDate: string | null = null;

  for (const row of rows) {
    const cells = [...row.cells].sort((a, b) => a.x - b.x);
    if (cells.length === 0) continue;
    const first = cells[0].str.trim();

    if (/^Parameters:/i.test(first)) {
      parameters = textOf(cells.slice(1));
      continue;
    }
    if (/^Warehouse:/i.test(first)) {
      warehouse = textOf(cells.slice(1));
      continue;
    }
    if (/^Ship Date:/i.test(first)) {
      shipDate = isoDate(cells[1]?.str.trim() ?? "");
      continue;
    }
    if (/^Totals:/i.test(first)) {
      const count = cells.find((c, i) => i > 0 && cells[i - 1].str.trim() === "Orders:");
      if (count) reportedOrders = toNumber(count.str);
      continue;
    }

    // An order row starts with its number in the first column.
    if (cells[0].x < 45 && /^\d{4,}$/.test(first)) {
      const status: typeof cells = [];
      const customer: typeof cells = [];
      const salesperson: typeof cells = [];
      const terms: typeof cells = [];
      const truck: typeof cells = [];
      const freight: typeof cells = [];
      let ordered = 0;
      let shipped = 0;
      for (const c of cells.slice(1)) {
        const str = c.str.trim();
        if (!str) continue;
        if (NUMERIC.test(str) && c.x + c.w >= 520) {
          // A number out in the quantity columns (right-aligned).
          if (c.x + c.w <= COL.orderedRightMax) ordered = toNumber(str);
          else shipped = toNumber(str);
        } else if (c.x >= COL.freight - 5) freight.push(c);
        else if (c.x >= COL.truck - 5) truck.push(c);
        else if (c.x >= COL.terms - 5) terms.push(c);
        else if (c.x >= COL.salesperson - 5) salesperson.push(c);
        else if (c.x >= COL.customer - 5) customer.push(c);
        else if (c.x >= COL.status - 5) status.push(c);
      }

      const customerText = textOf(customer);
      const dash = customerText.indexOf(" - ");
      orders.push({
        order_no: first,
        warehouse,
        ship_date: shipDate,
        status: textOf(status),
        customer_code: dash >= 0 ? customerText.slice(0, dash).trim() : customerText,
        customer_name: dash >= 0 ? customerText.slice(dash + 3).trim() : "",
        salesperson: textOf(salesperson),
        terms: textOf(terms),
        truck: textOf(truck),
        freight: textOf(freight),
        ordered,
        shipped,
      });
    }
  }

  if (orders.length === 0) warnings.push("No orders were found - is this the Orders Summary report?");

  // An order can be listed more than once (e.g. under two ship dates). It is one
  // order here: quantities are added together and the earliest ship date is used.
  const merged = new Map<string, ParsedOrder>();
  const duplicates = new Map<string, string[]>();
  for (const o of orders) {
    const first = merged.get(o.order_no);
    if (!first) {
      merged.set(o.order_no, { ...o });
      continue;
    }
    duplicates.set(o.order_no, [...(duplicates.get(o.order_no) ?? []), o.ship_date ?? ""]);
    first.ordered += o.ordered;
    first.shipped += o.shipped;
    if (o.ship_date && (!first.ship_date || o.ship_date < first.ship_date)) first.ship_date = o.ship_date;
    if (!first.freight) first.freight = o.freight;
    if (!first.truck) first.truck = o.truck;
  }
  const unique = [...merged.values()];
  for (const [orderNo, dates] of duplicates) {
    warnings.push(`Order ${orderNo} is on the report more than once (${dates.map(shortDay).join(", ")}) - its quantities were added together.`);
  }
  // The report counts each listing, so compare against that, not the merged count.
  if (reportedOrders !== null && reportedOrders !== orders.length) {
    warnings.push(`The report says ${reportedOrders} orders but ${orders.length} were read - check the list.`);
  }
  for (const o of unique) if (!o.ship_date) warnings.push(`Order ${o.order_no} has no ship date.`);
  return { orders: unique, parameters, reportedOrders, warnings };
}

// ---------------------------------------------------------------------------
// Colours and display helpers shared by the page, the image and the Excel copy.

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// The legend colour as it looks over a white page, as a solid hex - what the
// image and the Excel copy use (a spreadsheet has no "opacity").
export function blendOverWhite(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, opacity));
  const mix = (c: number) => Math.round(255 - (255 - c) * a);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function rgbaOf(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, opacity))})`;
}

export const GREY_ROW = "#e5e7eb";

// An order's quantities as the report shows them.
export function qty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function shortDay(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

// A pending order that is still "live": not moved to a later day.
export function isMovedAway(order: { moved_to: string | null }, today: string): boolean {
  return !!order.moved_to && order.moved_to > today;
}
