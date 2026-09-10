import { createClient } from "@/lib/supabase/server";
import type { CrmActivity, CrmCompany } from "@/lib/types";
import CrmCompaniesClient from "./CrmCompaniesClient";

export const dynamic = "force-dynamic";

export default async function CrmCompaniesPage() {
  const supabase = await createClient();

  const [{ data: companies, error: companiesError }, { data: activities, error: activitiesError }] = await Promise.all([
    supabase.from("crm_companies").select("*").order("name", { ascending: true }),
    supabase.from("crm_activities").select("*").order("activity_date", { ascending: false }),
  ]);

  if (companiesError || activitiesError) {
    return (
      <p className="text-red-600">Failed to load CRM: {companiesError?.message ?? activitiesError?.message}</p>
    );
  }

  return (
    <CrmCompaniesClient
      initialCompanies={(companies ?? []) as CrmCompany[]}
      initialActivities={(activities ?? []) as CrmActivity[]}
    />
  );
}
