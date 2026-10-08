import type { Role, Tab } from "./roles";

// The menu: every section and page, in order. Shared by the sidebar (NavBar)
// and the User Roles screen, so the pages a role can be given or denied are
// always exactly the pages the menu shows.

export interface NavItem {
  href: string;
  label: string;
  // Hides this one item from an otherwise-tab-eligible role - for a role
  // that gets only part of a tab's pages (e.g. Warehouse/QC's Mexico access
  // is Arrivals/Orders only, not Growers - see roles.ts's matching
  // middleware restriction, which is the real enforcement; this only
  // controls what shows in the sidebar).
  excludeRoles?: Role[];
  // Shown only to the Supreme account, even inside an otherwise
  // role-eligible category (see isSupremeUser in roles.ts).
  supremeOnly?: boolean;
  // Shown only to these roles (and the Supreme account), even inside a section
  // the role could otherwise open.
  onlyRoles?: Role[];
}

export interface NavCategory {
  label: string;
  href?: string;
  tab?: Tab;
  items?: NavItem[];
  // Outside the Tab/role system entirely - visible only to the one account
  // isSupremeUser recognizes, regardless of role (see roles.ts).
  supremeOnly?: boolean;
}

// The Logistics Oversight roles (see roles.ts) only ever have the narrower
// slice of Logistics, never the full tab, so these items are excluded for
// them specifically rather than gated by canAccessTab like a normal item.
const LOGISTICS_OVERSIGHT_ONLY_ROLES: Role[] = ["sales", "buyer_sales", "executive"];

export const NAV: NavCategory[] = [
  { label: "Home", href: "/" },
  {
    label: "Logistics",
    tab: "logistics",
    items: [
      { href: "/logistics", label: "Summary" },
      { href: "/logistics/board", label: "List", excludeRoles: LOGISTICS_OVERSIGHT_ONLY_ROLES },
      { href: "/logistics/rates", label: "Freight Rates" },
      {
        href: "/logistics/broker-rate-entry",
        label: "Broker Rate Entry",
        excludeRoles: LOGISTICS_OVERSIGHT_ONLY_ROLES,
      },
      {
        href: "/logistics/freight-calculator",
        label: "Freight Calculator",
        excludeRoles: LOGISTICS_OVERSIGHT_ONLY_ROLES,
      },
      {
        href: "/logistics/weight-calculator",
        label: "Weight Calculator",
        excludeRoles: LOGISTICS_OVERSIGHT_ONLY_ROLES,
      },
      { href: "/logistics/customer-lumpers", label: "Customer Lumpers" },
    ],
  },
  {
    label: "Warehouse",
    tab: "warehouse",
    items: [
      { href: "/warehouse/am-holdovers", label: "AM Holdovers" },
      { href: "/warehouse/repack-inventory", label: "Repack Inventory" },
      { href: "/warehouse/cold-inventory", label: "Cold Inventory" },
      { href: "/warehouse/broccoli-inventory", label: "Broccoli Inventory" },
    ],
  },
  {
    label: "QC",
    tab: "qc",
    items: [
      { href: "/qc/agenda", label: "QC Agenda" },
      { href: "/qc/inspections/new", label: "New Inspection" },
      { href: "/qc/inspections", label: "Inspection History" },
      // Only the Quality Control Manager role (and the Supreme account) sees this.
      { href: "/qc/plans", label: "Inspection Plans", onlyRoles: ["qc_manager"] },
      { href: "/qc/old-age", label: "Old Age" },
    ],
  },
  {
    label: "Sales",
    tab: "sales",
    items: [
      { href: "/sales/fob-pharr", label: "FOB - Pharr" },
      { href: "/sales/delivered/houston", label: "Houston Delivered" },
      { href: "/sales/delivered/dallas", label: "Dallas Delivered" },
      { href: "/sales/delivered/east-coast", label: "East Coast Delivered" },
      { href: "/sales/calculator", label: "Sales Calculator" },
    ],
  },
  {
    label: "CRM",
    tab: "crm",
    items: [
      { href: "/crm/companies", label: "Companies" },
      {
        href: "/crm/activity",
        label: "Activity Tracking",
        excludeRoles: ["sales", "buyer_sales", "operations"],
      },
    ],
  },
  {
    label: "Buyers",
    tab: "buyers",
    items: [
      { href: "/buyers/price-sheets", label: "Price Sheets" },
      { href: "/buyers/vendor-catalog", label: "Vendor Catalog" },
      { href: "/buyers/buyers-list", label: "Buyers List" },
      { href: "/buyers/local-inbounds", label: "Local Inbounds" },
    ],
  },
  {
    label: "Management",
    tab: "management",
    items: [
      { href: "/management/callout-sheet", label: "Callout Sheet" },
      { href: "/management/schedules", label: "Schedules" },
      { href: "/management/performance-reviews", label: "Performance Reviews" },
      { href: "/management/employee-files", label: "Employee Files" },
      { href: "/management/costs", label: "Costs" },
    ],
  },
  {
    label: "SubManagement",
    supremeOnly: true,
    items: [
      { href: "/submanagement/agents", label: "Agents" },
      { href: "/submanagement/activity-log", label: "Activity Log" },
    ],
  },
  { label: "Documents", href: "/documents", tab: "documents" },
  {
    label: "Compliance",
    tab: "compliance",
    items: [
      { href: "/compliance/pas-files", label: "PAS Files" },
      { href: "/compliance/food-safety", label: "Food Safety" },
    ],
  },
  {
    label: "Accounting",
    tab: "accounting",
    items: [
      { href: "/accounting/ar", label: "Accounts Receivable" },
      { href: "/accounting/pending-to-invoice", label: "Pending to Invoice" },
      { href: "/accounting/ap", label: "Accounts Payable" },
      { href: "/accounting/pay-lists", label: "Pay Lists" },
      { href: "/accounting/logistics-invoicing", label: "Logistics Invoicing" },
    ],
  },
  {
    label: "Marketing",
    tab: "marketing",
    items: [{ href: "/marketing/assets", label: "Brand Assets" }],
  },
  {
    label: "Meetings",
    tab: "meetings",
    items: [{ href: "/meetings/weekly-company-call", label: "Weekly Company Call" }],
  },
  {
    label: "Mexico",
    tab: "mexico",
    items: [
      { href: "/mexico/arrivals", label: "Arrivals" },
      { href: "/mexico/orders", label: "Orders" },
      { href: "/mexico/growers", label: "Growers", excludeRoles: ["warehouse_qc", "qc_manager"] },
      { href: "/mexico/carton-inventory", label: "Carton Inventory", excludeRoles: ["warehouse_qc", "qc_manager"] },
    ],
  },
  {
    label: "ERP",
    tab: "shipping_receiving",
    items: [
      { href: "/shipping-receiving/inventory", label: "Inventory" },
      { href: "/shipping-receiving/order-entry", label: "Order Entry" },
      { href: "/shipping-receiving/po-entry", label: "PO Entry" },
      { href: "/shipping-receiving/shipping", label: "Shipping" },
    ],
  },
  {
    label: "Supreme Tab",
    supremeOnly: true,
    items: [
      { href: "/supreme/workflow", label: "Workflow" },
      { href: "/supreme/meal-plans", label: "Meal Plans" },
      { href: "/supreme/users", label: "User Roles" },
      { href: "/supreme/notifications", label: "Notifications" },
      { href: "/supreme/devices", label: "Devices" },
      { href: "/supreme/produce", label: "Produce" },
      { href: "/supreme/reset", label: "Reset Tools" },
    ],
  },
];
