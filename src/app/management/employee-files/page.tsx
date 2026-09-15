import { createClient } from "@/lib/supabase/server";
import type { Employee, EmployeeDevice, EmployeeDocument } from "@/lib/types";
import { checkAndSendAnniversaryAlerts } from "./actions";
import EmployeeFilesClient from "./EmployeeFilesClient";

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
  ] = await Promise.all([
    supabase.from("employees").select("*").order("name", { ascending: true }),
    supabase.from("employee_documents").select("*").order("created_at", { ascending: false }),
    supabase.from("employee_devices").select("*").order("date_of_issue", { ascending: false }),
  ]);

  const error = employeesError ?? documentsError ?? devicesError;
  if (error) {
    return <p className="text-red-600">Failed to load Employee Files: {error.message}</p>;
  }

  return (
    <EmployeeFilesClient
      initialEmployees={(employees ?? []) as Employee[]}
      initialDocuments={(documents ?? []) as EmployeeDocument[]}
      initialDevices={(devices ?? []) as EmployeeDevice[]}
    />
  );
}
