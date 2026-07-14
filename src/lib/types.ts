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
  status_note: string | null;
  rate: number | null;
  broker_id: string | null;
  brokers: Broker | null;
  notes: string | null;
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
