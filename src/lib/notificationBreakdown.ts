import type { createClient } from "./supabase/server";
import type { Tab } from "./roles";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface NotifySubtab {
  label: string;
  href: string;
}

export interface NotifyTab {
  tab: Tab;
  label: string;
  subtabs: NotifySubtab[];
}

// Mirrors the category/items lists in src/components/NavBar.tsx - keep in
// sync if pages are added, renamed, or moved.
export const NOTIFY_BREAKDOWN: NotifyTab[] = [
  {
    tab: "logistics",
    label: "Logistics",
    subtabs: [
      { label: "Summary", href: "/logistics" },
      { label: "List", href: "/logistics/board" },
      { label: "Freight Rates", href: "/logistics/rates" },
      { label: "Freight Calculator", href: "/logistics/freight-calculator" },
      { label: "Weight Calculator", href: "/logistics/weight-calculator" },
      { label: "Invoicing", href: "/logistics/invoicing" },
    ],
  },
  {
    tab: "warehouse",
    label: "Warehouse",
    subtabs: [
      { label: "AM Holdovers", href: "/warehouse/am-holdovers" },
      { label: "Repack Inventory", href: "/warehouse/repack-inventory" },
      { label: "Cold Inventory", href: "/warehouse/cold-inventory" },
    ],
  },
  {
    tab: "qc",
    label: "QC",
    subtabs: [
      { label: "QC Agenda", href: "/qc/agenda" },
      { label: "QC Inspections", href: "/qc/inspections" },
      { label: "Old Age", href: "/qc/old-age" },
    ],
  },
  {
    tab: "sales",
    label: "Sales",
    subtabs: [
      { label: "FOB - Pharr", href: "/sales/fob-pharr" },
      { label: "Houston Delivered", href: "/sales/delivered/houston" },
      { label: "Dallas Delivered", href: "/sales/delivered/dallas" },
      { label: "East Coast Delivered", href: "/sales/delivered/east-coast" },
      { label: "Pending to Invoice", href: "/sales/pending-to-invoice" },
    ],
  },
  {
    tab: "buyers",
    label: "Buyers",
    subtabs: [
      { label: "Price Sheets", href: "/buyers/price-sheets" },
      { label: "Vendor Catalog", href: "/buyers/vendor-catalog" },
      { label: "Buyers List", href: "/buyers/buyers-list" },
      { label: "Local Inbounds", href: "/buyers/local-inbounds" },
    ],
  },
  {
    tab: "management",
    label: "Management",
    subtabs: [
      { label: "Workflow", href: "/management/workflow" },
      { label: "Callout Sheet", href: "/management/callout-sheet" },
      { label: "User Roles", href: "/management/users" },
    ],
  },
  {
    tab: "compliance",
    label: "Compliance",
    subtabs: [{ label: "PAS Files", href: "/compliance/pas-files" }],
  },
  {
    tab: "marketing",
    label: "Marketing",
    subtabs: [{ label: "Brand Assets", href: "/marketing/assets" }],
  },
];

async function maxUpdatedAt(supabase: SupabaseServerClient, table: string): Promise<string | null> {
  const { data } = await supabase
    .from(table)
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

async function maxUpdatedAtWhere(
  supabase: SupabaseServerClient,
  table: string,
  column: string,
  value: string,
): Promise<string | null> {
  const { data } = await supabase
    .from(table)
    .select("updated_at")
    .eq(column, value)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

async function maxCreatedAt(supabase: SupabaseServerClient, table: string): Promise<string | null> {
  const { data } = await supabase
    .from(table)
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { created_at: string } | null)?.created_at ?? null;
}

function latestOf(...values: (string | null)[]): string | null {
  const valid = values.filter((v): v is string => v !== null);
  return valid.length === 0 ? null : valid.reduce((a, b) => (a > b ? a : b));
}

// Best-available "last edited" signal per subtab, keyed by href - a few
// pages have nothing to report (pure calculators, or tables that don't carry
// an updated_at yet) and are left as null on purpose rather than guessed at.
export async function getLastEditedMap(supabase: SupabaseServerClient): Promise<Record<string, string | null>> {
  const [
    loads,
    invoiceStatements,
    amHoldovers,
    repackItems,
    coldInv,
    qcMeta,
    qcInbounds,
    qcFloor,
    qcRepack,
    oldAge,
    qcInspections,
    fobItems,
    fobFreight,
    msgHouston,
    msgDallas,
    msgEastCoast,
    pendingToInvoice,
    priceSheetItems,
    buyersList,
    localInbounds,
    workflowTasks,
    calloutEntries,
    ptoRequests,
    pasFiles,
    marketingFiles,
    marketingTasks,
  ] = await Promise.all([
    maxUpdatedAt(supabase, "loads"),
    maxUpdatedAt(supabase, "invoice_statements"),
    maxUpdatedAt(supabase, "am_holdovers"),
    maxUpdatedAt(supabase, "repack_items"),
    maxUpdatedAt(supabase, "cold_inventory_items"),
    maxUpdatedAt(supabase, "qc_agenda_meta"),
    maxUpdatedAt(supabase, "qc_agenda_inbounds"),
    maxUpdatedAt(supabase, "qc_agenda_floor_aging"),
    maxUpdatedAt(supabase, "qc_agenda_repack"),
    maxUpdatedAt(supabase, "old_age_items"),
    maxUpdatedAt(supabase, "qc_inspections"),
    maxUpdatedAt(supabase, "fob_items"),
    maxUpdatedAt(supabase, "fob_freight_rates"),
    maxUpdatedAtWhere(supabase, "delivered_price_messages", "lane", "houston"),
    maxUpdatedAtWhere(supabase, "delivered_price_messages", "lane", "dallas"),
    maxUpdatedAtWhere(supabase, "delivered_price_messages", "lane", "east-coast"),
    maxUpdatedAt(supabase, "pending_to_invoice"),
    maxUpdatedAt(supabase, "price_sheet_items"),
    maxUpdatedAt(supabase, "buyers_list_items"),
    maxUpdatedAt(supabase, "local_inbounds"),
    maxUpdatedAt(supabase, "workflow_tasks"),
    maxUpdatedAt(supabase, "callout_entries"),
    maxUpdatedAt(supabase, "pto_requests"),
    maxUpdatedAt(supabase, "pas_files"),
    maxCreatedAt(supabase, "marketing_files"),
    maxUpdatedAt(supabase, "marketing_tasks"),
  ]);

  return {
    "/logistics": null, // dashboard summary - nothing of its own to edit
    "/logistics/board": loads,
    "/logistics/rates": null, // broker_rate_entries has no updated_at column tracked yet
    "/logistics/freight-calculator": null, // calculator only, nothing persisted
    "/logistics/weight-calculator": null,
    "/logistics/invoicing": invoiceStatements,
    "/warehouse/am-holdovers": amHoldovers,
    "/warehouse/repack-inventory": repackItems,
    "/warehouse/cold-inventory": coldInv,
    "/qc/agenda": latestOf(qcMeta, qcInbounds, qcFloor, qcRepack),
    "/qc/inspections": qcInspections,
    "/qc/old-age": oldAge,
    "/sales/fob-pharr": latestOf(fobItems, fobFreight),
    "/sales/delivered/houston": latestOf(fobItems, fobFreight, msgHouston),
    "/sales/delivered/dallas": latestOf(fobItems, fobFreight, msgDallas),
    "/sales/delivered/east-coast": latestOf(fobItems, fobFreight, msgEastCoast),
    "/sales/pending-to-invoice": pendingToInvoice,
    "/buyers/price-sheets": priceSheetItems,
    "/buyers/vendor-catalog": priceSheetItems,
    "/buyers/buyers-list": buyersList,
    "/buyers/local-inbounds": localInbounds,
    "/management/workflow": workflowTasks,
    "/management/callout-sheet": latestOf(calloutEntries, ptoRequests),
    "/management/users": null, // role changes aren't timestamped
    "/compliance/pas-files": pasFiles,
    "/marketing/assets": latestOf(marketingFiles, marketingTasks),
  };
}
