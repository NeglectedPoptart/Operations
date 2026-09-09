import { createClient } from "@/lib/supabase/server";
import type { Broker, Profile } from "@/lib/types";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: profiles, error },
    { data: brokers, error: brokersError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*").order("email", { ascending: true }),
    supabase.from("brokers").select("*").order("name", { ascending: true }),
  ]);

  if (error) {
    return <p className="text-red-600">Failed to load users: {error.message}</p>;
  }
  if (brokersError) {
    return <p className="text-red-600">Failed to load brokers: {brokersError.message}</p>;
  }

  return (
    <UsersClient
      initialProfiles={(profiles ?? []) as Profile[]}
      brokers={(brokers ?? []) as Broker[]}
      currentUserId={user?.id ?? null}
    />
  );
}
