import { createClient } from "@/lib/supabase/server";
import type { Broker, Load } from "@/lib/types";
import BoardClient from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const supabase = await createClient();

  const [{ data: loads, error: loadsError }, { data: brokers, error: brokersError }] =
    await Promise.all([
      supabase
        .from("loads")
        .select("*, brokers(id, name), load_stops(*)")
        .order("loading_date", { ascending: true })
        .order("position", { foreignTable: "load_stops", ascending: true }),
      supabase.from("brokers").select("*").order("name", { ascending: true }),
    ]);

  if (loadsError || brokersError) {
    return (
      <p className="text-red-600">
        Failed to load board: {loadsError?.message ?? brokersError?.message}
      </p>
    );
  }

  return (
    <BoardClient
      loads={(loads ?? []) as unknown as Load[]}
      brokers={(brokers ?? []) as Broker[]}
    />
  );
}
