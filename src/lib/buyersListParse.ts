// Parses the ERP's "Warehouse Desk group by Whse, Comm, Var" PDF report
// (extracted via unpdf - see actions.ts's extractPdfText) directly, instead
// of requiring a tab-separated paste of the same report from Excel first.
//
// Column order per row is fixed: Whse Comm Var PStyle Size Label Grade
// L.Night Rec In.T Order Shipped Avl - but unlike a tab-separated paste,
// a blank cell isn't represented by anything at all in the extracted text,
// it's just omitted, so the leading descriptive tokens on a line are some
// variable-length subsequence of [Whse, Comm, Var, PStyle, Size, Label,
// Grade] rather than a fixed 7 columns. Verified against a real export:
//   - Whse/Comm/Var always appear together as a full triple (never
//     independently blank) whenever a new commodity/variety group starts -
//     detected by the line starting with a 2-digit Whse token.
//   - PStyle and Size both use "blank = same as the row above" merged-cell
//     display, same as Whse/Comm/Var.
//   - Label and Grade are NOT inherited - they're independently present or
//     absent as real per-row data, identified by matching a known-value
//     set (extend KNOWN_LABELS/KNOWN_GRADES below if a real import turns up
//     a label/grade this doesn't recognize) since there's no structural
//     signal otherwise. A rare "PStyle-only, no size" row (e.g. an
//     "INBOUND" pseudo-pack-style bucket) is handled via
//     PSTYLE_ONLY_MARKERS since it can't be told apart from a lone Size
//     token any other way.
// "Sub" subtotal lines get "Sub" appended to their last number with no
// space (e.g. "126Sub") rather than leading the line - stripped and
// skipped. Only rows where Avl (available) is negative are kept - that's
// the shortage this page exists to track, exactly as the old paste parser
// did.
export interface ParsedBuyersItem {
  whse: string;
  comm: string;
  variety: string;
  pstyle: string;
  size: string;
  label: string;
  qtyNeeded: number;
}

const KNOWN_LABELS = new Set(["GEN", "HB", "FRESCO", "20#"]);
const PSTYLE_ONLY_MARKERS = new Set(["INBOUND"]);

function popIfLabel(tokens: string[]): string | null {
  const last = tokens[tokens.length - 1];
  if (last && KNOWN_LABELS.has(last.toUpperCase())) return tokens.pop() ?? null;
  return null;
}

// Grade is never captured (ParsedBuyersItem has no field for it) - only
// needs to be recognized well enough to discard before it's mistaken for
// PStyle/Size. Observed values are short: a single letter ("U") or a
// "#<digits>" code ("#1").
function popIfGrade(tokens: string[]): void {
  const last = tokens[tokens.length - 1];
  if (last && (/^[A-Z]{1,2}$/.test(last) || /^#\d+$/.test(last))) tokens.pop();
}

function parseNum(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

const NON_DATA_LINE_RE = /^(Parameters:|Warehouse Desk|Harvest Best|Date:|\d{1,2}\/\d{1,2}\/\d{2,4}\s|Pds\d|Whse\s|Comm\s.*Whse$|\d+\/\d+$)/;

export function parseBuyersListPdfText(raw: string): { items: ParsedBuyersItem[]; error: string | null } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !NON_DATA_LINE_RE.test(l));

  const state = { whse: "", comm: "", variety: "", pstyle: "", size: "" };
  const items: ParsedBuyersItem[] = [];

  for (let line of lines) {
    let isSubtotal = false;
    if (/Sub$/.test(line)) {
      line = line.replace(/Sub$/, "").trim();
      isSubtotal = true;
    }
    if (line === "") continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 6) continue; // not enough for even just the 6 trailing metrics

    const metricTokens = tokens.slice(-6);
    if (!metricTokens.every((t) => /^-?[\d,]+$/.test(t))) continue; // not a data row
    const avl = parseNum(metricTokens[5]);

    let desc = tokens.slice(0, -6);

    // A 2-digit Size value (e.g. "30") would otherwise be mistaken for a
    // new Whse token - require the two tokens after it to look like real
    // Comm/Var words (not more numbers) before treating it as a group
    // header, since Whse only ever appears together with a fresh Comm+Var.
    const looksNumeric = (t: string | undefined) => !t || /^[\d,.-]+$/.test(t);
    if (/^\d{2}$/.test(desc[0]) && desc.length >= 3 && !looksNumeric(desc[1]) && !looksNumeric(desc[2])) {
      state.whse = desc[0];
      state.comm = desc[1];
      state.variety = desc[2];
      desc = desc.slice(3);
    }

    // Check label before grade (not the other way around) - a 2-letter
    // label like "HB" would otherwise get mistaken for a grade code. Only
    // fall back to stripping a grade, then re-checking label, when the
    // trailing token isn't a recognized label itself (the CTN56/FCR/20#/U
    // case: "U" isn't a label, so it's popped as grade, exposing "20#").
    let label = popIfLabel(desc);
    if (label === null) {
      popIfGrade(desc);
      label = popIfLabel(desc);
    }
    label = label ?? "";

    if (desc.length >= 2) {
      state.pstyle = desc[0];
      state.size = desc[1];
    } else if (desc.length === 1) {
      if (PSTYLE_ONLY_MARKERS.has(desc[0].toUpperCase())) {
        state.pstyle = desc[0];
      } else {
        state.size = desc[0];
      }
    }
    // desc.length === 0: both pstyle and size inherited from the row above.

    if (isSubtotal || !state.comm) continue;
    if (!Number.isFinite(avl) || avl >= 0) continue;

    items.push({
      whse: state.whse,
      comm: state.comm,
      variety: state.variety,
      pstyle: state.pstyle,
      size: state.size,
      label,
      qtyNeeded: Math.abs(avl),
    });
  }

  if (items.length === 0) {
    return { items: [], error: "No rows with a negative Avl (available) were found in this PDF." };
  }
  return { items, error: null };
}
