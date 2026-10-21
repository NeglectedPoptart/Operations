"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatTimestamp } from "@/lib/dates";
import { getDeliveredEmailList, saveDeliveredEmailList, sendDeliveredSheet, type DeliveredEmailList } from "@/app/sales/delivered/emailActions";

const DESTINATION: Record<string, string> = { houston: "Houston", dallas: "Dallas", "east-coast": "East Coast" };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Hosting caps what one request can carry (about 4.5 MB), and a tall price sheet as a PNG can be
// bigger than that - so a big one is re-saved as a high-quality JPEG, scaled down only if it must be.
const MAX_IMAGE_BYTES = 2_800_000;

async function emailImage(blob: Blob): Promise<{ data: string; contentType: "image/png" | "image/jpeg" }> {
  if (blob.size <= MAX_IMAGE_BYTES) return { data: await blobToBase64(blob), contentType: "image/png" };
  const bitmap = await createImageBitmap(blob);
  let jpeg: Blob | null = null;
  for (const scale of [1, 0.85, 0.7, 0.55]) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (jpeg && jpeg.size <= MAX_IMAGE_BYTES) break;
  }
  if (!jpeg) throw new Error("Could not prepare the image.");
  return { data: await blobToBase64(jpeg), contentType: "image/jpeg" };
}

// "Email to customers" for a Delivered page: sends the price sheet image to the lane's
// To / Cc / Bcc lists in one click, from the HOPS mailbox (replies go to Sales).
export default function DeliveredEmailButton({ lane, buildBlob }: { lane: string; buildBlob: () => Promise<Blob> }) {
  const confirm = useConfirm();
  const [list, setList] = useState<DeliveredEmailList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ to: string; cc: string; bcc: string } | null>(null);
  const label = DESTINATION[lane] ?? lane;

  useEffect(() => {
    getDeliveredEmailList(lane).then((r) => {
      if ("error" in r) setLoadError(r.error);
      else setList(r);
    });
  }, [lane]);

  async function send() {
    if (!list) return;
    const counts = `${list.to.length} To, ${list.cc.length} Cc, ${list.bcc.length} Bcc`;
    const day = (iso: string) => new Date(iso).toLocaleDateString("en-US");
    const sentToday = !!list.lastSentAt && day(list.lastSentAt) === day(new Date().toISOString());
    const warning = sentToday ? `\n\nHeads up: it was already sent today (${formatTimestamp(list.lastSentAt)} by ${list.lastSentBy}).` : "";
    if (!(await confirm(`Send the ${label} Delivered price sheet now? (${counts})${warning}`))) return;
    setBusy(true);
    setStatus("Sending...");
    try {
      const image = await emailImage(await buildBlob());
      const result = await sendDeliveredSheet(lane, image.data, image.contentType);
      if ("error" in result) {
        setStatus(null);
        alert(result.error);
        return;
      }
      setStatus(`Sent: ${result.subject}`);
      const refreshed = await getDeliveredEmailList(lane);
      if (!("error" in refreshed)) setList(refreshed);
    } catch (e) {
      setStatus(null);
      alert(`Could not send - try again. (${e instanceof Error ? e.message : "unknown error"})`);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(null), 6000);
    }
  }

  async function saveRecipients() {
    if (!editing) return;
    const result = await saveDeliveredEmailList(lane, editing);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    setList(result);
    setEditing(null);
  }

  const total = list ? list.to.length + list.cc.length + list.bcc.length : 0;
  return (
    <>
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex gap-2">
          <button
            onClick={send}
            disabled={busy || !list || total === 0}
            title={loadError ?? (total === 0 ? "Add recipients first" : "Send the price sheet image to the customer list")}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? "Sending..." : "Email to customers"}
          </button>
          <button
            onClick={() => list && setEditing({ to: list.to.join("\n"), cc: list.cc.join("\n"), bcc: list.bcc.join("\n") })}
            disabled={!list}
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            Recipients
          </button>
        </div>
        <p className="text-[11px] text-black/50 dark:text-white/50">
          {status ?? loadError ?? (list?.lastSentAt ? `Last sent ${formatTimestamp(list.lastSentAt)} by ${list.lastSentBy ?? "?"}` : list ? `${total} recipients` : "")}
        </p>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 text-black shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{label} Delivered - who gets the price sheet</h2>
            <p className="mb-3 text-xs text-black/60">Paste addresses in any format (one per line, or straight from Outlook). Sent from HOPS; replies go to sales@harvestbestinc.com.</p>
            {(
              [
                ["to", "To (sales team)"],
                ["cc", "Cc (ops)"],
                ["bcc", "Bcc (customers)"],
              ] as const
            ).map(([key, title]) => (
              <label key={key} className="mb-3 block text-sm font-medium">
                {title}
                <textarea
                  value={editing[key]}
                  onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                  rows={key === "bcc" ? 8 : 3}
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs text-black"
                />
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-md border border-black/20 px-3 py-1.5 text-sm hover:bg-black/5">
                Cancel
              </button>
              <button onClick={saveRecipients} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
