// Parses a vendor price sheet pasted from WhatsApp - these come from dozens
// of different vendors with wildly inconsistent formatting (bullets +
// emoji, "Grade - N loads @ price", multi-line section headers, location
// markers, organic/conventional subsections, "@ CALL" for no fixed price).
// This is deliberately a best-effort parser: it's paired with an editable
// preview in the UI so a misread category/label/price is a quick fix, not a
// blocker.

export interface ParsedPriceSheetItem {
  category: string;
  itemLabel: string;
  size: string;
  price: number | null;
}

export interface ParsePriceSheetResult {
  vendorNameGuess: string | null;
  sheetDateGuess: string | null;
  items: ParsedPriceSheetItem[];
  error?: string;
}

// Keyword/emoji signals per major variety - checked against the item's own
// line first, falling back to the accumulated section header only when the
// line itself doesn't say enough (e.g. a bare "Xxl - 2 loads @ 13.95" under
// a "ROMAS # 1 - GREENHOUSE" header). Deliberately includes a couple of
// common misspellings/emoji seen in real vendor texts (zucchini/zuchinni,
// the 🥦/🥕/🌶/🥒/🍅/🍋/🧅 shorthand some vendors lean on instead of words).
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Bell Pepper": ["bell pepper", "bell peppers"],
  Broccoli: ["broccoli", "emperor crown", "🥦"],
  Carrots: ["carrot", "🥕"],
  Cauliflower: ["cauliflower"],
  Celery: ["celery"],
  Cucumber: ["cucumber", "cuke", "slicer", "🥒"],
  Jalapeno: ["jalape", "🌶"],
  Lemon: ["lemon", "🍋"],
  Lettuce: ["lettuce", "romaine"],
  Onion: ["onion", "🧅"],
  Poblano: ["poblano"],
  Serrano: ["serrano"],
  Squash: ["squash", "zucchini", "zuchinni", "zuchini"],
  Tomatillo: ["tomatillo"],
  Tomato: ["tomato", "roma", "grape tomato", "🍅"],
  Beets: ["beet"],
};

export const PRODUCE_CATEGORIES = [...Object.keys(CATEGORY_KEYWORDS), "Other"];

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

// Word keywords are checked across every category before any emoji keyword
// is - a couple of these emoji (🥒 for both cucumber and squash-family
// vendors, say) are ambiguous enough that an explicit word on the same line
// ("Mex Gray Squash 🥒") should always win over a shared shorthand symbol.
function classify(text: string): string {
  const t = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => !EMOJI_RE.test(k) && t.includes(k))) return category;
  }
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => EMOJI_RE.test(k) && t.includes(k))) return category;
  }
  return "Other";
}

// Same 2-or-4-digit-year date parser used across the other paste parsers in
// this app (invoicingParse.ts, oldAgeParse.ts) - duplicated rather than
// shared, matching that existing convention.
function parseUsDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyyRaw] = m;
  const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

const PRICE_RE = /\$\s*([\d.]+)|@\s*([\d.]+)/;
const CALL_PRICE_RE = /@\s*(call|mkt|market)\b/i;

function stripDecoration(s: string): string {
  return s
    .replace(/^[•\-*]+\s*/, "")
    .replace(/\s*[•\-*]+$/, "")
    // Emoji + variation selectors (produce vendors lean heavily on these
    // instead of words - stripped for the display label, but checked for
    // category signal separately against the raw line).
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}︎️]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "Xxl - 2 loads @ 13.95" / "140's - 3 pallets @ 25.00" -> the load/pallet
// count is packaging metadata, not part of the grade label.
function stripQuantityClause(s: string): string {
  return s.replace(/[-–]?\s*\d+\s*(loads?|pallets?)\s*$/i, "").trim();
}

function extractSize(text: string): { rest: string; size: string } {
  const m = text.match(/(\d+(?:\.\d+)?\s*(?:#|lbs?|lb|cts?|ct))\s*$/i);
  if (!m || m.index === undefined) return { rest: text.trim(), size: "" };
  return { rest: text.slice(0, m.index).trim(), size: m[1].trim() };
}

function looksLikeBareSizeFragment(s: string): boolean {
  return /^\d+(\.\d+)?\s*(#|lbs?|lb|cts?|ct)$/i.test(s.trim());
}

export function parsePriceSheetPaste(raw: string): ParsePriceSheetResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { vendorNameGuess: null, sheetDateGuess: null, items: [], error: "Nothing pasted." };
  }

  // A convenience prefill for a "new vendor" name field only - never trusted
  // as the actual vendor (that's always an explicit UI choice), so it's safe
  // to guess even when line 0 is really the first commodity header (e.g. an
  // Unknown/TBD paste with no vendor name at all - the loop below still
  // processes that same line as a header either way).
  const firstLine = lines[0];
  const vendorNameGuess =
    !PRICE_RE.test(firstLine) && !CALL_PRICE_RE.test(firstLine) && !parseUsDate(firstLine)
      ? stripDecoration(firstLine)
      : null;

  let sheetDateGuess: string | null = null;
  const items: ParsedPriceSheetItem[] = [];
  let headerParts: string[] = [];

  for (const line of lines) {
    const dateMatch = parseUsDate(line);
    if (dateMatch) {
      sheetDateGuess = dateMatch;
      continue;
    }

    const priceMatch = line.match(PRICE_RE);
    const callMatch = !priceMatch ? line.match(CALL_PRICE_RE) : null;

    if (priceMatch || callMatch) {
      const matchIndex = (priceMatch ?? callMatch)!.index ?? line.length;
      const price = priceMatch ? Number(priceMatch[1] ?? priceMatch[2]) : null;
      const labelRaw = stripQuantityClause(line.slice(0, matchIndex).trim());
      const cleanedLabel = stripDecoration(labelRaw);
      const headerText = headerParts.join(" ");

      const { rest: headerRest, size: headerSize } = extractSize(headerText);
      const { rest: labelRest, size: labelSize } = extractSize(cleanedLabel);

      const size = labelSize || headerSize;
      const rawCategory = classify(line);
      // A per-line label that's just a grade/size code ("Xxl", "140's")
      // carries no commodity identity on its own - prepend the header's
      // descriptive text ("ROMAS # 1 - GREENHOUSE", "RED BELL PEPPERS") so
      // the item still says what it is, same signal already used for the
      // category fallback below. When the line names its own commodity
      // ("SERRANO @ 22.00"), skip the header - it may be stale leftover
      // from an earlier section this line has nothing to do with.
      const itemLabel =
        rawCategory === "Other" ? [headerRest, labelRest].filter(Boolean).join(" ") || "Item" : labelRest || "Item";
      const category = rawCategory !== "Other" ? rawCategory : classify(headerText);

      items.push({
        category,
        itemLabel,
        size,
        price: price !== null && Number.isFinite(price) ? price : null,
      });
      continue;
    }

    // No price, no date - a section header. A bare size fragment ("25 lbs")
    // reads as a continuation of the current header ("RED BELL PEPPERS" +
    // "25 lbs"); anything else starts a fresh section.
    const cleaned = stripDecoration(line);
    if (cleaned === "") continue;
    if (looksLikeBareSizeFragment(cleaned) && headerParts.length > 0) {
      headerParts.push(cleaned);
    } else {
      headerParts = [cleaned];
    }
  }

  if (items.length === 0) {
    return {
      vendorNameGuess,
      sheetDateGuess,
      items: [],
      error: "Couldn't find any priced lines - make sure each item has a $ or @ price (or \"@ CALL\").",
    };
  }

  return { vendorNameGuess, sheetDateGuess, items };
}
