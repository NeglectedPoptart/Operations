import { createClient } from "@/lib/supabase/server";
import type { OldAgeItem } from "@/lib/types";
import OldAgeClient from "./OldAgeClient";

export const dynamic = "force-dynamic";

export default async function OldAgePage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("old_age_items")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Old Age: {error.message}</p>;
  }

  return <OldAgeClient initialItems={(data ?? []) as OldAgeItem[]} />;
}
