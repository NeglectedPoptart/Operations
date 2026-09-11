export type Role =
  | "admin"
  | "operations"
  | "warehouse_qc"
  | "sales"
  | "accounting"
  | "buyer"
  | "executive"
  | "broker_carrier"
  | "mx"
  | "buyer_sales";

export const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "operations", label: "Operations" },
  { value: "warehouse_qc", label: "Warehouse/QC" },
  { value: "sales", label: "Sales" },
  { value: "accounting", label: "Accounting" },
  { value: "buyer", label: "Buyer" },
  { value: "executive", label: "Executive" },
  { value: "broker_carrier", label: "Broker/Carrier" },
  { value: "mx", label: "MX" },
  { value: "buyer_sales", label: "Buyer/Sales" },
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
  | "accounting"
  | "meetings"
  | "mexico"
  | "shipping_receiving"
  | "crm";

// A broker/carrier login is a fundamentally different shape of access than
// every other role - not "which tabs", but "exactly this one page and
// nothing else, not even Home" (see middleware.ts). Kept as its own
// constant rather than a Tab since it's a single hardcoded path, not a
// category of pages.
export const BROKER_CARRIER_PATH = "/logistics/broker-rate-entry";

// The "Supreme Tab" (Workflow, Meal Plans, User Roles, Notifications, Reset
// Tools) is deliberately NOT part of the Tab/role system at all - it's
// locked to this one specific account regardless of role, so a second
// Admin login still can't see it. Same "hardcoded exception outside the tab
// system" shape as BROKER_CARRIER_PATH above, just gating a whole path
// prefix instead of a single page (see middleware.ts and NavBar.tsx).
const SUPREME_EMAIL = "tcamph@harvestbestinc.com";
export const SUPREME_PATH_PREFIX = "/supreme";

export function isSupremeUser(email: string | null): boolean {
  return email === SUPREME_EMAIL;
}

// What each role can open, besides Home (which is open to every
// authenticated role except broker_carrier - see the Draft Changes /
// permission levels round, and middleware.ts for the broker_carrier
// exception).
const ROLE_TABS: Record<Role, Tab[]> = {
  admin: [
    "logistics",
    "warehouse",
    "qc",
    "sales",
    "management",
    "compliance",
    "buyers",
    "marketing",
    "accounting",
    "meetings",
    "mexico",
    "shipping_receiving",
    "crm",
  ],
  // Sees everything except Management. Gets CRM to browse/manage buckets
  // and pipelines, but - unlike Sales/Executive/Buyer-Sales - is never
  // itself a pipeline owner (see the assignable-users role filter in
  // crm/companies/page.tsx, which deliberately leaves "operations" out).
  operations: [
    "logistics",
    "warehouse",
    "qc",
    "sales",
    "compliance",
    "buyers",
    "marketing",
    "accounting",
    "meetings",
    "mexico",
    "crm",
  ],
  // "mexico" here is deliberately narrower than every other role that has
  // it - middleware.ts additionally restricts Warehouse/QC to just
  // Arrivals and Orders, not Growers (see warehouseQcMexicoAllowed below).
  warehouse_qc: ["warehouse", "qc", "buyers", "meetings", "mexico"],
  sales: ["sales", "qc", "buyers", "marketing", "meetings", "crm"],
  accounting: ["sales", "compliance", "accounting", "meetings"],
  buyer: ["warehouse", "qc", "sales", "buyers", "meetings"],
  // Sees everything except Logistics.
  executive: [
    "warehouse",
    "qc",
    "sales",
    "management",
    "compliance",
    "buyers",
    "marketing",
    "accounting",
    "meetings",
    "mexico",
    "crm",
  ],
  // No tabs at all - access to BROKER_CARRIER_PATH is a hardcoded exception
  // in middleware.ts, not tab-based like every other role.
  broker_carrier: [],
  // Mexico-side staff: Mexico plus the general-interest tabs (Meetings,
  // Marketing, Compliance, QC, Warehouse), same as every other role, home
  // dashboard included via the "no tab" exception below.
  mx: ["mexico", "meetings", "marketing", "compliance", "qc", "warehouse"],
  // Hybrid for staff who need both Buyer's tabs and full Sales access
  // (including CRM) rather than one or the other - the union of buyer's and
  // sales' tabs above.
  buyer_sales: ["warehouse", "qc", "sales", "buyers", "meetings", "marketing", "crm"],
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
  if (pathname.startsWith("/meetings")) return "meetings";
  if (pathname.startsWith("/mexico")) return "mexico";
  if (pathname.startsWith("/shipping-receiving")) return "shipping_receiving";
  if (pathname.startsWith("/crm")) return "crm";
  return null;
}

// Warehouse/QC has "mexico" in its ROLE_TABS, but only for Arrivals and
// Orders - not Growers, which stays reserved for roles with full Mexico
// access. A per-role path allowlist layered on top of the generic tab
// check (see middleware.ts), the same "hardcoded exception alongside the
// tab system" shape as BROKER_CARRIER_PATH/SUPREME_PATH_PREFIX, just
// narrowing one role's access to part of a tab instead of granting/denying
// the whole thing.
const WAREHOUSE_QC_MEXICO_PATHS = ["/mexico/arrivals", "/mexico/orders"];

export function warehouseQcMexicoAllowed(pathname: string): boolean {
  return WAREHOUSE_QC_MEXICO_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// The mirror shape of the exception above: Sales, Buyer/Sales, and
// Operations all have the "crm" tab, but Activity Tracking (per-salesperson
// stats) is narrower - Admin/Exec only, same as the Completed and DNS lists
// it summarizes.
export const CRM_ACTIVITY_PATH_PREFIX = "/crm/activity";

export function crmActivityAllowed(role: Role | null): boolean {
  return role === "admin" || role === "executive";
}
