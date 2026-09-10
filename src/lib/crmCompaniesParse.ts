import type { CrmStatus } from "./types";

// Matches the "Companies" sheet in the Blue Book-derived CRM Excel export:
// Blue Book ID | Company | Legal / Alternate Name | City / State | Location
// Type | Phone | Classification (Raw) | Score (Raw) | Rating (Raw) | Source
// Status | Profile URL | CRM Status | Primary Contact | Email | CRM Notes
export interface ParsedCrmCompanyRow {
  blueBookId: string | null;
  name: string;
  legalName: string | null;
  cityState: string | null;
  locationType: string | null;
  phone: string | null;
  classification: string | null;
  score: number | null;
  rating: number | null;
  sourceStatus: string | null;
  profileUrl: string | null;
  crmStatus: CrmStatus;
  primaryContact: string | null;
  email: string | null;
  notes: string | null;
}

export interface CrmCompaniesParseResult {
  rows: ParsedCrmCompanyRow[];
  error?: string;
}

const STATUS_BY_LABEL: Record<string, CrmStatus> = {
  prospect: "prospect",
  contacted: "contacted",
  qualified: "qualified",
  customer: "customer",
  inactive: "inactive",
  "do not contact": "do_not_contact",
};

function cell(cells: string[], i: number): string | null {
  const v = cells[i]?.trim();
  return v ? v : null;
}

function toInt(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toFloat(v: string | null): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// The sheet's "Profile URL" column is a hyperlink displayed as the literal
// text "Open Profile" - a plain-text paste only carries that display text,
// not the underlying link. Blue Book's profile URLs are just the company id
// on a stable path, so reconstruct the real link from the Blue Book ID
// instead of storing the useless "Open Profile" label.
function resolveProfileUrl(raw: string | null, blueBookId: string | null): string | null {
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  if (blueBookId) return `https://apps.bluebookservices.com/company/profile/${blueBookId}`;
  return raw;
}

export function parseCrmCompaniesText(text: string): CrmCompaniesParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], error: "Paste some rows first." };

  const looksLikeHeader = /blue\s*book\s*id/i.test(lines[0]) && /company/i.test(lines[0]);
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  if (dataLines.length === 0) return { rows: [], error: "No data rows found below the header." };

  const rows: ParsedCrmCompanyRow[] = [];
  for (const line of dataLines) {
    const cells = line.split("\t");
    const name = cell(cells, 1);
    if (!name) continue;
    const statusLabel = cell(cells, 11)?.toLowerCase() ?? null;
    const blueBookId = cell(cells, 0);

    rows.push({
      blueBookId,
      name,
      legalName: cell(cells, 2),
      cityState: cell(cells, 3),
      locationType: cell(cells, 4),
      phone: cell(cells, 5),
      classification: cell(cells, 6),
      score: toInt(cell(cells, 7)),
      rating: toFloat(cell(cells, 8)),
      sourceStatus: cell(cells, 9),
      profileUrl: resolveProfileUrl(cell(cells, 10), blueBookId),
      crmStatus: (statusLabel && STATUS_BY_LABEL[statusLabel]) || "prospect",
      primaryContact: cell(cells, 12),
      email: cell(cells, 13),
      notes: cell(cells, 14),
    });
  }

  if (rows.length === 0) {
    return { rows: [], error: "Couldn't find any rows with a Company name (column 2)." };
  }
  return { rows };
}
