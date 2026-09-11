"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { parseCrmCompaniesText, type ParsedCrmCompanyRow } from "@/lib/crmCompaniesParse";
import { todayISO } from "@/lib/dates";
import type { Role } from "@/lib/roles";
import {
  CRM_ACTIVITY_TYPES,
  CRM_OUTCOMES,
  CRM_PRIORITIES,
  CRM_STATUSES,
  type CrmActivity,
  type CrmActivityType,
  type CrmBucket,
  type CrmCompany,
  type CrmOutcome,
  type CrmPriority,
  type CrmStatus,
} from "@/lib/types";
import {
  addCrmActivity,
  assignCrmCompany,
  createCrmBucket,
  createCrmCompany,
  deleteCrmActivity,
  deleteCrmBucket,
  deleteCrmCompany,
  importCrmCompanies,
  markCompanyDns,
  markCompanyLanded,
  undoCompanyDns,
  undoCompanyLanded,
  updateCrmActivity,
  updateCrmCompany,
} from "./actions";

export interface AssignableUser {
  id: string;
  email: string | null;
  role: Role;
}

// The email-local-part-as-a-name convention this company already uses
// (tcamph@... -> "Tcamph") - good enough for a pipeline label without
// needing a dedicated display-name field on profiles.
function displayNameForEmail(email: string | null): string {
  if (!email) return "Unknown";
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

const STATUS_BADGE: Record<CrmStatus, string> = {
  prospect: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
  contacted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  qualified: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  customer: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  inactive: "bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/40",
  do_not_contact: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const PRIORITY_BADGE: Record<CrmPriority, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
};

const STATUS_LABEL = new Map(CRM_STATUSES.map((s) => [s.value, s.label]));
const ACTIVITY_TYPE_LABEL = new Map(CRM_ACTIVITY_TYPES.map((t) => [t.value, t.label]));
const OUTCOME_LABEL = new Map(CRM_OUTCOMES.map((o) => [o.value, o.label]));

function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

function formatShortDateTime(iso: string | null): string {
  if (!iso) return "";
  return formatShortDate(iso.slice(0, 10));
}

// One company's expand-in-place detail: editable fields plus its activity
// log - kept as its own component (rather than inlined in the map, as
// Growers does) since the add-activity mini-form needs its own draft state
// per card.
function CompanyCard({
  company,
  activities,
  expanded,
  onToggle,
  onSave,
  onDelete,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  isAdminOrExec,
  assignableUsers,
  currentUserId,
  onAssign,
  buckets,
  onSetBucket,
  selected,
  onToggleSelect,
  onMarkLanded,
  landedInfo,
  onMarkDns,
  dnsInfo,
}: {
  company: CrmCompany;
  activities: CrmActivity[];
  expanded: boolean;
  onToggle: () => void;
  onSave: (patch: Partial<CrmCompany>) => void;
  onDelete: () => void;
  onAddActivity: (input: Parameters<typeof addCrmActivity>[1]) => Promise<void>;
  onUpdateActivity: (id: string, patch: Partial<CrmActivity>) => void;
  onDeleteActivity: (id: string) => void;
  isAdminOrExec: boolean;
  assignableUsers: AssignableUser[];
  currentUserId: string;
  onAssign: (userId: string | null) => void;
  buckets: CrmBucket[];
  onSetBucket: (bucketId: string | null) => void;
  selected: boolean;
  onToggleSelect: () => void;
  // Present only when this card is eligible to be marked landed (assigned,
  // not already landed, and the viewer is either the pipeline owner or an
  // Admin/Exec) - undefined elsewhere so the button just doesn't render.
  onMarkLanded?: () => void;
  // Present only in the Completed list - swaps the header's bucket/assign
  // controls for a "Landed by X on <date>" line and an Undo button, since
  // Completed is a distinct end state, not another pipeline to reassign.
  landedInfo?: { label: string; onUndo: () => void };
  // Same shape as the two above, for the "Do Not Sell" mirror state.
  onMarkDns?: () => void;
  dnsInfo?: { label: string; onUndo: () => void };
}) {
  const confirm = useConfirm();
  const [draftDate, setDraftDate] = useState(todayISO());
  const [draftContact, setDraftContact] = useState("");
  const [draftType, setDraftType] = useState<CrmActivityType | "">("");
  const [draftOutcome, setDraftOutcome] = useState<CrmOutcome | "">("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftNextAction, setDraftNextAction] = useState("");
  const [draftNextFollowUp, setDraftNextFollowUp] = useState("");
  const [draftOwner, setDraftOwner] = useState("");
  const [logging, setLogging] = useState(false);

  async function handleLogActivity() {
    setLogging(true);
    try {
      await onAddActivity({
        activity_date: draftDate,
        contact_person: draftContact || null,
        activity_type: draftType || null,
        outcome: draftOutcome || null,
        notes: draftNotes || null,
        next_action: draftNextAction || null,
        next_follow_up: draftNextFollowUp || null,
        owner: draftOwner || null,
      });
      setDraftContact("");
      setDraftType("");
      setDraftOutcome("");
      setDraftNotes("");
      setDraftNextAction("");
      setDraftNextFollowUp("");
      setDraftOwner("");
    } finally {
      setLogging(false);
    }
  }

  async function handleDeleteActivity(id: string) {
    if (!(await confirm("Delete this activity entry?"))) return;
    onDeleteActivity(id);
  }

  return (
    <div className="rounded-lg border border-black/10 px-3 py-2 shadow-sm dark:border-white/10">
      <div className="flex flex-wrap items-center gap-3">
        {!landedInfo && !dnsInfo && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 shrink-0"
          />
        )}
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="min-w-0 truncate">
            <span className="font-medium">{company.name}</span>
            {company.city_state && (
              <span className="ml-2 text-sm font-normal text-black/50 dark:text-white/50">{company.city_state}</span>
            )}
          </span>
        </button>

        <span className="flex shrink-0 flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[company.crm_status]}`}>
            {STATUS_LABEL.get(company.crm_status)}
          </span>
          {company.priority && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_BADGE[company.priority]}`}>
              {company.priority === "high" ? "High Priority" : company.priority === "medium" ? "Medium Priority" : "Low Priority"}
            </span>
          )}
        </span>

        {landedInfo || dnsInfo ? (
          (() => {
            const info = (landedInfo ?? dnsInfo) as { label: string; onUndo: () => void };
            return (
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <span className={`font-medium ${landedInfo ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  {info.label}
                </span>
                <button onClick={info.onUndo} className="font-medium text-black/50 hover:underline dark:text-white/50">
                  Undo
                </button>
              </span>
            );
          })()
        ) : (
          <>
            {company.assigned_to === null && (
              <select
                value={company.bucket_id ?? ""}
                onChange={(e) => onSetBucket(e.target.value || null)}
                className="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
              >
                <option value="">General</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={company.assigned_to ?? ""}
              onChange={(e) => onAssign(e.target.value || null)}
              className="shrink-0 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
            >
              <option value="">Unassigned</option>
              {isAdminOrExec
                ? assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {displayNameForEmail(u.email)}
                    </option>
                  ))
                : (
                    <option value={currentUserId}>Me</option>
                  )}
            </select>
          </>
        )}
      </div>

      {expanded && (
        <div className="mt-3 space-y-4 border-t border-black/10 pt-3 dark:border-white/10">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-medium">
              Company
              <input defaultValue={company.name} onBlur={(e) => onSave({ name: e.target.value })} className={`${field} mt-1`} />
            </label>
            <label className="text-xs font-medium">
              Legal / Alternate Name
              <input
                defaultValue={company.legal_name ?? ""}
                onBlur={(e) => onSave({ legal_name: e.target.value || null })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-xs font-medium">
              City / State
              <input
                defaultValue={company.city_state ?? ""}
                onBlur={(e) => onSave({ city_state: e.target.value || null })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-xs font-medium">
              Phone
              <input
                defaultValue={company.phone ?? ""}
                onBlur={(e) => onSave({ phone: e.target.value || null })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-xs font-medium">
              Primary Contact
              <input
                defaultValue={company.primary_contact ?? ""}
                onBlur={(e) => onSave({ primary_contact: e.target.value || null })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-xs font-medium">
              Email
              <input
                defaultValue={company.email ?? ""}
                onBlur={(e) => onSave({ email: e.target.value || null })}
                className={`${field} mt-1`}
              />
            </label>
            <label className="text-xs font-medium">
              CRM Status
              <select
                value={company.crm_status}
                onChange={(e) => onSave({ crm_status: e.target.value as CrmStatus })}
                className={`${field} mt-1`}
              >
                {CRM_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Priority
              <select
                value={company.priority ?? ""}
                onChange={(e) => onSave({ priority: (e.target.value || null) as CrmPriority | null })}
                className={`${field} mt-1`}
              >
                <option value="">--</option>
                {CRM_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium sm:col-span-2 lg:col-span-1">
              Blue Book Info
              <p className="mt-1 rounded border border-gray-200 bg-black/5 px-2 py-1 text-sm dark:border-white/10 dark:bg-white/5">
                {company.blue_book_id ? `#${company.blue_book_id}` : "No Blue Book ID"}
                {company.location_type ? ` · ${company.location_type}` : ""}
                {company.classification ? ` · ${company.classification}` : ""}
                {company.score !== null ? ` · Score ${company.score}` : ""}
                {company.rating !== null ? ` · Rating ${company.rating}` : ""}
                {company.source_status ? ` · ${company.source_status}` : ""}
                {company.profile_url && /^https?:\/\//i.test(company.profile_url) && (
                  <>
                    {" · "}
                    <a href={company.profile_url} target="_blank" rel="noreferrer" className="underline">
                      Profile
                    </a>
                  </>
                )}
              </p>
            </label>
            <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">
              CRM Notes
              <textarea
                defaultValue={company.notes ?? ""}
                onBlur={(e) => onSave({ notes: e.target.value || null })}
                rows={2}
                className={`${field} mt-1`}
              />
            </label>
          </div>

          <div className="space-y-2 rounded-md bg-black/5 p-3 dark:bg-white/5">
            <h3 className="text-xs font-bold text-green-700 dark:text-green-400">Activity Log</h3>
            {activities.length === 0 && <p className="text-xs text-black/40 dark:text-white/40">No activity logged yet.</p>}
            {activities.map((a) => (
              <div key={a.id} className="rounded border border-black/10 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-neutral-900">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {formatShortDate(a.activity_date)}
                    {a.activity_type && ` · ${ACTIVITY_TYPE_LABEL.get(a.activity_type)}`}
                    {a.outcome && ` · ${OUTCOME_LABEL.get(a.outcome)}`}
                  </span>
                  <button onClick={() => handleDeleteActivity(a.id)} className="text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
                {a.contact_person && <p className="mt-0.5 text-black/60 dark:text-white/60">With: {a.contact_person}</p>}
                {a.notes && <p className="mt-0.5">{a.notes}</p>}
                {(a.next_action || a.next_follow_up) && (
                  <p className="mt-0.5 text-black/60 dark:text-white/60">
                    Next: {a.next_action}
                    {a.next_follow_up ? ` (by ${formatShortDate(a.next_follow_up)})` : ""}
                  </p>
                )}
                {a.owner && <p className="mt-0.5 text-black/40 dark:text-white/40">Owner: {a.owner}</p>}
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <select
                    value={a.activity_type ?? ""}
                    onChange={(e) => onUpdateActivity(a.id, { activity_type: (e.target.value || null) as CrmActivityType | null })}
                    className="rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px] text-black"
                  >
                    <option value="">Type: --</option>
                    {CRM_ACTIVITY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={a.outcome ?? ""}
                    onChange={(e) => onUpdateActivity(a.id, { outcome: (e.target.value || null) as CrmOutcome | null })}
                    className="rounded border border-gray-300 bg-white px-1 py-0.5 text-[11px] text-black"
                  >
                    <option value="">Outcome: --</option>
                    {CRM_OUTCOMES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4">
              <label className="text-[11px] font-medium">
                Date
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
                />
              </label>
              <label className="text-[11px] font-medium">
                Contact
                <input
                  value={draftContact}
                  onChange={(e) => setDraftContact(e.target.value)}
                  className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
                />
              </label>
              <label className="text-[11px] font-medium">
                Type
                <select
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value as CrmActivityType | "")}
                  className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
                >
                  <option value="">--</option>
                  {CRM_ACTIVITY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-medium">
                Outcome
                <select
                  value={draftOutcome}
                  onChange={(e) => setDraftOutcome(e.target.value as CrmOutcome | "")}
                  className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
                >
                  <option value="">--</option>
                  {CRM_OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-[11px] font-medium sm:col-span-4">
                Notes
                <input
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
                />
              </label>
              <label className="text-[11px] font-medium">
                Next Action
                <input
                  value={draftNextAction}
                  onChange={(e) => setDraftNextAction(e.target.value)}
                  className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
                />
              </label>
              <label className="text-[11px] font-medium">
                Follow-Up By
                <input
                  type="date"
                  value={draftNextFollowUp}
                  onChange={(e) => setDraftNextFollowUp(e.target.value)}
                  className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
                />
              </label>
              <label className="text-[11px] font-medium">
                Owner
                <input
                  value={draftOwner}
                  onChange={(e) => setDraftOwner(e.target.value)}
                  className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black"
                />
              </label>
            </div>
            <button
              onClick={handleLogActivity}
              disabled={logging}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {logging ? "Logging..." : "Log Activity"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onMarkLanded && (
              <button
                onClick={onMarkLanded}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              >
                Mark as Landed - Full Setup, PO Pulled
              </button>
            )}
            {onMarkDns && (
              <button
                onClick={onMarkDns}
                className="rounded-md border border-red-600 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                DNS - Do Not Sell
              </button>
            )}
            <button onClick={onDelete} className="text-xs font-medium text-red-600 hover:underline">
              Delete Company
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type CrmView =
  | { kind: "bucket"; bucketId: string | null }
  | { kind: "mine" }
  | { kind: "all" }
  | { kind: "completed" }
  | { kind: "dns" };

export default function CrmCompaniesClient({
  initialCompanies,
  initialActivities,
  initialBuckets,
  assignableUsers,
  currentUserId,
  currentUserRole,
}: {
  initialCompanies: CrmCompany[];
  initialActivities: CrmActivity[];
  initialBuckets: CrmBucket[];
  assignableUsers: AssignableUser[];
  currentUserId: string;
  currentUserRole: Role | null;
}) {
  const confirm = useConfirm();
  const isAdminOrExec = currentUserRole === "admin" || currentUserRole === "executive";
  const nameById = useMemo(() => new Map(assignableUsers.map((u) => [u.id, displayNameForEmail(u.email)])), [assignableUsers]);
  const [companies, setCompanies] = useState(initialCompanies);
  const [activities, setActivities] = useState(initialActivities);
  const [buckets, setBuckets] = useState(initialBuckets);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkMoving, setBulkMoving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CrmStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "city">("name");
  const [view, setView] = useState<CrmView>({ kind: "bucket", bucketId: null });
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [creatingBucket, setCreatingBucket] = useState(false);

  const [newCompanyName, setNewCompanyName] = useState("");
  const [addingCompany, setAddingCompany] = useState(false);

  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedCrmCompanyRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const activitiesByCompany = useMemo(() => {
    const map = new Map<string, CrmActivity[]>();
    for (const a of activities) {
      const list = map.get(a.company_id) ?? [];
      list.push(a);
      map.set(a.company_id, list);
    }
    return map;
  }, [activities]);

  function matchesSearchStatus(c: CrmCompany): boolean {
    if (statusFilter !== "all" && c.crm_status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.city_state ?? "").toLowerCase().includes(q) ||
      (c.blue_book_id ?? "").toLowerCase().includes(q) ||
      (c.primary_contact ?? "").toLowerCase().includes(q)
    );
  }

  function sortCompanies(list: CrmCompany[]): CrmCompany[] {
    return [...list].sort((a, b) =>
      sortBy === "city"
        ? (a.city_state ?? "").localeCompare(b.city_state ?? "") || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  }

  const unassignedCompanies = useMemo(() => companies.filter((c) => c.assigned_to === null), [companies]);
  const mineCompanies = useMemo(
    () => companies.filter((c) => c.assigned_to === currentUserId && c.landed_at === null && c.dns_at === null),
    [companies, currentUserId],
  );
  const landedCompanies = useMemo(
    () => [...companies.filter((c) => c.landed_at !== null)].sort((a, b) => (b.landed_at ?? "").localeCompare(a.landed_at ?? "")),
    [companies],
  );
  const dnsCompanies = useMemo(
    () => [...companies.filter((c) => c.dns_at !== null)].sort((a, b) => (b.dns_at ?? "").localeCompare(a.dns_at ?? "")),
    [companies],
  );
  const assignedCount = companies.filter(
    (c) => c.assigned_to !== null && c.landed_at === null && c.dns_at === null,
  ).length;

  function bucketCount(bucketId: string | null): number {
    return unassignedCompanies.filter((c) => c.bucket_id === bucketId).length;
  }

  function markLandedEligible(c: CrmCompany): boolean {
    return (
      c.assigned_to !== null && c.landed_at === null && c.dns_at === null && (isAdminOrExec || c.assigned_to === currentUserId)
    );
  }

  function markDnsEligible(c: CrmCompany): boolean {
    return (
      c.assigned_to !== null && c.landed_at === null && c.dns_at === null && (isAdminOrExec || c.assigned_to === currentUserId)
    );
  }

  function landedInfoFor(c: CrmCompany): { label: string; onUndo: () => void } | undefined {
    if (!c.landed_at) return undefined;
    const name = c.landed_by ? (nameById.get(c.landed_by) ?? "Someone") : "Someone";
    return { label: `Landed by ${name} on ${formatShortDateTime(c.landed_at)}`, onUndo: () => handleUndoLanded(c.id) };
  }

  function dnsInfoFor(c: CrmCompany): { label: string; onUndo: () => void } | undefined {
    if (!c.dns_at) return undefined;
    const name = c.dns_by ? (nameById.get(c.dns_by) ?? "Someone") : "Someone";
    return { label: `DNS by ${name} on ${formatShortDateTime(c.dns_at)}`, onUndo: () => handleUndoDns(c.id) };
  }

  const filteredCompanies = useMemo(() => {
    const source =
      view.kind === "bucket"
        ? unassignedCompanies.filter((c) => c.bucket_id === view.bucketId)
        : view.kind === "mine"
          ? mineCompanies
          : view.kind === "completed"
            ? landedCompanies
            : view.kind === "dns"
              ? dnsCompanies
              : [];
    return sortCompanies(source.filter(matchesSearchStatus));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unassignedCompanies, mineCompanies, landedCompanies, dnsCompanies, view, search, statusFilter, sortBy]);

  const allPipelineGroups = useMemo(() => {
    if (view.kind !== "all") return [];
    const byUser = new Map<string, CrmCompany[]>();
    for (const c of companies) {
      if (!c.assigned_to || c.landed_at !== null || c.dns_at !== null) continue;
      const list = byUser.get(c.assigned_to) ?? [];
      list.push(c);
      byUser.set(c.assigned_to, list);
    }
    return [...byUser.entries()]
      .map(([userId, list]) => ({
        userId,
        name: nameById.get(userId) ?? "Unknown",
        companies: sortCompanies(list.filter(matchesSearchStatus)),
      }))
      .filter((g) => g.companies.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, view, nameById, search, statusFilter, sortBy]);

  const statusCounts = useMemo(() => {
    const counts = new Map<CrmStatus, number>();
    for (const c of companies) counts.set(c.crm_status, (counts.get(c.crm_status) ?? 0) + 1);
    return counts;
  }, [companies]);

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave(id: string, patch: Partial<CrmCompany>) {
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    updateCrmCompany(id, patch).catch(() => {});
  }

  async function handleAssign(id: string, userId: string | null) {
    const prevCompanies = companies;
    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, assigned_to: userId, assigned_at: userId ? new Date().toISOString() : null } : c)),
    );
    try {
      await assignCrmCompany(id, userId);
    } catch (e) {
      setCompanies(prevCompanies);
      alert(e instanceof Error ? e.message : "Couldn't update the assignment.");
    }
  }

  async function handleMarkLanded(company: CrmCompany) {
    if (!(await confirm(`Mark "${company.name}" as landed? This moves it to the Completed list (Admin/Exec only).`))) return;
    const prevCompanies = companies;
    const now = new Date().toISOString();
    setCompanies((prev) =>
      prev.map((c) => (c.id === company.id ? { ...c, landed_at: now, landed_by: currentUserId, crm_status: "customer" } : c)),
    );
    try {
      await markCompanyLanded(company.id);
    } catch (e) {
      setCompanies(prevCompanies);
      alert(e instanceof Error ? e.message : "Couldn't mark this company landed.");
    }
  }

  async function handleUndoLanded(id: string) {
    const prevCompanies = companies;
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, landed_at: null, landed_by: null } : c)));
    try {
      await undoCompanyLanded(id);
    } catch (e) {
      setCompanies(prevCompanies);
      alert(e instanceof Error ? e.message : "Couldn't undo this.");
    }
  }

  async function handleMarkDns(company: CrmCompany) {
    if (!(await confirm(`Mark "${company.name}" Do Not Sell? This moves it to the DNS list (Admin/Exec only).`))) return;
    const prevCompanies = companies;
    const now = new Date().toISOString();
    setCompanies((prev) =>
      prev.map((c) => (c.id === company.id ? { ...c, dns_at: now, dns_by: currentUserId, crm_status: "do_not_contact" } : c)),
    );
    try {
      await markCompanyDns(company.id);
    } catch (e) {
      setCompanies(prevCompanies);
      alert(e instanceof Error ? e.message : "Couldn't mark this company Do Not Sell.");
    }
  }

  async function handleUndoDns(id: string) {
    const prevCompanies = companies;
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, dns_at: null, dns_by: null } : c)));
    try {
      await undoCompanyDns(id);
    } catch (e) {
      setCompanies(prevCompanies);
      alert(e instanceof Error ? e.message : "Couldn't undo this.");
    }
  }

  function handleSetBucket(id: string, bucketId: string | null) {
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, bucket_id: bucketId } : c)));
    updateCrmCompany(id, { bucket_id: bucketId }).catch(() => {});
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  // A bucket target both files the company under that bucket and drops any
  // pipeline claim, so it actually shows up there - a pipeline target is
  // just the same single-row assign, applied to every selected company.
  async function handleBulkMove() {
    const ids = [...selectedIds];
    if (ids.length === 0 || !bulkTarget) return;
    setBulkMoving(true);
    try {
      if (bulkTarget.startsWith("bucket:")) {
        const bucketId = bulkTarget.slice("bucket:".length) || null;
        setCompanies((prev) =>
          prev.map((c) => (ids.includes(c.id) ? { ...c, bucket_id: bucketId, assigned_to: null, assigned_at: null } : c)),
        );
        await Promise.all(ids.flatMap((id) => [updateCrmCompany(id, { bucket_id: bucketId }), assignCrmCompany(id, null)]));
      } else if (bulkTarget.startsWith("user:")) {
        const userId = bulkTarget.slice("user:".length);
        setCompanies((prev) =>
          prev.map((c) => (ids.includes(c.id) ? { ...c, assigned_to: userId, assigned_at: new Date().toISOString() } : c)),
        );
        await Promise.all(ids.map((id) => assignCrmCompany(id, userId)));
      }
      setSelectedIds(new Set());
      setBulkTarget("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't move some of the selected companies.");
    } finally {
      setBulkMoving(false);
    }
  }

  async function handleCreateBucket() {
    const name = newBucketName.trim();
    if (!name) return;
    setCreatingBucket(true);
    try {
      const row = (await createCrmBucket(name)) as CrmBucket;
      setBuckets((prev) => [...prev, row]);
      setNewBucketName("");
      setShowNewBucket(false);
      setView({ kind: "bucket", bucketId: row.id });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't create the bucket.");
    } finally {
      setCreatingBucket(false);
    }
  }

  async function handleDeleteBucket(id: string) {
    const bucket = buckets.find((b) => b.id === id);
    if (!(await confirm(`Delete "${bucket?.name ?? "this bucket"}"? Its companies return to the General Bucket.`))) return;
    setBuckets((prev) => prev.filter((b) => b.id !== id));
    setCompanies((prev) => prev.map((c) => (c.bucket_id === id ? { ...c, bucket_id: null } : c)));
    setView({ kind: "bucket", bucketId: null });
    await deleteCrmBucket(id).catch(() => {});
  }

  async function handleDelete(id: string, name: string) {
    if (!(await confirm(`Delete "${name}"? This also removes its activity log.`))) return;
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    setActivities((prev) => prev.filter((a) => a.company_id !== id));
    await deleteCrmCompany(id).catch(() => {});
  }

  async function handleAddCompany() {
    const name = newCompanyName.trim();
    if (!name) return;
    setAddingCompany(true);
    try {
      const row = (await createCrmCompany(name)) as CrmCompany;
      setCompanies((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCompanyName("");
      setExpandedIds((prev) => new Set(prev).add(row.id));
    } catch {
      alert(`Couldn't add "${name}" - a company with that name may already exist.`);
    } finally {
      setAddingCompany(false);
    }
  }

  async function handleAddActivity(companyId: string, input: Parameters<typeof addCrmActivity>[1]) {
    const row = (await addCrmActivity(companyId, input)) as CrmActivity;
    setActivities((prev) => [row, ...prev]);
  }

  function handleUpdateActivity(id: string, patch: Partial<CrmActivity>) {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    updateCrmActivity(id, patch).catch(() => {});
  }

  function handleDeleteActivity(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id));
    deleteCrmActivity(id).catch(() => {});
  }

  function handlePreview() {
    const result = parseCrmCompaniesText(pasteText);
    if (result.error) {
      setParseError(result.error);
      setPreviewRows(null);
      return;
    }
    setParseError(null);
    setPreviewRows(result.rows);
  }

  function handleCancelPreview() {
    setPreviewRows(null);
    setParseError(null);
  }

  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      const inserted = (await importCrmCompanies(previewRows)) as CrmCompany[];
      setCompanies((prev) => [...prev, ...inserted].sort((a, b) => a.name.localeCompare(b.name)));
      setPreviewRows(null);
      setPasteText("");
      setShowPaste(false);
    } finally {
      setImporting(false);
    }
  }

  const visibleIds =
    view.kind === "all" ? allPipelineGroups.flatMap((g) => g.companies.map((c) => c.id)) : filteredCompanies.map((c) => c.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">CRM - Companies</h1>
        <button
          onClick={() => setShowPaste((s) => !s)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          {showPaste ? "Hide paste box" : "Paste from Excel"}
        </button>
      </div>

      {showPaste && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <p className="text-xs text-black/50 dark:text-white/50">
            Paste rows copied from the &quot;Companies&quot; sheet (header row included or not) - Blue Book ID, Company, Legal /
            Alternate Name, City / State, Location Type, Phone, Classification, Score, Rating, Source Status, Profile URL, CRM
            Status, Primary Contact, Email, CRM Notes.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setPreviewRows(null);
              setParseError(null);
            }}
            rows={6}
            placeholder="Paste the Companies sheet rows here..."
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
          />
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}

          {!previewRows && (
            <button
              onClick={handlePreview}
              disabled={pasteText.trim() === ""}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Preview
            </button>
          )}

          {previewRows && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Found {previewRows.length} row{previewRows.length === 1 ? "" : "s"} (already-imported companies are skipped
                automatically).
              </p>
              <div className="max-h-64 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-1">Blue Book ID</th>
                      <th className="px-2 py-1">Company</th>
                      <th className="px-2 py-1">City / State</th>
                      <th className="px-2 py-1">Phone</th>
                      <th className="px-2 py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-2 py-1">{r.blueBookId}</td>
                        <td className="px-2 py-1">{r.name}</td>
                        <td className="px-2 py-1">{r.cityState}</td>
                        <td className="px-2 py-1">{r.phone}</td>
                        <td className="px-2 py-1">{STATUS_LABEL.get(r.crmStatus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmImport}
                  disabled={importing}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {importing ? "Adding..." : `Add ${previewRows.length} Row${previewRows.length === 1 ? "" : "s"}`}
                </button>
                <button
                  onClick={handleCancelPreview}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newCompanyName}
          onChange={(e) => setNewCompanyName(e.target.value)}
          placeholder="Add a company..."
          className={`${field} max-w-xs`}
        />
        <button
          onClick={handleAddCompany}
          disabled={addingCompany || newCompanyName.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {addingCompany ? "Adding..." : "+ Add Company"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={() => setView({ kind: "bucket", bucketId: null })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            view.kind === "bucket" && view.bucketId === null
              ? "bg-green-600 text-white"
              : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
          }`}
        >
          General ({bucketCount(null)})
        </button>
        {buckets.map((b) => (
          <button
            key={b.id}
            onClick={() => setView({ kind: "bucket", bucketId: b.id })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              view.kind === "bucket" && view.bucketId === b.id
                ? "bg-green-600 text-white"
                : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
            }`}
          >
            {b.name} ({bucketCount(b.id)})
          </button>
        ))}
        <button
          onClick={() => setView({ kind: "mine" })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            view.kind === "mine"
              ? "bg-green-600 text-white"
              : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
          }`}
        >
          My Pipeline ({mineCompanies.length})
        </button>
        {isAdminOrExec && (
          <button
            onClick={() => setView({ kind: "all" })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              view.kind === "all"
                ? "bg-green-600 text-white"
                : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
            }`}
          >
            All Pipelines ({assignedCount})
          </button>
        )}
        {isAdminOrExec && (
          <button
            onClick={() => setView({ kind: "completed" })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              view.kind === "completed"
                ? "bg-green-600 text-white"
                : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
            }`}
          >
            Completed ({landedCompanies.length})
          </button>
        )}
        {isAdminOrExec && (
          <button
            onClick={() => setView({ kind: "dns" })}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              view.kind === "dns"
                ? "bg-red-600 text-white"
                : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
            }`}
          >
            DNS ({dnsCompanies.length})
          </button>
        )}
        {isAdminOrExec && (
          <button
            onClick={() => setShowNewBucket((s) => !s)}
            className="rounded-full border border-dashed border-black/30 px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:border-white/30 dark:text-white/60 dark:hover:bg-white/10"
          >
            {showNewBucket ? "Cancel" : "+ New Bucket"}
          </button>
        )}
      </div>

      {showNewBucket && isAdminOrExec && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newBucketName}
            onChange={(e) => setNewBucketName(e.target.value)}
            placeholder="Bucket name (e.g. Priority Customers)"
            className={`${field} max-w-xs`}
          />
          <button
            onClick={handleCreateBucket}
            disabled={creatingBucket || newBucketName.trim() === ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {creatingBucket ? "Creating..." : "Create Bucket"}
          </button>
        </div>
      )}

      {isAdminOrExec && view.kind === "bucket" && view.bucketId !== null && (
        <button onClick={() => handleDeleteBucket(view.bucketId!)} className="text-xs font-medium text-red-600 hover:underline">
          Delete this bucket (companies return to General)
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, city, contact, Blue Book ID..."
          className={`${field} max-w-xs bg-white`}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "name" | "city")}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black"
        >
          <option value="name">Sort: Name</option>
          <option value="city">Sort: City</option>
        </select>
        {view.kind !== "completed" && view.kind !== "dns" && (
          <label className="flex items-center gap-1.5 text-xs text-black/60 dark:text-white/60">
            <input
              type="checkbox"
              checked={visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))}
              onChange={() => selectAllVisible(visibleIds)}
              className="h-3.5 w-3.5"
            />
            Select all
          </label>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              statusFilter === "all"
                ? "bg-green-600 text-white"
                : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
            }`}
          >
            All ({companies.length})
          </button>
          {CRM_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                statusFilter === s.value
                  ? "bg-green-600 text-white"
                  : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
              }`}
            >
              {s.label} ({statusCounts.get(s.value) ?? 0})
            </button>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && view.kind !== "completed" && view.kind !== "dns" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-green-600/40 bg-green-50 px-3 py-2 text-sm dark:border-green-500/30 dark:bg-green-950/20">
          <span className="font-medium">{selectedIds.size} selected</span>
          <select
            value={bulkTarget}
            onChange={(e) => setBulkTarget(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black"
          >
            <option value="">Move to...</option>
            <optgroup label="Bucket">
              <option value="bucket:">General</option>
              {buckets.map((b) => (
                <option key={b.id} value={`bucket:${b.id}`}>
                  {b.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Pipeline">
              {isAdminOrExec ? (
                assignableUsers.map((u) => (
                  <option key={u.id} value={`user:${u.id}`}>
                    {displayNameForEmail(u.email)}
                  </option>
                ))
              ) : (
                <option value={`user:${currentUserId}`}>Me</option>
              )}
            </optgroup>
          </select>
          <button
            onClick={handleBulkMove}
            disabled={bulkMoving || !bulkTarget}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {bulkMoving ? "Moving..." : "Move"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-medium text-black/60 hover:underline dark:text-white/60"
          >
            Clear selection
          </button>
        </div>
      )}

      {view.kind === "all" ? (
        <div className="space-y-6">
          {allPipelineGroups.map((g) => (
            <div key={g.userId} className="space-y-3">
              <h2 className="text-lg font-bold text-green-700 dark:text-green-400">
                {g.name} Pipeline ({g.companies.length})
              </h2>
              <div className="flex flex-col gap-2">
                {g.companies.map((c) => (
                  <CompanyCard
                    key={c.id}
                    company={c}
                    activities={activitiesByCompany.get(c.id) ?? []}
                    expanded={expandedIds.has(c.id)}
                    onToggle={() => toggle(c.id)}
                    onSave={(patch) => handleSave(c.id, patch)}
                    onDelete={() => handleDelete(c.id, c.name)}
                    onAddActivity={(input) => handleAddActivity(c.id, input)}
                    onUpdateActivity={handleUpdateActivity}
                    onDeleteActivity={handleDeleteActivity}
                    isAdminOrExec={isAdminOrExec}
                    assignableUsers={assignableUsers}
                    currentUserId={currentUserId}
                    onAssign={(userId) => handleAssign(c.id, userId)}
                    buckets={buckets}
                    onSetBucket={(bucketId) => handleSetBucket(c.id, bucketId)}
                    selected={selectedIds.has(c.id)}
                    onToggleSelect={() => toggleSelect(c.id)}
                    onMarkLanded={markLandedEligible(c) ? () => handleMarkLanded(c) : undefined}
                    landedInfo={landedInfoFor(c)}
                    onMarkDns={markDnsEligible(c) ? () => handleMarkDns(c) : undefined}
                    dnsInfo={dnsInfoFor(c)}
                  />
                ))}
              </div>
            </div>
          ))}
          {allPipelineGroups.length === 0 && (
            <p className="px-1 text-sm text-black/40 dark:text-white/40">No companies have been assigned to a pipeline yet.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredCompanies.map((c) => (
            <CompanyCard
              key={c.id}
              company={c}
              activities={activitiesByCompany.get(c.id) ?? []}
              expanded={expandedIds.has(c.id)}
              onToggle={() => toggle(c.id)}
              onSave={(patch) => handleSave(c.id, patch)}
              onDelete={() => handleDelete(c.id, c.name)}
              onAddActivity={(input) => handleAddActivity(c.id, input)}
              onUpdateActivity={handleUpdateActivity}
              onDeleteActivity={handleDeleteActivity}
              isAdminOrExec={isAdminOrExec}
              assignableUsers={assignableUsers}
              currentUserId={currentUserId}
              onAssign={(userId) => handleAssign(c.id, userId)}
              buckets={buckets}
              onSetBucket={(bucketId) => handleSetBucket(c.id, bucketId)}
              selected={selectedIds.has(c.id)}
              onToggleSelect={() => toggleSelect(c.id)}
              onMarkLanded={markLandedEligible(c) ? () => handleMarkLanded(c) : undefined}
              landedInfo={landedInfoFor(c)}
              onMarkDns={markDnsEligible(c) ? () => handleMarkDns(c) : undefined}
              dnsInfo={dnsInfoFor(c)}
            />
          ))}
          {filteredCompanies.length === 0 && (
            <p className="px-1 text-sm text-black/40 dark:text-white/40">
              {view.kind === "mine"
                ? "Nothing in your pipeline yet - claim one from a bucket."
                : view.kind === "completed"
                  ? "Nothing landed yet."
                  : view.kind === "dns"
                    ? "Nothing marked Do Not Sell yet."
                    : "No companies match - add one above or adjust your filters."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
