"use client";

import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import { deleteArrivalDocument, getArrivalDocuments, recordArrivalDocument, type ArrivalDocument } from "./actions";

const KIND_LABEL: Record<ArrivalDocument["kind"], string> = { purchase_order: "Purchase order", other: "Other" };

function sizeText(bytes: number | null): string {
  if (bytes === null) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// The documents kept with one arrival - mainly the purchase order sent to the grower for that load.
export default function ArrivalDocsModal({
  arrivalId,
  title,
  onClose,
  onCountChange,
}: {
  arrivalId: string;
  title: string;
  onClose: () => void;
  onCountChange: (arrivalId: string, count: number) => void;
}) {
  const confirm = useConfirm();
  const [docs, setDocs] = useState<ArrivalDocument[] | null>(null);
  const [kind, setKind] = useState<ArrivalDocument["kind"]>("purchase_order");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getArrivalDocuments(arrivalId)
      .then(setDocs)
      .catch((e) => {
        setDocs([]);
        setError(e instanceof Error ? e.message : "Could not load documents. Has migration 158 been run?");
      });
  }, [arrivalId]);

  async function reload() {
    const list = await getArrivalDocuments(arrivalId);
    setDocs(list);
    onCountChange(arrivalId, list.length);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      for (const file of Array.from(files)) {
        // Straight to Storage from the browser, then recorded against the arrival.
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const storagePath = `arrivals/${arrivalId}/${crypto.randomUUID()}${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("load-documents")
          .upload(storagePath, file, { contentType: file.type || undefined });
        if (uploadError) throw new Error(uploadError.message);
        await recordArrivalDocument({
          arrivalId,
          kind,
          fileName: file.name,
          storagePath,
          contentType: file.type || null,
          sizeBytes: file.size,
        });
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleDelete(doc: ArrivalDocument) {
    if (!(await confirm(`Delete ${doc.file_name}?`))) return;
    try {
      await deleteArrivalDocument(doc.id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-lg bg-white p-4 text-black shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Documents</h2>
            <p className="text-xs text-black/60">{title}</p>
          </div>
          <button onClick={onClose} className="text-sm font-medium text-black/60 hover:underline">
            Close
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md bg-black/5 p-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ArrivalDocument["kind"])}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="purchase_order">Purchase order</option>
            <option value="other">Other</option>
          </select>
          <label
            className={`cursor-pointer rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 ${
              uploading ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {uploading ? "Uploading..." : "+ Attach file"}
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        {docs === null ? (
          <p className="text-sm text-black/50">Loading...</p>
        ) : docs.length === 0 ? (
          <p className="rounded-md border border-dashed border-black/15 p-4 text-center text-sm text-black/40">
            No documents yet. Attach the purchase order sent to the grower for this load.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm">
                <div className="min-w-0">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="block truncate font-medium text-green-700 hover:underline">
                      {d.file_name}
                    </a>
                  ) : (
                    <span className="block truncate font-medium">{d.file_name}</span>
                  )}
                  <span className="text-xs text-black/50">
                    {[KIND_LABEL[d.kind], sizeText(d.size_bytes), formatDate(d.created_at.slice(0, 10)), d.created_by].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <button onClick={() => handleDelete(d)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
