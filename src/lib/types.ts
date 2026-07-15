export type LoadStatus = "pending_to_load" | "on_the_road" | "complete";

export const LOAD_STATUSES: { value: LoadStatus; label: string }[] = [
  { value: "pending_to_load", label: "Pending to Load" },
  { value: "on_the_road", label: "On the Road" },
  { value: "complete", label: "Complete Load" },
];

export interface Broker {
  id: string;
  name: string;
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
