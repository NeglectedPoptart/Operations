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

export interface RoleSchedule {
  id: string;
  department: string;
  role_name: string;
  hours_text: string;
  position: number;
  created_at: string;
  updated_at: string;
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
