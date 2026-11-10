import { createClient } from "@/lib/supabase/server";
import type { LoadCharge } from "@/lib/loadCharges";
import ChargesClient, { type ChargeRow } from "./ChargesClient";

export const dynamic = "force-dynamic";

interface JoinedCharge extends LoadCharge {
  loads: {
    loading_date: string | null;
    source: string | null;
    rate: number | null;
    brokers: { name: string } | null;
    load_stops: { order_number: string | null; client_name: string | null; destination_city: string | null; destination_state: string | null; position: number }[];
  } | null;
}

export default async function LoadChargesPage() {
  const supabase = await createClient();

  // Page through everything - Supabase returns at most 1,000 rows per request.
  const rows: JoinedCharge[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("load_charges")
      .select("*, loads(loading_date, source, rate, brokers(name), load_stops(order_number, client_name, destination_city, destination_state, position))")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return <p className="text-red-600">Failed to load charges: {error.message}</p>;
    rows.push(...((data ?? []) as unknown as JoinedCharge[]));
    if ((data ?? []).length < 1000) break;
  }

  const charges: ChargeRow[] = rows.map((r) => {
    const stops = [...(r.loads?.load_stops ?? [])].sort((a, b) => a.position - b.position);
    const orders = stops.map((s) => s.order_number).filter(Boolean).join(", ");
    const dest = stops[0] ? [stops[0].destination_city, stops[0].destination_state].filter(Boolean).join(", ") : "";
    return {
      id: r.id,
      loadId: r.load_id,
      kind: r.kind,
      amount: Number(r.amount),
      note: r.note,
      createdBy: r.created_by,
      createdAt: r.created_at,
      payer: r.payer ?? null,
      payerName: r.payer_name ?? null,
      cause: r.cause ?? null,
      recoveryStatus: r.recovery_status ?? "open",
      recoveredAmount: r.recovered_amount === null || r.recovered_amount === undefined ? null : Number(r.recovered_amount),
      recoveredAt: r.recovered_at ?? null,
      reference: r.reference ?? null,
      details: r.details ?? null,
      updatedAt: r.updated_at ?? null,
      updatedBy: r.updated_by ?? null,
      carrier: r.loads?.brokers?.name ?? null,
      loadDate: r.loads?.loading_date ?? null,
      source: r.loads?.source ?? null,
      orders,
      customer: stops[0]?.client_name ?? null,
      destination: dest,
    };
  });

  return <ChargesClient initialRows={charges} />;
}
