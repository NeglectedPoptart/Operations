"use client";

import { useMemo, useState } from "react";
import type { Role } from "@/lib/roles";
import type { CrmActivity, CrmCompany } from "@/lib/types";
import {
  addDays,
  currentMonthStart,
  currentQuarter,
  currentWeekStart,
  formatDate,
  formatMonthLabel,
  formatQuarterLabel,
  formatWeekLabel,
  isoDateOf,
  monthEnd,
  monthStart,
  addMonths,
  mondayOf,
  quarterEnd,
  quarterStart,
  todayISO,
  weekEnd,
} from "@/lib/dates";

export interface AssignableUser {
  id: string;
  email: string | null;
  role: Role;
}

export type CompanyStats = Pick<
  CrmCompany,
  "id" | "name" | "created_by" | "created_at" | "assigned_to" | "assigned_at" | "landed_at" | "landed_by" | "dns_at" | "dns_by"
>;

export type ActivityStats = Pick<CrmActivity, "id" | "company_id" | "activity_date" | "activity_type" | "logged_by">;

// Same email-local-part convention as CrmCompaniesClient's displayNameForEmail.
function displayNameForEmail(email: string | null): string {
  if (!email) return "Unknown";
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

type PeriodType = "day" | "week" | "month" | "quarter";

interface Range {
  start: string;
  end: string;
  label: string;
}

function rangeFor(periodType: PeriodType, anchor: string): Range {
  if (periodType === "day") {
    return { start: anchor, end: anchor, label: formatDate(anchor) };
  }
  if (periodType === "week") {
    const start = mondayOf(anchor);
    return { start, end: weekEnd(start), label: formatWeekLabel(start) };
  }
  if (periodType === "month") {
    const start = monthStart(anchor);
    return { start, end: monthEnd(start), label: formatMonthLabel(start) };
  }
  const year = Number(anchor.slice(0, 4));
  const quarter = Math.floor((Number(anchor.slice(5, 7)) - 1) / 3) + 1;
  return { start: quarterStart(year, quarter), end: quarterEnd(year, quarter), label: formatQuarterLabel(year, quarter) };
}

function shiftAnchor(periodType: PeriodType, anchor: string, direction: 1 | -1): string {
  if (periodType === "day") return addDays(anchor, direction);
  if (periodType === "week") return addDays(anchor, direction * 7);
  if (periodType === "month") return addMonths(anchor, direction);
  return addMonths(anchor, direction * 3);
}

interface Row {
  id: string;
  name: string;
  callsLogged: number;
  customersAdded: number;
  assignedToPipeline: number;
  landed: number;
  dns: number;
}

export default function ActivityTrackingClient({
  companies,
  activities,
  assignableUsers,
}: {
  companies: CompanyStats[];
  activities: ActivityStats[];
  assignableUsers: AssignableUser[];
}) {
  const [periodType, setPeriodType] = useState<PeriodType>("day");
  const [anchor, setAnchor] = useState(todayISO());

  const range = useMemo(() => rangeFor(periodType, anchor), [periodType, anchor]);

  const rows: Row[] = useMemo(() => {
    const inRange = (dateStr: string) => dateStr >= range.start && dateStr <= range.end;
    const sortedUsers = [...assignableUsers].sort((a, b) =>
      displayNameForEmail(a.email).localeCompare(displayNameForEmail(b.email)),
    );

    return sortedUsers.map((u) => {
      const callsLogged = activities.filter(
        (a) => a.logged_by === u.id && a.activity_type === "call" && inRange(a.activity_date),
      ).length;
      const customersAdded = companies.filter((c) => c.created_by === u.id && inRange(isoDateOf(c.created_at))).length;
      const assignedToPipeline = companies.filter(
        (c) => c.assigned_to === u.id && c.assigned_at !== null && inRange(isoDateOf(c.assigned_at)),
      ).length;
      const landed = companies.filter((c) => c.landed_by === u.id && c.landed_at !== null && inRange(isoDateOf(c.landed_at))).length;
      const dns = companies.filter((c) => c.dns_by === u.id && c.dns_at !== null && inRange(isoDateOf(c.dns_at))).length;

      return { id: u.id, name: displayNameForEmail(u.email), callsLogged, customersAdded, assignedToPipeline, landed, dns };
    });
  }, [assignableUsers, activities, companies, range]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          callsLogged: acc.callsLogged + r.callsLogged,
          customersAdded: acc.customersAdded + r.customersAdded,
          assignedToPipeline: acc.assignedToPipeline + r.assignedToPipeline,
          landed: acc.landed + r.landed,
          dns: acc.dns + r.dns,
        }),
        { callsLogged: 0, customersAdded: 0, assignedToPipeline: 0, landed: 0, dns: 0 },
      ),
    [rows],
  );

  function goToday() {
    setAnchor(todayISO());
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-black">Activity Tracking</h1>
        <p className="text-sm text-gray-600">Daily, weekly, monthly, and quarterly performance by salesperson.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded border border-gray-300 bg-white">
          {(["day", "week", "month", "quarter"] as PeriodType[]).map((pt) => (
            <button
              key={pt}
              onClick={() => {
                setPeriodType(pt);
                if (pt === "month") setAnchor(currentMonthStart());
                else if (pt === "week") setAnchor(currentWeekStart());
                else if (pt === "quarter") {
                  const { year, quarter } = currentQuarter();
                  setAnchor(quarterStart(year, quarter));
                } else setAnchor(todayISO());
              }}
              className={`px-3 py-1.5 text-sm capitalize ${
                periodType === pt ? "bg-blue-600 text-white" : "text-black hover:bg-gray-100"
              }`}
            >
              {pt}
            </button>
          ))}
        </div>

        <button
          onClick={() => setAnchor(shiftAnchor(periodType, anchor, -1))}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-black hover:bg-gray-100"
        >
          ← Prev
        </button>
        <button
          onClick={() => setAnchor(shiftAnchor(periodType, anchor, 1))}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-black hover:bg-gray-100"
        >
          Next →
        </button>
        <button onClick={goToday} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-black hover:bg-gray-100">
          Today
        </button>

        <span className="ml-2 text-sm font-medium text-black">{range.label}</span>
      </div>

      <div className="overflow-x-auto rounded border border-gray-300 bg-white">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 bg-gray-50 text-left text-black">
              <th className="px-3 py-2 font-semibold">Salesperson</th>
              <th className="px-3 py-2 font-semibold">Calls Logged</th>
              <th className="px-3 py-2 font-semibold">Customers Added</th>
              <th className="px-3 py-2 font-semibold">Assigned to Pipeline</th>
              <th className="px-3 py-2 font-semibold">Landed</th>
              <th className="px-3 py-2 font-semibold">DNS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-200 text-black">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.callsLogged}</td>
                <td className="px-3 py-2">{r.customersAdded}</td>
                <td className="px-3 py-2">{r.assignedToPipeline}</td>
                <td className="px-3 py-2">{r.landed}</td>
                <td className="px-3 py-2">{r.dns}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold text-black">
              <td className="px-3 py-2">Totals</td>
              <td className="px-3 py-2">{totals.callsLogged}</td>
              <td className="px-3 py-2">{totals.customersAdded}</td>
              <td className="px-3 py-2">{totals.assignedToPipeline}</td>
              <td className="px-3 py-2">{totals.landed}</td>
              <td className="px-3 py-2">{totals.dns}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
