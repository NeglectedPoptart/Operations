import { createClient } from "@/lib/supabase/server";
import { currentMonthStart, monthEnd } from "@/lib/dates";
import type { CalloutEntry } from "@/lib/types";
import CalloutSheetClient from "./CalloutSheetClient";

export const dynamic = "force-dynamic";

export default async function CalloutSheetPage() {
  const supabase = await createClient();
  const month = currentMonthStart();

  const [{ data: entries, error: entriesError }, { data: employees, error: employeesError }, { data: types, error: typesError }] =
    await Promise.all([
      supabase
        .from("callout_entries")
        .select("*")
        .gte("entry_date", month)
        .lte("entry_date", monthEnd(month))
        .order("entry_date", { ascending: true }),
      supabase.from("employees").select("name").order("name", { ascending: true }),
      supabase.from("callout_types").select("name").order("name", { ascending: true }),
    ]);

  if (entriesError || employeesError || typesError) {
    return (
      <p className="text-red-600">
        Failed to load Call Out Sheet: {entriesError?.message ?? employeesError?.message ?? typesError?.message}
      </p>
    );
  }

  return (
    <CalloutSheetClient
      initialMonth={month}
      initialEntries={(entries ?? []) as CalloutEntry[]}
      employeeOptions={(employees ?? []).map((e) => e.name)}
      calloutTypeOptions={(types ?? []).map((t) => t.name)}
    />
  );
}
