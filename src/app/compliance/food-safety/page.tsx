import { createClient } from "@/lib/supabase/server";
import type { FoodSafetyDocument, FoodSafetyReportType, MxGrower } from "@/lib/types";
import { checkAndSendFoodSafetyAlerts } from "./actions";
import FoodSafetyClient from "./FoodSafetyClient";

export const dynamic = "force-dynamic";

export default async function FoodSafetyPage() {
  // Best-effort - a failure here (e.g. no recipients configured yet)
  // shouldn't block the page itself from loading.
  await checkAndSendFoodSafetyAlerts().catch(() => {});

  const supabase = await createClient();
  const [
    { data: growers, error: growersError },
    { data: reportTypes, error: typesError },
    { data: documents, error: docsError },
  ] = await Promise.all([
    supabase.from("mx_growers").select("*").order("name", { ascending: true }),
    supabase.from("food_safety_report_types").select("*").order("position", { ascending: true }),
    supabase.from("food_safety_documents").select("*").order("created_at", { ascending: false }),
  ]);

  const error = growersError ?? typesError ?? docsError;
  if (error) {
    return <p className="text-red-600">Failed to load Food Safety: {error.message}</p>;
  }

  return (
    <FoodSafetyClient
      initialGrowers={(growers ?? []) as MxGrower[]}
      initialReportTypes={(reportTypes ?? []) as FoodSafetyReportType[]}
      initialDocuments={(documents ?? []) as FoodSafetyDocument[]}
    />
  );
}
