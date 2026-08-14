export type Role =
  | "admin"
  | "operations"
  | "warehouse_qc"
  | "sales"
  | "accounting"
  | "buyer"
  | "executive"
  | "broker_carrier";

export const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "operations", label: "Operations" },
  { value: "warehouse_qc", label: "Warehouse/QC" },
  { value: "sales", label: "Sales" },
  { value: "accounting", label: "Accounting" },
  { value: "buyer", label: "Buyer" },
  { value: "executive", label: "Executive" },
  { value: "broker_carrier", label: "Broker/Carrier" },
];

export type Tab =
  | "logistics"
  | "warehouse"
  | "qc"
  | "sales"
  | "management"
  | "compliance"
  | "buyers"
  | "marketing"
  | "accounting";

// A broker/carrier login is a fundamentally different shape of access than
// every other role - not "which tabs", but "exactly this one page and
// nothing else, not even Home" (see middleware.ts). Kept as its own
// constant rather than a Tab since it's a single hardcoded path, not a
// category of pages.
export const BROKER_CARRIER_PATH = "/logistics/broker-rate-entry";

// What each role can open, besides Home (which is open to every
// authenticated role except broker_carrier - see the Draft Changes /
// permission levels round, and middleware.ts for the broker_carrier
// exception).
const ROLE_TABS: Record<Role, Tab[]> = {
  admin: ["logistics", "warehouse", "qc", "sales", "management", "compliance", "buyers", "marketing", "accounting"],
  // Sees everything except Management.
  operations: ["logistics", "warehouse", "qc", "sales", "compliance", "buyers", "marketing", "accounting"],
  warehouse_qc: ["warehouse", "qc", "buyers"],
  sales: ["sales", "qc", "buyers", "marketing"],
  accounting: ["sales", "compliance", "accounting"],
  buyer: ["warehouse", "qc", "sales", "buyers"],
  // Sees everything except Logistics and Management.
  executive: ["warehouse", "qc", "sales", "compliance", "buyers", "marketing", "accounting"],
  // No tabs at all - access to BROKER_CARRIER_PATH is a hardcoded exception
  // in middleware.ts, not tab-based like every other role.
  broker_carrier: [],
};

export function tabsForRole(role: Role | null): Tab[] {
  return role ? ROLE_TABS[role] : [];
}

export function canAccessTab(role: Role | null, tab: Tab): boolean {
  return tabsForRole(role).includes(tab);
}

// Maps a request path to the Tab that governs it. Returns null for paths
// that aren't gated by a tab (Home, login) - those are open to any
// authenticated user regardless of role.
export function tabForPath(pathname: string): Tab | null {
  if (pathname.startsWith("/logistics")) return "logistics";
  if (pathname.startsWith("/warehouse")) return "warehouse";
  if (pathname.startsWith("/qc")) return "qc";
  if (pathname.startsWith("/sales")) return "sales";
  if (pathname.startsWith("/management")) return "management";
  if (pathname.startsWith("/compliance")) return "compliance";
  if (pathname.startsWith("/buyers")) return "buyers";
  if (pathname.startsWith("/marketing")) return "marketing";
  if (pathname.startsWith("/accounting")) return "accounting";
  return null;
}
