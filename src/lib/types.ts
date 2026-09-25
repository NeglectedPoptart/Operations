import type { Role } from "@/lib/roles";

export type LoadStatus = "pending_to_load" | "on_the_road" | "complete";

export const LOAD_STATUSES: { value: LoadStatus; label: string }[] = [
  { value: "pending_to_load", label: "Pending to Load" },
  { value: "on_the_road", label: "On the Road" },
  { value: "complete", label: "Complete Load" },
];

export type BrokerCategory = "otr" | "local" | "ltl";

export const BROKER_CATEGORIES: { value: BrokerCategory; label: string }[] = [
  { value: "otr", label: "OTR" },
  { value: "local", label: "Local" },
  { value: "ltl", label: "LTL" },
];

export interface Broker {
  id: string;
  name: string;
  request_statement: boolean;
  position: number;
  last_activity_at: string | null;
  // Backend-only categorization - Local and LTL brokers are excluded from
  // the Freight Rates page (Broker Tracker + Route Averages) since neither
  // belongs in long-haul lane pricing, but changes nothing else (Invoicing,
  // Board's carrier picker, etc. still show them same as any OTR broker).
  category: BrokerCategory;
  // "Not actively using this company" - kept (never deleted) so its history
  // stays intact and it's a click away from coming back, but greyed out and
  // moved to its own section on the Invoicing tile list, and left out of the
  // broker picker when creating a new load.
  active: boolean;
  // The last time the Statement Checker was actually run against this
  // carrier - separate from last_activity_at, which only bumps on a
  // Done/note event, not just running a check.
  last_statement_checked_at: string | null;
}

// Logistics: Invoicing ---------------------------------------------------

export type InvoiceStatus = "pending" | "done";

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "done", label: "Done" },
];

export interface InvoiceStatement {
  id: string;
  broker_id: string;
  invoice_no: string;
  invoice_date: string | null;
  customer_po: string | null;
  amount: number | null;
  status: InvoiceStatus | null;
  notes: string | null;
  flagged: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lane {
  id: string;
  from_hub: string;
  destination: string;
  position: number | null;
}

export interface Hub {
  id: string;
  name: string;
}

export interface DestinationCity {
  id: string;
  city: string;
  state: string;
}

export interface LoadStop {
  id: string;
  load_id: string;
  position: number;
  order_number: string | null;
  po_number: string | null;
  client_name: string | null;
  destination_city: string | null;
  destination_state: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  // Either a real appointment time/reference, or the literal "FCFS" - a stop
  // with neither is flagged as missing an appointment.
  appointment: string | null;
}

// An extra pickup beyond the load's primary one (loads.source is always the
// truck's originating hub/pickup) - e.g. a second grower's warehouse the
// same truck stops at before crossing to deliver.
export interface LoadPickup {
  id: string;
  load_id: string;
  position: number;
  pu_number: string | null;
  vendor: string | null;
  location: string | null;
}

// A short display label for pairing UI (Mexico Arrivals' Load dropdown) that
// doesn't need the full Load shape (stops, pickups, broker, etc.).
export interface LoadOption {
  id: string;
  label: string;
}

export interface Load {
  id: string;
  loading_date: string | null;
  source: string | null;
  status: LoadStatus;
  rate: number | null;
  broker_id: string | null;
  brokers: Broker | null;
  notes: string | null;
  eta_note: string | null;
  ready_to_load: boolean;
  rate_con_sent: boolean;
  created_at: string;
  updated_at: string;
  load_stops: LoadStop[];
  load_pickups: LoadPickup[];
}

export interface BrokerRateEntry {
  id: string;
  lane_id: string;
  broker_id: string;
  week_start_date: string;
  rate: number | null;
  updated_at: string;
}

export interface RateSubmission {
  id: string;
  week_start_date: string;
  submitted_by: string;
  submitted_at: string;
}

export type AmHoldoverStatus = "pending_inbound" | "pending_changes" | "cancelled";

export const AM_HOLDOVER_STATUSES: { value: AmHoldoverStatus; label: string }[] = [
  { value: "pending_inbound", label: "Pending Inbound" },
  { value: "pending_changes", label: "Pending Changes" },
  { value: "cancelled", label: "Cancelled" },
];

export interface AmHoldover {
  id: string;
  entry_date: string;
  position: number;
  po_lot_number: string | null;
  customer_name: string | null;
  status: AmHoldoverStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Warehouse: Local Inbounds -----------------------------------------------------

export type LocalInboundStatus = "pending" | "loading_direct" | "arrived";

export interface LocalInbound {
  id: string;
  entry_date: string;
  position: number;
  po: string | null;
  pu_info: string | null;
  vendor: string | null;
  loading_warehouse: string | null;
  eta: string | null;
  notes: string | null;
  status: LocalInboundStatus;
  created_at: string;
  updated_at: string;
}

// Warehouse: Cold Inventory -----------------------------------------------------

export type ColdInventoryStatus = "good" | "issue" | "dump";

export const COLD_INVENTORY_STATUSES: { value: ColdInventoryStatus; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "issue", label: "Issue" },
  { value: "dump", label: "Dump" },
];

export interface ColdInventoryItem {
  id: string;
  manifest: string;
  commodity: string;
  size: string;
  qty: number;
  manifest_order: number;
  column_order: number;
  status: ColdInventoryStatus | null;
  notes: string | null;
  carried_over: boolean;
  created_at: string;
  updated_at: string;
}

// Warehouse: Repack Inventory -----------------------------------------------------

export interface RepackItem {
  id: string;
  position: number;
  name: string;
  initial_stock: number;
  current_stock: number;
  created_at: string;
  updated_at: string;
}

// qty is signed: negative = used by a repack, positive = restocked/corrected.
export interface RepackAdjustment {
  id: string;
  item_id: string;
  entry_date: string;
  qty: number;
  notes: string | null;
  created_at: string;
}

export type OldAgeNextStep = "pending_qc" | "cash_sale" | "repack" | "as_is" | "dump_donate" | "moved" | "partial_moved";

export const OLD_AGE_NEXT_STEPS: { value: OldAgeNextStep; label: string }[] = [
  { value: "pending_qc", label: "Pending QC" },
  { value: "cash_sale", label: "Cash Sale" },
  { value: "repack", label: "Repack" },
  { value: "as_is", label: "As Is" },
  { value: "dump_donate", label: "Dump/Donate" },
  { value: "moved", label: "Moved" },
  { value: "partial_moved", label: "Partial Moved" },
];

export interface OldAgeItem {
  id: string;
  position: number;
  document: string | null;
  received_date: string | null;
  description: string | null;
  pack_style: string | null;
  size: string | null;
  qty: number | null;
  age: number | null;
  next_step: OldAgeNextStep | null;
  notes: string | null;
  cash_list: boolean;
  cash_price: number | null;
  qc_needed: boolean;
  // Running total moved out so far - kept in sync from old_age_moves by a
  // trigger, same as Repack Inventory's current_stock.
  qty_moved: number;
  created_at: string;
  updated_at: string;
}

// qty is signed the same way as RepackAdjustment: positive = moved out,
// negative = a correction/reversal. order_reference is the order/PO this
// portion is going toward.
export interface OldAgeMove {
  id: string;
  item_id: string;
  entry_date: string;
  order_reference: string | null;
  qty: number;
  notes: string | null;
  created_at: string;
}

// Management: Workflow ------------------------------------------------------

export type WorkflowSection = "morning_early_afternoon" | "afternoon_early_evening";

export const WORKFLOW_SECTIONS: { value: WorkflowSection; label: string }[] = [
  { value: "morning_early_afternoon", label: "Morning/Early Afternoon" },
  { value: "afternoon_early_evening", label: "Afternoon/Early Evening" },
];

export type WorkflowStatus = "pending" | "done";

export interface WorkflowTask {
  id: string;
  section: WorkflowSection;
  position: number;
  name: string;
  status: WorkflowStatus;
  notes: string | null;
  is_permanent: boolean;
  created_at: string;
  updated_at: string;
}

// Management: Schedules ----------------------------------------------------

export type RoleScheduleAssignmentType = "person" | "role";

// Monday-Saturday only - every real schedule example so far (and the
// calendar mockup this was built from) never shows Sunday at all.
export type ScheduleDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export const SCHEDULE_DAY_KEYS: ScheduleDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat"];

export const SCHEDULE_DAY_LABELS: Record<ScheduleDayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

// A day missing from the object (or an empty string) means "off" that day.
export type ScheduleDayHours = Partial<Record<ScheduleDayKey, string>>;

export interface RoleSchedule {
  id: string;
  department: string;
  role_name: string;
  hours_text: string;
  assignment_type: RoleScheduleAssignmentType;
  // Set only when assignment_type is "person".
  employee_id: string | null;
  // Role rows (salaried, e.g. "Operations") use these two - a single
  // free-text block, week_b filled in only if it alternates.
  week_a_hours_text: string | null;
  week_b_hours_text: string | null;
  // Person rows use these instead - a real per-day grid so a multi-week
  // calendar can be generated forward. week_a is the default/every-week
  // pattern; week_b, when set, is what alternates in on even-numbered
  // weeks (see weekNumberOf in lib/dates.ts).
  week_a_days: ScheduleDayHours | null;
  week_b_days: ScheduleDayHours | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// A one-off (or short-range) override on top of a person's regular Week
// A/B pattern - "off this one Saturday", "in an hour earlier for the next
// two weeks". A blank hours_text means the day (or every day in the
// range) is off; a single day just has start_date === end_date.
export interface ScheduleException {
  id: string;
  role_schedule_id: string;
  start_date: string;
  end_date: string;
  hours_text: string | null;
  created_at: string;
}

// Management: Call Out Sheet -------------------------------------------------

export type CalloutApproved = "yes" | "no";

export interface CalloutEntry {
  id: string;
  employee_name: string;
  entry_date: string;
  call_out_type: string;
  reason: string | null;
  notified_at: string | null;
  approved: CalloutApproved | null;
  return_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PtoRequest {
  id: string;
  employee_name: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// The same free-text-employee-name convention as callout_entries/pto_requests
// above - "employees" has no columns beyond name, just enough to back a
// dropdown/combobox, not a real HR roster.
export interface Employee {
  id: string;
  name: string;
  title: string | null;
}

// Management: Performance Reviews ---------------------------------------------

// Everything here is scoped by (employee_name, year, quarter) rather than a
// bare date, since a review is organized around "the notes for this
// employee's Q3 2026 review" - occurred_date/follow_up_date are separate,
// optional fields for the actual incident/follow-up date, not the scoping key.
export interface PerformanceReviewQuickNote {
  id: string;
  employee_name: string;
  year: number;
  quarter: number;
  note: string;
  occurred_date: string | null;
  follow_up_notes: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PerformanceReviewImprovement {
  id: string;
  employee_name: string;
  year: number;
  quarter: number;
  note: string;
  occurred_date: string | null;
  created_at: string;
  updated_at: string;
}

export type MajorIssueType = "formal_warning" | "informal_warning" | "major_issue_resolved";

export const MAJOR_ISSUE_TYPES: { value: MajorIssueType; label: string }[] = [
  { value: "formal_warning", label: "Formal Warning" },
  { value: "informal_warning", label: "Informal Warning" },
  { value: "major_issue_resolved", label: "Major Issue (Resolved)" },
];

export interface PerformanceReviewMajorIssue {
  id: string;
  employee_name: string;
  year: number;
  quarter: number;
  occurred_date: string | null;
  issue_type: MajorIssueType | null;
  description: string | null;
  action_plan: string | null;
  review_date: string | null;
  created_at: string;
  updated_at: string;
}

// Management: QC Agenda -------------------------------------------------------

export interface QcAgendaMeta {
  id: string;
  entry_date: string;
  prepared_by: string | null;
  qc1: string | null;
  qc2: string | null;
  created_at: string;
  updated_at: string;
}

export type QcInboundStatus = "in_transit" | "arrived" | "qc_completed";

export const QC_INBOUND_STATUSES: { value: QcInboundStatus; label: string }[] = [
  { value: "in_transit", label: "In Transit" },
  { value: "arrived", label: "Arrived" },
  { value: "qc_completed", label: "QC Completed" },
];

export interface QcAgendaInbound {
  id: string;
  entry_date: string;
  position: number;
  vendor_origin: string | null;
  commodity_sku: string | null;
  po_load_number: string | null;
  carrier: string | null;
  eta: string | null;
  photo_report: string | null;
  status: QcInboundStatus | null;
  notes: string | null;
  // Set when this row came from "Pull Arrivals" (see Mexico > Arrivals) -
  // lets a re-click skip whatever's already been pulled for the day.
  mx_arrival_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QcAgendaFloorAging {
  id: string;
  entry_date: string;
  position: number;
  commodity_sku: string | null;
  lot_number: string | null;
  received_date: string | null;
  days_on_floor: number | null;
  action_needed: string | null;
  old_age_item_id: string | null;
  pack_style: string | null;
  size: string | null;
  created_at: string;
  updated_at: string;
}

export interface QcAgendaHoldover {
  id: string;
  entry_date: string;
  position: number;
  inspection_date: string | null;
  po: string | null;
  lot: string | null;
  product: string | null;
  qc: string | null;
  notes: string | null;
  qc_inspection_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface QcAgendaRepack {
  id: string;
  entry_date: string;
  position: number;
  reference: string | null;
  pack_format: string | null;
  priority: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Compliance: PAS Files -------------------------------------------------------

export type PasHighlight = "none" | "yellow" | "red";

export const PAS_HIGHLIGHTS: { value: PasHighlight; label: string }[] = [
  { value: "none", label: "None" },
  { value: "yellow", label: "Needs Contact" },
  { value: "red", label: "Escalated" },
];

export interface PasFile {
  id: string;
  position: number;
  order_no: string;
  po: string | null;
  customer: string | null;
  slp: string | null;
  order_date: string | null;
  ship_date: string | null;
  ship_qty: number | null;
  fob_amt: number | null;
  whse: string | null;
  status: string | null;
  order_type: string | null;
  sales_type: string | null;
  update_notes: string | null;
  last_contact: string | null;
  notes: string | null;
  highlight: PasHighlight;
  created_at: string;
  updated_at: string;
}

// Sales: Pending to Invoice -----------------------------------------------------

export interface PendingToInvoiceItem {
  id: string;
  position: number;
  order_no: string;
  po: string | null;
  customer: string | null;
  slp: string | null;
  order_date: string | null;
  ship_date: string | null;
  ship_qty: number | null;
  fob_amt: number | null;
  whse: string | null;
  status: string | null;
  order_type: string | null;
  sales_type: string | null;
  update_notes: string | null;
  last_contact: string | null;
  created_at: string;
  updated_at: string;
}

// QC: Inspections -------------------------------------------------------------

// A fixed scale rather than free text, so results can be scored/averaged
// (see Meetings > Weekly Company Call) - score is 0-100, used directly as
// a "quality" percentage.
export const QC_RESULTS: { label: string; score: number }[] = [
  { label: "Pass", score: 100 },
  { label: "Slight caution", score: 75 },
  { label: "Caution", score: 50 },
  { label: "Urgent", score: 25 },
  { label: "Fail", score: 0 },
];

export const QC_RESULT_SCORE: Record<string, number> = Object.fromEntries(
  QC_RESULTS.map((r) => [r.label, r.score]),
);

export interface QcInspection {
  id: string;
  position: number;
  entry_date: string | null;
  po: string | null;
  lot: string | null;
  product: string | null;
  qc: string | null;
  chat: boolean;
  report: boolean;
  mail: boolean;
  status: string | null;
  result: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Sales: FOB Pricing -----------------------------------------------------------

export type FobSection = "western_veg" | "hot_house";

export interface FobItem {
  id: string;
  entry_date: string;
  section: FobSection;
  commodity_group: string;
  variety: string | null;
  unit_per: number | null;
  size: string | null;
  fob: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface FobFreightRate {
  id: string;
  lane: string;
  ltl: number | null;
  ftl: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DeliveredPriceMessage {
  id: string;
  lane: string;
  message: string | null;
  created_at: string;
  updated_at: string;
}

// Sales: Buyers List -----------------------------------------------------------

export interface BuyersListItem {
  id: string;
  whse: string;
  comm: string;
  variety: string;
  pstyle: string;
  size: string;
  label: string;
  qty_needed: number;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// Buyers: Price Sheets + Vendor Catalog ----------------------------------------

export interface Vendor {
  id: string;
  name: string;
  is_unknown: boolean;
  sheet_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PriceSheetItem {
  id: string;
  vendor_id: string;
  category: string;
  item_label: string;
  size: string | null;
  price: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface VendorCommodity {
  vendor_id: string;
  category: string;
  first_seen_at: string;
}

// Management: User Roles -------------------------------------------------------

export interface Profile {
  id: string;
  email: string | null;
  role: Role;
  // Which broker/carrier company this login is - only set when role is
  // "broker_carrier", null for everyone else.
  broker_id: string | null;
  created_at: string;
}

// Management: Notifications ----------------------------------------------------

export type NotificationTargetType = "user" | "role";

export interface AppNotification {
  id: string;
  tab_label: string;
  subtab_label: string;
  page_path: string;
  message: string;
  updated_by: string | null;
  last_edited_at: string | null;
  target_type: NotificationTargetType;
  target_role: Role | null;
  created_by: string | null;
  created_at: string;
}

export interface NotificationRecipient {
  id: string;
  notification_id: string;
  user_id: string;
  acknowledged_at: string | null;
}

export interface SentNotification extends AppNotification {
  notification_recipients: NotificationRecipient[];
}

// Mobile app: push tokens -------------------------------------------------

export type PushPlatform = "android" | "ios";

export interface PushToken {
  id: string;
  user_id: string;
  platform: PushPlatform;
  token: string;
  created_at: string;
  updated_at: string;
}

// Marketing -----------------------------------------------------------------

export interface MarketingFile {
  id: string;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  label: string | null;
  category: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export type MarketingTaskStatus = "pending" | "done";

export interface MarketingTask {
  id: string;
  position: number;
  name: string;
  status: MarketingTaskStatus;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

// Management: Meal Plans -----------------------------------------------------

export type RecipeType = "main" | "snack";

export interface Recipe {
  id: string;
  recipe_type: RecipeType;
  name: string;
  servings: string | null;
  ingredients: string[];
  steps: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Manual "up to date" confirmation per page -------------------------------

export interface PageStatus {
  page_key: string;
  marked_at: string;
  marked_by: string | null;
}

// Accounting: Accounts Receivable ------------------------------------------------

export interface ArCustomer {
  id: string;
  customer_code: string;
  customer_name: string;
  credit_limit: number | null;
  bb_rating: string | null;
  created_at: string;
  updated_at: string;
}

export type ArTroubleStatus = "none" | "pending" | "posted";
export type ArHighlight = "none" | "yellow" | "red";

export const AR_HIGHLIGHTS: { value: ArHighlight; label: string }[] = [
  { value: "none", label: "None" },
  { value: "yellow", label: "Needs Contact" },
  { value: "red", label: "Escalated" },
];

// Aging bucket (Current/1-20/21-40/41-60/61+) is deliberately not a stored
// field - it's computed live from due_date at render time (see
// src/lib/arAging.ts) so it never goes stale between AR report pulls.
export interface ArInvoice {
  id: string;
  customer_id: string;
  invoice_no: string;
  po: string | null;
  invoice_date: string | null;
  due_date: string | null;
  doc_amount: number | null;
  balance: number;
  has_partial_credit: boolean;
  trouble_status: ArTroubleStatus;
  last_contact: string | null;
  notes: string | null;
  highlight: ArHighlight;
  position: number;
  created_at: string;
  updated_at: string;
}

// Snapshot of the Summary card's own totals as of the last AR Aging sync -
// see computeArSummaryTotals in arShared.tsx, which produces the same
// shape (camelCase) that this row (snake_case) is saved from.
export interface ArSummarySnapshot {
  id: string;
  total: number;
  customers: number;
  escalated: number;
  needs_contact: number;
  trouble_claims: number;
  short_total: number;
  over_total: number;
  captured_at: string;
}

// Accounting: Accounts Payable -------------------------------------------------

export type ApHighlight = "none" | "yellow" | "red";

export const AP_HIGHLIGHTS: { value: ApHighlight; label: string }[] = [
  { value: "none", label: "None" },
  { value: "yellow", label: "Needs Contact" },
  { value: "red", label: "Escalated" },
];

export interface ApVendor {
  id: string;
  vendor_code: string;
  vendor_name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

// gl_account_code/label come straight from the "Accrued Payables by
// Document" report's own GL Account group headers - not an enum, since
// nothing here assumes there are only ever two.
export interface ApPayable {
  id: string;
  vendor_id: string;
  gl_account_code: string;
  gl_account_label: string;
  doc_date: string | null;
  type: string | null;
  concept: string | null;
  document: string;
  balance: number;
  last_contact: string | null;
  notes: string | null;
  highlight: ApHighlight;
  position: number;
  created_at: string;
  updated_at: string;
}

// Accounting: AP Pay Lists ------------------------------------------------------

export type ApPayListItemStatus = "pending" | "good_to_pay" | "hold";

export const AP_PAY_LIST_ITEM_STATUSES: { value: ApPayListItemStatus; label: string }[] = [
  { value: "pending", label: "Pending Review" },
  { value: "good_to_pay", label: "Good to Pay" },
  { value: "hold", label: "HOLD" },
];

export interface ApPayList {
  id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// A snapshot of the payable's fields at the moment it was added to the
// list, not a live join back to ap_payables (see migration_055) - ap_payable_id
// is kept only as an optional back-reference.
export interface ApPayListItem {
  id: string;
  pay_list_id: string;
  ap_payable_id: string | null;
  vendor_code: string;
  vendor_name: string;
  gl_account_label: string;
  document: string;
  doc_date: string | null;
  type: string | null;
  concept: string | null;
  balance: number;
  status: ApPayListItemStatus;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// Mexico: Growers -------------------------------------------------------------

export interface MxGrower {
  id: string;
  name: string;
  origin: string | null;
  best_contact: string | null;
  accounting_contact: string | null;
  logistics_contact: string | null;
  notes: string | null;
  // Address is on file but deliberately left off Carton Inventory's
  // display - only city/state show there.
  address: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
}

export interface MxGrowerLabel {
  id: string;
  name: string;
}

// Doubles as "Products" on Supreme > Produce - same table, just managed
// from a different page and now carrying which carton type that product
// ships in.
export interface MxCommodity {
  id: string;
  name: string;
  carton_type_id: string | null;
}

// Mexico: Arrivals --------------------------------------------------------------

// The report is sectioned exactly like the source spreadsheet's own groupings
// - which section a row lives in is a manual choice (which section's "+ Add
// Row" the user clicked), independent of which commodities end up selected
// inside it.
export type MxArrivalSection = "lettuce" | "broccoli" | "peppers_hothouse" | "celery_carrots_cauliflower";

export const MX_ARRIVAL_SECTIONS: { value: MxArrivalSection; label: string }[] = [
  { value: "lettuce", label: "Lettuce" },
  { value: "broccoli", label: "Broccoli" },
  { value: "peppers_hothouse", label: "Bell Peppers / Hot House" },
  { value: "celery_carrots_cauliflower", label: "Celery / Carrots / Cauliflower" },
];

export type MxArrivalDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

// Each day gets a visually distinct color (not just light/dark shades of the
// same hue) so the booking column reads at a glance.
export const MX_ARRIVAL_DAYS: { value: MxArrivalDay; label: string; badgeClass: string }[] = [
  { value: "monday", label: "Monday", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "tuesday", label: "Tuesday", badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "wednesday", label: "Wednesday", badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  { value: "thursday", label: "Thursday", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "friday", label: "Friday", badgeClass: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
  { value: "saturday", label: "Saturday", badgeClass: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
  { value: "sunday", label: "Sunday", badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
];

export type MxTruckPosition = "nose" | "middle" | "tail";

export const MX_TRUCK_POSITIONS: { value: MxTruckPosition; label: string }[] = [
  { value: "nose", label: "Nose" },
  { value: "middle", label: "Middle" },
  { value: "tail", label: "Tail" },
];

// One row = one truck/manifest. Up to 4 commodities can ride on one truck,
// sharing one combined box count and price (matching how the source
// spreadsheet already treats a multi-commodity load as one line - e.g.
// "Broccoli #1 / #2" with one combined box count - just with each commodity
// now a real selection instead of typed into one text cell). truck_group/
// truck_position link separate manifests (possibly in different sections)
// that physically rode on the same truck.
export interface MxArrival {
  id: string;
  week_start_date: string;
  section: MxArrivalSection;
  position: number;
  grower_id: string | null;
  label_id: string | null;
  commodity_1_id: string | null;
  commodity_2_id: string | null;
  commodity_3_id: string | null;
  commodity_4_id: string | null;
  boxes_approx: string | null;
  price_to_grower: string | null;
  // Set on the Mexico side (which grade got shipped), independent of which
  // commodity slot was picked - e.g. Broccoli #1/#2 used to be encoded only
  // by commodity choice; this is the explicit field.
  grade: string | null;
  manifesto: string | null;
  arrival_day: MxArrivalDay | null;
  notes: string | null;
  truck_group: string | null;
  truck_position: MxTruckPosition | null;
  // Pairs this inbound with the domestic Logistics load actually carrying
  // it onward - optional, set from the Arrivals table's Load dropdown.
  linked_load_id: string | null;
  created_at: string;
  updated_at: string;
}

// Mexico: Orders ----------------------------------------------------------------

export type MxOrderStatus = "pending" | "fulfilled";

export const MX_ORDER_STATUSES: { value: MxOrderStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "fulfilled", label: "Fulfilled" },
];

// One line item a customer needs fulfilled - `customer` is free text (not a
// fixed list) since new customers show up over time, each with their own
// order format (see src/lib/mxOrdersParse.ts for the paste parsers).
export interface MxOrder {
  id: string;
  customer: string;
  commodity: string;
  plu: string | null;
  size: string | null;
  coo: string | null;
  grade: string | null;
  qty: number | null;
  qty_unit: string | null;
  po_number: string | null;
  reference_number: string | null;
  loading_date: string | null;
  delivery_date: string | null;
  status: MxOrderStatus;
  notes: string | null;
  position: number;
  // Set once this order has been sent to Arrivals (see the "Send to
  // Arrivals" option on fulfilling it) - prevents sending the same order
  // twice.
  linked_arrival_id: string | null;
  created_at: string;
  updated_at: string;
}

// Mexico: Carton Inventory -------------------------------------------------------

// Every place cartons can sit - the one Homebase (PCA, Texas) plus one row
// per grower, kept in sync automatically whenever a grower is added (see
// the mx_growers_create_carton_location trigger).
export type CartonLocationKind = "homebase" | "grower";

export interface CartonLocation {
  id: string;
  kind: CartonLocationKind;
  grower_id: string | null;
  name: string | null;
  created_at: string;
}

export interface CartonType {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

export type CartonTransactionSource = "manual" | "transfer" | "arrival";

// Signed ledger row (+ in, - out). A transfer is two rows sharing
// related_transaction_id.
export interface CartonTransaction {
  id: string;
  carton_type_id: string;
  location_id: string;
  qty: number;
  entry_date: string;
  related_transaction_id: string | null;
  source: CartonTransactionSource;
  source_arrival_id: string | null;
  source_arrival_slot: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// Running total per (carton_type, location), kept in sync from
// carton_transactions by a trigger - the app never writes this directly.
export interface CartonBalance {
  carton_type_id: string;
  location_id: string;
  qty: number;
  updated_at: string;
}

// Warehouse: Broccoli Inventory ---------------------------------------------------

// "inbound" comes from Mexico Arrivals (not yet on the floor); "on_floor"
// comes from either Warehouse Inventory or a promoted inbound lot. Crown/Ice
// condition only ever apply once something is on_floor.
export type BroccoliLotStatus = "inbound" | "on_floor";

export type BroccoliLotSource = "warehouse" | "arrivals" | "manual";

export type BroccoliCrownQuality = "pass" | "slight_caution" | "caution" | "urgent" | "fail";

export const BROCCOLI_CROWN_QUALITIES: { value: BroccoliCrownQuality; label: string; badgeClass: string }[] = [
  { value: "pass", label: "Pass", badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { value: "slight_caution", label: "Slight Caution", badgeClass: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300" },
  { value: "caution", label: "Caution", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "urgent", label: "Urgent", badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "fail", label: "Fail", badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
];

export type BroccoliIceQuality = "none" | "low" | "med" | "high";

export const BROCCOLI_ICE_QUALITIES: { value: BroccoliIceQuality; label: string; badgeClass: string }[] = [
  { value: "none", label: "None (0-2lbs)", badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { value: "low", label: "Low (2-3lbs)", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "med", label: "Med (3-5lbs)", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "high", label: "High (5lbs+)", badgeClass: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
];

// A lot is flagged out of the normal Grade/Crown/Ice groups and into the
// bottom "Issues Flagged" section once its condition needs urgent action.
export function isBroccoliLotFlagged(lot: Pick<BroccoliLot, "crown_quality" | "ice_quality">): boolean {
  return lot.crown_quality === "urgent" || lot.crown_quality === "fail" || lot.ice_quality === "none";
}

export interface BroccoliLot {
  id: string;
  status: BroccoliLotStatus;
  source: BroccoliLotSource;
  source_lot_id: string | null;
  source_arrival_id: string | null;
  lot_number: string | null;
  received_date: string | null;
  label: string | null;
  grade: string | null;
  qty: number | null;
  crown_quality: BroccoliCrownQuality | null;
  ice_quality: BroccoliIceQuality | null;
  position: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BroccoliOrder {
  id: string;
  lot_id: string;
  source_order_id: string | null;
  order_number: string | null;
  qty: number | null;
  notes: string | null;
  position: number;
  created_at: string;
}

// Compliance: Food Safety --------------------------------------------------------

export interface FoodSafetyReportType {
  id: string;
  name: string;
  required: boolean;
  position: number;
  created_at: string;
}

export interface FoodSafetyDocument {
  id: string;
  grower_id: string;
  report_type_id: string | null;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  expiration_date: string | null;
  auto_detected: boolean;
  notes: string | null;
  uploaded_by: string | null;
  last_alert_threshold_sent: number | null;
  created_at: string;
  updated_at: string;
}

export interface FoodSafetyAlertRecipient {
  id: string;
  user_id: string;
  created_at: string;
}

export type GrowerGrade = "A" | "B" | "C" | "D" | "F" | "N/A";

// Shipping/Receiving: prototype ERP ---------------------------------------------

// Master data - deliberately its own standalone item/vendor/customer list
// rather than reusing Mexico's Growers, Buyers' Vendor Catalog, or AR's
// customers, since each of those is shaped for its own specific workflow.
export interface SrItem {
  id: string;
  name: string;
  // Additive - the Warehouse Desk view groups by these when set, falling
  // back to name/pack_style/size for items that haven't been split out yet.
  commodity: string | null;
  variety: string | null;
  grade: string | null;
  label: string | null;
  // One of "Carton" | "Sack" | "Plastic" | "Bin" (DB check constraint), or
  // null for items not yet classified.
  pack_style: string | null;
  size: string | null;
  // Manually entered per item - how many cases/units make up a full pallet.
  // Used for PO/Lot entry math, not derived from anything else.
  qty_per_pallet: number | null;
  unit: string | null;
  category: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SrVendor {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SrCustomer {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  terms: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// One row per received lot (pallet-tag style), not one row per item -
// qty_on_hand starts equal to qty_received and depletes as Shipping ships
// against it (oldest lot first), so aging/rotation is visible per lot.
export type SrLotStatus = "available" | "committed" | "shipped" | "adjusted";

export interface SrInventoryLot {
  id: string;
  item_id: string | null;
  lot_number: string | null;
  vendor_id: string | null;
  po_id: string | null;
  received_date: string | null;
  qty_received: number | null;
  qty_on_hand: number | null;
  unit_cost: number | null;
  warehouse: string | null;
  status: SrLotStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type SrPoStatus = "open" | "partial" | "received" | "closed";

export const SR_PO_STATUSES: { value: SrPoStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "partial", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "closed", label: "Closed" },
];

export interface SrPurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string | null;
  order_date: string | null;
  status: SrPoStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SrPoLine {
  id: string;
  po_id: string;
  position: number;
  item_id: string | null;
  qty_ordered: number | null;
  unit_cost: number | null;
  qty_received: number;
  created_at: string;
  updated_at: string;
}

export type SrSoStatus = "open" | "shipped" | "invoiced" | "cancelled";

export const SR_SO_STATUSES: { value: SrSoStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "shipped", label: "Shipped" },
  { value: "invoiced", label: "Invoiced" },
  { value: "cancelled", label: "Cancelled" },
];

export interface SrSalesOrder {
  id: string;
  order_number: string;
  customer_id: string | null;
  order_date: string | null;
  ship_date: string | null;
  status: SrSoStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SrSoLine {
  id: string;
  so_id: string;
  position: number;
  item_id: string | null;
  qty_ordered: number | null;
  unit_price: number | null;
  qty_shipped: number;
  created_at: string;
  updated_at: string;
}

// CRM: Companies -------

export type CrmStatus = "prospect" | "contacted" | "qualified" | "customer" | "inactive" | "do_not_contact";

export const CRM_STATUSES: { value: CrmStatus; label: string }[] = [
  { value: "prospect", label: "Prospect" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "customer", label: "Customer" },
  { value: "inactive", label: "Inactive" },
  { value: "do_not_contact", label: "Do Not Contact" },
];

export type CrmPriority = "high" | "medium" | "low";

export const CRM_PRIORITIES: { value: CrmPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export interface CrmCompany {
  id: string;
  blue_book_id: string | null;
  name: string;
  legal_name: string | null;
  city_state: string | null;
  location_type: string | null;
  phone: string | null;
  classification: string | null;
  score: number | null;
  rating: number | null;
  source_status: string | null;
  profile_url: string | null;
  crm_status: CrmStatus;
  priority: CrmPriority | null;
  primary_contact: string | null;
  email: string | null;
  notes: string | null;
  // Which unclaimed bucket this sits in - null means the default General
  // Bucket (always exists, isn't a real crm_buckets row). Only meaningful
  // while assigned_to is null; ignored once claimed into a pipeline.
  bucket_id: string | null;
  // Null while sitting in a bucket - set to a profile id once a salesperson
  // (or an Admin/Exec on their behalf) claims it into that person's own
  // pipeline.
  assigned_to: string | null;
  assigned_at: string | null;
  // Set once someone marks this company "landed" - full setup done, a PO
  // pulled. Moves it out of the working pipeline views into the Exec/Admin-
  // only Completed list; landed_by isn't always assigned_to, since an
  // Admin/Exec can mark it on the pipeline owner's behalf.
  landed_at: string | null;
  landed_by: string | null;
  // The mirror of landed_at/landed_by for a company the pipeline owner (or
  // Admin/Exec) decided NOT to pursue - moves it out of the working
  // pipeline views into its own Exec/Admin-only DNS list instead.
  dns_at: string | null;
  dns_by: string | null;
  // Who added this company - powers the Activity Tracking page's
  // "Customers Added" count. Null for rows created before that page shipped.
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// A named segment of the shared unclaimed pool (e.g. "Priority Customers"),
// alongside the implicit, always-present General Bucket (bucket_id null).
export interface CrmBucket {
  id: string;
  name: string;
  position: number;
  created_at: string;
}

// CRM: Daily Goals -------

// One person's goal for one calendar day - scoped to goal_date so a new day
// naturally starts as a blank slate rather than needing an explicit reset.
export interface CrmDailyGoal {
  id: string;
  user_id: string;
  goal_date: string;
  // 1, 2, or 3 - each person can have up to 3 independent goals per day.
  slot: number;
  goal_text: string;
  target_count: number;
  current_count: number;
  created_at: string;
  updated_at: string;
}

// CRM: Activities -------

export type CrmActivityType = "call" | "email" | "meeting" | "quote" | "follow_up" | "visit" | "other";

export const CRM_ACTIVITY_TYPES: { value: CrmActivityType; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "quote", label: "Quote" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "visit", label: "Visit" },
  { value: "other", label: "Other" },
];

export type CrmOutcome =
  | "no_answer"
  | "left_message"
  | "connected"
  | "interested"
  | "quote_sent"
  | "follow_up_needed"
  | "won"
  | "lost"
  | "other";

export const CRM_OUTCOMES: { value: CrmOutcome; label: string }[] = [
  { value: "no_answer", label: "No Answer" },
  { value: "left_message", label: "Left Message" },
  { value: "connected", label: "Connected" },
  { value: "interested", label: "Interested" },
  { value: "quote_sent", label: "Quote Sent" },
  { value: "follow_up_needed", label: "Follow-Up Needed" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "other", label: "Other" },
];

export interface CrmActivity {
  id: string;
  company_id: string;
  activity_date: string;
  contact_person: string | null;
  activity_type: CrmActivityType | null;
  outcome: CrmOutcome | null;
  notes: string | null;
  next_action: string | null;
  next_follow_up: string | null;
  owner: string | null;
  // Who actually logged this entry - separate from the free-text Owner
  // field above (which was never a real user reference). Powers the
  // Activity Tracking page's "Calls Logged" count. Null for rows created
  // before that page shipped.
  logged_by: string | null;
  created_at: string;
  updated_at: string;
}

// Management: Employee Files ----------------------------------------------------

export type EmployeeStatus = "active" | "resigned" | "terminated";

export const EMPLOYEE_STATUSES: { value: EmployeeStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
];

export type EmployeeOfficeLocation = "Monterey, CA" | "Pharr, TX" | "Guadalajara, MX" | "San Antonio, TX";

export const EMPLOYEE_OFFICE_LOCATIONS: EmployeeOfficeLocation[] = [
  "Monterey, CA",
  "Pharr, TX",
  "Guadalajara, MX",
  "San Antonio, TX",
];

export interface Employee {
  id: string;
  name: string;
  title: string | null;
  department: string | null;
  start_date: string | null;
  status: EmployeeStatus;
  direct_manager: string | null;
  office_location: EmployeeOfficeLocation | null;
  personal_number: string | null;
  work_cell_number: string | null;
  office_number: string | null;
  // Anniversary year number (1, 2, 3...) already alerted for - see
  // checkAndSendAnniversaryAlerts in employee-files/actions.ts.
  last_anniversary_alert_year: number | null;
  // Their system login (profiles.id), if they have one - not every
  // employee necessarily does. Identity link only, no password: Supabase
  // Auth never exposes the actual password anywhere, even to this app.
  linked_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// Additional, self-labeled phone numbers - for when Personal/Work
// Cell/Office aren't enough (e.g. a second work line, a pager).
export interface EmployeePhoneNumber {
  id: string;
  employee_id: string;
  label: string | null;
  phone_number: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export type EmployeeDocumentCategory = "onboarding" | "offboarding" | "photo";

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  category: EmployeeDocumentCategory;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export const DEVICE_TYPES = ["Tablet", "Laptop", "Phone", "Other"] as const;
export const DEVICE_CHECKOUT_CONDITIONS = ["New", "Good", "Fair", "Damaged"] as const;
export const DEVICE_RETURN_CONDITIONS = ["Good", "Fair", "Damaged"] as const;

// One checkout event, start to finish - a digital version of the paper
// Employee Device Checkout Form. Employee Name/Title/Employee ID are left
// off since they already live on the Employee record this belongs to, and
// Device Brand & Model/Operating System/Login Username-Email/
// Password/Additional Access Notes are dropped entirely per request.
export interface EmployeeDevice {
  id: string;
  employee_id: string;
  device_type: string | null;
  device_type_other: string | null;
  device_name: string | null;
  serial_number: string | null;
  condition_at_checkout: string | null;
  condition_notes: string | null;
  device_pin: string | null;
  date_of_issue: string | null;
  date_returned: string | null;
  condition_at_return: string | null;
  return_notes: string | null;
  manager_name: string | null;
  created_at: string;
  updated_at: string;
}

// Supreme: Devices ---------------------------------------------------------------

// The master equipment registry - one row per physical device, with
// whoever currently holds it (nullable - not every device is checked out).
// Separate from EmployeeDevice above, which is a detailed one-time
// checkout-form record rather than a "current state" registry entry.
export interface Device {
  id: string;
  device_type: string | null;
  device_type_other: string | null;
  device_name: string | null;
  serial_number: string | null;
  assigned_to: string | null;
  notes: string | null;
  has_issue: boolean;
  created_at: string;
  updated_at: string;
}

// Logistics: Customer Lumpers -----------------------------------------------------

export interface CustomerLumper {
  id: string;
  customer: string | null;
  description: string | null;
  price: number | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// Management: Costs ----------------------------------------------------------------

export type RepackCostUnit = "Case" | "Pallet";

export const REPACK_COST_UNITS: RepackCostUnit[] = ["Case", "Pallet"];

// First section on the Costs page - what each repack movement/action
// costs, and the unit it's billed per.
export interface RepackCost {
  id: string;
  action: string | null;
  cost: number | null;
  unit: RepackCostUnit | null;
  position: number;
  created_at: string;
  updated_at: string;
}

// Documents ------------------------------------------------------------------------

// A header grouping printable company forms - starts with just
// "Onboarding", but is its own table (not a fixed enum) so more can be
// added later without a migration.
export interface DocumentCategory {
  id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CompanyDocument {
  id: string;
  category_id: string;
  file_name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}
