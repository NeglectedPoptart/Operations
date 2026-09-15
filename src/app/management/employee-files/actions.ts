"use server";

import { sendNotification } from "@/app/supreme/notifications/actions";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/dates";
import { nextAnniversary } from "@/lib/employeeFiles";
import type { Employee, EmployeeDevice, EmployeeDocumentCategory } from "@/lib/types";

// None of the mutations below call revalidatePath. They used to, but a
// tile gets several fields filled out in quick succession right after
// creation (name, title, department, start date, direct manager, status,
// login), and revalidating on every single one forced the page's client
// component to refetch and remount mid-edit - wiping out whatever the
// NEXT field's blur hadn't saved yet. Reported as several employees'
// details vanishing after being fully filled out. The client's own
// optimistic setState already reflects every change instantly for the
// person making it; each row is still written correctly regardless, and
// the page is already force-dynamic so a later visit fetches fresh data
// anyway.

export async function createEmployee(name: string): Promise<Employee> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").insert({ name: name.trim() }).select().single();
  if (error) throw new Error(error.message);
  return data as Employee;
}

export async function updateEmployee(
  id: string,
  patch: Partial<
    Pick<Employee, "name" | "title" | "department" | "start_date" | "status" | "direct_manager" | "linked_user_id">
  >,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEmployee(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// The file's bytes are already in Storage by the time this runs (uploaded
// straight from the browser, same reasoning as Food Safety/Marketing
// Assets - a Server Action's request body is capped at ~4.5MB on Vercel
// regardless of Next.js config). This only records the metadata.
export async function recordEmployeeDocument(input: {
  employeeId: string;
  category: EmployeeDocumentCategory;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("employee_documents")
    .insert({
      employee_id: input.employeeId,
      category: input.category,
      file_name: input.fileName,
      storage_path: input.storagePath,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEmployeeDocument(id: string, fileName: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_documents").update({ file_name: fileName }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEmployeeDocument(id: string, storagePath: string) {
  const supabase = await createClient();
  await supabase.storage.from("employee-documents").remove([storagePath]);
  const { error } = await supabase.from("employee_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createEmployeeDevice(input: {
  employeeId: string;
  deviceType: string | null;
  deviceTypeOther: string | null;
  deviceName: string | null;
  serialNumber: string | null;
  conditionAtCheckout: string | null;
  conditionNotes: string | null;
  devicePin: string | null;
  dateOfIssue: string | null;
  managerName: string | null;
}): Promise<EmployeeDevice> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_devices")
    .insert({
      employee_id: input.employeeId,
      device_type: input.deviceType,
      device_type_other: input.deviceTypeOther,
      device_name: input.deviceName,
      serial_number: input.serialNumber,
      condition_at_checkout: input.conditionAtCheckout,
      condition_notes: input.conditionNotes,
      device_pin: input.devicePin,
      date_of_issue: input.dateOfIssue,
      manager_name: input.managerName,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmployeeDevice;
}

export async function updateEmployeeDevice(
  id: string,
  patch: Partial<Pick<EmployeeDevice, "date_returned" | "condition_at_return" | "return_notes">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_devices").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEmployeeDevice(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_devices").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Alert recipients (managed from Supreme > Notifications) -----------------------

export async function getEmployeeAnniversaryRecipientIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employee_anniversary_alert_recipients").select("user_id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.user_id as string);
}

export async function setEmployeeAnniversaryRecipient(userId: string, enabled: boolean) {
  const supabase = await createClient();
  if (enabled) {
    const { error } = await supabase
      .from("employee_anniversary_alert_recipients")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("employee_anniversary_alert_recipients").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
}

// Alerting --------------------------------------------------------------------------

// Checked on every Employee Files page load (same "check when someone
// opens the page" shape as Food Safety's expiration alerts) rather than a
// real daily cron, which this app has no infrastructure for yet - good
// enough as long as someone opens the page occasionally as an anniversary
// nears. Alerts once an employee's next anniversary is within this many
// days out.
const ANNIVERSARY_LOOKAHEAD_DAYS = 14;

export async function checkAndSendAnniversaryAlerts() {
  const supabase = await createClient();
  const today = todayISO();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, name, start_date, last_anniversary_alert_year")
    .eq("status", "active")
    .not("start_date", "is", null);
  if (error || !employees || employees.length === 0) return;

  const recipientIds = await getEmployeeAnniversaryRecipientIds();
  if (recipientIds.length === 0) return;

  for (const emp of employees) {
    const upcoming = nextAnniversary(emp.start_date as string, today);
    if (!upcoming || upcoming.daysAway > ANNIVERSARY_LOOKAHEAD_DAYS) continue;

    const already = emp.last_anniversary_alert_year as number | null;
    if (already !== null && already >= upcoming.year) continue;

    const message =
      upcoming.daysAway === 0
        ? `${emp.name}'s ${upcoming.year}-year anniversary is today (${formatDate(upcoming.date)}).`
        : `${emp.name}'s ${upcoming.year}-year anniversary is in ${upcoming.daysAway} day${upcoming.daysAway === 1 ? "" : "s"} (${formatDate(upcoming.date)}).`;

    for (const userId of recipientIds) {
      await sendNotification({
        tabLabel: "Management",
        subtabLabel: "Employee Files",
        pagePath: "/management/employee-files",
        message,
        updatedBy: null,
        lastEditedAt: upcoming.date,
        targetType: "user",
        targetUserId: userId,
        targetRole: null,
      }).catch(() => {});
    }

    await supabase.from("employees").update({ last_anniversary_alert_year: upcoming.year }).eq("id", emp.id);
  }
}
