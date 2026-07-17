export type Role = "admin" | "operations" | "warehouse_qc" | "sales" | "compliance";

export const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "operations", label: "Operations" },
  { value: "warehouse_qc", label: "Warehouse/QC" },
  { value: "sales", label: "Sales" },
  { value: "compliance", label: "Compliance" },
];

export type Tab = "logistics" | "warehouse" | "qc" | "sales" | "management" | "compliance";

// What each role can open, besides Home (which is open to every
// authenticated role - see the Draft Changes / permission levels round).
const ROLE_TABS: Record<Role, Tab[]> = {
  admin: ["logistics", "warehouse", "qc", "sales", "management", "compliance"],
  operations: ["logistics", "warehouse", "qc", "sales", "compliance"],
  warehouse_qc: ["warehouse", "qc"],
  sales: ["sales", "qc"],
  compliance: ["logistics", "warehouse", "qc", "sales", "compliance"],
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
  return null;
}
