"use client";

import { useEffect, useRef, useState } from "react";
import { getWhatsappShare, type WhatsappShareData } from "@/app/qc/inspections/reportActions";

// "Send to WhatsApp" for an inspection: the message in the team's format
// (editable) plus the photos you pick. On a phone the share sheet opens with the
// photos and text attached - pick WhatsApp, then the chat. On a computer
// WhatsApp is opened with the text filled in and the photos put on the
// clipboard as one picture to paste (or downloaded).

type PhotoInfo = WhatsappShareData["photos"][number];

// Photos per share.
const MAX_SELECT = 100; // most photos that can be picked
const COLLAGE_MAX = 12; // more than this is too small to see as one picture
const BATCH = 30; // WhatsApp takes up to 30 photos in one message, so more go as extra messages
const PARALLEL = 6;

const modalBtn = "rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50";

// The photo's bytes: straight from storage when allowed (fast), otherwise
// through our own server.
async function fetchPhoto(info: PhotoInfo, name: string): Promise<File | null> {
  for (const url of [info.signedUrl, info.url]) {
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return new File([await res.blob()], name, { type: "image/jpeg" });
    } catch {
      // try the next address
    }
  }
  return null;
}

// All the photos as one picture (a grid), for pasting into WhatsApp on a computer.
async function makeCollage(files: File[]): Promise<Blob> {
  const bitmaps = await Promise.all(files.map((f) => createImageBitmap(f)));
  const cols = bitmaps.length <= 1 ? 1 : bitmaps.length <= 4 ? 2 : bitmaps.length <= 12 ? 3 : 5;
  const rows = Math.ceil(bitmaps.length / cols);
  const cell = bitmaps.length === 1 ? 1200 : bitmaps.length <= 12 ? 600 : 360;
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
    bmp.close();
  });
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture"))), "image/png"));
}

function Modal({ inspectionId, onClose }: { inspectionId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PhotoInfo[]>([]);
  // The photos that will go, in order.
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  // Photo files fetched so far, and the ones that couldn't be.
  const [fileById, setFileById] = useState<Record<string, File>>({});
  const [failedIds, setFailedIds] = useState<string[]>([]);
  // Which photos are already fetched / being fetched (used only by the fetching below).
  const started = useRef<Set<string>>(new Set());
  // Parts (of BATCH photos each) already handed to WhatsApp.
  const [sentParts, setSentParts] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getWhatsappShare(inspectionId);
        if (!data) throw new Error("That inspection wasn't found.");
        if (cancelled) return;
        setText(data.text);
        setPhotos(data.photos);
        setSelected(data.photos.slice(0, MAX_SELECT).map((p) => p.id));
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

  // Fetch the chosen photos in the background (a few at a time), so the Share
  // tap can use them straight away - a phone only allows sharing right after a tap.
  useEffect(() => {
    const queue = selected.filter((id) => !started.current.has(id));
    for (const id of queue) started.current.add(id);
    async function worker() {
      for (;;) {
        const id = queue.shift();
        if (!id) return;
        const info = photos.find((p) => p.id === id);
        const file = info ? await fetchPhoto(info, `inspection-${id.slice(0, 8)}.jpg`) : null;
        if (file) setFileById((prev) => ({ ...prev, [id]: file }));
        else setFailedIds((prev) => [...prev, id]);
      }
    }
    void Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
  }, [selected, photos]);

  const files = selected.map((id) => fileById[id]).filter((f): f is File => !!f);
  const failedCount = selected.filter((id) => failedIds.includes(id)).length;
  const waiting = selected.length - files.length - failedCount;
  const ready = waiting === 0;

  // The photos in groups of BATCH (WhatsApp takes 30 per message).
  const parts: File[][] = [];
  for (let i = 0; i < files.length; i += BATCH) parts.push(files.slice(i, i + BATCH));

  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && parts.length > 0 && navigator.canShare({ files: parts[0] });
  const canShareText = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const useShareSheet = canShareFiles || (selected.length === 0 && canShareText);

  function toggle(id: string) {
    setStatus(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECT) {
        setStatus(`You can pick up to ${MAX_SELECT} photos - take one off first.`);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Text copied.");
    } catch {
      setStatus("Couldn't copy - select the text and copy it by hand.");
    }
  }

  // Hands one group of photos (30 at most) to the phone's share sheet. The
  // message goes with the first group only.
  async function share(partIndex: number) {
    const batch = parts[partIndex] ?? [];
    // Also copy the text, in case WhatsApp only takes the photos from the share.
    if (partIndex === 0) navigator.clipboard?.writeText(text).catch(() => {});
    try {
      await navigator.share(batch.length === 0 ? { text } : partIndex === 0 ? { text, files: batch } : { files: batch });
      setSentParts((prev) => (prev.includes(partIndex) ? prev : [...prev, partIndex]));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // they closed the share sheet
      setStatus("Couldn't open the share sheet - use the buttons below instead.");
    }
  }

  async function openWhatsapp() {
    // Opened first, straight from the click, so the browser doesn't block it.
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    if (files.length === 0) {
      setStatus("WhatsApp is opening - pick the chat and send.");
      return;
    }
    if (files.length > COLLAGE_MAX) {
      setStatus(`WhatsApp is opening with the text. That's a lot of photos for one picture - use Download photos and drag them into the chat (${BATCH} at a time).`);
      return;
    }
    try {
      const png = await makeCollage(files);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setStatus("WhatsApp is opening with the text. Pick the chat, then press Ctrl+V to add the photos (copied as one picture).");
    } catch {
      setStatus("WhatsApp is opening with the text. The photos couldn't be copied - use Download photos and drag them in.");
    }
  }

  async function copyPhotos() {
    try {
      const png = await makeCollage(files);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setStatus("Photos copied as one picture - paste them into the chat with Ctrl+V.");
    } catch {
      setStatus("Couldn't copy the photos - use Download photos instead.");
    }
  }

  function downloadPhotos() {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    setStatus(`${files.length} photo${files.length === 1 ? "" : "s"} downloaded - drag them into the chat.`);
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
          {loading && <p className="text-sm text-black/60">Getting the message...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && (
            <>
              <label className="block text-sm font-medium">
                Message (edit it if you need to)
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={12}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-sm text-black"
                />
              </label>

              {photos.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      Photos: {selected.length} of {photos.length} selected
                      <span className="ml-1 font-normal text-black/50">(tap a photo to add or leave it out)</span>
                    </p>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setSelected(photos.slice(0, MAX_SELECT).map((p) => p.id))} className="text-green-700 hover:underline">
                        {photos.length > MAX_SELECT ? `First ${MAX_SELECT}` : "All"}
                      </button>
                      <button onClick={() => setSelected([])} className="text-black/60 hover:underline">
                        None
                      </button>
                    </div>
                  </div>
                  <div className="grid max-h-56 grid-cols-5 gap-1.5 overflow-y-auto">
                    {photos.map((p) => {
                      const on = selected.includes(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => toggle(p.id)} className="relative" aria-pressed={on}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.signedUrl ?? p.url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className={`aspect-square w-full rounded object-cover ${on ? "ring-2 ring-green-600" : "opacity-40"}`}
                          />
                          {on && (
                            <span className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[11px] text-white">
                              {selected.indexOf(p.id) + 1}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selected.length > 0 && !ready && (
                    <p className="text-xs text-black/60">
                      Getting the photos ready: {files.length} of {selected.length - failedCount}...
                    </p>
                  )}
                  {failedCount > 0 && <p className="text-xs text-red-600">{failedCount} photo{failedCount === 1 ? "" : "s"} couldn&apos;t be loaded and will be left out.</p>}
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
            {useShareSheet && parts.length <= 1 && (
              <button
                onClick={() => share(0)}
                disabled={!ready}
                className="w-full rounded-md bg-green-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {!ready
                  ? `Getting photos ready (${files.length}/${selected.length - failedCount})...`
                  : `Share${files.length > 0 ? " photos + message" : " message"} - then pick WhatsApp and the chat`}
              </button>
            )}
            {useShareSheet && parts.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs text-black/60">
                  WhatsApp takes {BATCH} photos per message, so these go in {parts.length} messages. Send each one to the same chat.
                </p>
                {parts.map((batch, i) => {
                  const from = i * BATCH + 1;
                  const to = i * BATCH + batch.length;
                  return (
                    <button
                      key={i}
                      onClick={() => share(i)}
                      disabled={!ready}
                      className={`w-full rounded-md px-4 py-2.5 text-base font-semibold disabled:opacity-60 ${
                        sentParts.includes(i) ? "border border-green-600 text-green-700" : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                    >
                      {!ready
                        ? `Getting photos ready (${files.length}/${selected.length - failedCount})...`
                        : `${sentParts.includes(i) ? "✓ " : ""}Part ${i + 1} of ${parts.length}: photos ${from}-${to}${i === 0 ? " + message" : ""}`}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={openWhatsapp}
                disabled={!ready}
                className={useShareSheet ? modalBtn : "w-full rounded-md bg-green-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-60"}
              >
                Open WhatsApp{files.length > 0 ? " (photos on clipboard)" : ""}
              </button>
              <button onClick={copyText} className={modalBtn}>
                Copy text
              </button>
              {files.length > 0 && (
                <>
                  <button onClick={copyPhotos} disabled={!ready || files.length > COLLAGE_MAX} title={files.length > COLLAGE_MAX ? "Too many photos for one picture - use Download photos" : undefined} className={modalBtn}>
                    Copy photos
                  </button>
                  <button onClick={downloadPhotos} disabled={!ready} className={modalBtn}>
                    Download photos
                  </button>
                </>
              )}
            </div>
            {!useShareSheet && files.length > 0 && files.length <= COLLAGE_MAX && (
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
