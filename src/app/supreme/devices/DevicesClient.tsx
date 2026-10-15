"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { DEVICE_TYPES, type Device, type Employee, type EmployeeDocument } from "@/lib/types";
import { createDevice, deleteDevice, updateDevice } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";
const label = "mb-1 block text-xs font-medium text-black/60 dark:text-white/60";

// Groups in the order they appear in the list.
const GROUP_ORDER = ["Cell phone", "Desk phone", "Laptop", "Tablet", "Other"];

// Devices saved before Cell phone / Desk phone were split say just "Phone" - they are cell phones.
function normalType(type: string | null): string {
  return type === "Phone" ? "Cell phone" : type ?? "Other";
}

function typeOf(d: Device): string {
  const t = normalType(d.device_type);
  return GROUP_ORDER.includes(t) ? t : "Other";
}

function deviceLabel(d: Device): string {
  const type = d.device_type === "Other" ? d.device_type_other || "Other" : normalType(d.device_type);
  return d.device_name || type || "Device";
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

function Avatar({ name, photoUrl, size = 28 }: { name: string | null; photoUrl?: string; size?: number }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name ?? ""} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-black/10 text-[10px] font-bold text-black/60 dark:bg-white/10 dark:text-white/60"
    >
      {name ? initials(name) : "?"}
    </span>
  );
}

function TypeIcon({ type, className = "h-5 w-5" }: { type: string; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, viewBox: "0 0 24 24" };
  if (type === "Cell phone")
    return (
      <svg {...common}>
        <rect x="7" y="3" width="10" height="18" rx="2" />
        <path d="M11 18h2" />
      </svg>
    );
  if (type === "Desk phone")
    return (
      <svg {...common}>
        <path d="M5 10c4-3 10-3 14 0l-1.5 2.5-3-1.2v-1.3a7 7 0 0 0-5 0v1.3l-3 1.2z" />
        <rect x="4" y="15" width="16" height="5" rx="1.5" />
        <path d="M8 17.5h.01M12 17.5h.01M16 17.5h.01" />
      </svg>
    );
  if (type === "Laptop")
    return (
      <svg {...common}>
        <rect x="5" y="5" width="14" height="10" rx="1.5" />
        <path d="M3 19h18" />
      </svg>
    );
  if (type === "Tablet")
    return (
      <svg {...common}>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M11 18h2" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  );
}

type Filter = "all" | "unassigned" | "flagged";

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
  const [selectedId, setSelectedId] = useState<string | null>(initialDevices[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  // One signed URL per employee who has a photo on file (most recent one,
  // since `photos` is already ordered newest-first).
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

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const total = devices.length;
  const unassignedCount = devices.filter((d) => !d.assigned_to).length;
  const flaggedCount = devices.filter((d) => d.has_issue).length;

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (filter === "unassigned" && d.assigned_to) return false;
      if (filter === "flagged" && !d.has_issue) return false;
      if (!q) return true;
      const person = d.assigned_to ? employeeById.get(d.assigned_to)?.name ?? "" : "unassigned";
      return [deviceLabel(d), d.serial_number ?? "", person, d.notes ?? "", d.device_type ?? ""].some((t) => t.toLowerCase().includes(q));
    });
  }, [devices, filter, search, employeeById]);

  const groups = GROUP_ORDER.map((g) => ({ name: g, items: shown.filter((d) => typeOf(d) === g) })).filter((g) => g.items.length > 0);
  const selected = devices.find((d) => d.id === selectedId) ?? null;

  function patchDevice(id: string, patch: Partial<Device>) {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    updateDevice(id, patch).catch(() => {});
  }

  async function handleRemove(d: Device) {
    if (!(await confirm(`Remove "${deviceLabel(d)}" from the device registry? This can't be undone.`))) return;
    setDevices((prev) => prev.filter((x) => x.id !== d.id));
    setSelectedId((cur) => (cur === d.id ? null : cur));
    await deleteDevice(d.id).catch(() => {});
  }

  function pill(id: Filter, text: string, count: number): ReactNode {
    const on = filter === id;
    return (
      <button
        key={id}
        onClick={() => setFilter(id)}
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          on ? "bg-black text-white dark:bg-white dark:text-black" : "border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        }`}
      >
        {text} {count}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Devices</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Every piece of company equipment and who has it. Pick a device on the left to edit it on the right. You can also reassign from
            that person&apos;s tile on Employee Files.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          + Add device
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search devices, serials, people" className={`${field} max-w-xs`} />
        {pill("all", "All", total)}
        {pill("unassigned", "Unassigned", unassignedCount)}
        {pill("flagged", "Needs follow-up", flaggedCount)}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
          {groups.map((g) => (
            <div key={g.name}>
              <div className="bg-black/5 px-3 py-1.5 text-xs font-medium text-black/60 dark:bg-white/10 dark:text-white/60">
                {g.name === "Other" ? "Other" : `${g.name}s`} ({g.items.length})
              </div>
              {g.items.map((d) => {
                const person = d.assigned_to ? employeeById.get(d.assigned_to) : undefined;
                const on = d.id === selectedId && !adding;
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      setAdding(false);
                      setSelectedId(d.id);
                    }}
                    className={`flex w-full items-center gap-3 border-t border-black/10 px-3 py-2 text-left dark:border-white/10 ${
                      on ? "bg-green-50 dark:bg-green-950/30" : d.has_issue ? "bg-red-50 dark:bg-red-950/20" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="text-black/50 dark:text-white/50">
                      <TypeIcon type={typeOf(d)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{deviceLabel(d)}</span>
                      <span className="block truncate text-xs text-black/55 dark:text-white/55">
                        {person ? person.name : <span className="italic">Unassigned</span>}
                        {d.serial_number ? ` · ${d.serial_number}` : ""}
                      </span>
                    </span>
                    {person && <Avatar name={person.name} photoUrl={photoUrls[person.id]} size={24} />}
                    {d.has_issue && <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" title="Needs follow-up" />}
                  </button>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-black/40 dark:text-white/40">
              {devices.length === 0 ? "No devices yet - add one." : "Nothing matches that search or filter."}
            </p>
          )}
        </div>

        <div className="lg:sticky lg:top-4">
          {adding ? (
            <AddPanel
              employees={employees}
              onCancel={() => setAdding(false)}
              onCreated={(d) => {
                setDevices((prev) => [d, ...prev]);
                setSelectedId(d.id);
                setAdding(false);
              }}
            />
          ) : selected ? (
            <DetailPanel
              key={selected.id}
              device={selected}
              employees={employees}
              photoUrls={photoUrls}
              onPatch={(patch) => patchDevice(selected.id, patch)}
              onRemove={() => handleRemove(selected)}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm text-black/50 dark:border-white/20 dark:text-white/50">
              Pick a device to see and edit its details.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  device,
  employees,
  photoUrls,
  onPatch,
  onRemove,
}: {
  device: Device;
  employees: Employee[];
  photoUrls: Record<string, string>;
  onPatch: (patch: Partial<Device>) => void;
  onRemove: () => void;
}) {
  const person = device.assigned_to ? employees.find((e) => e.id === device.assigned_to) : undefined;
  const type = normalType(device.device_type);
  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60">
          <TypeIcon type={typeOf(device)} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{deviceLabel(device)}</p>
          <p className="text-xs text-black/55 dark:text-white/55">
            {type === "Other" ? device.device_type_other || "Other" : type} · added {new Date(device.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </p>
        </div>
        {person && <Avatar name={person.name} photoUrl={photoUrls[person.id]} size={36} />}
      </div>

      <label className="block text-sm">
        <span className={label}>Assigned to</span>
        <select value={device.assigned_to ?? ""} onChange={(e) => onPatch({ assigned_to: e.target.value || null })} className={field}>
          <option value="">Unassigned</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className={label}>Type</span>
          <select value={type} onChange={(e) => onPatch({ device_type: e.target.value })} className={field}>
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {type === "Other" ? (
          <label className="block text-sm">
            <span className={label}>Describe</span>
            <input defaultValue={device.device_type_other ?? ""} onBlur={(e) => onPatch({ device_type_other: e.target.value.trim() || null })} className={field} />
          </label>
        ) : (
          <label className="block text-sm">
            <span className={label}>Name / label</span>
            <input defaultValue={device.device_name ?? ""} onBlur={(e) => onPatch({ device_name: e.target.value.trim() || null })} className={field} />
          </label>
        )}
      </div>
      {type === "Other" && (
        <label className="block text-sm">
          <span className={label}>Name / label</span>
          <input defaultValue={device.device_name ?? ""} onBlur={(e) => onPatch({ device_name: e.target.value.trim() || null })} className={field} />
        </label>
      )}

      <label className="block text-sm">
        <span className={label}>Serial number / asset tag</span>
        <input defaultValue={device.serial_number ?? ""} onBlur={(e) => onPatch({ serial_number: e.target.value.trim() || null })} className={field} />
      </label>

      <label className="block text-sm">
        <span className={label}>Notes</span>
        <textarea defaultValue={device.notes ?? ""} onBlur={(e) => onPatch({ notes: e.target.value.trim() || null })} rows={3} placeholder="Add a note..." className={field} />
      </label>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onPatch({ has_issue: !device.has_issue })}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            device.has_issue
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          }`}
        >
          {device.has_issue ? "⚑ Needs follow-up - clear it" : "Flag for follow-up"}
        </button>
        <span className="flex-1" />
        <button onClick={onRemove} className="text-sm font-medium text-red-600 hover:underline">
          Remove
        </button>
      </div>
    </div>
  );
}

function AddPanel({ employees, onCancel, onCreated }: { employees: Employee[]; onCancel: () => void; onCreated: (d: Device) => void }) {
  const [type, setType] = useState<string>(DEVICE_TYPES[1]);
  const [other, setOther] = useState("");
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const created = await createDevice({
        deviceType: type,
        deviceTypeOther: type === "Other" ? other.trim() || null : null,
        deviceName: name.trim() || null,
        serialNumber: serial.trim() || null,
        assignedTo: assignedTo || null,
      });
      onCreated(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-green-600 p-4">
      <p className="text-base font-bold">Add a device</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className={label}>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {type === "Other" ? (
          <label className="block text-sm">
            <span className={label}>Describe</span>
            <input value={other} onChange={(e) => setOther(e.target.value)} className={field} />
          </label>
        ) : (
          <label className="block text-sm">
            <span className={label}>Name / label</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
        )}
      </div>
      {type === "Other" && (
        <label className="block text-sm">
          <span className={label}>Name / label</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
      )}
      <label className="block text-sm">
        <span className={label}>Serial number / asset tag</span>
        <input value={serial} onChange={(e) => setSerial(e.target.value)} className={field} />
      </label>
      <label className="block text-sm">
        <span className={label}>Assign to</span>
        <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={field}>
          <option value="">Unassigned</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10">
          Cancel
        </button>
        <button onClick={add} disabled={busy} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">
          {busy ? "Adding..." : "Add device"}
        </button>
      </div>
    </div>
  );
}
