import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import ScareClient, { type ScarePerson, type ScareRow } from "./ScareClient";

export const dynamic = "force-dynamic";

export default async function ScarePage() {
  const supabase = await createClient();
  const { data: profiles, error } = await supabase.from("profiles").select("id, email, role").neq("role", "broker_carrier").order("email", { ascending: true });
  if (error) return <p className="text-red-600">Failed to load users: {error.message}</p>;

  // Names are optional (a later migration); fall back to the email.
  const { data: names } = await supabase.from("profiles").select("id, display_name");
  const nameById = new Map((names ?? []).map((n) => [n.id as string, ((n.display_name as string | null) ?? "").trim()]));
  const people: ScarePerson[] = (profiles ?? []).map((p) => ({
    id: p.id as string,
    label: nameById.get(p.id as string) ? `${nameById.get(p.id as string)} (${p.email})` : ((p.email as string | null) ?? "(no email)"),
  }));
  const labelById = new Map(people.map((p) => [p.id, p.label]));

  // Table comes from migration 170 - show the page either way, with a note until it exists.
  const { data: scares, error: scaresError } = await adminClient()
    .from("scares")
    .select("id, target_user_id, created_at, shown_at")
    .order("created_at", { ascending: false })
    .limit(20);
  const recent: ScareRow[] = (scares ?? []).map((s) => ({
    id: s.id as string,
    who: labelById.get(s.target_user_id as string) ?? "(removed user)",
    createdAt: s.created_at as string,
    shownAt: (s.shown_at as string | null) ?? null,
  }));

  return <ScareClient people={people} recent={recent} notSetUp={!!scaresError} />;
}
