import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/carrierRates/token";
import { extractLotpathRows } from "@/lib/lotpathExtract";
import { queueFullPhotos } from "@/lib/lotpathFullPhotos";
import { extractLotpathPhotos, pdfLooksLikeLotpath, type LotpathPhoto } from "@/lib/lotpathPhotos";
import { saveLotpathParsed } from "@/lib/lotpathSave";
import { parseLotpathRows } from "@/lib/lotpathParse";
import { SUPREME_EMAIL } from "@/lib/roles";
import { listStatementAttachments, markRead, sendEmail, type InboxMessage } from "./graph";

// A third-party inspector's LotPath report (the PDF LotPath emails out) forwarded to the HOP@ mailbox by a HOPS user
// becomes a Lot Inspection on QC > Inspections: the same data as one done in HOPS, with the photos from the report.
// Anything that isn't a LotPath report is left alone for the other inbox readers.

export interface QcEmailDeps {
  log: (kind: string, message: string) => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
}

async function allowedSender(db: SupabaseClient, from: string): Promise<boolean> {
  const email = from.trim().toLowerCase();
  if (!email) return false;
  if (email === SUPREME_EMAIL.toLowerCase()) return true;
  // Any HOPS login except a carrier's.
  const { data } = await db.from("profiles").select("email, role");
  return (data ?? []).some((p) => ((p.email as string | null) ?? "").trim().toLowerCase() === email && p.role !== "broker_carrier");
}

interface Outcome {
  label: string;
  line: string;
  ok: boolean;
}

// Returns true when the email held a LotPath report (imported, already there, or unreadable), false when it was
// something else.
export async function handleQcInspectionEmail(db: SupabaseClient, msg: InboxMessage, deps: QcEmailDeps): Promise<boolean> {
  if (!msg.hasAttachments) return false;
  if (!(await allowedSender(db, msg.fromEmail))) return false;

  // Each email once: the newest message is re-read on every inbox pass.
  const stateKey = `qc_lotpath:${msg.id}`;
  const { data: seen } = await db.from("agent_state").select("key, value").eq("key", stateKey).maybeSingle();
  if (seen) return seen.value !== "not_lotpath";
  const remember = (value: string) => db.from("agent_state").upsert({ key: stateKey, value, updated_at: new Date().toISOString() });

  const files = (await listStatementAttachments(msg.id).catch(() => [])).filter((f) => /\.pdf$/i.test(f.fileName) || /pdf/i.test(f.contentType));
  const reports: { fileName: string; bytes: Uint8Array }[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(f.data);
    if (await pdfLooksLikeLotpath(bytes)) reports.push({ fileName: f.fileName, bytes });
  }
  if (reports.length === 0) {
    await remember("not_lotpath");
    return false;
  }
  await remember("handled");

  const outcomes: Outcome[] = [];
  for (const r of reports) {
    try {
      const parsed = parseLotpathRows(await extractLotpathRows(r.bytes.slice()));
      if ("error" in parsed) {
        outcomes.push({ label: r.fileName, ok: false, line: `X  ${r.fileName}: ${parsed.error}` });
        continue;
      }
      const photos = await extractLotpathPhotos(r.bytes).catch(() => [] as LotpathPhoto[]);
      const saved = await saveLotpathParsed(db, parsed, { photos: photos.map((p) => p.thumb), status: "LotPath report (emailed)" });
      // The PDF's photos are thumbnails linking to the full-size ones - fetched in the background and swapped in.
      if (saved.status === "imported" && saved.photos > 0) await queueFullPhotos(db, saved.inspectionId, photos.map((p) => p.fullUrl)).catch(() => {});
      const name = `${parsed.commodity || parsed.planName}${parsed.headerFields.find((h) => /lot/i.test(h.label))?.value ? ` - lot ${parsed.headerFields.find((h) => /lot/i.test(h.label))!.value}` : ""}`;
      if (saved.status === "imported") outcomes.push({ label: r.fileName, ok: true, line: `OK ${name}: added to Inspections with ${saved.photos} photo${saved.photos === 1 ? "" : "s"}${saved.planCreated ? ` (a new "${parsed.planName}" inspection plan was made from the report)` : ""}.` });
      else if (saved.status === "duplicate") outcomes.push({ label: r.fileName, ok: true, line: `OK ${name}: already on the Inspections list - nothing added.` });
      else outcomes.push({ label: r.fileName, ok: false, line: `X  ${name}: ${saved.error}` });
    } catch (err) {
      outcomes.push({ label: r.fileName, ok: false, line: `X  ${r.fileName}: couldn't be read (${err instanceof Error ? err.message : String(err)}).` });
    }
  }

  const bad = outcomes.filter((o) => !o.ok);
  await deps.log(bad.length > 0 ? "error" : "info", `LotPath report email from ${msg.fromEmail}: ${outcomes.map((o) => o.line).join(" | ")}`.slice(0, 900));

  try {
    await sendEmail({
      to: [msg.fromEmail],
      subject: `${bad.length > 0 ? "Inspection problem" : "Inspection added"}: ${msg.subject.replace(/^(fwd?|re):\s*/i, "").slice(0, 80)}`,
      body: [`HOPS read your email "${msg.subject}".`, "", ...outcomes.map((o) => o.line), "", `See it under QC > Inspections: ${appBaseUrl()}/qc/inspections`, "", "- HOPS Agent"].join("\n"),
    });
  } catch (err) {
    await deps.log("error", `Couldn't email the inspection result to ${msg.fromEmail}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (bad.length > 0) await deps.notify("LotPath report needs a look", `${msg.fromEmail}: ${bad.map((o) => o.line).join("; ")}`.slice(0, 220));
  else if (msg.fromEmail.toLowerCase() !== SUPREME_EMAIL.toLowerCase()) await deps.notify("Inspection added", outcomes.map((o) => o.line.replace(/^OK /, "")).join(" ").slice(0, 200));

  await markRead(msg.id).catch(() => {});
  return true;
}
