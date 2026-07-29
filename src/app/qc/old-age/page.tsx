import { createClient } from "@/lib/supabase/server";
import type { OldAgeItem, OldAgeMove } from "@/lib/types";
import OldAgeClient from "./OldAgeClient";

export const dynamic = "force-dynamic";

export default async function OldAgePage() {
  const supabase = await createClient();

  const [
    { data, error },
    { data: moves, error: movesError },
  ] = await Promise.all([
    supabase.from("old_age_items").select("*").order("position", { ascending: true }),
    supabase.from("old_age_moves").select("*").order("created_at", { ascending: false }),
  ]);

  if (error || movesError) {
    return <p className="text-red-600">Failed to load Old Age: {error?.message ?? movesError?.message}</p>;
  }

  return <OldAgeClient initialItems={(data ?? []) as OldAgeItem[]} initialMoves={(moves ?? []) as OldAgeMove[]} />;
}
