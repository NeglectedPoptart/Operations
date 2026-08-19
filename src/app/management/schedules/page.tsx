import { createClient } from "@/lib/supabase/server";
import type { RoleSchedule } from "@/lib/types";
import SchedulesClient from "./SchedulesClient";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("role_schedules")
    .select("*")
    .order("department", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Schedules: {error.message}</p>;
  }

  return <SchedulesClient initialSchedules={(data ?? []) as RoleSchedule[]} />;
}
