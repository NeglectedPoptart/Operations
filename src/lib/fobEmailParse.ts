import type { FobItem } from "./types";

// Parses the recurring daily FOB pricing email: blocks of
//   Category Header[:]
//   Label...$price
//   Label...$price
// separated by blank lines. A line with no "$" starts a new category (text
// before the first colon); a line with "$" is a price line for the current
// category. Trailing notes like "(pre book)" after the price are ignored.
export interface ParsedFobPriceLine {
  category: string;
  label: string;
  price: number;
}

const PRICE_LINE_RE = /^(.*?)[\s.…\-–—]*\$\s*(\d+(?:\.\d+)?)/;

export function parseFobPriceEmail(raw: string): ParsedFobPriceLine[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: ParsedFobPriceLine[] = [];
  let category = "";
  for (const line of lines) {
    const match = line.match(PRICE_LINE_RE);
    if (match && match[1].trim() !== "") {
      results.push({
        category,
        label: match[1].trim().replace(/\s+/g, " "),
        price: parseFloat(match[2]),
      });
    } else if (!line.includes("$")) {
      category = line.split(":")[0].trim().replace(/\s+/g, " ");
    }
  }
  return results;
}

interface Target {
  group: string;
  variety?: string;
  size?: string;
}

// Hand-mapped to the current FOB - Pharr catalog (commodity_group/variety/
// size as edited in the UI), since the email uses shorthand labels ("MD",
// "Choice", "#1") that don't literally match the catalog's field names.
// Unrecognized headers/labels resolve to no targets and are surfaced to the
// user as "not matched" rather than guessed at.
function resolveTargets(category: string, label: string): Target[] {
  const cat = category.toLowerCase().replace(/\s+/g, " ").trim();
  const lbl = label.toLowerCase().replace(/\s+/g, " ").trim();

  if (cat === "green pepper") {
    if (lbl === "jbo/xl") return [{ group: "Bell Pepper 25lb", variety: "Green - JBO" }, { group: "Bell Pepper 25lb", variety: "Green - XLG" }];
    if (lbl === "large") return [{ group: "Bell Pepper 25lb", variety: "Green - LGE" }];
    if (lbl === "medium") return [{ group: "Bell Pepper 25lb", variety: "Green - MED" }];
    if (lbl === "choice") return [{ group: "Bell Pepper 25lb", variety: "Green - CH" }];
  }
  if (cat === "red pepper 11#" && lbl === "jbo/xl") return [{ group: "Bell Pepper 1lb", variety: "Red - XLG/JBO" }];
  if (cat === "yellow pepper 11#" && lbl === "jbo/xl") return [{ group: "Bell Pepper 1lb", variety: "Yellow - XLG/JBO" }];
  if ((cat === "orange pepper#" || cat === "orange pepper") && lbl === "jbo/xl") {
    return [{ group: "Bell Pepper 1lb", variety: "Orange - XLG/JBO" }];
  }
  if (cat === "red pepper 25#") {
    if (lbl === "xl") return [{ group: "Bell Pepper 25lb", variety: "Red - XLG/JBO" }];
    if (lbl === "md") return [{ group: "Bell Pepper 25lb", variety: "Red - MED" }];
  }
  if (cat === "yellow pepper 25#") {
    if (lbl === "xl") return [{ group: "Bell Pepper 25lb", variety: "Yellow - XLG/JBO" }];
    if (lbl === "md") return [{ group: "Bell Pepper 25lb", variety: "Yellow - MED" }];
  }
  if (cat === "orange pepper 25#") {
    if (lbl === "xl") return [{ group: "Bell Pepper 25lb", variety: "Orange - XLG/JBO" }];
    if (lbl === "md") return [{ group: "Bell Pepper 25lb", variety: "Orange - MED" }];
  }
  if (cat === "jalapenos" || cat === "jalapeno") {
    if (lbl === "xl") return [{ group: "Bell Pepper 25lb", variety: "Jalapeno XLG" }];
    if (lbl === "lg") return [{ group: "Bell Pepper 25lb", variety: "Jalapeno LG" }];
  }
  if ((cat === "serranos" || cat === "serrano") && lbl === "xl") return [{ group: "Bell Pepper 25lb", variety: "Serrano" }];
  if ((cat === "poblanos" || cat === "poblano") && lbl === "xl") return [{ group: "Bell Pepper 25lb", variety: "Poblano" }];

  if (cat === "celery") {
    if (lbl === "24ct") return [{ group: "Celery - Naked", size: "24s" }];
    if (lbl === "30ct") return [{ group: "Celery - Naked", size: "30s" }];
  }
  if (cat === "iceberg lettuce") {
    if (lbl === "cello 24") return [{ group: "Lettuce", variety: "Iceberg", size: "Cello" }];
    if (lbl === "liner 24") return [{ group: "Lettuce", variety: "Iceberg", size: "Liner" }];
  }
  if (cat === "broccoli") {
    if (lbl === "#1") return [{ group: "Broccoli", variety: "Fu Choy Red" }];
    if (lbl === "#2") return [{ group: "Broccoli", variety: "Fu Choy Green" }];
    if (lbl === "iceless") return [{ group: "Broccoli", variety: "Iceless" }];
  }
  if (cat === "cauliflower" && lbl === "12ct") return [{ group: "Cauliflower", variety: "12ct" }];
  if (cat === "romaine" && lbl === "24ct") return [{ group: "Lettuce", variety: "Romaine", size: "Liner" }];
  if (cat === "green leaf" && lbl === "24ct") return [{ group: "Lettuce", variety: "Green Leaf", size: "Liner" }];
  if (cat === "carrots") {
    if (lbl === "mediums 50#") return [{ group: "Carrots", variety: "MED" }];
    if (lbl === "jumbo 50#") return [{ group: "Carrots", variety: "JBO" }];
    if (lbl === "super jumbos 50#") return [{ group: "Carrots", variety: "LGE" }];
  }

  return [];
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findItem(target: Target, items: FobItem[]): FobItem | null {
  const found = items.filter(
    (i) =>
      norm(i.commodity_group) === norm(target.group) &&
      (target.variety === undefined || norm(i.variety) === norm(target.variety)) &&
      (target.size === undefined || norm(i.size) === norm(target.size)),
  );
  return found.length === 1 ? found[0] : null;
}

export interface FobPriceMatch {
  category: string;
  label: string;
  price: number;
  matches: FobItem[];
}

// For each parsed price line, resolves the catalog item(s) it should update.
// A line with zero or ambiguous (>1) matches is left with an empty
// `matches` array so the UI can show it as skipped rather than guess.
export function matchFobPriceLines(parsed: ParsedFobPriceLine[], items: FobItem[]): FobPriceMatch[] {
  return parsed.map((p) => {
    const targets = resolveTargets(p.category, p.label);
    const matches = targets.map((t) => findItem(t, items)).filter((i): i is FobItem => i !== null);
    return { ...p, matches: matches.length === targets.length && targets.length > 0 ? matches : [] };
  });
}
