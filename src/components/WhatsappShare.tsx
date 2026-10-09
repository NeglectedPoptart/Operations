"use client";

import { useEffect, useState } from "react";
import { getWhatsappShare } from "@/app/qc/inspections/reportActions";

// "Send to WhatsApp" for an inspection: the message in the team's format
// (editable) plus the photos. On a phone the share sheet opens with the photos
// and text attached - pick WhatsApp, then the chat. On a computer WhatsApp is
// opened with the text filled in and the photos put on the clipboard as one
// picture to paste (or downloaded).

interface PhotoFile {
  id: string;
  file: File;
  preview: string;
}

const modalBtn = "rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50";

// All the photos as one picture (a grid), for pasting into WhatsApp on a computer.
async function makeCollage(files: File[]): Promise<Blob> {
  const bitmaps = await Promise.all(files.map((f) => createImageBitmap(f)));
  const cols = bitmaps.length <= 1 ? 1 : bitmaps.length <= 4 ? 2 : 3;
  const rows = Math.ceil(bitmaps.length / cols);
  const cell = bitmaps.length === 1 ? 1200 : 700;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  bitmaps.forEach((bmp, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    // Fill the square, cropping the centre.
    const scale = Math.max(cell / bmp.width, cell / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 2, cell - 4, cell - 4);
    ctx.clip();
    ctx.drawImage(bmp, x + (cell - w) / 2, y + (cell - h) / 2, w, h);
    ctx.restore();
  });
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture"))), "image/png"));
}

function Modal({ inspectionId, onClose }: { inspectionId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getWhatsappShare(inspectionId);
        if (!data) throw new Error("That inspection wasn't found.");
        // Fetched now so the Share click can use them straight away (a phone only
        // allows sharing right after a tap).
        const loaded: PhotoFile[] = [];
        for (let i = 0; i < data.photos.length; i++) {
          const res = await fetch(data.photos[i].url);
          if (!res.ok) continue;
          const blob = await res.blob();
          const file = new File([blob], `inspection-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" });
          loaded.push({ id: data.photos[i].id, file, preview: URL.createObjectURL(blob) });
        }
        if (cancelled) return;
        setText(data.text);
        setPhotos(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the message.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectionId]);

  const files = photos.map((p) => p.file);
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && files.length > 0 && navigator.canShare({ files });
  const canShareText = typeof navigator !== "undefined" && typeof navigator.share === "function";

  function flash(message: string) {
    setStatus(message);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      flash("Text copied.");
    } catch {
      flash("Couldn't copy - select the text and copy it by hand.");
    }
  }

  async function share() {
    // Also copy the text, in case WhatsApp only takes the photos from the share.
    navigator.clipboard?.writeText(text).catch(() => {});
    try {
      await navigator.share(canShareFiles ? { text, files } : { text });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // they closed the share sheet
      flash("Couldn't open the share sheet - use the buttons below instead.");
    }
  }

  async function openWhatsapp() {
    // Opened first, straight from the click, so the browser doesn't block it.
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    if (files.length === 0) {
      flash("WhatsApp is opening - pick the chat and send.");
      return;
    }
    try {
      const png = await makeCollage(files);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      flash("WhatsApp is opening with the text. Pick the chat, then press Ctrl+V to add the photos (copied as one picture).");
    } catch {
      flash("WhatsApp is opening with the text. The photos couldn't be copied - use Download photos and drag them in.");
    }
  }

  async function copyPhotos() {
    try {
      const png = await makeCollage(files);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      flash("Photos copied as one picture - paste them into the chat with Ctrl+V.");
    } catch {
      flash("Couldn't copy the photos - use Download photos instead.");
    }
  }

  function downloadPhotos() {
    for (const p of photos) {
      const a = document.createElement("a");
      a.href = p.preview;
      a.download = p.file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    flash(`${photos.length} photo${photos.length === 1 ? "" : "s"} downloaded - drag them into the chat.`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-lg bg-white text-black shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <h2 className="text-lg font-bold">Send to WhatsApp</h2>
          <button onClick={onClose} aria-label="Close" className="text-black/50 hover:text-black">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading && <p className="text-sm text-black/60">Getting the message and photos...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && (
            <>
              <label className="block text-sm font-medium">
                Message (edit it if you need to)
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={14}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-sm text-black"
                />
              </label>

              {photos.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {photos.length} photo{photos.length === 1 ? "" : "s"} (tap ✕ to leave one out)
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {photos.map((p) => (
                      <div key={p.id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt="" className="aspect-square w-full rounded object-cover" />
                        <button
                          type="button"
                          onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))}
                          aria-label="Leave this photo out"
                          className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] text-white"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-black/50">This inspection has no photos.</p>
              )}

              {status && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{status}</p>}
            </>
          )}
        </div>

        {!loading && !error && (
          <div className="space-y-2 border-t border-black/10 p-4">
            {(canShareFiles || (files.length === 0 && canShareText)) && (
              <button onClick={share} className="w-full rounded-md bg-green-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-green-700">
                Share{files.length > 0 ? " photos + message" : " message"} - then pick WhatsApp and the chat
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={openWhatsapp}
                className={
                  canShareFiles || (files.length === 0 && canShareText)
                    ? modalBtn
                    : "w-full rounded-md bg-green-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-green-700"
                }
              >
                Open WhatsApp{files.length > 0 ? " (photos on clipboard)" : ""}
              </button>
              <button onClick={copyText} className={modalBtn}>
                Copy text
              </button>
              {photos.length > 0 && (
                <>
                  <button onClick={copyPhotos} className={modalBtn}>
                    Copy photos
                  </button>
                  <button onClick={downloadPhotos} className={modalBtn}>
                    Download photos
                  </button>
                </>
              )}
            </div>
            {!canShareFiles && files.length > 0 && (
              <p className="text-xs text-black/50">
                On a computer: click Open WhatsApp, pick the chat, then press Ctrl+V to paste the photos. The text is already in the message box.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WhatsappShareButton({
  inspectionId,
  className,
  label = "Send to WhatsApp",
}: {
  inspectionId: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open && <Modal inspectionId={inspectionId} onClose={() => setOpen(false)} />}
    </>
  );
}
