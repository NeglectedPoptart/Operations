"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { DEVICE_TYPES, type Device, type Employee } from "@/lib/types";
import { createDevice, deleteDevice, updateDevice } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function deviceLabel(d: Device): string {
  const type = d.device_type === "Other" ? d.device_type_other || "Other" : d.device_type;
  return [type, d.device_name].filter(Boolean).join(" - ") || "Device";
}

export default function DevicesClient({
  initialDevices,
  employees,
}: {
  initialDevices: Device[];
  employees: Employee[];
}) {
  const confirm = useConfirm();
  const [devices, setDevices] = useState(initialDevices);

  const [newType, setNewType] = useState<string>(DEVICE_TYPES[1]);
  const [newTypeOther, setNewTypeOther] = useState("");
  const [newName, setNewName] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [adding, setAdding] = useState(false);

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
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">{deviceLabel(d)}</td>
                <td className="px-3 py-2">{d.serial_number || "-"}</td>
                <td className="px-3 py-2">
                  <select
                    value={d.assigned_to ?? ""}
                    onChange={(e) => handleReassign(d.id, e.target.value)}
                    className={`${field} w-48`}
                  >
                    <option value="">Unassigned</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => handleRemove(d)} className="font-medium text-red-600 hover:underline">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
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
