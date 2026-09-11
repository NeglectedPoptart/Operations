import { createClient } from "@/lib/supabase/server";
import ActivityTrackingClient, { type ActivityStats, type AssignableUser, type CompanyStats } from "./ActivityTrackingClient";

export const dynamic = "force-dynamic";

// Only the columns the stats table actually needs - the full crm_companies/
// crm_activities rows carry a lot of contact/notes fields this page has no
// use for.
const COMPANY_COLUMNS =
  "id, name, created_by, created_at, assigned_to, assigned_at, landed_at, landed_by, dns_at, dns_by";
const ACTIVITY_COLUMNS = "id, company_id, activity_date, activity_type, logged_by";

export default async function CrmActivityTrackingPage() {
  const supabase = await createClient();

  const [
    { data: companies, error: companiesError },
    { data: activities, error: activitiesError },
    { data: assignableUsers, error: usersError },
  ] = await Promise.all([
    supabase.from("crm_companies").select(COMPANY_COLUMNS),
    supabase.from("crm_activities").select(ACTIVITY_COLUMNS),
    // Same role set (and same deliberate exclusion of "operations") as the
    // assignable-users list on crm/companies/page.tsx.
    supabase.from("profiles").select("id, email, role").in("role", ["admin", "executive", "sales", "buyer_sales"]),
  ]);

  if (companiesError || activitiesError || usersError) {
    return (
      <p className="text-red-600">
        Failed to load Activity Tracking: {companiesError?.message ?? activitiesError?.message ?? usersError?.message}
      </p>
    );
  }

  return (
    <ActivityTrackingClient
      companies={(companies ?? []) as CompanyStats[]}
      activities={(activities ?? []) as ActivityStats[]}
      assignableUsers={(assignableUsers ?? []) as AssignableUser[]}
    />
  );
}
