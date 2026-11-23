import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { extractText, getDocumentProxy } from "unpdf";
import { appBaseUrl } from "@/lib/carrierRates/token";
import {
  CARRIER_NAME_HINTS,
  CARRIER_PARSERS,
  PDF_CARRIERS,
  parseJearPastedTable,
  parseJearStatementCsv,
  parsePgtransPastedTable,
  splitCsvLine,
} from "@/lib/carrierStatementParse";
import { mergeInvoices } from "@/lib/invoiceImport";
import type { ParsedInvoiceRow, ParseResult } from "@/lib/invoicingParse";
import { SUPREME_EMAIL } from "@/lib/roles";
import { agentMailbox, listInboxSince, listStatementAttachments, markRead, sendEmail, type InboxMessage } from "./graph";
import type { Agent } from "./types";

// The Freight Statements agent. A carrier's statement (PDF, Excel, CSV, or Jear's table pasted in the email)
// emailed to the HOP@ mailbox by a HOPS user is read with the same parsers as Upload / Paste Statement on
// Accounting > Logistics Invoicing, and the invoices it lists are added to that carrier's list. Like the page,
// it only ADDS invoices that aren't on the list yet - nothing already there is changed or removed.

export interface StatementDeps {
  log: (agentId: string, kind: string, message: string) => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
}

const STATEMENT_WORDS = /statement|aging|\bsoa\b|open invoices?|outstanding|a\/r\b/i;
// A forwarded freight INVOICE (rather than a statement) - one carrier's own invoice PDF per file.
const INVOICE_WORDS = /invoice/i;
// Carriers whose PDF is a single invoice, not a statement of many. It adds a line, and doesn't count as a statement check.
const SINGLE_INVOICE_CARRIERS = new Set(["RWB"]);
const SUPPORTED = "ALIMAT, AMP, DSV, Griffith, Jear, Jerue, PGTrans, Profreight and RWB (invoices)";

// ---- reading the files -----------------------------------------------------------------------------

interface Source {
  label: string;
  kind: "pdf" | "sheet" | "body";
  // pdf: the PDF's text. body: the email text. sheet: unused (see csv / tsv).
  text: string;
  csv: string;
  tsv: string;
  error?: string;
}

function cellText(cell: ExcelJS.Cell): string {
  try {
    const v = cell.value as unknown;
    if (v === null || v === undefined) return "";
    // Dates in the carriers' own US format - the parsers expect MM/DD/YYYY.
    if (v instanceof Date) return `${v.getUTCMonth() + 1}/${v.getUTCDate()}/${v.getUTCFullYear()}`;
    if (typeof v === "object") {
      const o = v as { result?: unknown; richText?: { text: string }[]; text?: unknown };
      if ("result" in o) return o.result instanceof Date ? `${o.result.getUTCMonth() + 1}/${o.result.getUTCDate()}/${o.result.getUTCFullYear()}` : String(o.result ?? "");
      if (o.richText) return o.richText.map((t) => t.text).join("");
      if (o.text !== undefined) return String(o.text);
      return "";
    }
    return String(v);
  } catch {
    return "";
  }
}

const csvCell = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

function sourceFromRows(label: string, rows: string[][]): Source {
  const kept = rows.filter((r) => r.some((c) => c.trim() !== ""));
  return { label, kind: "sheet", text: "", csv: kept.map((r) => r.map(csvCell).join(",")).join("\n"), tsv: kept.map((r) => r.join("\t")).join("\n") };
}

async function readFile(file: { fileName: string; contentType: string; data: Buffer }): Promise<Source> {
  const name = file.fileName;
  const blank = { csv: "", tsv: "", text: "" };
  try {
    if (/\.pdf$/i.test(name) || /pdf/i.test(file.contentType)) {
      const pdf = await getDocumentProxy(new Uint8Array(file.data));
      const { text } = await extractText(pdf, { mergePages: true });
      return { label: name, kind: "pdf", ...blank, text };
    }
    if (/\.xlsx$/i.test(name)) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.data as unknown as ArrayBuffer);
      const sheet = workbook.worksheets.find((w) => w.rowCount > 0);
      if (!sheet) return { label: name, kind: "sheet", ...blank, error: "the workbook has no data" };
      const rows: string[][] = [];
      for (let r = 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= sheet.columnCount; c++) cells.push(cellText(row.getCell(c)).trim());
        rows.push(cells);
      }
      return sourceFromRows(name, rows);
    }
    if (/\.xls$/i.test(name)) {
      return { label: name, kind: "sheet", ...blank, error: "this is an old .xls file, which HOPS can't open - save it as .xlsx (or send the PDF) and email it again" };
    }
    if (/\.(csv|txt)$/i.test(name)) {
      const raw = file.data.toString("utf8").replace(/^﻿/, "");
      const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
      // A tab-separated .txt stays tab-separated; a CSV is split properly (quoted commas).
      const rows = lines.map((l) => (l.includes("\t") ? l.split("\t").map((c) => c.trim()) : splitCsvLine(l)));
      return sourceFromRows(name, rows);
    }
    return { label: name, kind: "sheet", ...blank, error: "not a PDF, Excel or CSV file" };
  } catch (err) {
    return { label: name, kind: /pdf/i.test(file.contentType) ? "pdf" : "sheet", ...blank, error: `couldn't open it (${err instanceof Error ? err.message : String(err)})` };
  }
}

// ---- working out which carrier, and reading the rows ------------------------------------------------

function hintsIn(text: string): string[] {
  return CARRIER_NAME_HINTS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

// The email's table, starting at its own header row - a forwarded message has "From: / Sent: / To:" lines above it.
function trimToTable(text: string): string {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*customer\s*(\t|$)/i.test(l));
  return at > 0 ? lines.slice(at).join("\n") : text;
}

function applyParser(carrier: string, source: Source): ParseResult | null {
  const parser = CARRIER_PARSERS.get(carrier);
  if (!parser) return null;
  let result: ParseResult | null = null;
  if (carrier === "JEAR") {
    // Jear sends its Weekly SOA as a file (21-day terms on the page's Upload button) or a table in the email body
    // (30-day terms, the page's Paste button) - each keeps the terms it has on the page.
    if (source.kind === "sheet") result = parseJearStatementCsv(source.csv);
    else if (source.kind === "body") result = parseJearPastedTable(trimToTable(source.text));
  } else if (carrier === "PGTRANS") {
    if (source.kind === "sheet") result = parsePgtransPastedTable(source.tsv);
    else if (source.kind === "body") result = parsePgtransPastedTable(trimToTable(source.text));
  } else if (PDF_CARRIERS.has(carrier)) {
    if (source.kind === "pdf") result = parser(source.text);
  }
  if (!result || result.error) return result;
  // A signature or a total line can slip in at the end of a pasted table - a real invoice has a number and an amount.
  const rows = result.rows.filter((r) => r.invoice_no.trim() !== "" && (carrier !== "JEAR" || (r.amount !== null && r.invoice_date !== null)));
  return rows.length > 0 ? { rows } : { rows: [], error: "no invoice rows found" };
}

function foundRows(r: ParseResult | null): number {
  return r && !r.error ? r.rows.length : 0;
}

// File name first, then the statement's own text, then (only when it's the one statement in the email) the subject
// and sender. If none of those name a carrier, the carrier whose parser is the only one to find invoices wins.
function pickCarrier(source: Source, context: string, onlyOne: boolean): string | null {
  const body = source.kind === "sheet" ? `${source.csv}` : source.text;
  const tiers = [source.label, body.slice(0, 20000), ...(onlyOne ? [context] : [])];
  for (const tier of tiers) {
    const found = hintsIn(tier);
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      const working = found.filter((c) => foundRows(applyParser(c, source)) > 0);
      if (working.length === 1) return working[0];
    }
  }
  const fits = [...CARRIER_PARSERS.keys()].filter((c) => foundRows(applyParser(c, source)) > 0);
  return fits.length === 1 ? fits[0] : null;
}

// ---- who may send, and one email ---------------------------------------------------------------------

async function allowedSender(db: SupabaseClient, agent: Agent, from: string): Promise<boolean> {
  const email = from.trim().toLowerCase();
  if (!email) return false;
  if (email === SUPREME_EMAIL.toLowerCase()) return true;
  if ((agent.config.recipients ?? []).some((e) => e.trim().toLowerCase() === email)) return true;
  // Any HOPS login except a carrier's.
  const { data } = await db.from("profiles").select("email, role");
  return (data ?? []).some((p) => ((p.email as string | null) ?? "").trim().toLowerCase() === email && p.role !== "broker_carrier");
}

interface Outcome {
  label: string;
  carrier?: string;
  found?: number;
  added?: number;
  already?: number;
  error?: string;
}

function outcomeLine(o: Outcome): string {
  if (o.error) return `X  ${o.label}: ${o.error}`;
  const name = o.carrier ?? "";
  if (!o.added) return `OK ${name} (${o.label}): ${o.found} invoice${o.found === 1 ? "" : "s"} found - nothing new, ${o.found === 1 ? "it was" : "they were all"} already on the list.`;
  return `OK ${name} (${o.label}): ${o.found} invoice${o.found === 1 ? "" : "s"} found - ${o.added} new added, ${o.already} already on the list.`;
}

// Reads one email. Returns true when it was a statement email (handled, good or bad), false when it was something else
// and should be left to the other readers.
export async function handleStatementEmail(db: SupabaseClient, msg: InboxMessage, deps: StatementDeps): Promise<boolean> {
  const { data: agent } = await db.from("agents").select("*").eq("key", "freight_statements").maybeSingle<Agent>();
  if (!agent || !agent.enabled) return false;
  if (!(await allowedSender(db, agent, msg.fromEmail))) return false;

  // Each email once: the newest message is re-read on every inbox pass.
  const stateKey = `freight_statement:${msg.id}`;
  const { data: seen } = await db.from("agent_state").select("key, value").eq("key", stateKey).maybeSingle();
  if (seen) return seen.value !== "not_statement";
  const remember = (value: string) => db.from("agent_state").upsert({ key: stateKey, value, updated_at: new Date().toISOString() });

  const body = msg.fullText || msg.text;
  const named = hintsIn(`${msg.subject} ${msg.fromEmail}`);
  const looksLike = named.length > 0 || STATEMENT_WORDS.test(msg.subject) || /\bJEAR PO\b/i.test(body);
  const files = msg.hasAttachments ? await listStatementAttachments(msg.id).catch(() => []) : [];
  const fileHints = files.some((f) => hintsIn(f.fileName).length > 0 || STATEMENT_WORDS.test(f.fileName));
  // Not obviously a statement, but it says "invoice" and has a file: it might be a carrier's invoice. That is only
  // acted on if a file turns out to be one a parser reads - anything else is left for the other readers, silently.
  const maybeInvoice = !looksLike && !fileHints && files.length > 0 && (INVOICE_WORDS.test(msg.subject) || files.some((f) => INVOICE_WORDS.test(f.fileName)));
  if (!looksLike && !fileHints && !maybeInvoice) {
    await remember("not_statement");
    return false;
  }
  if (!maybeInvoice) await remember("handled");

  const context = `${msg.subject} ${msg.fromEmail}`;
  const sources: Source[] = [];
  for (const f of files) sources.push(await readFile(f));
  const fileSources = sources.length;
  // A statement pasted into the email itself (Jear's table). Only used when it really contains one.
  sources.push({ label: "the email itself", kind: "body", text: body, csv: "", tsv: "" });

  const outcomes: Outcome[] = [];
  const touched = new Set<string>();
  for (const source of sources) {
    const isBody = source.kind === "body";
    if (source.error) {
      outcomes.push({ label: source.label, error: source.error });
      continue;
    }
    const carrier = pickCarrier(source, context, sources.length === 1 || (isBody && fileSources === 0));
    if (!carrier) {
      // The email's own text is usually just a note - only worth a complaint when there was nothing else to read.
      if (!isBody || fileSources === 0) {
        outcomes.push({ label: source.label, error: `couldn't tell which carrier this is (I read ${SUPPORTED}). Put the carrier's name in the subject or the file name and send it again.` });
      }
      continue;
    }
    const parsed = applyParser(carrier, source);
    if (!parsed || parsed.error) {
      if (isBody) continue;
      const why = !parsed ? `${carrier} sends a ${carrier === "JEAR" || carrier === "PGTRANS" ? "spreadsheet or table" : "PDF"} - this isn't that.` : parsed.error;
      outcomes.push({ label: source.label, carrier, error: `${why}` });
      continue;
    }
    // One carrier's statement can arrive twice in one email (a table and its file) - the merge drops the repeats.
    const { data: brokers } = await db.from("brokers").select("id, name");
    // The exact name, else (for carriers whose broker name is longer, like "RWB Trucking, LLC./Wintrust Bank") the
    // one broker whose name starts with it.
    const names = (brokers ?? []) as { id: string; name: string }[];
    const exact = names.find((b) => String(b.name).trim().toLowerCase() === carrier.toLowerCase());
    const starts = names.filter((b) => String(b.name).trim().toLowerCase().startsWith(carrier.toLowerCase()));
    const broker = exact ?? (starts.length === 1 ? starts[0] : undefined);
    if (!broker) {
      outcomes.push({ label: source.label, carrier, error: `there's no carrier called "${carrier}" under Logistics Invoicing.` });
      continue;
    }
    try {
      const rows: ParsedInvoiceRow[] = parsed.rows.map(({ invoice_no, invoice_date, customer_po, amount }) => ({ invoice_no, invoice_date, customer_po, amount }));
      const { inserted, alreadyOnList } = await mergeInvoices(db, String(broker.id), rows);
      outcomes.push({ label: source.label, carrier, found: rows.length, added: inserted.length, already: alreadyOnList });
      touched.add(carrier);
      // A statement that arrived by email counts as checking that carrier's statement, same as running the
      // Statement Checker - even when every invoice on it was already on the list. (A single invoice isn't a statement.)
      if (!SINGLE_INVOICE_CARRIERS.has(carrier)) {
        await db.from("brokers").update({ last_statement_checked_at: new Date().toISOString() }).eq("id", String(broker.id));
      }
    } catch (err) {
      outcomes.push({ label: source.label, carrier, error: `couldn't save the invoices (${err instanceof Error ? err.message : String(err)}).` });
    }
  }

  if (maybeInvoice) {
    // Nothing that reads as a carrier invoice: not ours - leave the email to the other readers, with no reply.
    if (touched.size === 0) {
      await remember("not_statement");
      return false;
    }
    await remember("handled");
    // A real invoice came in; ignore any other file in the email that wasn't one.
    for (let i = outcomes.length - 1; i >= 0; i--) if (outcomes[i].error) outcomes.splice(i, 1);
  }

  if (outcomes.length === 0) {
    outcomes.push({ label: msg.subject || "your email", error: `I couldn't find a statement in it. Attach the carrier's PDF, Excel or CSV (${SUPPORTED}).` });
  }

  const good = outcomes.filter((o) => !o.error);
  const bad = outcomes.filter((o) => o.error);
  const totalNew = good.reduce((n, o) => n + (o.added ?? 0), 0);
  const summary = outcomes.map(outcomeLine).join(" | ");
  await deps.log(agent.id, bad.length > 0 ? "error" : "info", `Statement email from ${msg.fromEmail}: ${summary}`);

  const link = `${appBaseUrl()}/accounting/logistics-invoicing`;
  const emailBody = [
    `HOPS read your email "${msg.subject}".`,
    "",
    ...outcomes.map(outcomeLine),
    "",
    good.length > 0 ? "Only invoices that weren't on the list were added - nothing already there was changed or removed." : "",
    good.length > 0 ? `See them under Accounting > Logistics Invoicing: ${link}` : "",
    "",
    "- HOPS Agent",
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");
  try {
    await sendEmail({
      to: [msg.fromEmail],
      subject: `${bad.length > 0 ? "Statement problem" : ([...touched].every((c) => SINGLE_INVOICE_CARRIERS.has(c)) ? "Invoice added" : "Statement added")}: ${[...touched].join(", ") || msg.subject}`,
      body: emailBody,
    });
  } catch (err) {
    await deps.log(agent.id, "error", `Couldn't email the result to ${msg.fromEmail}: ${err instanceof Error ? err.message : String(err)}`);
  }
  // The owner always hears about a problem; a good result only when someone else sent the statement.
  if (bad.length > 0) await deps.notify("Freight statement needs a look", `${msg.fromEmail}: ${bad.map((o) => `${o.label} - ${o.error}`).join("; ")}`.slice(0, 220));
  else if (msg.fromEmail.toLowerCase() !== SUPREME_EMAIL.toLowerCase()) await deps.notify(([...touched].every((c) => SINGLE_INVOICE_CARRIERS.has(c)) ? "Freight invoice added" : "Freight statement added"), `${[...touched].join(", ")}: ${totalNew} new invoice${totalNew === 1 ? "" : "s"}.`);

  await markRead(msg.id).catch(() => {});
  return true;
}

// "Run now": looks back over the last few days of the HOP@ mailbox for statement emails that haven't been read yet
// (the agent was off when one arrived, or it was sent a minute ago). Returns how many emails it handled.
export async function runFreightStatements(db: SupabaseClient, agent: Agent, opts: { force: boolean; deps: StatementDeps; notes: string[] }): Promise<number> {
  if (!opts.force) return 0; // the 15-minute inbox pass reads them as they arrive
  const since = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
  const mailbox = agentMailbox().toLowerCase();
  let handled = 0;
  const messages = await listInboxSince(since, 50);
  for (const msg of messages) {
    if (msg.fromEmail === mailbox || /\[HOPS-[0-9A-F]{6}\]/i.test(msg.subject)) continue;
    const { data: seen } = await db.from("agent_state").select("key").eq("key", `freight_statement:${msg.id}`).maybeSingle();
    if (seen) continue;
    if (await handleStatementEmail(db, msg, opts.deps).catch(() => false)) handled++;
  }
  if (handled === 0) opts.notes.push("I looked through the last 3 days of the HOP@ mailbox and found no new statement emails. Email one to HOP@ from your HOPS address and I'll read it within 15 minutes.");
  return handled;
}
