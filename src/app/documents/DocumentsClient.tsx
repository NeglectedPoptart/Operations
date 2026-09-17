"use client";

import { useState, type ChangeEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import type { CompanyDocument, DocumentCategory } from "@/lib/types";
import {
  createDocumentCategory,
  deleteCompanyDocument,
  recordCompanyDocument,
  renameCompanyDocument,
  renameDocumentCategory,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// Same hover-preview + inline-rename shape as Employee Files' DocumentRow,
// against the company-documents bucket instead of employee-documents.
function DocumentRow({
  doc,
  onDelete,
  onRename,
}: {
  doc: CompanyDocument;
  onDelete: (doc: CompanyDocument) => void;
  onRename: (doc: CompanyDocument, newName: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(doc.file_name);

  const isImage = doc.content_type?.startsWith("image/") ?? false;
  const isPdf = doc.content_type === "application/pdf";
  const previewable = isImage || isPdf;

  async function handleHover() {
    if (!previewable || previewUrl) return;
    const supabase = createClient();
    const { data } = await supabase.storage.from("company-documents").createSignedUrl(doc.storage_path, 300);
    if (data) setPreviewUrl(data.signedUrl);
  }

  async function handleView() {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("company-documents").createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      alert("Couldn't open that file.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  function commitRename() {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== doc.file_name) onRename(doc, trimmed);
    else setRenameValue(doc.file_name);
  }

  return (
    <div
      className="group relative flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10"
      onMouseEnter={handleHover}
    >
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setRenameValue(doc.file_name);
              setRenaming(false);
            }
          }}
          className={`${field} min-w-0`}
        />
      ) : (
        <>
          <button onClick={handleView} className="truncate font-medium text-green-700 hover:underline dark:text-green-400">
            {doc.file_name}
          </button>
          <button
            onClick={() => setRenaming(true)}
            title="Rename"
            className="shrink-0 text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
          >
            ✎
          </button>
          <button onClick={() => onDelete(doc)} className="ml-auto shrink-0 text-xs font-medium text-red-600 hover:underline">
            Delete
          </button>
        </>
      )}

      {previewable && (
        <div className="absolute left-0 top-full z-20 mt-1 hidden rounded-md border border-black/10 bg-white p-1 shadow-lg group-hover:block dark:border-white/20 dark:bg-neutral-900">
          {previewUrl ? (
            isImage ? (
              // A short-lived signed URL, not a static asset next/image can optimize.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={doc.file_name} className="max-h-64 max-w-64 object-contain" />
            ) : (
              <iframe src={previewUrl} title={doc.file_name} className="h-64 w-64" />
            )
          ) : (
            <div className="flex h-32 w-48 items-center justify-center text-black/40 dark:text-white/40">Loading preview...</div>
          )}
        </div>
      )}
    </div>
  );
}

// Same inline pencil-icon rename as DocumentRow above, for the category
// header itself.
function CategoryHeader({
  category,
  onRename,
}: {
  category: DocumentCategory;
  onRename: (category: DocumentCategory, newName: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(category.name);

  function commitRename() {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== category.name) onRename(category, trimmed);
    else setRenameValue(category.name);
  }

  if (renaming) {
    return (
      <input
        autoFocus
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") {
            setRenameValue(category.name);
            setRenaming(false);
          }
        }}
        className={`${field} max-w-xs text-lg font-bold`}
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{category.name}</h2>
      <button
        onClick={() => setRenaming(true)}
        title="Rename category"
        className="text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
      >
        ✎
      </button>
    </div>
  );
}

export default function DocumentsClient({
  initialCategories,
  initialDocuments,
}: {
  initialCategories: DocumentCategory[];
  initialDocuments: CompanyDocument[];
}) {
  const confirm = useConfirm();
  const [categories, setCategories] = useState(initialCategories);
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const nextPosition = categories.length > 0 ? Math.max(...categories.map((c) => c.position)) + 1 : 1;
      const created = await createDocumentCategory(name, nextPosition);
      setCategories((prev) => [...prev, created]);
      setNewCategoryName("");
      setShowAddCategory(false);
    } finally {
      setAddingCategory(false);
    }
  }

  async function handleUpload(categoryId: string, file: File) {
    setUploadingCategory(categoryId);
    setUploadError(null);
    try {
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const storagePath = `${crypto.randomUUID()}${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("company-documents")
        .upload(storagePath, file, { contentType: file.type || undefined });
      if (uploadErr) throw new Error(uploadErr.message);

      const categoryDocs = documents.filter((d) => d.category_id === categoryId);
      const nextPosition = categoryDocs.length > 0 ? Math.max(...categoryDocs.map((d) => d.position)) + 1 : 1;
      const saved = await recordCompanyDocument({
        categoryId,
        fileName: file.name,
        storagePath,
        contentType: file.type || null,
        sizeBytes: file.size,
        nextPosition,
      });
      setDocuments((prev) => [...prev, saved]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingCategory(null);
    }
  }

  function handleRename(doc: CompanyDocument, newName: string) {
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, file_name: newName } : d)));
    renameCompanyDocument(doc.id, newName).catch(() => {});
  }

  function handleRenameCategory(category: DocumentCategory, newName: string) {
    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, name: newName } : c)));
    renameDocumentCategory(category.id, newName).catch(() => {});
  }

  async function handleDelete(doc: CompanyDocument) {
    if (!(await confirm(`Delete "${doc.file_name}"? This can't be undone.`))) return;
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    await deleteCompanyDocument(doc.id, doc.storage_path).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documents</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Company forms that often need to be printed, grouped by category.
        </p>
      </div>

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <div className="space-y-6">
        {categories
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((category) => {
            const categoryDocs = documents
              .filter((d) => d.category_id === category.id)
              .sort((a, b) => a.position - b.position);
            const key = category.id;
            return (
              <div key={category.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <CategoryHeader category={category} onRename={handleRenameCategory} />
                  <label className="cursor-pointer rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                    {uploadingCategory === key ? "Uploading..." : "+ Upload"}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingCategory === key}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) handleUpload(category.id, file);
                      }}
                    />
                  </label>
                </div>
                {categoryDocs.length > 0 ? (
                  <div className="space-y-1">
                    {categoryDocs.map((doc) => (
                      <DocumentRow key={doc.id} doc={doc} onDelete={handleDelete} onRename={handleRename} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-black/40 dark:text-white/40">No documents yet.</p>
                )}
              </div>
            );
          })}
        {categories.length === 0 && (
          <p className="text-sm text-black/40 dark:text-white/40">No categories yet - add one below.</p>
        )}
      </div>

      {showAddCategory ? (
        <div className="flex items-center gap-2">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name..."
            className={`${field} w-56`}
          />
          <button
            onClick={handleAddCategory}
            disabled={addingCategory || newCategoryName.trim() === ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {addingCategory ? "Adding..." : "Add"}
          </button>
          <button
            onClick={() => {
              setShowAddCategory(false);
              setNewCategoryName("");
            }}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddCategory(true)}
          className="text-sm font-medium text-green-600 hover:underline"
        >
          + Add Category
        </button>
      )}
    </div>
  );
}
