"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import PhoneInput from "@/components/PhoneInput";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateSlash, todayISO } from "@/lib/dates";
import { nextAnniversary } from "@/lib/employeeFiles";
import { formatPhoneNumber } from "@/lib/phone";
import type { Role } from "@/lib/roles";
import { updateDevice } from "@/app/supreme/devices/actions";
import {
  DEVICE_CHECKOUT_CONDITIONS,
  DEVICE_RETURN_CONDITIONS,
  DEVICE_TYPES,
  EMPLOYEE_OFFICE_LOCATIONS,
  EMPLOYEE_STATUSES,
  type Device,
  type Employee,
  type EmployeeDevice,
  type EmployeeDocument,
  type EmployeeDocumentCategory,
  type EmployeeOfficeLocation,
  type EmployeePhoneNumber,
  type EmployeeStatus,
} from "@/lib/types";
import {
  createEmployee,
  createEmployeeDevice,
  createEmployeePhoneNumber,
  deleteEmployee,
  deleteEmployeeDevice,
  deleteEmployeeDocument,
  deleteEmployeePhoneNumber,
  recordEmployeeDocument,
  updateEmployee,
  updateEmployeeDevice,
  updateEmployeeDocument,
  updateEmployeePhoneNumber,
} from "./actions";

export interface LoginOption {
  id: string;
  email: string | null;
  role: Role;
}

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

const STATUS_BADGE: Record<EmployeeStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  resigned: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  terminated: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
};

const DOC_CATEGORIES: { value: EmployeeDocumentCategory; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "offboarding", label: "Offboarding" },
];

interface DeviceCheckoutInput {
  deviceType: string;
  deviceTypeOther: string | null;
  deviceName: string | null;
  serialNumber: string | null;
  conditionAtCheckout: string;
  conditionNotes: string | null;
  devicePin: string | null;
  dateOfIssue: string | null;
  managerName: string | null;
}

// A simplified digital version of the paper Employee Device Checkout Form -
// Employee Name/Title/Employee ID are dropped since this is already
// attached to a specific employee, and Device Brand & Model/Operating
// System/Login Username-Email/Password/Additional Access Notes are
// dropped entirely per request.
function DeviceCheckoutModal({
  employeeName,
  onSubmit,
  onCancel,
  saving,
}: {
  employeeName: string;
  onSubmit: (input: DeviceCheckoutInput) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [deviceType, setDeviceType] = useState<string>(DEVICE_TYPES[1]);
  const [deviceTypeOther, setDeviceTypeOther] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [dateOfIssue, setDateOfIssue] = useState(todayISO());
  const [condition, setCondition] = useState<string>(DEVICE_CHECKOUT_CONDITIONS[0]);
  const [conditionNotes, setConditionNotes] = useState("");
  const [devicePin, setDevicePin] = useState("");
  const [managerName, setManagerName] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-5 dark:bg-neutral-900">
        <div>
          <h2 className="text-lg font-bold">Device Checkout - {employeeName}</h2>
          <p className="text-xs text-black/50 dark:text-white/50">Complete this each time a company device is issued.</p>
        </div>

        <div className="text-sm">
          <span className="block font-medium">Device Type</span>
          <div className="mt-1 flex flex-wrap gap-3">
            {DEVICE_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="radio" checked={deviceType === t} onChange={() => setDeviceType(t)} />
                {t}
              </label>
            ))}
          </div>
        </div>
        {deviceType === "Other" && (
          <input
            value={deviceTypeOther}
            onChange={(e) => setDeviceTypeOther(e.target.value)}
            placeholder="Describe device type"
            className={field}
          />
        )}

        <label className="block text-sm">
          Device Name / Label
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} className={`${field} mt-1`} />
        </label>

        <label className="block text-sm">
          Serial Number / Asset Tag
          <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className={`${field} mt-1`} />
        </label>

        <label className="block text-sm">
          Date of Issue
          <input type="date" value={dateOfIssue} onChange={(e) => setDateOfIssue(e.target.value)} className={`${field} mt-1`} />
        </label>

        <div className="text-sm">
          <span className="block font-medium">Condition at Checkout</span>
          <div className="mt-1 flex flex-wrap gap-3">
            {DEVICE_CHECKOUT_CONDITIONS.map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input type="radio" checked={condition === c} onChange={() => setCondition(c)} />
                {c}
              </label>
            ))}
          </div>
        </div>

        <label className="block text-sm">
          Condition Notes
          <textarea
            value={conditionNotes}
            onChange={(e) => setConditionNotes(e.target.value)}
            rows={2}
            className={`${field} mt-1`}
          />
        </label>

        <label className="block text-sm">
          Device PIN / Passcode
          <input value={devicePin} onChange={(e) => setDevicePin(e.target.value)} className={`${field} mt-1`} />
        </label>

        <label className="block text-sm">
          Manager Name (Print)
          <input value={managerName} onChange={(e) => setManagerName(e.target.value)} className={`${field} mt-1`} />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                deviceType,
                deviceTypeOther: deviceType === "Other" ? deviceTypeOther.trim() || null : null,
                deviceName: deviceName.trim() || null,
                serialNumber: serialNumber.trim() || null,
                conditionAtCheckout: condition,
                conditionNotes: conditionNotes.trim() || null,
                devicePin: devicePin.trim() || null,
                dateOfIssue: dateOfIssue || null,
                managerName: managerName.trim() || null,
              })
            }
            disabled={saving}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Check Out Device"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReturnDeviceInput {
  date_returned: string;
  condition_at_return: string;
  return_notes: string | null;
}

function ReturnDeviceModal({
  deviceLabel,
  onSubmit,
  onCancel,
  saving,
}: {
  deviceLabel: string;
  onSubmit: (input: ReturnDeviceInput) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [dateReturned, setDateReturned] = useState(todayISO());
  const [condition, setCondition] = useState<string>(DEVICE_RETURN_CONDITIONS[0]);
  const [returnNotes, setReturnNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 dark:bg-neutral-900">
        <h2 className="text-lg font-bold">Return - {deviceLabel}</h2>

        <label className="block text-sm">
          Date Returned
          <input type="date" value={dateReturned} onChange={(e) => setDateReturned(e.target.value)} className={`${field} mt-1`} />
        </label>

        <div className="text-sm">
          <span className="block font-medium">Condition at Return</span>
          <div className="mt-1 flex flex-wrap gap-3">
            {DEVICE_RETURN_CONDITIONS.map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input type="radio" checked={condition === c} onChange={() => setCondition(c)} />
                {c}
              </label>
            ))}
          </div>
        </div>

        <label className="block text-sm">
          Return Notes
          <textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} className={`${field} mt-1`} />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({ date_returned: dateReturned, condition_at_return: condition, return_notes: returnNotes.trim() || null })
            }
            disabled={saving}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Mark Returned"}
          </button>
        </div>
      </div>
    </div>
  );
}

// A hover-triggered preview (signed URL fetched lazily, cached once found -
// the same private-bucket signed-URL flow as opening the file, just shown
// inline instead of opened) plus click-to-rename, since the display name
// is the only thing worth easily fixing later - the storage object itself
// keeps its random key regardless.
function DocumentRow({
  doc,
  onView,
  onDelete,
  onRename,
}: {
  doc: EmployeeDocument;
  onView: (doc: EmployeeDocument) => void;
  onDelete: (doc: EmployeeDocument) => void;
  onRename: (doc: EmployeeDocument, newName: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(doc.file_name);

  const isImage = doc.content_type?.startsWith("image/") ?? false;
  const isPdf = doc.content_type === "application/pdf";
  const previewable = isImage || isPdf;

  async function handleHover() {
    if (!previewable || previewUrl) return;
    const supabase = createClient();
    const { data } = await supabase.storage.from("employee-documents").createSignedUrl(doc.storage_path, 300);
    if (data) setPreviewUrl(data.signedUrl);
  }

  function commitRename() {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== doc.file_name) onRename(doc, trimmed);
    else setRenameValue(doc.file_name);
  }

  return (
    <div className="group relative flex items-center gap-2 text-xs" onMouseEnter={handleHover}>
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setRenameValue(doc.file_name);
              setRenaming(false);
            }
          }}
          className="w-full min-w-0 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-black"
        />
      ) : (
        <>
          <button onClick={() => onView(doc)} className="truncate font-medium text-green-700 hover:underline dark:text-green-400">
            {doc.file_name}
          </button>
          <button
            onClick={() => setRenaming(true)}
            title="Rename"
            className="shrink-0 text-black/40 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
          >
            ✎
          </button>
          <button onClick={() => onDelete(doc)} className="ml-auto shrink-0 font-medium text-red-600 hover:underline">
            Delete
          </button>
        </>
      )}

      {previewable && (
        <div className="absolute left-0 top-full z-20 mt-1 hidden rounded-md border border-black/10 bg-white p-1 shadow-lg group-hover:block dark:border-white/20 dark:bg-neutral-900">
          {previewUrl ? (
            isImage ? (
              // A short-lived signed URL, not a static asset next/image can optimize.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={doc.file_name} className="max-h-64 max-w-64 object-contain" />
            ) : (
              <iframe src={previewUrl} title={doc.file_name} className="h-64 w-64" />
            )
          ) : (
            <div className="flex h-32 w-48 items-center justify-center text-black/40 dark:text-white/40">Loading preview...</div>
          )}
        </div>
      )}
    </div>
  );
}

function EmployeeDetail({
  employee,
  documents,
  devices,
  deviceRegistry,
  phoneNumbers,
  logins,
  uploadingCategory,
  onUpdate,
  onDelete,
  onUploadDoc,
  onDeleteDoc,
  onViewDoc,
  onRenameDoc,
  onAddDevice,
  onReturnDevice,
  onDeleteDevice,
  onAssignDevice,
  onAddPhoneNumber,
  onUpdatePhoneNumber,
  onDeletePhoneNumber,
}: {
  employee: Employee;
  documents: EmployeeDocument[];
  devices: EmployeeDevice[];
  deviceRegistry: Device[];
  phoneNumbers: EmployeePhoneNumber[];
  logins: LoginOption[];
  uploadingCategory: string | null;
  onUpdate: (id: string, patch: Partial<Employee>) => void;
  onDelete: (id: string) => void;
  onUploadDoc: (employeeId: string, category: EmployeeDocumentCategory, file: File) => void;
  onDeleteDoc: (doc: EmployeeDocument) => void;
  onViewDoc: (doc: EmployeeDocument) => void;
  onRenameDoc: (doc: EmployeeDocument, newName: string) => void;
  onAddDevice: (employeeId: string, input: DeviceCheckoutInput) => Promise<void>;
  onReturnDevice: (id: string, patch: ReturnDeviceInput) => Promise<void>;
  onDeleteDevice: (id: string) => void;
  onAssignDevice: (deviceId: string, employeeId: string | null) => void;
  onAddPhoneNumber: (employeeId: string) => void;
  onUpdatePhoneNumber: (id: string, patch: Partial<Pick<EmployeePhoneNumber, "label" | "phone_number">>) => void;
  onDeletePhoneNumber: (id: string) => void;
}) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [returningDevice, setReturningDevice] = useState<EmployeeDevice | null>(null);
  const [savingDevice, setSavingDevice] = useState(false);
  const [deviceToAssign, setDeviceToAssign] = useState("");

  const today = todayISO();
  const upcoming = employee.start_date ? nextAnniversary(employee.start_date, today) : null;
  const isMexicoOffice = employee.office_location === "Guadalajara, MX";
  const employeePhoneNumbers = phoneNumbers.filter((p) => p.employee_id === employee.id);
  const employeeDocs = documents.filter((d) => d.employee_id === employee.id);
  const employeeDevices = devices.filter((d) => d.employee_id === employee.id);
  const assignedToMe = deviceRegistry.filter((d) => d.assigned_to === employee.id);
  const assignableDevices = deviceRegistry.filter((d) => d.assigned_to !== employee.id);

  function deviceLabel(d: EmployeeDevice) {
    const type = d.device_type === "Other" ? d.device_type_other || "Other" : d.device_type;
    return [type, d.device_name].filter(Boolean).join(" - ") || "Device";
  }

  function registryDeviceLabel(d: Device) {
    const type = d.device_type === "Other" ? d.device_type_other || "Other" : d.device_type;
    return [type, d.device_name, d.serial_number ? `(${d.serial_number})` : null].filter(Boolean).join(" - ") || "Device";
  }

  return (
    <div className="mt-4 space-y-4 border-t border-black/10 pt-4 dark:border-white/10" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Name
          <input
            defaultValue={employee.name}
            onBlur={(e) => onUpdate(employee.id, { name: e.target.value })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Title
          <input
            defaultValue={employee.title ?? ""}
            onBlur={(e) => onUpdate(employee.id, { title: e.target.value || null })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Department
          <input
            defaultValue={employee.department ?? ""}
            onBlur={(e) => onUpdate(employee.id, { department: e.target.value || null })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Start Date
          <input
            type="date"
            defaultValue={employee.start_date ?? ""}
            onBlur={(e) => onUpdate(employee.id, { start_date: e.target.value || null })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Direct Manager
          <input
            defaultValue={employee.direct_manager ?? ""}
            onBlur={(e) => onUpdate(employee.id, { direct_manager: e.target.value || null })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Office Location
          <select
            value={employee.office_location ?? ""}
            onChange={(e) => onUpdate(employee.id, { office_location: (e.target.value || null) as EmployeeOfficeLocation | null })}
            className={`${field} mt-1`}
          >
            <option value="">Not set</option>
            {EMPLOYEE_OFFICE_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Personal Number
          <PhoneInput
            key={employee.id}
            value={employee.personal_number}
            isMexico={isMexicoOffice}
            onSave={(v) => onUpdate(employee.id, { personal_number: v })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Work Cell Number
          <PhoneInput
            key={employee.id}
            value={employee.work_cell_number}
            isMexico={isMexicoOffice}
            onSave={(v) => onUpdate(employee.id, { work_cell_number: v })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Office Number
          <PhoneInput
            key={employee.id}
            value={employee.office_number}
            isMexico={isMexicoOffice}
            onSave={(v) => onUpdate(employee.id, { office_number: v })}
            className={`${field} mt-1`}
          />
        </label>
        <label className="block text-sm">
          Login Account
          <select
            value={employee.linked_user_id ?? ""}
            onChange={(e) => onUpdate(employee.id, { linked_user_id: e.target.value || null })}
            className={`${field} mt-1`}
          >
            <option value="">No login / not matched</option>
            {logins.map((l) => (
              <option key={l.id} value={l.id}>
                {l.email ?? l.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Status
          <select
            value={employee.status}
            onChange={(e) => onUpdate(employee.id, { status: e.target.value as EmployeeStatus })}
            className={`${field} mt-1`}
          >
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Additional Phone Numbers</p>
          <button
            onClick={() => onAddPhoneNumber(employee.id)}
            className="text-xs font-medium text-green-600 hover:underline"
          >
            + Add Number
          </button>
        </div>
        {employeePhoneNumbers.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {employeePhoneNumbers.map((p) => (
              <div key={p.id} className="flex items-end gap-2">
                <label className="block flex-1 text-sm">
                  Name
                  <input
                    defaultValue={p.label ?? ""}
                    onBlur={(e) => onUpdatePhoneNumber(p.id, { label: e.target.value || null })}
                    className={`${field} mt-1`}
                  />
                </label>
                <label className="block flex-1 text-sm">
                  Number
                  <PhoneInput
                    key={p.id}
                    value={p.phone_number}
                    isMexico={isMexicoOffice}
                    onSave={(v) => onUpdatePhoneNumber(p.id, { phone_number: v })}
                    className={`${field} mt-1`}
                  />
                </label>
                <button
                  onClick={() => onDeletePhoneNumber(p.id)}
                  className="mb-1 text-xs font-medium text-red-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {upcoming && upcoming.daysAway <= 30 && (
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400">
          🎉 {upcoming.year}-year anniversary {upcoming.daysAway === 0 ? "today" : `in ${upcoming.daysAway} day${upcoming.daysAway === 1 ? "" : "s"}`}{" "}
          ({formatDate(upcoming.date)})
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Documents</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DOC_CATEGORIES.map((cat) => {
            const docs = employeeDocs.filter((d) => d.category === cat.value);
            const key = `${employee.id}:${cat.value}`;
            return (
              <div key={cat.value} className="rounded-md border border-black/10 p-3 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase text-black/60 dark:text-white/60">{cat.label}</span>
                  <label className="cursor-pointer rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                    {uploadingCategory === key ? "Uploading..." : "+ Upload"}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadingCategory === key}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) onUploadDoc(employee.id, cat.value, file);
                      }}
                    />
                  </label>
                </div>
                {docs.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {docs.map((doc) => (
                      <DocumentRow key={doc.id} doc={doc} onView={onViewDoc} onDelete={onDeleteDoc} onRename={onRenameDoc} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-black/40 dark:text-white/40">No documents.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Equipment</p>
          <button
            onClick={() => setCheckoutOpen(true)}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            + Add Equipment
          </button>
        </div>
        {employeeDevices.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-black/5 text-left dark:bg-white/5">
                <tr>
                  <th className="px-2 py-1.5">Device</th>
                  <th className="px-2 py-1.5">Serial</th>
                  <th className="px-2 py-1.5">Issued</th>
                  <th className="px-2 py-1.5">Condition</th>
                  <th className="px-2 py-1.5">Returned</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {employeeDevices.map((d) => (
                  <tr key={d.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-2 py-1.5">{deviceLabel(d)}</td>
                    <td className="px-2 py-1.5">{d.serial_number || "-"}</td>
                    <td className="px-2 py-1.5">{formatDateSlash(d.date_of_issue)}</td>
                    <td className="px-2 py-1.5">{d.condition_at_checkout || "-"}</td>
                    <td className="px-2 py-1.5">
                      {d.date_returned ? (
                        formatDateSlash(d.date_returned)
                      ) : (
                        <button
                          onClick={() => setReturningDevice(d)}
                          className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                        >
                          Mark Returned
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => onDeleteDevice(d.id)} className="font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-black/40 dark:text-white/40">No equipment checked out.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Assigned Devices</p>
        <p className="mb-2 text-xs text-black/50 dark:text-white/50">
          From the company device registry (Supreme &gt; Devices) - assigning a device here takes it away from whoever
          had it before.
        </p>
        {assignedToMe.length > 0 && (
          <div className="mb-2 space-y-1">
            {assignedToMe.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <span>{registryDeviceLabel(d)}</span>
                <button
                  onClick={() => onAssignDevice(d.id, null)}
                  className="ml-auto font-medium text-red-600 hover:underline"
                >
                  Unassign
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <select value={deviceToAssign} onChange={(e) => setDeviceToAssign(e.target.value)} className={`${field} max-w-xs`}>
            <option value="">Select a device...</option>
            {assignableDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {registryDeviceLabel(d)}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!deviceToAssign) return;
              onAssignDevice(deviceToAssign, employee.id);
              setDeviceToAssign("");
            }}
            disabled={!deviceToAssign}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            Assign
          </button>
        </div>
      </div>

      <button onClick={() => onDelete(employee.id)} className="text-xs font-medium text-red-600 hover:underline">
        Delete Employee
      </button>

      {checkoutOpen && (
        <DeviceCheckoutModal
          employeeName={employee.name}
          saving={savingDevice}
          onCancel={() => setCheckoutOpen(false)}
          onSubmit={async (input) => {
            setSavingDevice(true);
            try {
              await onAddDevice(employee.id, input);
              setCheckoutOpen(false);
            } finally {
              setSavingDevice(false);
            }
          }}
        />
      )}
      {returningDevice && (
        <ReturnDeviceModal
          deviceLabel={deviceLabel(returningDevice)}
          saving={savingDevice}
          onCancel={() => setReturningDevice(null)}
          onSubmit={async (patch) => {
            setSavingDevice(true);
            try {
              await onReturnDevice(returningDevice.id, patch);
              setReturningDevice(null);
            } finally {
              setSavingDevice(false);
            }
          }}
        />
      )}
    </div>
  );
}

export default function EmployeeFilesClient({
  initialEmployees,
  initialDocuments,
  initialDevices,
  initialDeviceRegistry,
  initialPhoneNumbers,
  logins,
}: {
  initialEmployees: Employee[];
  initialDocuments: EmployeeDocument[];
  initialDevices: EmployeeDevice[];
  initialDeviceRegistry: Device[];
  initialPhoneNumbers: EmployeePhoneNumber[];
  logins: LoginOption[];
}) {
  const confirm = useConfirm();
  const [employees, setEmployees] = useState(initialEmployees);
  const [deviceRegistry, setDeviceRegistry] = useState(initialDeviceRegistry);
  const [documents, setDocuments] = useState(initialDocuments);
  const [devices, setDevices] = useState(initialDevices);
  const [phoneNumbers, setPhoneNumbers] = useState(initialPhoneNumbers);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("active");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const today = useMemo(() => todayISO(), []);
  const filtered = useMemo(
    () => employees.filter((e) => statusFilter === "all" || e.status === statusFilter),
    [employees, statusFilter],
  );

  async function handleAddEmployee() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const created = await createEmployee(name);
      setEmployees((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setExpandedId(created.id);
    } finally {
      setAdding(false);
    }
  }

  function handleUpdate(id: string, patch: Partial<Employee>) {
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    updateEmployee(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this employee? This also removes their documents and equipment history."))) return;
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setExpandedId((prev) => (prev === id ? null : prev));
    await deleteEmployee(id).catch(() => {});
  }

  async function handleUploadDoc(employeeId: string, category: EmployeeDocumentCategory, file: File) {
    const key = `${employeeId}:${category}`;
    setUploadingCategory(key);
    setUploadError(null);
    try {
      // Straight to Storage from the browser, same reasoning as Food
      // Safety/Marketing Assets - a Server Action's body is capped at
      // ~4.5MB on Vercel regardless of Next.js config.
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
      const storagePath = `${crypto.randomUUID()}${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("employee-documents")
        .upload(storagePath, file, { contentType: file.type || undefined });
      if (uploadErr) throw new Error(uploadErr.message);

      const saved = await recordEmployeeDocument({
        employeeId,
        category,
        fileName: file.name,
        storagePath,
        contentType: file.type || null,
        sizeBytes: file.size,
      });
      setDocuments((prev) => [saved as EmployeeDocument, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingCategory(null);
    }
  }

  async function handleViewDoc(doc: EmployeeDocument) {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("employee-documents").createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      alert("Couldn't open that file.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDeleteDoc(doc: EmployeeDocument) {
    if (!(await confirm(`Delete "${doc.file_name}"? This can't be undone.`))) return;
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    await deleteEmployeeDocument(doc.id, doc.storage_path).catch(() => {});
  }

  function handleRenameDoc(doc: EmployeeDocument, newName: string) {
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, file_name: newName } : d)));
    updateEmployeeDocument(doc.id, newName).catch(() => {});
  }

  async function handleAddDevice(employeeId: string, input: DeviceCheckoutInput) {
    const created = await createEmployeeDevice({ employeeId, ...input });
    setDevices((prev) => [created, ...prev]);
  }

  async function handleReturnDevice(id: string, patch: ReturnDeviceInput) {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    await updateEmployeeDevice(id, patch).catch(() => {});
  }

  async function handleDeleteDevice(id: string) {
    if (!(await confirm("Delete this equipment record?"))) return;
    setDevices((prev) => prev.filter((d) => d.id !== id));
    await deleteEmployeeDevice(id).catch(() => {});
  }

  function handleAssignDevice(deviceId: string, employeeId: string | null) {
    setDeviceRegistry((prev) => prev.map((d) => (d.id === deviceId ? { ...d, assigned_to: employeeId } : d)));
    updateDevice(deviceId, { assigned_to: employeeId }).catch(() => {});
  }

  async function handleAddPhoneNumber(employeeId: string) {
    const existing = phoneNumbers.filter((p) => p.employee_id === employeeId);
    const nextPosition = existing.length > 0 ? Math.max(...existing.map((p) => p.position)) + 1 : 1;
    const created = await createEmployeePhoneNumber(employeeId, nextPosition);
    setPhoneNumbers((prev) => [...prev, created]);
  }

  function handleUpdatePhoneNumber(id: string, patch: Partial<Pick<EmployeePhoneNumber, "label" | "phone_number">>) {
    setPhoneNumbers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    updateEmployeePhoneNumber(id, patch).catch(() => {});
  }

  async function handleDeletePhoneNumber(id: string) {
    if (!(await confirm("Delete this phone number?"))) return;
    setPhoneNumbers((prev) => prev.filter((p) => p.id !== id));
    await deleteEmployeePhoneNumber(id).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Employee Files</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          One tile per employee - onboarding/offboarding documents, equipment checkout history, and upcoming work
          anniversaries.
        </p>
        <p className="mt-1 text-sm font-semibold">
          Main Line: <span className="font-normal text-black/70 dark:text-white/70">{formatPhoneNumber("2108684628", false)}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-gray-300 text-sm dark:border-white/20">
          {(["active", "resigned", "terminated", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 capitalize ${
                statusFilter === s
                  ? "bg-green-600 text-white"
                  : "bg-white text-black hover:bg-black/5 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New employee name..."
            className={`${field} max-w-xs`}
          />
          <button
            onClick={handleAddEmployee}
            disabled={adding || newName.trim() === ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {adding ? "Adding..." : "+ Add Employee"}
          </button>
        </div>
      </div>

      {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((employee) => {
          const expanded = expandedId === employee.id;
          const upcoming = employee.start_date ? nextAnniversary(employee.start_date, today) : null;
          const login = logins.find((l) => l.id === employee.linked_user_id);
          return (
            <div
              key={employee.id}
              className={`rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10 ${
                expanded ? "sm:col-span-2 lg:col-span-3" : ""
              }`}
            >
              <button
                onClick={() => setExpandedId(expanded ? null : employee.id)}
                className="flex w-full items-start justify-between gap-2 text-left"
              >
                <div>
                  <p className="font-semibold">{employee.name}</p>
                  <p className="text-xs text-black/60 dark:text-white/60">
                    {[employee.title, employee.department].filter(Boolean).join(" · ") || "-"}
                  </p>
                  <p className="text-xs text-black/40 dark:text-white/40">
                    {employee.start_date ? `Started ${formatDate(employee.start_date)}` : "No start date"}
                  </p>
                  {employee.direct_manager && (
                    <p className="text-xs text-black/40 dark:text-white/40">Reports to {employee.direct_manager}</p>
                  )}
                  {login && <p className="text-xs text-black/40 dark:text-white/40">Login: {login.email ?? login.id}</p>}
                  {upcoming && upcoming.daysAway <= 30 && (
                    <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-400">
                      🎉 {upcoming.year}-yr anniversary {upcoming.daysAway === 0 ? "today" : `in ${upcoming.daysAway}d`}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[employee.status]}`}>
                  {EMPLOYEE_STATUSES.find((s) => s.value === employee.status)?.label}
                </span>
              </button>

              {expanded && (
                <EmployeeDetail
                  employee={employee}
                  documents={documents}
                  devices={devices}
                  deviceRegistry={deviceRegistry}
                  phoneNumbers={phoneNumbers}
                  logins={logins}
                  uploadingCategory={uploadingCategory}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onUploadDoc={handleUploadDoc}
                  onDeleteDoc={handleDeleteDoc}
                  onViewDoc={handleViewDoc}
                  onRenameDoc={handleRenameDoc}
                  onAddDevice={handleAddDevice}
                  onReturnDevice={handleReturnDevice}
                  onDeleteDevice={handleDeleteDevice}
                  onAssignDevice={handleAssignDevice}
                  onAddPhoneNumber={handleAddPhoneNumber}
                  onUpdatePhoneNumber={handleUpdatePhoneNumber}
                  onDeletePhoneNumber={handleDeletePhoneNumber}
                />
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-1 text-sm text-black/40 dark:text-white/40">No employees match this filter.</p>
        )}
      </div>
    </div>
  );
}
