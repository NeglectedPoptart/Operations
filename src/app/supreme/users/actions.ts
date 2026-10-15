"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ALL_TABS, isSupremeUser, type Role, type Tab } from "@/lib/roles";
import { NAV } from "@/lib/navConfig";
import { isValidTimeZone } from "@/lib/timezones";
import { adminClient } from "@/lib/supabase/admin";
import { passwordProblem } from "@/lib/passwordRules";

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

// Set a new password for someone (Supreme only). Passwords can never be read
// back - Supabase keeps only a one-way hash - so this sets a new one that you
// then pass on to them. Same strength rules as everyone's own change.
export async function setUserPassword(userId: string, newPassword: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSupremeUser(user?.email ?? null)) return { error: "Not allowed." };

  const problem = passwordProblem(newPassword);
  if (problem) return { error: problem };

  try {
    const admin = adminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return { error: error.message };
    await admin.from("profiles").update({ password_changed_at: new Date().toISOString() }).eq("id", userId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't set the password." };
  }
  revalidatePath("/supreme/users");
  return { ok: true };
}

// Add a person. Created directly with the password you give - no invitation or
// confirmation email is sent (email_confirm is set), so they can sign in right
// away. Supreme only.
export async function createUserAccount(input: {
  email: string;
  password: string;
  role: string;
  brokerId?: string | null;
}): Promise<{ error: string } | { profile: Record<string, unknown> }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSupremeUser(user?.email ?? null)) return { error: "Not allowed." };

  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  const problem = passwordProblem(input.password);
  if (problem) return { error: problem };

  const { data: role } = await supabase.from("roles").select("key").eq("key", input.role).maybeSingle();
  if (!role) return { error: "Pick a role for them." };

  try {
    const admin = adminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true, // no confirmation / setup email
    });
    if (error || !created.user) {
      const message = error?.message ?? "Couldn't create the user.";
      return { error: /already|registered|exists/i.test(message) ? "Someone with that email already has a login." : message };
    }

    // A profile row is added automatically (as Sales); set the real role and the rest.
    const patch: Record<string, unknown> = { role: input.role, password_changed_at: new Date().toISOString() };
    if (input.role === "broker_carrier") patch.broker_id = input.brokerId || null;
    const { error: profileError } = await admin.from("profiles").update(patch).eq("id", created.user.id);
    if (profileError) return { error: `The login was created but its role couldn't be set: ${profileError.message}` };

    const { data: profile } = await admin.from("profiles").select("*").eq("id", created.user.id).single();
    revalidatePath("/supreme/users");
    return { profile: (profile ?? { id: created.user.id, email, role: input.role }) as Record<string, unknown> };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the user." };
  }
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

// Single pages a role can open even without the whole section (migration 142).
export async function setRoleAllowedPages(key: string, pages: string[]) {
  const supabase = await ownerClient();
  if (key === "broker_carrier") throw new Error("Broker/Carrier only ever sees its one page.");
  const clean = pages.filter((p) => KNOWN_PAGES.has(p));
  const { error } = await supabase.from("roles").update({ allowed_pages: clean }).eq("key", key);
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
