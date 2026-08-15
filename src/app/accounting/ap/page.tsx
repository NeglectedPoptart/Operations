import { createClient } from "@/lib/supabase/server";
import type { ApPayable, ApVendor } from "@/lib/types";
import ApClient from "./ApClient";

export const dynamic = "force-dynamic";

export default async function AccountsPayablePage() {
  const supabase = await createClient();

  const [{ data: vendors, error: vendorsError }, { data: payables, error: payablesError }] = await Promise.all([
    supabase.from("ap_vendors").select("*").order("vendor_name", { ascending: true }),
    supabase.from("ap_payables").select("*"),
  ]);

  if (vendorsError) {
    return <p className="text-red-600">Failed to load AP vendors: {vendorsError.message}</p>;
  }
  if (payablesError) {
    return <p className="text-red-600">Failed to load AP payables: {payablesError.message}</p>;
  }

  return <ApClient initialVendors={(vendors ?? []) as ApVendor[]} initialPayables={(payables ?? []) as ApPayable[]} />;
}
