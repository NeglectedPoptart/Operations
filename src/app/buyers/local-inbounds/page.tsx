import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { LocalInbound } from "@/lib/types";
import LocalInboundsClient from "./LocalInboundsClient";

export const dynamic = "force-dynamic";

export default async function LocalInboundsPage() {
  const supabase = await createClient();
  const today = todayISO();

  const { data, error } = await supabase
    .from("local_inbounds")
    .select("*")
    .eq("entry_date", today)
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Local Inbounds: {error.message}</p>;
  }

  return <LocalInboundsClient initialItems={(data ?? []) as LocalInbound[]} entryDate={today} />;
}
