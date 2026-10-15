import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessTab, isPageAllowed, isPageHidden, isSupremeUser, tabForPath, type Role } from "./roles";
import { loadRoleAccess } from "./roleAccess";

// Can this signed-in person open the page, going by their role's settings on
// User Roles (the whole section, minus hidden pages, or the page given on its
// own)? The Supreme account always can. For pages that do their own check as
// well as the menu / middleware one - e.g. server actions that act for the company.
export async function canOpenPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  user: { id: string; email?: string | null } | null,
  pathname: string,
): Promise<boolean> {
  if (!user) return false;
  if (isSupremeUser(user.email ?? null)) return true;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile?.role ?? null) as Role | null;
  if (!role || role === "broker_carrier") return false;
  const access = await loadRoleAccess(supabase, role);
  if (isPageAllowed(access, pathname)) return true;
  const tab = tabForPath(pathname);
  return !!tab && canAccessTab(access, tab) && !isPageHidden(access, pathname);
}
