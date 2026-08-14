"use client";

import { formatDate } from "@/lib/dates";
import { ROLES, canAccessTab, type Role, type Tab } from "@/lib/roles";
import type { Broker, Profile } from "@/lib/types";

// Mirrors the category/page lists in src/components/NavBar.tsx (page names
// only - the access itself is computed live from canAccessTab below, so
// this can't drift from what the app actually enforces). Keep the labels
// here in sync if pages are added, renamed, or moved.
const SECTIONS: { tab: Tab | null; label: string; pages: string }[] = [
  { tab: null, label: "Home", pages: "Dashboard / summary" },
  {
    tab: "logistics",
    label: "Logistics",
    pages: "Summary, List, Freight Rates, Broker Rate Entry, Freight Calculator, Weight Calculator, Invoicing",
  },
  { tab: "warehouse", label: "Warehouse", pages: "AM Holdovers, Repack Inventory, Cold Inventory" },
  { tab: "qc", label: "QC", pages: "QC Agenda, QC Inspections, Old Age" },
  {
    tab: "sales",
    label: "Sales",
    pages: "FOB - Pharr, Houston/Dallas/East Coast Delivered, Pending to Invoice, Sales Calculator",
  },
  { tab: "buyers", label: "Buyers", pages: "Price Sheets, Vendor Catalog, Buyers List, Local Inbounds" },
  { tab: "management", label: "Management", pages: "Workflow, Callout Sheet, User Roles, Notifications, Reset Tools" },
  { tab: "compliance", label: "Compliance", pages: "PAS Files" },
  { tab: "accounting", label: "Accounting", pages: "Accounts Receivable" },
  { tab: "marketing", label: "Marketing", pages: "Brand Assets" },
];

// Home is open to everyone except broker_carrier, whose access is a single
// hardcoded page outside the tab system entirely (see BROKER_CARRIER_PATH
// in roles.ts) - never "yes" to any section here, Home included.
function hasAccess(role: Role, tab: Tab | null): boolean {
  if (role === "broker_carrier") return false;
  if (tab === null) return true;
  return canAccessTab(role, tab);
}

export default function RolesPermissionsModal({
  profiles,
  brokers,
  onClose,
}: {
  profiles: Profile[];
  brokers: Broker[];
  onClose: () => void;
}) {
  const brokerNameById = new Map(brokers.map((b) => [b.id, b.name]));
  const roleLabelByValue = new Map(ROLES.map((r) => [r.value, r.label]));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 print:static print:bg-white print:p-0">
      <div className="my-6 w-full max-w-4xl space-y-5 rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900 print:my-0 print:max-w-none print:rounded-none print:border-none print:shadow-none">
        <div className="flex items-center justify-between print:hidden">
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Roles &amp; Permissions</h2>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              Close
            </button>
          </div>
        </div>

        <h1 className="hidden text-xl font-bold text-black print:block">Roles &amp; Permissions</h1>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-green-700 dark:text-green-400 print:text-black">
            What Each Role Can See
          </h3>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 print:border-black">
            <table className="w-full text-xs print:text-[9px]">
              <thead className="bg-black/5 text-left dark:bg-white/5 print:bg-transparent">
                <tr>
                  <th className="px-2 py-2 print:text-black">Section</th>
                  {ROLES.map((r) => (
                    <th key={r.value} className="px-1 py-2 text-center print:text-black">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s) => (
                  <tr key={s.label} className="border-t border-black/10 dark:border-white/10 print:border-black">
                    <td className="px-2 py-1.5">
                      <div className="font-medium print:text-black">{s.label}</div>
                      <div className="text-[10px] text-black/50 dark:text-white/50 print:text-black">{s.pages}</div>
                    </td>
                    {ROLES.map((r) => (
                      <td key={r.value} className="px-1 py-1.5 text-center">
                        {hasAccess(r.value, s.tab) ? (
                          <span className="font-semibold text-green-600 dark:text-green-400 print:text-black">✓</span>
                        ) : (
                          <span className="text-black/20 dark:text-white/20 print:text-black/40">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-black/50 dark:text-white/50 print:text-black">
            Broker/Carrier is a special case: no Home, no sections above - just the Broker Rate Entry form and
            nothing else.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-green-700 dark:text-green-400 print:text-black">Who Has What Role</h3>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 print:border-black">
            <table className="w-full text-xs print:text-[9px]">
              <thead className="bg-black/5 text-left dark:bg-white/5 print:bg-transparent">
                <tr>
                  <th className="px-2 py-2 print:text-black">Email</th>
                  <th className="px-2 py-2 print:text-black">Role</th>
                  <th className="px-2 py-2 print:text-black">Broker/Carrier Company</th>
                  <th className="px-2 py-2 print:text-black">Added</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-t border-black/10 dark:border-white/10 print:border-black">
                    <td className="px-2 py-1.5 print:text-black">{p.email ?? "(no email)"}</td>
                    <td className="px-2 py-1.5 print:text-black">{roleLabelByValue.get(p.role) ?? p.role}</td>
                    <td className="px-2 py-1.5 print:text-black">
                      {p.broker_id ? brokerNameById.get(p.broker_id) ?? "—" : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 print:text-black">
                      {formatDate(p.created_at.slice(0, 10))}
                    </td>
                  </tr>
                ))}
                {profiles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
