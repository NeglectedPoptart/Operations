"use client";

import { useEffect, useRef, useState } from "react";
import type { PortalLoad } from "@/lib/brokerPortal/types";
import { signRateCon } from "./actions";

const field = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-black";

// Draw-your-signature pad (finger or mouse). Reports the signature as a PNG data URL, or "" while blank.
function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1b5a";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    inked.current = true;
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange(canvas.current!.toDataURL("image/png"));
  }

  function clear() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    inked.current = false;
    onChange("");
  }

  return (
    <div className="space-y-1">
      <canvas
        ref={canvas}
        width={720}
        height={240}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="aspect-[3/1] w-full touch-none rounded-md border-2 border-dashed border-gray-400 bg-white"
        aria-label="Signature"
      />
      <div className="flex items-center justify-between text-xs text-black/60 dark:text-white/60">
        <span>Sign above with your finger or mouse.</span>
        <button type="button" onClick={clear} className="font-medium text-green-700 hover:underline dark:text-green-400">
          Clear
        </button>
      </div>
    </div>
  );
}

export default function SignModal({ load, defaultName, onClose, onDone }: { load: PortalLoad; defaultName: string; onClose: () => void; onDone: (message: string) => void }) {
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doc = load.rateCons[0];
  const rate = load.rate === null ? null : `$${load.rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  async function submit() {
    setError(null);
    setBusy(true);
    const r = await signRateCon({ loadId: load.id, name, title, signature, agreed });
    setBusy(false);
    if ("error" in r) setError(r.error);
    else onDone(r.message ?? "Signed.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[95vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-t-xl bg-white p-4 text-black shadow-xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Review &amp; sign the rate confirmation</h2>
            <p className="text-xs text-black/60">Read it, then sign at the bottom. The signed copy is saved on the load at Harvest Best.</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-black/50 hover:text-black" aria-label="Close">
            ×
          </button>
        </div>

        {doc?.url ? (
          <>
            <iframe src={doc.url} title="Rate confirmation" className="hidden h-[45vh] w-full rounded-md border border-black/20 sm:block" />
            <a href={doc.url} target="_blank" rel="noreferrer" className="inline-block rounded-md border border-green-600 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50">
              Open the rate confirmation ({doc.name})
            </a>
          </>
        ) : (
          <p className="text-sm text-red-600">The rate confirmation file couldn&apos;t be opened - refresh the page.</p>
        )}
        {load.rateCons.length > 1 && <p className="text-xs text-black/60">This load has {load.rateCons.length} confirmations; your signature goes on each of them.</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-0.5 text-sm">
            <span className="font-medium">Full name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="space-y-0.5 text-sm">
            <span className="font-medium">Title</span>
            <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dispatcher, Owner..." />
          </label>
        </div>

        <SignaturePad onChange={setSignature} />

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            I agree to the terms and conditions of this rate confirmation and accept the load{rate ? ` at ${rate}` : ""}. I understand my electronic signature has the same effect as a handwritten one.
          </span>
        </label>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/5">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy || !signature || !agreed || name.trim().length < 3}
            className="rounded-md bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Signing..." : "Sign & approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
