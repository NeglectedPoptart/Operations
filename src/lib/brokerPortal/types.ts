// What the Broker Pending List shows for one load. Built on the server from the carrier's own loads
// only; internal fields (notes, claims, charges staff added) are never included.

export interface PortalDoc {
  id: string;
  name: string;
  url: string | null;
  // A link that saves the file to the device instead of opening it (rate confirmations and signed copies).
  downloadUrl: string | null;
  createdAt: string;
}

export interface PortalPod extends PortalDoc {
  status: "pending" | "approved" | "rejected" | null;
  note: string | null;
}

export interface PortalCharge {
  id: string;
  kind: string;
  amount: number;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
  reviewNote: string | null;
  files: PortalDoc[];
}

export interface PortalStop {
  orderNumber: string | null;
  poNumber: string | null;
  client: string | null;
  destination: string;
  deliveryDate: string | null;
  deliveryTime: string | null;
  appointment: string | null;
}

export interface PortalPickup {
  puNumber: string | null;
  vendor: string | null;
  location: string | null;
}

export interface PortalLoad {
  id: string;
  status: "pending_to_load" | "on_the_road" | "complete";
  loadingDate: string | null;
  source: string | null;
  ready: boolean;
  rate: number | null;
  rateConSent: boolean;
  pickups: PortalPickup[];
  stops: PortalStop[];
  etaNote: string | null;
  etaUpdatedAt: string | null;
  etaUpdatedBy: string | null;
  signedAt: string | null;
  signedBy: string | null;
  rateConfirmedAt: string | null;
  rateConfirmedBy: string | null;
  rateConfirmedAmount: number | null;
  podSubmittedAt: string | null;
  podRejectedNote: string | null;
  rateCons: PortalDoc[];
  signedCopies: PortalDoc[];
  pods: PortalPod[];
  charges: PortalCharge[];
}

// Charges a carrier may ask for.
export const PORTAL_CHARGE_KINDS = ["Layover", "Redelivery", "Added stop", "Detention", "Lumper", "TONU (truck ordered not used)", "Other"] as const;
