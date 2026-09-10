import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
import type { CrmActivity, CrmCompany } from "@/lib/types";
import CrmCompaniesClient, { type AssignableUser } from "./CrmCompaniesClient";

export const dynamic = "force-dynamic";

export default async function CrmCompaniesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: companies, error: companiesError },
    { data: activities, error: activitiesError },
    { data: assignableUsers, error: usersError },
    { data: myProfile, error: myProfileError },
  ] = await Promise.all([
    supabase.from("crm_companies").select("*").order("name", { ascending: true }),
    supabase.from("crm_activities").select("*").order("activity_date", { ascending: false }),
    supabase.from("profiles").select("id, email, role").in("role", ["admin", "executive", "sales"]),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (companiesError || activitiesError || usersError || myProfileError) {
    return (
      <p className="text-red-600">
        Failed to load CRM: {companiesError?.message ?? activitiesError?.message ?? usersError?.message ?? myProfileError?.message}
      </p>
    );
  }

  return (
    <CrmCompaniesClient
      initialCompanies={(companies ?? []) as CrmCompany[]}
      initialActivities={(activities ?? []) as CrmActivity[]}
      assignableUsers={(assignableUsers ?? []) as AssignableUser[]}
      currentUserId={user?.id ?? ""}
      currentUserRole={(myProfile?.role as Role | undefined) ?? null}
    />
  );
}
