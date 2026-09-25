import { createClient } from "@/lib/supabase/server";
import type { CartonType, MxCommodity } from "@/lib/types";
import ProduceClient from "./ProduceClient";

export const dynamic = "force-dynamic";

export default async function ProducePage() {
  const supabase = await createClient();

  const [{ data: cartonTypes, error: cartonTypesError }, { data: products, error: productsError }] = await Promise.all([
    supabase.from("carton_types").select("*").order("position", { ascending: true }),
    supabase.from("mx_commodities").select("*").order("name", { ascending: true }),
  ]);

  const error = cartonTypesError ?? productsError;
  if (error) {
    return <p className="text-red-600">Failed to load Produce: {error.message}</p>;
  }

  return (
    <ProduceClient initialCartonTypes={(cartonTypes ?? []) as CartonType[]} initialProducts={(products ?? []) as MxCommodity[]} />
  );
}
