import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/dates";
import EmployeeHoursClient, { type EmployeeOption } from "./EmployeeHoursClient";

export const dynamic = "force-dynamic";

export default async function EmployeeHoursPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("id, name, status").order("name", { ascending: true });
  if (error) return <p className="text-red-600">Failed to load employees: {error.message}</p>;
  return <EmployeeHoursClient employees={(data ?? []) as EmployeeOption[]} initialWeekStart={currentWeekStart()} />;
}
