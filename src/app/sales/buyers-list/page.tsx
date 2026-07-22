import { createClient } from "@/lib/supabase/server";
import type { BuyersListItem } from "@/lib/types";
import BuyersListClient from "./BuyersListClient";

export const dynamic = "force-dynamic";

export default async function BuyersListPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("buyers_list_items")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Buyers List: {error.message}</p>;
  }

  return <BuyersListClient initialItems={(data ?? []) as BuyersListItem[]} />;
}
