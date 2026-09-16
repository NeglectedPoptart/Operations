"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { DEVICE_TYPES, type Device, type Employee, type EmployeeDocument } from "@/lib/types";
import { createDevice, deleteDevice, updateDevice } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function deviceLabel(d: Device): string {
  const type = d.device_type === "Other" ? d.device_type_other || "Other" : d.device_type;
  return [type, d.device_name].filter(Boolean).join(" - ") || "Device";
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function Avatar({ name, photoUrl }: { name: string | null; photoUrl?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name ?? ""} className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold text-black/60 dark:bg-white/10 dark:text-white/60">
      {name ? initials(name) : "?"}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <p className="text-xs font-medium text-black/60 dark:text-white/60">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

export default function DevicesClient({
  initialDevices,
  employees,
  photos,
}: {
  initialDevices: Device[];
  employees: Employee[];
  photos: EmployeeDocument[];
}) {
  const confirm = useConfirm();
  const [devices, setDevices] = useState(initialDevices);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const [newType, setNewType] = useState<string>(DEVICE_TYPES[1]);
  const [newTypeOther, setNewTypeOther] = useState("");
  const [newName, setNewName] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [adding, setAdding] = useState(false);

  // One signed URL per employee who has a photo on file (most recent one,
  // since `photos` is already ordered newest-first) - fetched once up
  // front rather than per-row, since the assignee list here is small.
  useEffect(() => {
    const latestByEmployee = new Map<string, EmployeeDocument>();
    for (const doc of photos) {
      if (!latestByEmployee.has(doc.employee_id)) latestByEmployee.set(doc.employee_id, doc);
    }
    if (latestByEmployee.size === 0) return;

    let cancelled = false;
    const supabase = createClient();
    Promise.all(
      Array.from(latestByEmployee.entries()).map(async ([employeeId, doc]) => {
        const { data } = await supabase.storage.from("employee-documents").createSignedUrl(doc.storage_path, 3600);
        return [employeeId, data?.signedUrl] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [employeeId, url] of entries) if (url) next[employeeId] = url;
      setPhotoUrls(next);
    });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const total = devices.length;
  const assignedCount = devices.filter((d) => d.assigned_to).length;
  const unassignedCount = total - assignedCount;
  const flaggedCount = devices.filter((d) => d.has_issue).length;

  async function handleAdd() {
    setAdding(true);
    try {
      const created = await createDevice({
        deviceType: newType,
        deviceTypeOther: newType === "Other" ? newTypeOther.trim() || null : null,
        deviceName: newName.trim() || null,
        serialNumber: newSerial.trim() || null,
        assignedTo: newAssignedTo || null,
      });
      setDevices((prev) => [created, ...prev]);
      setNewType(DEVICE_TYPES[1]);
      setNewTypeOther("");
      setNewName("");
      setNewSerial("");
      setNewAssignedTo("");
    } finally {
      setAdding(false);
    }
  }

  function handleReassign(id: string, assignedTo: string) {
    const value = assignedTo || null;
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, assigned_to: value } : d)));
    updateDevice(id, { assigned_to: value }).catch(() => {});
  }

  function handleNotesSave(id: string, notes: string) {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, notes: notes || null } : d)));
    updateDevice(id, { notes: notes || null }).catch(() => {});
  }

  function handleToggleFlag(id: string, hasIssue: boolean) {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, has_issue: hasIssue } : d)));
    updateDevice(id, { has_issue: hasIssue }).catch(() => {});
  }

  async function handleRemove(d: Device) {
    if (!(await confirm(`Remove "${deviceLabel(d)}" from the device registry? This can't be undone.`))) return;
    setDevices((prev) => prev.filter((x) => x.id !== d.id));
    await deleteDevice(d.id).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Devices</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Every piece of company equipment and who currently has it. Reassign a device here or from that person&apos;s
          tile on Employee Files.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Devices" value={total} />
        <StatCard label="Assigned" value={assignedCount} accent="text-green-700 dark:text-green-400" />
        <StatCard label="Unassigned" value={unassignedCount} accent="text-black/60 dark:text-white/60" />
        <StatCard label="Needs Follow-up" value={flaggedCount} accent="text-red-600 dark:text-red-400" />
      </div>

      <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Add Device</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs font-medium text-black/60 dark:text-white/60">Type</span>
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className={`${field} mt-1 w-32`}>
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {newType === "Other" && (
            <label className="text-sm">
              <span className="block text-xs font-medium text-black/60 dark:text-white/60">Describe</span>
              <input value={newTypeOther} onChange={(e) => setNewTypeOther(e.target.value)} className={`${field} mt-1`} />
            </label>
          )}
          <label className="text-sm">
            <span className="block text-xs font-medium text-black/60 dark:text-white/60">Device Name / Label</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-black/60 dark:text-white/60">Serial Number / Asset Tag</span>
            <input value={newSerial} onChange={(e) => setNewSerial(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-black/60 dark:text-white/60">Assign To</span>
            <select value={newAssignedTo} onChange={(e) => setNewAssignedTo(e.target.value)} className={`${field} mt-1 w-40`}>
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {adding ? "Adding..." : "+ Add Device"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-3 py-2">Device</th>
              <th className="px-3 py-2">Serial Number</th>
              <th className="px-3 py-2">Assigned To</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2">Flag</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const assignedEmployee = employees.find((e) => e.id === d.assigned_to);
              return (
                <tr
                  key={d.id}
                  className={`border-t border-black/10 dark:border-white/10 ${
                    d.has_issue ? "bg-red-50 dark:bg-red-950/20" : ""
                  }`}
                >
                  <td className="px-3 py-2">{deviceLabel(d)}</td>
                  <td className="px-3 py-2">{d.serial_number || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex w-fit items-center gap-2 rounded-full bg-black/5 py-1 pl-1 pr-3 dark:bg-white/10">
                        <Avatar
                          name={assignedEmployee?.name ?? null}
                          photoUrl={assignedEmployee ? photoUrls[assignedEmployee.id] : undefined}
                        />
                        <span className="text-xs font-medium">{assignedEmployee?.name ?? "Unassigned"}</span>
                      </div>
                      <select
                        value={d.assigned_to ?? ""}
                        onChange={(e) => handleReassign(d.id, e.target.value)}
                        className={`${field} w-44 text-xs`}
                      >
                        <option value="">Unassigned</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={d.notes ?? ""}
                      onBlur={(e) => handleNotesSave(d.id, e.target.value)}
                      placeholder="Add a note..."
                      className={`${field} w-40`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleToggleFlag(d.id, !d.has_issue)}
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        d.has_issue
                          ? "bg-red-600 text-white hover:bg-red-700"
                          : "border border-gray-300 text-black/60 hover:bg-black/5 dark:border-white/20 dark:text-white/60 dark:hover:bg-white/10"
                      }`}
                    >
                      {d.has_issue ? "⚑ Needs Follow-up" : "Flag Issue"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => handleRemove(d)} className="font-medium text-red-600 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            {devices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No devices yet - add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
