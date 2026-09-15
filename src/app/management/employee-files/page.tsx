import { createClient } from "@/lib/supabase/server";
import type { Employee, EmployeeDevice, EmployeeDocument } from "@/lib/types";
import { checkAndSendAnniversaryAlerts } from "./actions";
import EmployeeFilesClient, { type LoginOption } from "./EmployeeFilesClient";

export const dynamic = "force-dynamic";

export default async function EmployeeFilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Best-effort - a failure here (e.g. no recipients configured yet)
  // shouldn't block the page itself from loading.
  await checkAndSendAnniversaryAlerts().catch(() => {});

  const supabase = await createClient();
  const [
    { data: employees, error: employeesError },
    { data: documents, error: documentsError },
    { data: devices, error: devicesError },
    { data: logins, error: loginsError },
  ] = await Promise.all([
    supabase.from("employees").select("*").order("name", { ascending: true }),
    supabase.from("employee_documents").select("*").order("created_at", { ascending: false }),
    supabase.from("employee_devices").select("*").order("date_of_issue", { ascending: false }),
    supabase.from("profiles").select("id, email, role").order("email", { ascending: true }),
  ]);

  const error = employeesError ?? documentsError ?? devicesError ?? loginsError;
  if (error) {
    return <p className="text-red-600">Failed to load Employee Files: {error.message}</p>;
  }

  if (params.debug === "1") {
    return <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(employees?.[0], null, 2)}</pre>;
  }

  return (
    <EmployeeFilesClient
      initialEmployees={(employees ?? []) as Employee[]}
      initialDocuments={(documents ?? []) as EmployeeDocument[]}
      initialDevices={(devices ?? []) as EmployeeDevice[]}
      logins={(logins ?? []) as LoginOption[]}
    />
  );
}
