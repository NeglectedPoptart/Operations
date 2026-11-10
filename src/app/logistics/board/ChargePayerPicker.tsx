"use client";

import { CHARGE_CAUSES, CHARGE_PAYERS, type ChargePayer } from "@/lib/loadCharges";

const inputClass = "rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black placeholder:text-black/40";

export interface PayerValue {
  payer: ChargePayer | "";
  payerName: string;
  cause: "" | "expected" | "our_error";
}

export const emptyPayer = (warehouse = ""): PayerValue => ({ payer: "", payerName: warehouse, cause: "" });

// "Who should pay this?" - one tap on Harvest Best / Warehouse / Carrier / Customer / Other, then the
// one follow-up that choice needs (expected vs our error, which warehouse, or the carrier being charged).
export default function ChargePayerPicker({
  value,
  onChange,
  carrierName,
  warehouseHint,
}: {
  value: PayerValue;
  onChange: (v: PayerValue) => void;
  carrierName?: string | null;
  warehouseHint?: string | null;
}) {
  const chosen = CHARGE_PAYERS.find((p) => p.value === value.payer);
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">Who should pay this?</p>
      <div className="flex flex-wrap gap-1.5">
        {CHARGE_PAYERS.map((p) => {
          const on = value.payer === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange({ ...value, payer: p.value, payerName: p.value === "warehouse" && !value.payerName ? warehouseHint ?? "" : value.payerName })}
              className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${on ? p.tone : "border-black/15 bg-white text-black/70 hover:bg-black/5 dark:border-white/20 dark:bg-transparent dark:text-white/70"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {chosen && <p className="text-xs text-black/60 dark:text-white/60">{chosen.value === "carrier" && carrierName ? `Deduct it from ${carrierName} - their error.` : `${chosen.hint}.`}</p>}
      {value.payer === "harvest_best" && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium">Why?</span>
          {CHARGE_CAUSES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange({ ...value, cause: value.cause === c.value ? "" : c.value })}
              className={`rounded-full border px-2.5 py-0.5 ${value.cause === c.value ? "border-blue-500 bg-blue-50 font-semibold text-blue-900 dark:bg-blue-900/30 dark:text-blue-100" : "border-black/20 hover:bg-black/5 dark:border-white/20"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {(value.payer === "warehouse" || value.payer === "customer") && (
        <label className="block text-xs font-medium">
          {value.payer === "warehouse" ? "Which warehouse?" : "Which customer?"}
          <input value={value.payerName} onChange={(e) => onChange({ ...value, payerName: e.target.value })} className={`${inputClass} mt-0.5 block w-full max-w-xs`} />
        </label>
      )}
    </div>
  );
}
