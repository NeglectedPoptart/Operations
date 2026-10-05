import { createClient } from "@/lib/supabase/server";
import type { CartonBalance, CartonLocation, CartonTransaction, CartonType, MxGrower } from "@/lib/types";
import CartonInventoryClient from "./CartonInventoryClient";

export const dynamic = "force-dynamic";

export default async function CartonInventoryPage() {
  const supabase = await createClient();

  const [
    { data: locations, error: locationsError },
    { data: cartonTypes, error: cartonTypesError },
    { data: balances, error: balancesError },
    { data: growers, error: growersError },
    { data: activity, error: activityError },
  ] = await Promise.all([
    supabase.from("carton_locations").select("*"),
    supabase.from("carton_types").select("*").order("position", { ascending: true }),
    supabase.from("carton_balances").select("*"),
    supabase.from("mx_growers").select("*").order("name", { ascending: true }),
    supabase
      .from("carton_transactions")
      .select("*")
      .in("source", ["manual", "transfer"])
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const error = locationsError ?? cartonTypesError ?? balancesError ?? growersError ?? activityError;
  if (error) {
    return <p className="text-red-600">Failed to load Carton Inventory: {error.message}</p>;
  }

  return (
    <CartonInventoryClient
      initialLocations={(locations ?? []) as CartonLocation[]}
      cartonTypes={(cartonTypes ?? []) as CartonType[]}
      initialBalances={(balances ?? []) as CartonBalance[]}
      growers={(growers ?? []) as MxGrower[]}
      initialActivity={(activity ?? []) as CartonTransaction[]}
    />
  );
}
