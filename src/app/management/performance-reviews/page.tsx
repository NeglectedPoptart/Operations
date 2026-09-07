import { createClient } from "@/lib/supabase/server";
import { currentQuarter } from "@/lib/dates";
import type { Employee } from "@/lib/types";
import PerformanceReviewsClient from "./PerformanceReviewsClient";

export const dynamic = "force-dynamic";

export default async function PerformanceReviewsPage() {
  const supabase = await createClient();
  const { data: employees, error } = await supabase.from("employees").select("*").order("name", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load employees: {error.message}</p>;
  }

  const { year, quarter } = currentQuarter();

  return (
    <PerformanceReviewsClient
      initialEmployees={(employees ?? []) as Employee[]}
      initialYear={year}
      initialQuarter={quarter}
    />
  );
}
