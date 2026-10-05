"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/mexico/carton-inventory");
}

// PCA/manufacturer intake - always lands at the one Homebase location.
export async function addCartons(cartonTypeId: string, qty: number, entryDate: string, notes: string | null) {
  const supabase = await createClient();
  const { data: homebase, error: homebaseError } = await supabase
    .from("carton_locations")
    .select("id")
    .eq("kind", "homebase")
    .single();
  if (homebaseError) throw new Error(homebaseError.message);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("carton_transactions").insert({
    carton_type_id: cartonTypeId,
    location_id: homebase.id,
    qty,
    entry_date: entryDate,
    source: "manual",
    notes,
    created_by: user?.id ?? null,
  });
  if (error) throw new Error(error.message);
  revalidateAll();
}

export interface CountLine {
  cartonTypeId: string;
  qty: number;
}

// Sets a location's on-hand count for each given carton type to exactly the
// counted number - used to load starting inventory (and later to correct a
// physical count). Posts one ledger row for the difference between the
// count and the balance as of right now, rather than overwriting the
// balance, so the ledger still adds up and the change is traceable. The
// difference is worked out here (not trusted from the client) against the
// live balance.
export async function setCartonCounts(locationId: string, lines: CountLine[], entryDate: string) {
  if (lines.length === 0) throw new Error("Enter at least one count.");
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty < 0) {
      throw new Error("Counts must be whole numbers, 0 or more.");
    }
  }

  const supabase = await createClient();
  const { data: balances, error: balancesError } = await supabase
    .from("carton_balances")
    .select("carton_type_id, qty")
    .eq("location_id", locationId);
  if (balancesError) throw new Error(balancesError.message);
  const currentByType = new Map((balances ?? []).map((b) => [b.carton_type_id as string, b.qty as number]));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rows = lines
    .map((line) => ({ line, delta: line.qty - (currentByType.get(line.cartonTypeId) ?? 0) }))
    .filter(({ delta }) => delta !== 0)
    .map(({ line, delta }) => ({
      carton_type_id: line.cartonTypeId,
      location_id: locationId,
      qty: delta,
      entry_date: entryDate,
      source: "manual" as const,
      notes: `Counted: ${line.qty}`,
      created_by: user?.id ?? null,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("carton_transactions").insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidateAll();
}

export interface TransferLine {
  cartonTypeId: string;
  qty: number;
  toLocationId: string;
}

// A transfer is two linked ledger rows per line (-qty at FROM, +qty at TO),
// sharing related_transaction_id - see carton_transactions_apply/reverse
// triggers in migration_114 for how the running balance stays in sync.
// Re-checks each line's available balance server-side (not just the
// client's point-in-time check) before writing anything.
export async function transferCartons(fromLocationId: string, lines: TransferLine[], entryDate: string, notes: string | null) {
  if (lines.length === 0) throw new Error("Add at least one line.");
  const supabase = await createClient();

  const { data: balances, error: balancesError } = await supabase
    .from("carton_balances")
    .select("carton_type_id, qty")
    .eq("location_id", fromLocationId);
  if (balancesError) throw new Error(balancesError.message);
  const balanceByType = new Map((balances ?? []).map((b) => [b.carton_type_id as string, b.qty as number]));

  for (const line of lines) {
    const available = balanceByType.get(line.cartonTypeId) ?? 0;
    if (line.qty > available) {
      throw new Error(`Only ${available} available for one of the selected carton types - reload and try again.`);
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  for (const line of lines) {
    const { data: outRow, error: outError } = await supabase
      .from("carton_transactions")
      .insert({
        carton_type_id: line.cartonTypeId,
        location_id: fromLocationId,
        qty: -line.qty,
        entry_date: entryDate,
        source: "transfer",
        notes,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (outError) throw new Error(outError.message);

    const { data: inRow, error: inError } = await supabase
      .from("carton_transactions")
      .insert({
        carton_type_id: line.cartonTypeId,
        location_id: line.toLocationId,
        qty: line.qty,
        entry_date: entryDate,
        related_transaction_id: outRow.id,
        source: "transfer",
        notes,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (inError) throw new Error(inError.message);

    const { error: linkError } = await supabase
      .from("carton_transactions")
      .update({ related_transaction_id: inRow.id })
      .eq("id", outRow.id);
    if (linkError) throw new Error(linkError.message);
  }

  revalidateAll();
}
