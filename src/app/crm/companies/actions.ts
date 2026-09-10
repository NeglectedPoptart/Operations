"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedCrmCompanyRow } from "@/lib/crmCompaniesParse";
import type { Role } from "@/lib/roles";
import type { CrmActivityType, CrmOutcome, CrmPriority, CrmStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/crm/companies");
}

// Shared by assignCrmCompany and the bucket CRUD below - both are Admin/Exec
// gated actions that need to know the current user's role server-side, not
// just have the button hidden client-side.
async function requireAdminOrExec(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (error) throw new Error(error.message);
  const isAdminOrExec = (profile.role as Role) === "admin" || (profile.role as Role) === "executive";
  return { userId: user.id, isAdminOrExec };
}

// Paste is the same running Blue Book export re-pasted over time, so a row
// is skipped if it already exists - matched by Blue Book ID when the sheet
// has one, falling back to a case-insensitive name match for hand-entered
// companies that never had one.
export async function importCrmCompanies(rows: ParsedCrmCompanyRow[]) {
  const supabase = await createClient();
  if (rows.length === 0) return [];

  const { data: existing, error: existingError } = await supabase.from("crm_companies").select("blue_book_id, name");
  if (existingError) throw new Error(existingError.message);

  const existingIds = new Set((existing ?? []).map((r) => r.blue_book_id).filter(Boolean));
  const existingNames = new Set((existing ?? []).map((r) => r.name.trim().toLowerCase()));

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const toInsert = [];
  for (const row of rows) {
    const nameKey = row.name.trim().toLowerCase();
    if (row.blueBookId) {
      if (existingIds.has(row.blueBookId) || seenIds.has(row.blueBookId)) continue;
      seenIds.add(row.blueBookId);
    } else {
      if (existingNames.has(nameKey) || seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);
    }
    toInsert.push({
      blue_book_id: row.blueBookId,
      name: row.name,
      legal_name: row.legalName,
      city_state: row.cityState,
      location_type: row.locationType,
      phone: row.phone,
      classification: row.classification,
      score: row.score,
      rating: row.rating,
      source_status: row.sourceStatus,
      profile_url: row.profileUrl,
      crm_status: row.crmStatus,
      primary_contact: row.primaryContact,
      email: row.email,
      notes: row.notes,
    });
  }

  if (toInsert.length === 0) return [];

  const { data, error } = await supabase.from("crm_companies").insert(toInsert).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function createCrmCompany(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_companies").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateCrmCompany(
  id: string,
  patch: Partial<{
    name: string;
    legal_name: string | null;
    city_state: string | null;
    location_type: string | null;
    phone: string | null;
    classification: string | null;
    score: number | null;
    rating: number | null;
    source_status: string | null;
    profile_url: string | null;
    crm_status: CrmStatus;
    priority: CrmPriority | null;
    primary_contact: string | null;
    email: string | null;
    notes: string | null;
    bucket_id: string | null;
  }>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("crm_companies").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Claims a company from the shared bucket into someone's pipeline, hands it
// back to the bucket (assignToUserId null), or - Admin/Exec only - moves it
// straight from one person's pipeline into another's. Enforced here, not
// just hidden in the UI: a non-Admin/Exec can only ever assign to themselves
// and can't pull a company out of someone else's pipeline.
export async function assignCrmCompany(companyId: string, assignToUserId: string | null) {
  const supabase = await createClient();
  const { userId, isAdminOrExec } = await requireAdminOrExec(supabase);

  if (!isAdminOrExec) {
    if (assignToUserId !== null && assignToUserId !== userId) {
      throw new Error("You can only assign companies to yourself.");
    }
    const { data: company, error: companyError } = await supabase
      .from("crm_companies")
      .select("assigned_to")
      .eq("id", companyId)
      .single();
    if (companyError) throw new Error(companyError.message);
    if (company.assigned_to !== null && company.assigned_to !== userId) {
      throw new Error("This company is already assigned to someone else.");
    }
  }

  const { error } = await supabase
    .from("crm_companies")
    .update({ assigned_to: assignToUserId, assigned_at: assignToUserId ? new Date().toISOString() : null })
    .eq("id", companyId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Bucket structure (creating/removing a segment of the shared pool) is
// Admin/Exec only - moving a company INTO a bucket is just a normal field
// on updateCrmCompany above, open to anyone with CRM access.
export async function createCrmBucket(name: string) {
  const supabase = await createClient();
  const { isAdminOrExec } = await requireAdminOrExec(supabase);
  if (!isAdminOrExec) throw new Error("Only Admin/Exec can create buckets.");

  const { data: existing, error: existingError } = await supabase.from("crm_buckets").select("position");
  if (existingError) throw new Error(existingError.message);
  const nextPosition = (existing ?? []).reduce((max, b) => Math.max(max, b.position), 0) + 1;

  const { data, error } = await supabase.from("crm_buckets").insert({ name, position: nextPosition }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

// Companies sitting in the deleted bucket fall back to the General Bucket
// automatically (bucket_id's on delete set null).
export async function deleteCrmBucket(id: string) {
  const supabase = await createClient();
  const { isAdminOrExec } = await requireAdminOrExec(supabase);
  if (!isAdminOrExec) throw new Error("Only Admin/Exec can delete buckets.");

  const { error } = await supabase.from("crm_buckets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteCrmCompany(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("crm_companies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addCrmActivity(
  companyId: string,
  input: {
    activity_date: string;
    contact_person: string | null;
    activity_type: CrmActivityType | null;
    outcome: CrmOutcome | null;
    notes: string | null;
    next_action: string | null;
    next_follow_up: string | null;
    owner: string | null;
  },
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_activities")
    .insert({ company_id: companyId, ...input })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateCrmActivity(
  id: string,
  patch: Partial<{
    activity_date: string;
    contact_person: string | null;
    activity_type: CrmActivityType | null;
    outcome: CrmOutcome | null;
    notes: string | null;
    next_action: string | null;
    next_follow_up: string | null;
    owner: string | null;
  }>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("crm_activities").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteCrmActivity(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("crm_activities").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
