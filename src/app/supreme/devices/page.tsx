import { createClient } from "@/lib/supabase/server";
import type { Device, Employee, EmployeeDocument } from "@/lib/types";
import DevicesClient from "./DevicesClient";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const supabase = await createClient();
  const [
    { data: devices, error: devicesError },
    { data: employees, error: employeesError },
    { data: photos, error: photosError },
  ] = await Promise.all([
    supabase.from("devices").select("*").order("created_at", { ascending: false }),
    supabase.from("employees").select("*").order("name", { ascending: true }),
    supabase.from("employee_documents").select("*").eq("category", "photo").order("created_at", { ascending: false }),
  ]);

  const error = devicesError ?? employeesError ?? photosError;
  if (error) {
    return <p className="text-red-600">Failed to load Devices: {error.message}</p>;
  }

  return (
    <DevicesClient
      initialDevices={(devices ?? []) as Device[]}
      employees={(employees ?? []) as Employee[]}
      photos={(photos ?? []) as EmployeeDocument[]}
    />
  );
}
