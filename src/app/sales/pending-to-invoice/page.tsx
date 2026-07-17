import { createClient } from "@/lib/supabase/server";
import type { PendingToInvoiceItem } from "@/lib/types";
import PendingToInvoiceClient from "./PendingToInvoiceClient";

export const dynamic = "force-dynamic";

export default async function PendingToInvoicePage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pending_to_invoice")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Pending to Invoice: {error.message}</p>;
  }

  return <PendingToInvoiceClient initialItems={(data ?? []) as PendingToInvoiceItem[]} />;
}
