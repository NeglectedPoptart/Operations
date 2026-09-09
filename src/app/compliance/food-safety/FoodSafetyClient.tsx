"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/dates";
import {
  computeGrowerGrade,
  detectExpirationDate,
  expirationLabel,
  expirationToneClasses,
  gradeBadgeClasses,
  gradeTileClasses,
} from "@/lib/foodSafety";
import type { FoodSafetyDocument, FoodSafetyReportType, MxGrower } from "@/lib/types";
import {
  addReportType,
  deleteFoodSafetyDocument,
  deleteReportType,
  extractPdfText,
  recordFoodSafetyDocument,
  updateFoodSafetyDocument,
  updateReportType,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// Manages the required-cert list (add/rename/toggle-required/delete) - the
// same "flat name list with add/remove" shape as Mexico Growers' Labels/
// Commodities panels, extended with the required toggle that drives grading.
function ReportTypeManager({
  reportTypes,
  onAdd,
  onUpdate,
  onDelete,
}: {
  reportTypes: FoodSafetyReportType[];
  onAdd: (name: string) => Promise<void>;
  onUpdate: (id: string, patch: { name?: string; required?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await onAdd(name);
      setNewName("");
    } catch {
      alert(`Couldn't add "${name}" - it may already exist.`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(type: FoodSafetyReportType) {
    if (!(await confirm(`Remove "${type.name}"? Documents already uploaded under it keep their history but won't count toward any grower's score.`)))
      return;
    onDelete(type.id);
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Report Types</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Check &quot;Required&quot; for anything a grower must have on file - missing or expired required docs hurt
        their grade below.
      </p>
      <div className="divide-y divide-black/10 dark:divide-white/10">
        {reportTypes.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 py-1.5">
            <input
              defaultValue={t.name}
              onBlur={(e) => onUpdate(t.id, { name: e.target.value })}
              className={`${field} max-w-xs`}
            />
            <label className="flex items-center gap-1.5 text-xs font-medium">
              <input type="checkbox" checked={t.required} onChange={(e) => onUpdate(t.id, { required: e.target.checked })} />
              Required
            </label>
            <button onClick={() => handleDelete(t)} className="ml-auto text-xs font-medium text-red-600 hover:underline">
              Remove
            </button>
          </div>
        ))}
        {reportTypes.length === 0 && <p className="py-2 text-sm text-black/40 dark:text-white/40">None yet.</p>}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a report type..."
          className={`${field} max-w-xs`}
        />
        <button
          onClick={handleAdd}
          disabled={adding || newName.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : "+ Add"}
        </button>
      </div>
    </div>
  );
}

export default function FoodSafetyClient({
  initialGrowers,
  initialReportTypes,
  initialDocuments,
}: {
  initialGrowers: MxGrower[];
  initialReportTypes: FoodSafetyReportType[];
  initialDocuments: FoodSafetyDocument[];
}) {
  const confirm = useConfirm();
  const [growers] = useState(initialGrowers);
  const [reportTypes, setReportTypes] = useState(initialReportTypes);
  const [documents, setDocuments] = useState(initialDocuments);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const today = useMemo(() => todayISO(), []);

  function toggleGrower(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function documentsFor(growerId: string, reportTypeId: string): FoodSafetyDocument[] {
    return documents.filter((d) => d.grower_id === growerId && d.report_type_id === reportTypeId);
  }

  async function handleUpload(growerId: string, reportTypeId: string, file: File) {
    const key = `${growerId}:${reportTypeId}`;
    setUploadingKey(key);
    setUploadError(null);
    try {
      let detectedDate: string | null = null;
      if (file.type === "application/pdf") {
        const formData = new FormData();
        formData.append("file", file);
        const result = await extractPdfText(formData);
        if (!("error" in result)) detectedDate = detectExpirationDate(result.text);
      }

      // Straight to Storage from the browser, same reasoning as Marketing
      // Assets - a Server Action's body is capped at ~4.5MB on Vercel
      // regardless of Next.js config, and real cert PDFs can exceed that.
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const storagePath = `${crypto.randomUUID()}${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("food-safety-docs")
        .upload(storagePath, file, { contentType: file.type || undefined });
      if (uploadErr) throw new Error(uploadErr.message);

      const saved = await recordFoodSafetyDocument({
        growerId,
        reportTypeId,
        fileName: file.name,
        storagePath,
        contentType: file.type || null,
        sizeBytes: file.size,
        expirationDate: detectedDate,
        autoDetected: detectedDate !== null,
      });
      setDocuments((prev) => [saved, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingKey(null);
    }
  }

  async function handleView(doc: FoodSafetyDocument) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("food-safety-docs").createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      alert("Couldn't open that file.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  function handleDocSave(id: string, patch: Partial<FoodSafetyDocument>) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch, auto_detected: false } : d)));
    updateFoodSafetyDocument(id, patch).catch(() => {});
  }

  async function handleDeleteDoc(doc: FoodSafetyDocument) {
    if (!(await confirm(`Delete "${doc.file_name}"? This can't be undone.`))) return;
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    await deleteFoodSafetyDocument(doc.id, doc.storage_path).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Food Safety</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Upload each grower&apos;s compliance documents by report type. Expiration dates are auto-detected from
        uploaded PDFs when possible - otherwise enter one by hand. A grower missing or expired on a required report
        type takes a hit to their letter grade below.
      </p>

      <ReportTypeManager
        reportTypes={reportTypes}
        onAdd={async (name) => {
          const row = await addReportType(name);
          setReportTypes((prev) => [...prev, row]);
        }}
        onUpdate={(id, patch) => {
          setReportTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
          updateReportType(id, patch).catch(() => {});
        }}
        onDelete={(id) => {
          setReportTypes((prev) => prev.filter((t) => t.id !== id));
          deleteReportType(id).catch(() => {});
        }}
      />

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {growers.map((g) => {
          const expanded = expandedIds.has(g.id);
          const { grade, satisfied, total } = computeGrowerGrade(g.id, reportTypes, documents, today);
          return (
            <div
              key={g.id}
              className={`rounded-lg border p-4 shadow-sm ${gradeTileClasses(grade)} ${
                expanded ? "sm:col-span-2 lg:col-span-3" : ""
              }`}
            >
              <button onClick={() => toggleGrower(g.id)} className="flex w-full items-center justify-between gap-2 text-left">
                <span className="font-medium">
                  {g.name}
                  {g.origin && <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">{g.origin}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {total > 0 && (
                    <span className="text-xs text-black/50 dark:text-white/50">
                      {satisfied}/{total} required
                    </span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${gradeBadgeClasses(grade)}`}>{grade}</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                  >
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              {expanded && (
                <div className="mt-4 space-y-3 border-t border-black/10 pt-4 dark:border-white/10">
                  {reportTypes.map((type) => {
                    const docs = documentsFor(g.id, type.id);
                    const key = `${g.id}:${type.id}`;
                    return (
                      <div key={type.id} className="rounded-md border border-black/10 p-3 dark:border-white/10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            {type.name}
                            {type.required && (
                              <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
                                Required
                              </span>
                            )}
                          </span>
                          <label className="cursor-pointer rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                            {uploadingKey === key ? "Uploading..." : "+ Upload"}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingKey === key}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) handleUpload(g.id, type.id, file);
                              }}
                            />
                          </label>
                        </div>

                        {docs.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {docs.map((doc) => (
                              <div key={doc.id} className="flex flex-wrap items-center gap-2 text-xs">
                                <button
                                  onClick={() => handleView(doc)}
                                  className="font-medium text-green-700 hover:underline dark:text-green-400"
                                >
                                  {doc.file_name}
                                </button>
                                <input
                                  type="date"
                                  defaultValue={doc.expiration_date ?? ""}
                                  onBlur={(e) => handleDocSave(doc.id, { expiration_date: e.target.value || null })}
                                  className={`${field} w-auto py-0.5 text-xs`}
                                />
                                {doc.auto_detected && (
                                  <span className="text-[10px] text-teal-700 dark:text-teal-400">auto-detected</span>
                                )}
                                <span className={expirationToneClasses(doc.expiration_date, today)}>
                                  {expirationLabel(doc.expiration_date, today)}
                                </span>
                                <button
                                  onClick={() => handleDeleteDoc(doc)}
                                  className="ml-auto font-medium text-red-600 hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-black/40 dark:text-white/40">No documents uploaded.</p>
                        )}
                      </div>
                    );
                  })}
                  {reportTypes.length === 0 && (
                    <p className="text-sm text-black/40 dark:text-white/40">Add a report type above to start uploading.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {growers.length === 0 && (
          <p className="px-1 text-sm text-black/40 dark:text-white/40">No growers yet - add one on Mexico &gt; Growers first.</p>
        )}
      </div>
    </div>
  );
}
