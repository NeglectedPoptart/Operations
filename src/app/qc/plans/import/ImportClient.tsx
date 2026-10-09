"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimestamp } from "@/lib/dates";
import type { ParsedLotpath } from "@/lib/lotpathParse";
import {
  importLotpath,
  importParsed,
  previewLotpath,
  previewParsed,
  readLotpathCsv,
  removeImportFiles,
  type LotpathPreview,
} from "./actions";

type Status = "queued" | "uploading" | "reading" | "preview" | "importing" | "imported" | "duplicate" | "error";

interface Item {
  id: string;
  name: string;
  // A PDF still to upload and read...
  file: File | null;
  path: string | null;
  // ...or an inspection already read out of a CSV.
  parsed: ParsedLotpath | null;
  status: Status;
  message: string | null;
  preview: LotpathPreview | null;
  planCreated: boolean;
}

const STATUS_TEXT: Record<Status, string> = {
  queued: "Waiting",
  uploading: "Uploading...",
  reading: "Reading...",
  preview: "Ready to import",
  importing: "Importing...",
  imported: "Imported",
  duplicate: "Already in HOPS - skipped",
  error: "Error",
};

const btn = "rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50";
const field = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";

// Runs `worker` over the items with a few going at once.
async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await worker(item);
      }
    }),
  );
}

export default function ImportClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const [csvPlan, setCsvPlan] = useState("");
  const [csvInspector, setCsvInspector] = useState("Edgar Cantu");
  const [csvNote, setCsvNote] = useState<string | null>(null);

  const patch = (id: string, p: Partial<Item>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const blank = (name: string): Omit<Item, "id" | "file" | "parsed"> => ({ name, path: null, status: "queued", message: null, preview: null, planCreated: false });

  function addPdfs(files: FileList | null) {
    if (!files) return;
    const added: Item[] = Array.from(files)
      .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
      .map((file) => ({ id: crypto.randomUUID(), file, parsed: null, ...blank(file.name) }));
    setItems((prev) => [...prev, ...added]);
    if (pdfInput.current) pdfInput.current.value = "";
  }

  async function addCsv(files: FileList | null) {
    const file = files?.[0];
    if (csvInput.current) csvInput.current.value = "";
    if (!file) return;
    // "Bell Peppers - Grower.csv" -> the plan it belongs to.
    const planName = csvPlan.trim() || file.name.replace(/\.csv$/i, "").replace(/\s*\(\d+\)$/, "").trim();
    setCsvPlan(planName);
    setCsvNote("Reading...");
    try {
      const result = await readLotpathCsv(await file.text(), planName, csvInspector);
      if ("error" in result) {
        setCsvNote(result.error);
        return;
      }
      setItems((prev) => [
        ...prev,
        ...result.inspections.map(
          (parsed): Item => ({
            id: crypto.randomUUID(),
            file: null,
            parsed,
            ...blank(`${file.name} - ${parsed.headerFields.find((h) => h.label.toLowerCase().startsWith("lot number"))?.value || "inspection"}`),
          }),
        ),
      ]);
      setCsvNote(`Read ${result.inspections.length} inspection${result.inspections.length === 1 ? "" : "s"} from ${file.name}.${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""}`);
    } catch {
      setCsvNote("Couldn't read that file - try again.");
    }
  }

  // mode "preview": read each and show what would happen, saving nothing.
  // mode "import": save them (skipping any already in HOPS).
  async function run(mode: "preview" | "import") {
    const targets = items.filter((i) => i.status !== "imported" && i.status !== "duplicate");
    if (targets.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    const used: string[] = [];

    // Imports go one at a time (each may create or grow a plan); PDF uploads run a few ahead.
    let importChain: Promise<void> = Promise.resolve();

    await pool(targets, 3, async (item) => {
      try {
        let path = item.path;
        if (item.file && !path) {
          patch(item.id, { status: "uploading", message: null });
          path = `import-temp/${crypto.randomUUID()}.pdf`;
          const { error } = await supabase.storage.from("qc-photos").upload(path, item.file, { contentType: "application/pdf" });
          if (error) throw new Error(`Upload failed: ${error.message}`);
          patch(item.id, { path });
        }
        if (path) used.push(path);
        const savedPath = path;

        if (mode === "preview") {
          patch(item.id, { status: "reading" });
          const result = item.parsed ? await previewParsed(item.parsed) : await previewLotpath(savedPath as string);
          if (!result.ok) patch(item.id, { status: "error", message: result.error });
          else patch(item.id, { status: result.duplicate ? "duplicate" : "preview", preview: result });
        } else {
          importChain = importChain.then(async () => {
            patch(item.id, { status: "importing" });
            const result = item.parsed ? await importParsed(item.parsed) : await importLotpath(savedPath as string);
            if (result.status === "imported") patch(item.id, { status: "imported", planCreated: result.planCreated });
            else if (result.status === "duplicate") patch(item.id, { status: "duplicate" });
            else patch(item.id, { status: "error", message: result.error });
          });
        }
      } catch (e) {
        patch(item.id, { status: "error", message: e instanceof Error ? e.message : String(e) });
      }
    });
    await importChain;

    // The PDFs were only needed for reading - clear them out of storage.
    if (mode === "import" && used.length > 0) {
      await removeImportFiles(used).catch(() => {});
      setItems((prev) => prev.map((i) => (used.includes(i.path ?? "") ? { ...i, path: null } : i)));
    }
    setBusy(false);
  }

  const counts = {
    imported: items.filter((i) => i.status === "imported").length,
    duplicate: items.filter((i) => i.status === "duplicate").length,
    error: items.filter((i) => i.status === "error").length,
    newPlans: items.filter((i) => i.planCreated).length,
  };
  const pending = items.filter((i) => i.status !== "imported" && i.status !== "duplicate");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Import LotPath Inspections</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Bring in LotPath report PDFs or a LotPath CSV export. Each inspection lands in Inspection History - data only,
            no photos. A plan that doesn&apos;t exist yet is created from the data; one that does is extended if the data
            has something it lacks. Anything already in HOPS is skipped, so adding the same file twice is safe.
          </p>
        </div>
        <Link href="/qc/plans" className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
          Back to plans
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Report PDFs</h2>
          <p className="text-xs text-black/60 dark:text-white/60">One PDF per inspection. Add as many as you like.</p>
          <input ref={pdfInput} type="file" accept="application/pdf,.pdf" multiple onChange={(e) => addPdfs(e.target.files)} className="hidden" />
          <button onClick={() => pdfInput.current?.click()} disabled={busy} className={`${btn} border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10`}>
            + Add PDFs
          </button>
        </div>

        <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">CSV export</h2>
          <p className="text-xs text-black/60 dark:text-white/60">
            LotPath&apos;s export for one plan (one row per sample). It doesn&apos;t say which plan it is or who inspected,
            so fill those in.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              Plan name
              <input value={csvPlan} onChange={(e) => setCsvPlan(e.target.value)} placeholder="Bell Peppers - Grower" className={`${field} mt-0.5 w-full`} />
            </label>
            <label className="text-xs">
              Inspector
              <input value={csvInspector} onChange={(e) => setCsvInspector(e.target.value)} placeholder="Edgar Cantu" className={`${field} mt-0.5 w-full`} />
            </label>
          </div>
          <input ref={csvInput} type="file" accept=".csv,text/csv" onChange={(e) => addCsv(e.target.files)} className="hidden" />
          <button onClick={() => csvInput.current?.click()} disabled={busy} className={`${btn} border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10`}>
            + Add CSV
          </button>
          {csvNote && <p className="text-xs text-black/70 dark:text-white/70">{csvNote}</p>}
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => run("preview")} disabled={busy || pending.length === 0} className={`${btn} border border-green-600 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20`}>
              Preview (saves nothing)
            </button>
            <button onClick={() => run("import")} disabled={busy || pending.length === 0} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
              {busy ? "Working..." : `Import ${pending.length} inspection${pending.length === 1 ? "" : "s"}`}
            </button>
            {!busy && (
              <button onClick={() => setItems([])} className="text-sm text-black/60 hover:underline dark:text-white/60">
                Clear list
              </button>
            )}
          </div>
          <p className="text-sm">
            {items.length} in the list · <span className="text-green-700 dark:text-green-400">{counts.imported} imported</span> · {counts.duplicate} already in HOPS ·{" "}
            <span className={counts.error > 0 ? "text-red-600" : ""}>{counts.error} errors</span>
            {counts.newPlans > 0 && ` · ${counts.newPlans} created a new plan`}
          </p>
          {busy && <p className="text-xs text-black/50 dark:text-white/50">Keep this page open until it finishes - about a second or two per inspection.</p>}
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-2">File</th>
                <th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Inspector</th>
                <th className="px-2 py-2">Result</th>
                <th className="px-2 py-2 text-right">Defects</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-black/10 align-top dark:border-white/10">
                  <td className="max-w-[16rem] truncate px-2 py-1.5" title={i.name}>
                    {i.name}
                  </td>
                  <td className="px-2 py-1.5">
                    {i.preview?.planName}
                    {i.preview && !i.preview.planExists && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-800">new plan</span>}
                    {i.preview && i.preview.planAdds.length > 0 && (
                      <span className="block text-[11px] text-black/50 dark:text-white/50">adds {i.preview.planAdds.join(", ")}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{i.preview?.lot}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{i.preview?.inspectedAt ? formatTimestamp(i.preview.inspectedAt) : ""}</td>
                  <td className="px-2 py-1.5">{i.preview?.inspector}</td>
                  <td className="px-2 py-1.5">{i.preview?.result}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {i.preview ? `${i.preview.totalDefects}${i.preview.totalPercent ? ` (${i.preview.totalPercent})` : ""}` : ""}
                  </td>
                  <td
                    className={`px-2 py-1.5 ${
                      i.status === "error" ? "text-red-600" : i.status === "imported" ? "text-green-700 dark:text-green-400" : i.status === "duplicate" ? "text-black/50 dark:text-white/50" : ""
                    }`}
                  >
                    {STATUS_TEXT[i.status]}
                    {i.status === "imported" && i.planCreated && " (new plan)"}
                    {i.message && <span className="block text-xs">{i.message}</span>}
                    {i.preview && i.preview.warnings.length > 0 && <span className="block text-xs text-amber-600">{i.preview.warnings.join(" ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {counts.imported > 0 && !busy && (
        <p className="text-sm">
          Done - see them in{" "}
          <Link href="/qc/inspections" className="font-medium text-green-700 underline dark:text-green-400">
            Inspection History
          </Link>{" "}
          or chart them on the{" "}
          <Link href="/qc/dashboard" className="font-medium text-green-700 underline dark:text-green-400">
            Quality Dashboard
          </Link>
          .
        </p>
      )}
    </div>
  );
}
