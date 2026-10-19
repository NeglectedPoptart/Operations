"use server";

import { createClient } from "@/lib/supabase/server";
import type { UserNote } from "@/lib/notes";

const COLUMNS = "id, title, body, pinned, updated_at";

const NOT_SET_UP = "Notes isn't set up yet - ask the admin to run migration 148.";

function message(error: { message: string; code?: string }): string {
  // 42P01 = the user_notes table doesn't exist yet.
  return error.code === "42P01" || /user_notes/.test(error.message) ? NOT_SET_UP : error.message;
}

async function whoAmI() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function listNotes(): Promise<{ notes: UserNote[] } | { error: string }> {
  const { supabase, user } = await whoAmI();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase.from("user_notes").select(COLUMNS).eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) return { error: message(error) };
  return { notes: (data ?? []) as UserNote[] };
}

export async function createNote(body = ""): Promise<{ note: UserNote } | { error: string }> {
  const { supabase, user } = await whoAmI();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase.from("user_notes").insert({ user_id: user.id, body }).select(COLUMNS).single();
  if (error) return { error: message(error) };
  return { note: data as UserNote };
}

export async function updateNote(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean },
): Promise<{ updated_at: string } | { error: string }> {
  const { supabase, user } = await whoAmI();
  if (!user) return { error: "Not signed in." };
  const updated_at = new Date().toISOString();
  const { error } = await supabase
    .from("user_notes")
    .update({ ...patch, updated_at })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: message(error) };
  return { updated_at };
}

export async function deleteNote(id: string): Promise<{ ok: true } | { error: string }> {
  const { supabase, user } = await whoAmI();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("user_notes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: message(error) };
  return { ok: true };
}
