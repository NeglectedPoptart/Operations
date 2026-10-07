"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ALL_TABS, isSupremeUser, type Role, type Tab } from "@/lib/roles";
import { NAV } from "@/lib/navConfig";
import { isValidTimeZone } from "@/lib/timezones";

// The "admins update roles" RLS policy (migration_017) is what actually
// enforces this is admin-only - a blocked update just returns zero rows
// rather than an error, so we check that explicitly instead of trusting a
// silent no-op.
export async function updateUserRole(id: string, role: Role) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ role }).eq("id", id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Update was blocked - only admins can change roles.");
  }
  revalidatePath("/supreme/users");
  return data[0];
}

// Which broker/carrier company a broker_carrier login is - same admin-only
// RLS policy as updateUserRole enforces this.
export async function updateUserBrokerId(id: string, brokerId: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ broker_id: brokerId }).eq("id", id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Update was blocked - only admins can change this.");
  }
  revalidatePath("/supreme/users");
  return data[0];
}

// A person's time zone, for the Activity Log's "their time". null puts them
// back on auto-detect (their browser's zone is picked up on their next visit).
export async function updateUserTimezone(id: string, timeZone: string | null) {
  const supabase = await createClient();
  if (timeZone !== null && !isValidTimeZone(timeZone)) throw new Error("That isn't a valid time zone.");
  const patch = timeZone === null ? { timezone_source: "auto" } : { timezone: timeZone, timezone_source: "manual" };
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", id).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Update was blocked - only admins can change this.");
  revalidatePath("/supreme/users");
  revalidatePath("/submanagement/activity-log");
}

// ---------------------------------------------------------------------------
// Roles. Editing who can see what is Supreme-only (the page is already
// locked by middleware; checked again here since these change everyone's
// access).

async function ownerClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSupremeUser(user?.email ?? null)) throw new Error("Not allowed.");
  return supabase;
}

const KNOWN_PAGES = new Set(NAV.flatMap((c) => (c.supremeOnly ? [] : (c.items ?? []).map((i) => i.href))));

function refresh() {
  revalidatePath("/supreme/users");
  revalidatePath("/", "layout");
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function createRole(label: string, copyFromKey: string | null) {
  const supabase = await ownerClient();
  const name = label.trim();
  if (!name) throw new Error("Give the role a name.");

  const { data: existing, error: listError } = await supabase.from("roles").select("key, label, position");
  if (listError) throw new Error(listError.message);
  if ((existing ?? []).some((r) => (r.label as string).toLowerCase() === name.toLowerCase())) {
    throw new Error(`There is already a role called "${name}".`);
  }

  const base = slugify(name) || "role";
  const keys = new Set((existing ?? []).map((r) => r.key as string));
  let key = base;
  for (let n = 2; keys.has(key); n++) key = `${base}_${n}`;

  let tabs: Tab[] = [];
  let hidden: string[] = [];
  if (copyFromKey) {
    const { data: source } = await supabase.from("roles").select("tabs, hidden_pages").eq("key", copyFromKey).maybeSingle();
    tabs = (source?.tabs ?? []) as Tab[];
    hidden = (source?.hidden_pages ?? []) as string[];
  }
  const position = Math.max(-1, ...(existing ?? []).map((r) => r.position as number)) + 1;

  const { error } = await supabase
    .from("roles")
    .insert({ key, label: name, tabs, hidden_pages: hidden, position, is_builtin: false });
  if (error) throw new Error(error.message);
  refresh();
  return { key, label: name, tabs, hidden_pages: hidden, position, is_builtin: false };
}

export async function renameRole(key: string, label: string) {
  const supabase = await ownerClient();
  const name = label.trim();
  if (!name) throw new Error("A role needs a name.");
  const { error } = await supabase.from("roles").update({ label: name }).eq("key", key);
  if (error) throw new Error(error.message);
  refresh();
}

export async function setRoleTabs(key: string, tabs: Tab[]) {
  const supabase = await ownerClient();
  if (key === "broker_carrier") throw new Error("Broker/Carrier only ever sees its one page.");
  const clean = ALL_TABS.filter((t) => tabs.includes(t));
  const { error } = await supabase.from("roles").update({ tabs: clean }).eq("key", key);
  if (error) throw new Error(error.message);
  refresh();
}

export async function setRoleHiddenPages(key: string, hiddenPages: string[]) {
  const supabase = await ownerClient();
  const clean = hiddenPages.filter((p) => KNOWN_PAGES.has(p));
  const { error } = await supabase.from("roles").update({ hidden_pages: clean }).eq("key", key);
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteRole(key: string) {
  const supabase = await ownerClient();
  const { data: role } = await supabase.from("roles").select("is_builtin").eq("key", key).maybeSingle();
  if (!role) return;
  if (role.is_builtin) throw new Error("The original roles can be edited but not deleted.");
  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", key);
  if ((count ?? 0) > 0) throw new Error("Move everyone off this role first, then delete it.");
  const { error } = await supabase.from("roles").delete().eq("key", key);
  if (error) throw new Error(error.message);
  refresh();
}
