import { createClient } from "@/lib/supabase/server";
import type { Employee, RoleSchedule, ScheduleException } from "@/lib/types";
import SchedulesClient from "./SchedulesClient";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const supabase = await createClient();

  const [
    { data: schedules, error: schedulesError },
    { data: employees, error: employeesError },
    { data: exceptions, error: exceptionsError },
  ] = await Promise.all([
    supabase.from("role_schedules").select("*").order("department", { ascending: true }).order("position", { ascending: true }),
    supabase.from("employees").select("*").eq("status", "active").order("name", { ascending: true }),
    supabase.from("schedule_exceptions").select("*").order("start_date", { ascending: true }),
  ]);

  const error = schedulesError ?? employeesError ?? exceptionsError;
  if (error) {
    return <p className="text-red-600">Failed to load Schedules: {error.message}</p>;
  }

  return (
    <SchedulesClient
      initialSchedules={(schedules ?? []) as RoleSchedule[]}
      employees={(employees ?? []) as Employee[]}
      initialExceptions={(exceptions ?? []) as ScheduleException[]}
    />
  );
}
