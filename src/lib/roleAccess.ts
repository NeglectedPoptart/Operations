import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ROLE_TABS, ROLES, defaultAccess, type Role, type RoleAccess, type Tab } from "./roles";

// Reads roles from the roles table (migration 128). Every loader falls back
// to the built-in defaults on any error, so a missing table or a database
// hiccup can never lock the whole team out.

export interface RoleRow {
  key: string;
  label: string;
  tabs: Tab[];
  hidden_pages: string[];
  position: number;
  is_builtin: boolean;
}

export function builtinRoleRows(): RoleRow[] {
  return ROLES.map((r, i) => ({
    key: r.value,
    label: r.label,
    tabs: DEFAULT_ROLE_TABS[r.value],
    hidden_pages: [],
    position: i,
    is_builtin: true,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;

export async function loadRoles(db: Db): Promise<RoleRow[]> {
  const { data, error } = await db.from("roles").select("*").order("position", { ascending: true });
  if (error || !data || data.length === 0) return builtinRoleRows();
  return data as RoleRow[];
}

export async function loadRoleAccess(db: Db, role: Role | null): Promise<RoleAccess> {
  if (!role) return { tabs: [], hiddenPages: [] };
  const { data, error } = await db.from("roles").select("tabs, hidden_pages").eq("key", role).maybeSingle();
  if (error || !data) return defaultAccess(role);
  return { tabs: (data.tabs ?? []) as Tab[], hiddenPages: (data.hidden_pages ?? []) as string[] };
}
