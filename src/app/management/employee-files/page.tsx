import { createClient } from "@/lib/supabase/server";
import type { Device, Employee, EmployeeDevice, EmployeeDocument } from "@/lib/types";
import { checkAndSendAnniversaryAlerts } from "./actions";
import EmployeeFilesClient, { type LoginOption } from "./EmployeeFilesClient";

export const dynamic = "force-dynamic";

export default async function EmployeeFilesPage() {
  // Best-effort - a failure here (e.g. no recipients configured yet)
  // shouldn't block the page itself from loading.
  await checkAndSendAnniversaryAlerts().catch(() => {});

  const supabase = await createClient();
  const [
    { data: employees, error: employeesError },
    { data: documents, error: documentsError },
    { data: devices, error: devicesError },
    { data: logins, error: loginsError },
    { data: deviceRegistry, error: deviceRegistryError },
  ] = await Promise.all([
    supabase.from("employees").select("*").order("name", { ascending: true }),
    supabase.from("employee_documents").select("*").order("created_at", { ascending: false }),
    supabase.from("employee_devices").select("*").order("date_of_issue", { ascending: false }),
    supabase.from("profiles").select("id, email, role").order("email", { ascending: true }),
    supabase.from("devices").select("*").order("created_at", { ascending: false }),
  ]);

  const error = employeesError ?? documentsError ?? devicesError ?? loginsError ?? deviceRegistryError;
  if (error) {
    return <p className="text-red-600">Failed to load Employee Files: {error.message}</p>;
  }

  return (
    <EmployeeFilesClient
      initialEmployees={(employees ?? []) as Employee[]}
      initialDocuments={(documents ?? []) as EmployeeDocument[]}
      initialDevices={(devices ?? []) as EmployeeDevice[]}
      initialDeviceRegistry={(deviceRegistry ?? []) as Device[]}
      logins={(logins ?? []) as LoginOption[]}
    />
  );
}
