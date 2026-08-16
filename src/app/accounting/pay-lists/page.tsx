import { createClient } from "@/lib/supabase/server";
import type { ApPayList, ApPayListItem, Profile } from "@/lib/types";
import PayListsClient from "./PayListsClient";

export const dynamic = "force-dynamic";

export default async function PayListsPage() {
  const supabase = await createClient();

  const [
    { data: payLists, error: payListsError },
    { data: items, error: itemsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase.from("ap_pay_lists").select("*").order("created_at", { ascending: false }),
    supabase.from("ap_pay_list_items").select("*"),
    supabase.from("profiles").select("*"),
  ]);

  if (payListsError) {
    return <p className="text-red-600">Failed to load pay lists: {payListsError.message}</p>;
  }
  if (itemsError) {
    return <p className="text-red-600">Failed to load pay list items: {itemsError.message}</p>;
  }
  if (profilesError) {
    return <p className="text-red-600">Failed to load users: {profilesError.message}</p>;
  }

  return (
    <PayListsClient
      payLists={(payLists ?? []) as ApPayList[]}
      initialItems={(items ?? []) as ApPayListItem[]}
      profiles={(profiles ?? []) as Profile[]}
    />
  );
}
