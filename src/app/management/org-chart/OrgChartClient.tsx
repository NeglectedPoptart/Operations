"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EMPLOYEE_STATUSES, type EmployeeStatus } from "@/lib/types";

export interface OrgEmployee {
  id: string;
  name: string;
  title: string | null;
  department: string | null;
  status: EmployeeStatus;
  direct_manager: string | null;
  office_location: string | null;
}

interface TreeNode {
  employee: OrgEmployee;
  children: TreeNode[];
  // Everyone else they report to (a person can have more than one manager - the chart hangs them under the first).
  alsoReportsTo: string[];
  // Named as their manager but not in the list being shown.
  unmatchedManager: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const NONE = new Set(["", "n/a", "na", "none", "-", "--", "—"]);

// "Nasser Halim/Jacob Romero", "A, B" or "A and B" -> ["Nasser Halim", "Jacob Romero"]
function managerNames(value: string | null): string[] {
  return (value ?? "")
    .split(/\s*(?:\/|,|;|&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => !NONE.has(norm(s)));
}

function buildTree(people: OrgEmployee[]): { roots: TreeNode[]; unassigned: TreeNode[] } {
  const byName = new Map(people.map((p) => [norm(p.name), p]));
  const nodes = new Map<string, TreeNode>(people.map((p) => [p.id, { employee: p, children: [], alsoReportsTo: [], unmatchedManager: null }]));

  const parentOf = new Map<string, string>();
  for (const p of people) {
    const node = nodes.get(p.id)!;
    const names = managerNames(p.direct_manager);
    const matched = names.map((n) => byName.get(norm(n))).filter((m): m is OrgEmployee => !!m && m.id !== p.id);
    if (matched.length > 0) {
      parentOf.set(p.id, matched[0].id);
      node.alsoReportsTo = matched.slice(1).map((m) => m.name);
    } else if (names.length > 0) {
      node.unmatchedManager = names.join(" / ");
    }
  }

  // A reporting loop (A under B under A) would never reach a root - cut it at the person who closes it.
  for (const p of people) {
    const seen = new Set<string>([p.id]);
    let cur = parentOf.get(p.id);
    while (cur) {
      if (seen.has(cur)) {
        parentOf.delete(p.id);
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur);
    }
  }

  for (const p of people) {
    const parent = parentOf.get(p.id);
    if (parent) nodes.get(parent)!.children.push(nodes.get(p.id)!);
  }

  const roots: TreeNode[] = [];
  const unassigned: TreeNode[] = [];
  for (const p of people) {
    if (parentOf.has(p.id)) continue;
    const node = nodes.get(p.id)!;
    // Nobody above them, nobody under them, and no "Reports to" filled in: not part of the structure yet.
    const blank = !(p.direct_manager ?? "").trim();
    if (blank && node.children.length === 0) unassigned.push(node);
    else roots.push(node);
  }
  // Biggest teams first, so the leaders read left to right.
  const size = (n: TreeNode): number => 1 + n.children.reduce((a, c) => a + size(c), 0);
  const order = (list: TreeNode[]) => {
    list.sort((a, b) => size(b) - size(a) || a.employee.name.localeCompare(b.employee.name));
    for (const n of list) order(n.children);
  };
  order(roots);
  return { roots, unassigned };
}

function Card({ node }: { node: TreeNode }) {
  const e = node.employee;
  const sub = [e.title, e.department].filter(Boolean).join(" · ");
  const team = node.children.length;
  return (
    <Link
      href="/management/employee-files"
      className="relative block w-48 rounded-lg border border-black/15 bg-white px-3 py-2 text-center shadow-sm hover:border-green-600 dark:border-white/15 dark:bg-neutral-900 dark:hover:border-green-500"
    >
      <p className="text-sm font-semibold leading-tight">{e.name}</p>
      {sub && <p className="mt-0.5 text-xs leading-tight text-black/60 dark:text-white/60">{sub}</p>}
      {e.office_location && <p className="mt-0.5 text-[11px] leading-tight text-black/40 dark:text-white/40">{e.office_location}</p>}
      {node.alsoReportsTo.length > 0 && (
        <p className="mt-1 text-[11px] leading-tight text-blue-700 dark:text-blue-300">Also reports to {node.alsoReportsTo.join(", ")}</p>
      )}
      {node.unmatchedManager && (
        <p className="mt-1 text-[11px] leading-tight text-amber-700 dark:text-amber-400">Reports to {node.unmatchedManager} (not found)</p>
      )}
      {team > 0 && <p className="mt-1 text-[11px] font-medium leading-tight text-green-700 dark:text-green-400">{team} direct report{team === 1 ? "" : "s"}</p>}
      {e.status !== "active" && (
        <span className="absolute -right-1 -top-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {EMPLOYEE_STATUSES.find((s) => s.value === e.status)?.label}
        </span>
      )}
    </Link>
  );
}

function Branch({ node }: { node: TreeNode }) {
  return (
    <li>
      <Card node={node} />
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <Branch key={c.employee.id} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

// Classic top-down org chart: each <li> draws the little elbow lines to its siblings and to its parent.
const CHART_CSS = `
.org-tree{--org-line:rgba(120,120,120,.55)}
.org-tree ul{display:flex;justify-content:center;padding-top:22px;position:relative;margin:0;padding-left:0}
.org-tree li{list-style:none;text-align:center;position:relative;padding:22px 8px 0}
.org-tree li::before,.org-tree li::after{content:"";position:absolute;top:0;right:50%;border-top:1px solid var(--org-line);width:50%;height:22px}
.org-tree li::after{right:auto;left:50%;border-left:1px solid var(--org-line)}
.org-tree li:only-child::before,.org-tree li:only-child::after{display:none}
.org-tree li:only-child{padding-top:0}
.org-tree li:first-child::before,.org-tree li:last-child::after{border:0 none}
.org-tree li:last-child::before{border-right:1px solid var(--org-line);border-radius:0 6px 0 0}
.org-tree li:first-child::after{border-radius:6px 0 0 0}
.org-tree li>ul::before{content:"";position:absolute;top:0;left:50%;border-left:1px solid var(--org-line);height:22px}
.org-tree .org-roots{padding-top:0;display:flex;flex-wrap:nowrap;justify-content:center;gap:40px;align-items:flex-start}
.org-roots>li{padding-top:0}
.org-roots>li::before,.org-roots>li::after{display:none}
`;

export default function OrgChartClient({ employees }: { employees: OrgEmployee[] }) {
  const [status, setStatus] = useState<EmployeeStatus | "all">("active");
  const shown = useMemo(() => employees.filter((e) => status === "all" || e.status === status), [employees, status]);
  const { roots, unassigned } = useMemo(() => buildTree(shown), [shown]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Org Chart</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Built from &quot;Reports to&quot; in{" "}
            <Link href="/management/employee-files" className="text-green-700 underline dark:text-green-400">
              Employee Files
            </Link>
            . Someone with two managers hangs under the first one named.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-sm dark:border-white/20">
          {([...EMPLOYEE_STATUSES.map((s) => ({ value: s.value as EmployeeStatus | "all", label: s.label })), { value: "all" as const, label: "All" }]).map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`px-3 py-1.5 font-medium ${status === s.value ? "bg-green-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <style>{CHART_CSS}</style>

      {shown.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">Nobody to show here.</p>
      ) : (
        <div className="org-tree overflow-x-auto rounded-lg border border-black/10 p-6 dark:border-white/10">
          <ul className="org-roots" style={{ width: "max-content", minWidth: "100%" }}>
            {roots.map((r) => (
              <Branch key={r.employee.id} node={r} />
            ))}
          </ul>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="space-y-2 rounded-lg border border-dashed border-black/20 p-4 dark:border-white/20">
          <p className="text-sm font-semibold">No reporting line set ({unassigned.length})</p>
          <p className="text-xs text-black/60 dark:text-white/60">Fill in &quot;Reports to&quot; on their card in Employee Files and they&apos;ll move into the chart.</p>
          <div className="flex flex-wrap gap-3">
            {unassigned.map((n) => (
              <Card key={n.employee.id} node={n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
