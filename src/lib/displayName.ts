import type { SupabaseClient } from "@supabase/supabase-js";

// The name HOPS shows for the signed-in person: the name they set themselves
// (profile menu), else their employee record's name, else the start of their
// login email. Each lookup tolerates a missing column/table so a name can
// never be the thing that breaks a page.
export async function personName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  user: { id: string; email?: string | null },
): Promise<string> {
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const chosen = (profile?.display_name as string | null | undefined)?.trim();
  if (chosen) return chosen;
  const { data: emp } = await supabase.from("employees").select("name").eq("linked_user_id", user.id).maybeSingle();
  return (emp?.name as string | undefined)?.trim() || (user.email ?? "Unknown").split("@")[0];
}
