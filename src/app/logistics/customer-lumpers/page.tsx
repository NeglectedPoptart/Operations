import { createClient } from "@/lib/supabase/server";
import type { CustomerLumper } from "@/lib/types";
import CustomerLumpersClient from "./CustomerLumpersClient";

export const dynamic = "force-dynamic";

export default async function CustomerLumpersPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customer_lumpers")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Customer Lumpers: {error.message}</p>;
  }

  return <CustomerLumpersClient initialRows={(data ?? []) as CustomerLumper[]} />;
}
