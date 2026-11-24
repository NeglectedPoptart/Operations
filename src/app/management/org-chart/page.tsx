import { createClient } from "@/lib/supabase/server";
import OrgChartClient, { type OrgEmployee } from "./OrgChartClient";

export const dynamic = "force-dynamic";

// The company structure, drawn from each person's "Reports to" in Employee Files - nothing to enter here.
export default async function OrgChartPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, name, title, department, status, direct_manager, office_location")
    .order("name", { ascending: true });

  if (error) return <p className="text-red-600">Failed to load the Org Chart: {error.message}</p>;
  return <OrgChartClient employees={(data ?? []) as OrgEmployee[]} />;
}
