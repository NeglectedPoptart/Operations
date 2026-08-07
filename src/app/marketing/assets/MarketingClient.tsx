"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatTimestamp } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";
import type { MarketingFile, MarketingTask, MarketingTaskStatus } from "@/lib/types";
import {
  addMarketingTask,
  deleteMarketingFile,
  deleteMarketingTask,
  recordMarketingFile,
  updateMarketingFileLabel,
  updateMarketingNotes,
  updateMarketingTask,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function isImage(contentType: string | null): boolean {
  return Boolean(contentType?.startsWith("image/"));
}

function formatBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FileCard({
  file,
  url,
  onLabelSave,
  onDelete,
  onPreview,
}: {
  file: MarketingFile;
  url: string;
  onLabelSave: (id: string, label: string) => void;
  onDelete: (file: MarketingFile) => void;
  onPreview: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 shadow-sm dark:border-white/10">
      {isImage(file.content_type) ? (
        <button
          onClick={onPreview}
          className="block aspect-square w-full overflow-hidden rounded-md border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local/optimizable asset */}
          <img src={url} alt={file.file_name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-black/10 bg-black/5 text-center text-xs text-black/50 dark:border-white/10 dark:bg-white/5 dark:text-white/50"
        >
          <span className="text-3xl">📄</span>
          <span className="px-2">{file.content_type ?? "File"}</span>
        </a>
      )}
      <input
        defaultValue={file.label ?? ""}
        placeholder="Add a label..."
        onBlur={(e) => onLabelSave(file.id, e.target.value)}
        className={`${field} text-xs`}
      />
      <p className="truncate text-xs font-medium" title={file.file_name}>
        {file.file_name}
      </p>
      <div className="flex items-center justify-between text-xs text-black/40 dark:text-white/40">
        <span>{formatTimestamp(file.created_at)}</span>
        <span>{formatBytes(file.size_bytes)}</span>
      </div>
      <button onClick={() => onDelete(file)} className="text-xs font-medium text-red-600 hover:underline">
        Delete
      </button>
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onNameSave,
  onNotesSave,
  onDelete,
}: {
  task: MarketingTask;
  onToggle: (id: string, status: MarketingTaskStatus) => void;
  onNameSave: (id: string, name: string) => void;
  onNotesSave: (id: string, notes: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 border-t border-black/10 py-2 first:border-t-0 dark:border-white/10">
      <input
        type="checkbox"
        checked={task.status === "done"}
        onChange={(e) => onToggle(task.id, e.target.checked ? "done" : "pending")}
        className="mt-1.5 h-4 w-4 shrink-0"
      />
      <div className="flex-1 space-y-1">
        <input
          defaultValue={task.name}
          onBlur={(e) => onNameSave(task.id, e.target.value)}
          className={`${field} ${task.status === "done" ? "line-through opacity-50" : ""}`}
        />
        <input
          defaultValue={task.notes ?? ""}
          placeholder="Notes (optional)"
          onBlur={(e) => onNotesSave(task.id, e.target.value)}
          className={`${field} text-xs text-black/60`}
        />
      </div>
      <button onClick={() => onDelete(task.id)} className="mt-1.5 text-xs font-medium text-red-600 hover:underline">
        Delete
      </button>
    </div>
  );
}

export default function MarketingClient({
  initialFiles,
  fileUrls,
  initialTasks,
  notesId,
  initialNotes,
}: {
  initialFiles: MarketingFile[];
  fileUrls: Record<string, string>;
  initialTasks: MarketingTask[];
  notesId: string | null;
  initialNotes: string;
}) {
  const confirm = useConfirm();
  const [files, setFiles] = useState(initialFiles);
  const [urls, setUrls] = useState(fileUrls);
  const [tasks, setTasks] = useState(initialTasks);
  const [notes, setNotes] = useState(initialNotes);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Uploads go straight from the browser to Supabase Storage - a big file's
  // bytes never touch a Server Action, which is capped at ~4.5MB on Vercel
  // regardless of Next.js config. Only the resulting metadata (name, path,
  // size) is sent to recordMarketingFile to insert the row.
  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const supabase = createClient();
    try {
      for (const file of selected) {
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const storagePath = `${crypto.randomUUID()}${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("marketing-assets")
          .upload(storagePath, file, { contentType: file.type || undefined });
        if (uploadErr) throw new Error(uploadErr.message);

        const publicUrl = supabase.storage.from("marketing-assets").getPublicUrl(storagePath).data.publicUrl;

        const saved = await recordMarketingFile({
          fileName: file.name,
          storagePath,
          contentType: file.type || null,
          sizeBytes: file.size,
          label: null,
        });
        setFiles((prev) => [saved, ...prev]);
        setUrls((prev) => ({ ...prev, [saved.id]: publicUrl }));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleLabelSave(id: string, label: string) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, label: label.trim() || null } : f)));
    updateMarketingFileLabel(id, label).catch(() => {});
  }

  async function handleDeleteFile(file: MarketingFile) {
    if (!(await confirm(`Delete "${file.file_name}"? This can't be undone.`))) return;
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    await deleteMarketingFile(file.id, file.storage_path).catch(() => {});
  }

  async function handleAddTask() {
    if (!newTaskName.trim()) return;
    const saved = await addMarketingTask(newTaskName.trim());
    setTasks((prev) => [...prev, saved]);
    setNewTaskName("");
  }

  function handleToggleTask(id: string, status: MarketingTaskStatus) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    updateMarketingTask(id, { status }).catch(() => {});
  }

  function handleTaskNameSave(id: string, name: string) {
    if (!name.trim()) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    updateMarketingTask(id, { name }).catch(() => {});
  }

  function handleTaskNotesSave(id: string, notesValue: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, notes: notesValue || null } : t)));
    updateMarketingTask(id, { notes: notesValue || null }).catch(() => {});
  }

  async function handleDeleteTask(id: string) {
    if (!(await confirm("Delete this task?"))) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await deleteMarketingTask(id).catch(() => {});
  }

  function handleNotesBlur(value: string) {
    setNotes(value);
    if (notesId) updateMarketingNotes(notesId, value).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Marketing</h1>
          <p className="text-sm text-black/50 dark:text-white/50">
            Brand assets, packaging previews, and everything left to do before they go out.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "+ Upload Files"}
          </button>
        </div>
      </div>
      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
        <h2 className="text-lg font-bold text-green-700 dark:text-green-400">
          Files <span className="text-sm font-normal text-black/40">({files.length})</span>
        </h2>
        {files.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">
            Nothing uploaded yet - drop in packaging mockups, logos, or anything else to preview here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {files.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                url={urls[file.id] ?? ""}
                onLabelSave={handleLabelSave}
                onDelete={handleDeleteFile}
                onPreview={() => setPreviewUrl(urls[file.id] ?? null)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Tasks</h2>
          <div className="flex gap-2">
            <input
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTask();
                }
              }}
              placeholder="Add a task..."
              className={field}
            />
            <button
              onClick={handleAddTask}
              className="shrink-0 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Add
            </button>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-black/40 dark:text-white/40">Nothing tracked yet.</p>
          ) : (
            <div>
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggleTask}
                  onNameSave={handleTaskNameSave}
                  onNotesSave={handleTaskNotesSave}
                  onDelete={handleDeleteTask}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Notes</h2>
          <textarea
            defaultValue={notes}
            onBlur={(e) => handleNotesBlur(e.target.value)}
            rows={10}
            placeholder="Anything worth writing down for next time..."
            className={`${field} font-mono text-xs`}
          />
        </div>
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPreviewUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local/optimizable asset */}
          <img src={previewUrl} alt="Preview" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
