import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDocumentProxy } from "unpdf";
import { APP_TIMEZONE } from "@/lib/dates";

// Stamps a carrier's e-signature onto Harvest Best's Freight Confirmation PDF: the drawn signature,
// printed name, title and date on the "Carrier Signature / Printed Name / Title / Date" lines, plus
// an Electronic Signature Certificate page (who, when, from where, a fingerprint of the original).
// If the lines can't be found (a PDF that is not our template) the signature goes on the
// certificate page alone, so signing never fails just because of layout.

export interface SignInput {
  pdf: Uint8Array;
  signaturePng: Uint8Array;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  company: string;
  loadRef: string;
  rateText: string;
  ip: string | null;
  userAgent: string | null;
  signedAt: Date;
}

// Helvetica (WinAnsi) can't draw every character.
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, "?");
}

export function stampTime(d: Date): string {
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d)} CT`;
}

interface Spot {
  page: number; // 0-based
  x: number;
  y: number;
  size: number;
  width: number;
  str: string;
}

// Where the template's four signature-block fields sit, by reading the PDF's own text positions.
async function findBlock(pdf: Uint8Array): Promise<Record<"signature" | "name" | "title" | "date", Spot> | null> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const found: Partial<Record<"signature" | "name" | "title" | "date", Spot>> = {};
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      for (const raw of content.items) {
        const it = raw as { str?: string; transform?: number[]; width?: number };
        if (!it.str || !it.transform) continue;
        const spot: Spot = { page: p - 1, x: it.transform[4], y: it.transform[5], size: Math.abs(it.transform[0]) || 7.2, width: it.width ?? 0, str: it.str };
        if (/^Carrier Signature:\s*_+/.test(it.str)) found.signature = spot;
        else if (/^Printed Name:\s*_+/.test(it.str)) found.name = spot;
        else if (/^Title:\s*_+/.test(it.str)) found.title = spot;
        else if (/^Date:\s*_+/.test(it.str)) found.date = spot;
      }
    }
    if (found.signature && found.name && found.title && found.date) return found as Record<"signature" | "name" | "title" | "date", Spot>;
  } catch {
    // fall through to the certificate-only signature
  }
  return null;
}

export async function signRateConPdf(input: SignInput): Promise<{ pdf: Uint8Array; sha256: string }> {
  const sha256 = createHash("sha256").update(input.pdf).digest("hex");
  const doc = await PDFDocument.load(input.pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sig = await doc.embedPng(input.signaturePng);
  const when = stampTime(input.signedAt);
  const dateOnly = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(input.signedAt);

  const block = await findBlock(input.pdf);
  if (block) {
    const pages = doc.getPages();
    const fill = (spot: Spot) => {
      const label = spot.str.slice(0, spot.str.indexOf(":") + 1);
      const start = spot.x + font.widthOfTextAtSize(`${label} `, spot.size);
      const end = spot.x + spot.width;
      return { start, end, page: pages[spot.page], size: spot.size };
    };
    const putText = (spot: Spot, text: string) => {
      const f = fill(spot);
      let size = 8;
      const room = f.end - f.start - 2;
      while (size > 5 && font.widthOfTextAtSize(safe(text), size) > room) size -= 0.5;
      f.page.drawText(safe(text), { x: f.start + 1, y: spot.y + 1.6, size, font, color: rgb(0.05, 0.05, 0.3) });
    };
    putText(block.name, input.signerName);
    putText(block.title, input.signerTitle || "-");
    putText(block.date, dateOnly);

    const s = fill(block.signature);
    const room = s.end - s.start;
    const maxH = 24;
    const scale = Math.min(room / sig.width, maxH / sig.height);
    s.page.drawImage(sig, { x: s.start + 1, y: block.signature.y + 1, width: sig.width * scale, height: sig.height * scale });
  }

  // Certificate page.
  const page = doc.addPage([612, 792]);
  const left = 60;
  let y = 720;
  page.drawText("Electronic Signature Certificate", { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.4, 0.15) });
  y -= 24;
  page.drawText(safe("Harvest Best, Inc. - Freight Rate Confirmation"), { x: left, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  y -= 30;
  const rows: [string, string][] = [
    ["Load / order", input.loadRef],
    ["Carrier / broker", input.company],
    ["Signed by", input.signerName],
    ["Title", input.signerTitle || "-"],
    ["Login email", input.signerEmail],
    ["Rate accepted", input.rateText],
    ["Signed at", when],
    ["IP address", input.ip ?? "unknown"],
    ["Device", (input.userAgent ?? "unknown").slice(0, 110)],
    ["Document fingerprint (SHA-256 of the confirmation before signing)", ""],
  ];
  for (const [k, v] of rows) {
    page.drawText(safe(k), { x: left, y, size: 8.5, font: bold, color: rgb(0.4, 0.4, 0.4) });
    y -= 13;
    if (v) {
      page.drawText(safe(v), { x: left, y, size: 10.5, font, color: rgb(0.05, 0.05, 0.05) });
      y -= 20;
    }
  }
  page.drawText(sha256.slice(0, 32), { x: left, y, size: 8.5, font, color: rgb(0.05, 0.05, 0.05) });
  y -= 11;
  page.drawText(sha256.slice(32), { x: left, y, size: 8.5, font, color: rgb(0.05, 0.05, 0.05) });
  y -= 30;

  page.drawText("Signature", { x: left, y, size: 8.5, font: bold, color: rgb(0.4, 0.4, 0.4) });
  y -= 6;
  const boxW = 240;
  const boxH = 80;
  const scale = Math.min(boxW / sig.width, boxH / sig.height);
  page.drawRectangle({ x: left, y: y - boxH - 6, width: boxW + 12, height: boxH + 12, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.7 });
  page.drawImage(sig, { x: left + 6, y: y - boxH, width: sig.width * scale, height: sig.height * scale });
  y -= boxH + 36;

  const statement =
    "The person named above signed this Freight Rate Confirmation electronically while signed in to the Harvest Best Operations Platform, " +
    "agreeing to the terms and conditions in it and accepting the load at the rate shown. An electronic signature has the same effect as a handwritten one.";
  const words = statement.split(" ");
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, 9) > 490) {
      page.drawText(line, { x: left, y, size: 9, font, color: rgb(0.25, 0.25, 0.25) });
      y -= 12;
      line = w;
    } else line = trial;
  }
  if (line) page.drawText(line, { x: left, y, size: 9, font, color: rgb(0.25, 0.25, 0.25) });

  return { pdf: await doc.save(), sha256 };
}
