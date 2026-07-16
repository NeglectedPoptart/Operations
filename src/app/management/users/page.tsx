import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase.from("profiles").select("*").order("email", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load users: {error.message}</p>;
  }

  return <UsersClient initialProfiles={(data ?? []) as Profile[]} currentUserId={user?.id ?? null} />;
}
