"use server";

import { redirect } from "next/navigation";
import { logActivity } from "@/lib/auditLog";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return error.message;
  }

  if (data.user?.email) {
    await logActivity("login", "Logged in to HOPS", undefined, { email: data.user.email, userId: data.user.id });
  }

  redirect("/");
}
