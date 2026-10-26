import { createClient } from "@/lib/supabase/server";
import { addDays, currentWeekStart, isoDateOf, todayISO } from "@/lib/dates";
import { effectiveArrivalDate, scheduledArrivalDate } from "@/lib/apSummary";
import type { MxArrival, MxCommodity, MxGrower, MxGrowerLabel } from "@/lib/types";
import ApSummaryClient, { type ApRow } from "./ApSummaryClient";

export const dynamic = "force-dynamic";

// Loads that have arrived, a year back - older ones are long since paid.
const WEEKS_BACK = 52;

export default async function ApSummaryPage() {
  const supabase = await createClient();
  const today = todayISO();
  const since = addDays(currentWeekStart(), -7 * WEEKS_BACK);

  const [{ data: arrivals, error }, { data: growers }, { data: commodities }, { data: labels }] = await Promise.all([
    supabase.from("mx_arrivals").select("*").eq("arrived", true).gte("week_start_date", since).order("week_start_date", { ascending: false }),
    supabase.from("mx_growers").select("*"),
    supabase.from("mx_commodities").select("id, name"),
    supabase.from("mx_grower_labels").select("*"),
  ]);
  if (error) return <p className="text-red-600">Failed to load the AP Summary: {error.message}</p>;

  const growerById = new Map(((growers ?? []) as MxGrower[]).map((g) => [g.id, g]));
  const commodityName = new Map(((commodities ?? []) as Pick<MxCommodity, "id" | "name">[]).map((c) => [c.id, c.name]));
  const labelName = new Map(((labels ?? []) as MxGrowerLabel[]).map((l) => [l.id, l.name]));

  const rows: ApRow[] = ((arrivals ?? []) as MxArrival[]).map((a) => {
    const g = a.grower_id ? growerById.get(a.grower_id) : undefined;
    const slots = [
      [a.commodity_1_id, a.commodity_1_qty],
      [a.commodity_2_id, a.commodity_2_qty],
      [a.commodity_3_id, a.commodity_3_qty],
      [a.commodity_4_id, a.commodity_4_qty],
    ] as const;
    const commodityList = slots
      .filter(([id]) => !!id)
      .map(([id, qty]) => `${commodityName.get(id as string) ?? "?"}${qty ? ` x ${qty}` : ""}`);
    const scheduled = scheduledArrivalDate(a);
    return {
      id: a.id,
      weekStart: a.week_start_date,
      arrivalDate: effectiveArrivalDate(scheduled, a.arrived_at ? isoDateOf(a.arrived_at) : null),
      growerId: a.grower_id,
      grower: g?.name ?? "(no grower)",
      termsDays: g?.ap_terms_days ?? null,
      termsNote: g?.ap_terms_note ?? null,
      label: a.label_id ? labelName.get(a.label_id) ?? null : null,
      commodities: commodityList,
      boxes: a.boxes_approx,
      price: a.price_to_grower,
      manifesto: a.manifesto,
      notes: a.notes,
      paidAt: a.ap_paid_at ?? null,
      paidBy: a.ap_paid_by ?? null,
    };
  });

  return <ApSummaryClient today={today} initialRows={rows} />;
}
