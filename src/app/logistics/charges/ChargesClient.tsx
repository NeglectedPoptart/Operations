"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDateSlash } from "@/lib/dates";
import {
  CHARGE_KINDS,
  CHARGE_PAYERS,
  RECOVERY_STATUSES,
  needsRecovery,
  payerLabel,
  payerSummary,
  payerTone,
  recoveryLabel,
  type ChargePayer,
  type RecoveryStatus,
} from "@/lib/loadCharges";
import { deleteLoadCharge, updateLoadCharge } from "../board/actions";
import ChargePayerPicker, { type PayerValue } from "../board/ChargePayerPicker";
import { inputClass, money, smallBtn, useRun } from "../board/LoadExtras";

export interface ChargeRow {
  id: string;
  loadId: string;
  kind: string;
  amount: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  payer: ChargePayer | null;
  payerName: string | null;
  cause: "expected" | "our_error" | null;
  recoveryStatus: RecoveryStatus;
  recoveredAmount: number | null;
  recoveredAt: string | null;
  reference: string | null;
  details: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  carrier: string | null;
  loadDate: string | null;
  source: string | null;
  orders: string;
  customer: string | null;
  destination: string;
}

// Still to get back from whoever should pay: not absorbed by us, not recovered or written off yet.
const isOutstanding = (c: ChargeRow) => needsRecovery(c.payer) && (c.recoveryStatus === "open" || c.recoveryStatus === "billed");
const outstandingAmount = (c: ChargeRow) => Math.max(0, c.amount - (c.recoveredAmount ?? 0));

const PAYER_FILTERS = [{ value: "all", label: "All" }, ...CHARGE_PAYERS.map((p) => ({ value: p.value as string, label: p.label })), { value: "none", label: "Not assigned" }];
const STATUS_FILTERS = [
  { value: "all", label: "Any status" },
  { value: "outstanding", label: "Still to recover" },
  { value: "recovered", label: "Recovered" },
  { value: "written_off", label: "Written off" },
];

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function ChargesClient({ initialRows }: { initialRows: ChargeRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [payerFilter, setPayerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const carriers = useMemo(() => [...new Set(rows.map((r) => r.carrier).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b)), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (payerFilter === "none" ? r.payer !== null : payerFilter !== "all" && r.payer !== payerFilter) return false;
      if (statusFilter === "outstanding" && !isOutstanding(r)) return false;
      if (statusFilter === "recovered" && !(needsRecovery(r.payer) && r.recoveryStatus === "recovered")) return false;
      if (statusFilter === "written_off" && !(needsRecovery(r.payer) && r.recoveryStatus === "written_off")) return false;
      if (carrierFilter && r.carrier !== carrierFilter) return false;
      const d = r.loadDate ?? r.createdAt.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q) {
        const hay = [r.kind, r.note, r.details, r.reference, r.carrier, r.orders, r.customer, r.destination, r.payerName, r.createdBy].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, payerFilter, statusFilter, carrierFilter, search, from, to]);

  // One tile per payer, over ALL charges (the filters only change the table below).
  const tiles = useMemo(() => {
    const make = (value: string, label: string, tone: string, match: (r: ChargeRow) => boolean) => {
      const mine = rows.filter(match);
      return {
        value,
        label,
        tone,
        count: mine.length,
        total: mine.reduce((s, r) => s + r.amount, 0),
        outstanding: mine.filter(isOutstanding).reduce((s, r) => s + outstandingAmount(r), 0),
        recovered: mine.reduce((s, r) => s + (needsRecovery(r.payer) && r.recoveryStatus === "recovered" ? (r.recoveredAmount ?? r.amount) : 0), 0),
      };
    };
    return [
      ...CHARGE_PAYERS.map((p) => make(p.value, p.label, p.tone, (r) => r.payer === p.value)),
      make("none", "Not assigned", payerTone(null), (r) => r.payer === null),
    ].filter((t) => t.count > 0 || t.value !== "none");
  }, [rows]);

  // Who currently owes us money: each carrier / warehouse / customer with open charges.
  const owed = useMemo(() => {
    const map = new Map<string, { label: string; payer: string; count: number; amount: number }>();
    for (const r of rows) {
      if (!isOutstanding(r)) continue;
      const who = r.payer === "carrier" ? r.carrier ?? "Carrier" : r.payerName ?? "";
      const key = `${r.payer}|${who}`;
      const cur = map.get(key) ?? { label: who ? `${payerLabel(r.payer)}: ${who}` : payerLabel(r.payer), payer: r.payer ?? "", count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += outstandingAmount(r);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const shownTotal = filtered.reduce((s, r) => s + r.amount, 0);
  const open = rows.find((r) => r.id === openId) ?? null;

  function patchRow(id: string, patch: Partial<ChargeRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function exportCsv() {
    const head = ["Load date", "Carrier", "Orders", "Customer", "Destination", "Charge", "Amount", "Who pays", "Status", "Recovered", "Recovered on", "Reference", "Note", "Details", "Added by"];
    const lines = filtered.map((r) =>
      [
        r.loadDate ?? "",
        r.carrier ?? "",
        r.orders,
        r.customer ?? "",
        r.destination,
        r.kind,
        r.amount.toFixed(2),
        payerSummary({ payer: r.payer, payer_name: r.payerName, cause: r.cause }, r.carrier),
        needsRecovery(r.payer) ? recoveryLabel(r.recoveryStatus) : r.payer ? "Absorbed" : "",
        r.recoveredAmount === null ? "" : r.recoveredAmount.toFixed(2),
        r.recoveredAt ?? "",
        r.reference ?? "",
        r.note ?? "",
        r.details ?? "",
        r.createdBy ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `load-charges-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Load Charges</h1>
          <p className="text-sm text-black/60 dark:text-white/60">Every extra charge added to a load, who should pay it, and whether it has been recovered. Add charges from a load on the List; click a row here to add details.</p>
        </div>
        <button onClick={exportCsv} className={smallBtn} disabled={filtered.length === 0}>
          ⬇ Export CSV ({filtered.length})
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <button
            key={t.value}
            onClick={() => setPayerFilter(payerFilter === t.value ? "all" : t.value)}
            className={`rounded-lg border-2 p-2.5 text-left ${t.tone} ${payerFilter === t.value ? "ring-2 ring-offset-1 ring-black/40" : "opacity-90 hover:opacity-100"}`}
          >
            <p className="text-xs font-semibold uppercase">{t.label}</p>
            <p className="text-lg font-bold">{money(t.total)}</p>
            <p className="text-xs">
              {t.count} charge{t.count === 1 ? "" : "s"}
              {t.value !== "harvest_best" && t.value !== "none" && (
                <>
                  {" "}
                  · <b>{money(t.outstanding)}</b> to recover
                </>
              )}
            </p>
          </button>
        ))}
      </div>

      {owed.length > 0 && (
        <section className="rounded-lg border border-black/10 p-3 dark:border-white/10">
          <h2 className="mb-1.5 text-sm font-bold">Still owed to Harvest Best</h2>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {owed.map((o) => (
              <li key={o.label} className="flex items-center justify-between gap-2 border-b border-black/5 py-0.5 dark:border-white/5">
                <span>
                  {o.label} <span className="text-xs text-black/50 dark:text-white/50">({o.count})</span>
                </span>
                <b>{money(o.amount)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium">
          Who pays
          <select value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)} className={`${inputClass} mt-0.5 block`}>
            {PAYER_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} mt-0.5 block`}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Carrier
          <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)} className={`${inputClass} mt-0.5 block`}>
            <option value="">All carriers</option>
            {carriers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Load date from
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-0.5 block`} />
        </label>
        <label className="text-xs font-medium">
          to
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-0.5 block`} />
        </label>
        <label className="min-w-[12rem] flex-1 text-xs font-medium">
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order #, customer, note, reference..." className={`${inputClass} mt-0.5 block w-full`} />
        </label>
        {(payerFilter !== "all" || statusFilter !== "all" || carrierFilter || search || from || to) && (
          <button
            className={smallBtn}
            onClick={() => {
              setPayerFilter("all");
              setStatusFilter("all");
              setCarrierFilter("");
              setSearch("");
              setFrom("");
              setTo("");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left text-xs uppercase dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Load</th>
              <th className="px-2 py-2">Charge</th>
              <th className="px-2 py-2 text-right">Amount</th>
              <th className="px-2 py-2">Who pays</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-black/50 dark:text-white/50">
                  {rows.length === 0 ? "No charges yet. Add one from a load on the List (💲 Charges)." : "No charges match these filters."}
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-t border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                <td className="px-2 py-1.5">
                  <p className="font-medium">{r.carrier ?? "No carrier"}</p>
                  <p className="text-xs text-black/55 dark:text-white/55">
                    {[r.loadDate ? formatDateSlash(r.loadDate) : "", r.orders ? `#${r.orders}` : "", r.customer].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="px-2 py-1.5">{r.kind}</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money(r.amount)}</td>
                <td className="px-2 py-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${payerTone(r.payer)}`}>{payerSummary({ payer: r.payer, payer_name: r.payerName, cause: r.cause }, r.carrier)}</span>
                </td>
                <td className="px-2 py-1.5 text-xs">
                  {!r.payer ? (
                    <span className="text-black/40 dark:text-white/40">-</span>
                  ) : !needsRecovery(r.payer) ? (
                    <span className="text-black/55 dark:text-white/55">Absorbed</span>
                  ) : (
                    <span className={r.recoveryStatus === "recovered" ? "font-semibold text-green-700 dark:text-green-400" : r.recoveryStatus === "written_off" ? "text-black/50" : "font-semibold text-amber-700 dark:text-amber-400"}>
                      {recoveryLabel(r.recoveryStatus)}
                      {r.recoveredAmount !== null && r.recoveryStatus !== "open" ? ` ${money(r.recoveredAmount)}` : ""}
                    </span>
                  )}
                  {r.reference && <p className="text-black/50 dark:text-white/50">Ref {r.reference}</p>}
                </td>
                <td className="max-w-xs px-2 py-1.5 text-xs text-black/70 dark:text-white/70">
                  {r.note}
                  {r.details && <span className="text-black/45 dark:text-white/45"> {r.note ? "· " : ""}+ details</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-black/20 bg-black/5 text-sm font-semibold dark:border-white/20 dark:bg-white/5">
              <tr>
                <td className="px-2 py-1.5" colSpan={2}>
                  {filtered.length} charge{filtered.length === 1 ? "" : "s"} shown
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(shownTotal)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {open && <ChargeEditor key={open.id} row={open} onClose={() => setOpenId(null)} onSaved={(patch) => patchRow(open.id, patch)} onDeleted={() => { setRows((prev) => prev.filter((r) => r.id !== open.id)); setOpenId(null); }} />}
    </div>
  );
}

function ChargeEditor({ row, onClose, onSaved, onDeleted }: { row: ChargeRow; onClose: () => void; onSaved: (patch: Partial<ChargeRow>) => void; onDeleted: () => void }) {
  const confirm = useConfirm();
  const { busy, run } = useRun();
  const [kind, setKind] = useState(row.kind);
  const [amount, setAmount] = useState(String(row.amount));
  const [note, setNote] = useState(row.note ?? "");
  const [payer, setPayer] = useState<PayerValue>({ payer: row.payer ?? "", payerName: row.payerName ?? "", cause: row.cause ?? "" });
  const [status, setStatus] = useState<RecoveryStatus>(row.recoveryStatus);
  const [recovered, setRecovered] = useState(row.recoveredAmount === null ? "" : String(row.recoveredAmount));
  const [recoveredAt, setRecoveredAt] = useState(row.recoveredAt ?? "");
  const [reference, setReference] = useState(row.reference ?? "");
  const [details, setDetails] = useState(row.details ?? "");
  const owes = needsRecovery(payer.payer);
  const kinds = CHARGE_KINDS.includes(row.kind as (typeof CHARGE_KINDS)[number]) ? [...CHARGE_KINDS] : [row.kind, ...CHARGE_KINDS];

  function setStatusSmart(next: RecoveryStatus) {
    setStatus(next);
    // Marking it recovered fills in the full amount and today's date to save typing; both can be changed.
    if (next === "recovered") {
      if (!recovered) setRecovered(amount);
      if (!recoveredAt) setRecoveredAt(new Date().toISOString().slice(0, 10));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-2xl space-y-3 rounded-xl bg-white p-4 text-black shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">
              {row.kind} · {money(row.amount)}
            </h2>
            <p className="text-xs text-black/60">
              {[row.carrier, row.loadDate ? formatDateSlash(row.loadDate) : "", row.orders ? `#${row.orders}` : "", row.customer, row.destination].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-black/45">
              Added {formatDateSlash(row.createdAt.slice(0, 10))}
              {row.createdBy ? ` by ${row.createdBy}` : ""}
              {row.updatedAt ? ` · last changed ${formatDateSlash(row.updatedAt.slice(0, 10))}${row.updatedBy ? ` by ${row.updatedBy}` : ""}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded px-2 text-xl leading-none text-black/50 hover:bg-black/10" aria-label="Close">
            ×
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium">
            Charge
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${inputClass} mt-0.5 block`}>
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Amount $
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} mt-0.5 block w-28`} />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs font-medium">
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} mt-0.5 block w-full`} />
          </label>
        </div>

        <div className="rounded-lg border border-black/10 p-2.5">
          <ChargePayerPicker value={payer} onChange={setPayer} carrierName={row.carrier} warehouseHint={row.source} />
          {payer.payer === "other" && (
            <label className="mt-1.5 block text-xs font-medium">
              Who?
              <input value={payer.payerName} onChange={(e) => setPayer({ ...payer, payerName: e.target.value })} className={`${inputClass} mt-0.5 block w-full max-w-xs`} />
            </label>
          )}
        </div>

        {owes && (
          <div className="space-y-2 rounded-lg border border-black/10 p-2.5">
            <p className="text-xs font-semibold uppercase text-black/50">Getting it back</p>
            <div className="flex flex-wrap gap-1.5">
              {RECOVERY_STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatusSmart(s.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${status === s.value ? "border-green-600 bg-green-50 font-semibold text-green-900" : "border-black/20 hover:bg-black/5"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium">
                Amount recovered $
                <input type="number" step="0.01" value={recovered} onChange={(e) => setRecovered(e.target.value)} className={`${inputClass} mt-0.5 block w-32`} />
              </label>
              <label className="text-xs font-medium">
                Date
                <input type="date" value={recoveredAt} onChange={(e) => setRecoveredAt(e.target.value)} className={`${inputClass} mt-0.5 block`} />
              </label>
              <label className="min-w-[10rem] flex-1 text-xs font-medium">
                Invoice / deduction / check #
                <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputClass} mt-0.5 block w-full`} />
              </label>
            </div>
          </div>
        )}
        {!owes && payer.payer && (
          <label className="block text-xs font-medium">
            Reference (invoice / PO)
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputClass} mt-0.5 block w-full max-w-xs`} />
          </label>
        )}

        <label className="block text-xs font-medium">
          Details (internal - what happened, who was told, what was agreed)
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} className={`${inputClass} mt-0.5 block w-full`} />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await confirm(`Delete this ${row.kind} charge of ${money(row.amount)}? This can't be undone.`)) void run(async () => {
                const result = await deleteLoadCharge(row.id);
                if (!("error" in result)) onDeleted();
                return result;
              });
            }}
            className="text-xs text-red-600 hover:underline"
          >
            Delete charge
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={smallBtn}>
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !payer.payer}
              title={payer.payer ? "" : "Pick who should pay this charge"}
              onClick={() =>
                void run(async () => {
                  if (!payer.payer) return { error: "Pick who should pay this charge." };
                  const amt = Number(amount);
                  const rec = recovered.trim() === "" ? null : Number(recovered);
                  const result = await updateLoadCharge(row.id, {
                    kind,
                    amount: amt,
                    note,
                    payer: payer.payer,
                    payerName: payer.payerName,
                    cause: payer.cause,
                    recoveryStatus: status,
                    recoveredAmount: rec,
                    recoveredAt,
                    reference,
                    details,
                  });
                  if (!("error" in result)) {
                    const absorbed = payer.payer === "harvest_best";
                    onSaved({
                      kind: kind.trim() || "Other",
                      amount: amt,
                      note: note.trim() || null,
                      payer: payer.payer,
                      payerName: payer.payer === "warehouse" || payer.payer === "customer" || payer.payer === "other" ? payer.payerName.trim() || null : null,
                      cause: absorbed && payer.cause ? payer.cause : null,
                      recoveryStatus: absorbed ? "open" : status,
                      recoveredAmount: absorbed ? null : rec,
                      recoveredAt: absorbed ? null : recoveredAt || null,
                      reference: reference.trim() || null,
                      details: details.trim() || null,
                      updatedAt: new Date().toISOString(),
                    });
                    onClose();
                  }
                  return result;
                })
              }
              className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
