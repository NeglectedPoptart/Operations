import type { Role } from "@/lib/roles";

export type LoadStatus = "pending_to_load" | "on_the_road" | "complete";

export const LOAD_STATUSES: { value: LoadStatus; label: string }[] = [
  { value: "pending_to_load", label: "Pending to Load" },
  { value: "on_the_road", label: "On the Road" },
  { value: "complete", label: "Complete Load" },
];

export interface Broker {
  id: string;
  name: string;
  request_statement: boolean;
  position: number;
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
}

export interface BrokerRateEntry {
  id: string;
  lane_id: string;
  broker_id: string;
  week_start_date: string;
  rate: number | null;
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

export type LocalInboundStatus = "pending" | "arrived";

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

export type OldAgeNextStep = "pending_qc" | "cash_sale" | "repack" | "as_is" | "dump_donate" | "moved";

export const OLD_AGE_NEXT_STEPS: { value: OldAgeNextStep; label: string }[] = [
  { value: "pending_qc", label: "Pending QC" },
  { value: "cash_sale", label: "Cash Sale" },
  { value: "repack", label: "Repack" },
  { value: "as_is", label: "As Is" },
  { value: "dump_donate", label: "Dump/Donate" },
  { value: "moved", label: "Moved" },
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
  created_at: string;
  updated_at: string;
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

// Management: User Roles -------------------------------------------------------

export interface Profile {
  id: string;
  email: string | null;
  role: Role;
  created_at: string;
}
