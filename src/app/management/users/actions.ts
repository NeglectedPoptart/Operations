"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

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
  revalidatePath("/management/users");
  return data[0];
}
