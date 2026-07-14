import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { AmHoldover } from "@/lib/types";
import AmHoldoversClient from "./AmHoldoversClient";

export const dynamic = "force-dynamic";

export default async function AmHoldoversPage() {
  const supabase = await createClient();
  const today = todayISO();

  const { data, error } = await supabase
    .from("am_holdovers")
    .select("*")
    .eq("entry_date", today)
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load AM Holdovers: {error.message}</p>;
  }

  return <AmHoldoversClient initialDate={today} initialEntries={(data ?? []) as AmHoldover[]} />;
}
