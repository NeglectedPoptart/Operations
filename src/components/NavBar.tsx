"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BROKER_CARRIER_PATH, canAccessTab, ROLES, type Role, type Tab } from "@/lib/roles";

interface NavItem {
  href: string;
  label: string;
}

interface NavCategory {
  label: string;
  href?: string;
  tab?: Tab;
  items?: NavItem[];
}

const NAV: NavCategory[] = [
  { label: "Home", href: "/" },
  {
    label: "Logistics",
    tab: "logistics",
    items: [
      { href: "/logistics", label: "Summary" },
      { href: "/logistics/board", label: "List" },
      { href: "/logistics/rates", label: "Freight Rates" },
      { href: "/logistics/broker-rate-entry", label: "Broker Rate Entry" },
      { href: "/logistics/freight-calculator", label: "Freight Calculator" },
      { href: "/logistics/weight-calculator", label: "Weight Calculator" },
      { href: "/logistics/invoicing", label: "Invoicing" },
    ],
  },
  {
    label: "Warehouse",
    tab: "warehouse",
    items: [
      { href: "/warehouse/am-holdovers", label: "AM Holdovers" },
      { href: "/warehouse/repack-inventory", label: "Repack Inventory" },
      { href: "/warehouse/cold-inventory", label: "Cold Inventory" },
    ],
  },
  {
    label: "QC",
    tab: "qc",
    items: [
      { href: "/qc/agenda", label: "QC Agenda" },
      { href: "/qc/inspections", label: "QC Inspections" },
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
      { href: "/sales/pending-to-invoice", label: "Pending to Invoice" },
      { href: "/sales/calculator", label: "Sales Calculator" },
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
      { href: "/management/workflow", label: "Workflow" },
      { href: "/management/callout-sheet", label: "Callout Sheet" },
      { href: "/management/schedules", label: "Schedules" },
      { href: "/management/users", label: "User Roles" },
      { href: "/management/notifications", label: "Notifications" },
      { href: "/management/reset", label: "Reset Tools" },
    ],
  },
  {
    label: "Compliance",
    tab: "compliance",
    items: [{ href: "/compliance/pas-files", label: "PAS Files" }],
  },
  {
    label: "Accounting",
    tab: "accounting",
    items: [
      { href: "/accounting/ar", label: "Accounts Receivable" },
      { href: "/accounting/ar-troubles", label: "AR Troubles" },
      { href: "/accounting/ap", label: "Accounts Payable" },
      { href: "/accounting/pay-lists", label: "Pay Lists" },
    ],
  },
  {
    label: "Marketing",
    tab: "marketing",
    items: [{ href: "/marketing/assets", label: "Brand Assets" }],
  },
];

// One small stroke icon per category - hand-drawn rather than pulled from
// an icon library, since the app doesn't depend on one anywhere else.
function CategoryIcon({ label, className }: { label: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (label) {
    case "Home":
      return (
        <svg {...common}>
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case "Logistics":
      return (
        <svg {...common}>
          <path d="M3 7h10v9H3z" />
          <path d="M13 11h4l3 3v2h-7z" />
          <circle cx="7" cy="18" r="1.6" />
          <circle cx="17" cy="18" r="1.6" />
        </svg>
      );
    case "Warehouse":
      return (
        <svg {...common}>
          <path d="M3 10 12 4l9 6v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "QC":
      return (
        <svg {...common}>
          <path d="M7 4h10v3a5 5 0 0 1-10 0z" />
          <path d="M7 20h10v-3a5 5 0 0 0-10 0z" />
          <path d="M9.5 11.5 11 13l3.5-3.5" />
        </svg>
      );
    case "Sales":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v9M9.5 15c0 1.1 1.1 2 2.5 2s2.5-.9 2.5-2-1.1-1.5-2.5-1.8S9.5 12.6 9.5 11.5 10.6 9.5 12 9.5s2.5.6 2.5 1.5" />
        </svg>
      );
    case "Buyers":
      return (
        <svg {...common}>
          <path d="M6 8h12l-1 12H7z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "Management":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.75" />
          <path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M6.3 17.7l1.6-1.6M16.1 7.9l1.6-1.6" />
        </svg>
      );
    case "Compliance":
      return (
        <svg {...common}>
          <path d="M12 4l7 2.5v5.5c0 4.5-3 7.2-7 8-4-.8-7-3.5-7-8V6.5z" />
          <path d="M9.5 12l2 2 3.5-4" />
        </svg>
      );
    case "Accounting":
      return (
        <svg {...common}>
          <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
          <path d="M8.5 7.5h7M8.5 11h2M13.5 11h2M8.5 14.5h2M13.5 14.5h2M8.5 18h2M13.5 18h2" />
        </svg>
      );
    case "Marketing":
      return (
        <svg {...common}>
          <path d="M4 10v4h3l6 4V6l-6 4z" />
          <path d="M13 9.5a3 3 0 0 1 0 5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      );
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export default function NavBar({ role, email }: { role: Role | null; email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isBrokerCarrier = role === "broker_carrier";
  // A broker/carrier login gets none of the normal categories - not even
  // Home, which every other role gets for free (it has no `.tab`, so the
  // filter below would otherwise always keep it).
  const nav = useMemo(
    () => (isBrokerCarrier ? [] : NAV.filter((category) => !category.tab || canAccessTab(role, category.tab))),
    [isBrokerCarrier, role],
  );

  const activeCategoryLabel = useMemo(
    () =>
      nav.find((category) =>
        (category.items ?? []).some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
      )?.label ?? null,
    [nav, pathname],
  );
  const [openCategory, setOpenCategory] = useState<string | null>(activeCategoryLabel);

  // Adjust state in response to navigation, during render rather than in an
  // effect (React's recommended pattern for this - avoids an extra
  // commit/paint cycle): re-expand whichever group contains the page just
  // navigated to, and close the mobile drawer since it did its job.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
    if (activeCategoryLabel) setOpenCategory(activeCategoryLabel);
  }

  if (pathname === "/login") return null;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const roleLabel = ROLES.find((r) => r.value === role)?.label ?? null;
  const initials = (email ?? "?").trim().slice(0, 1).toUpperCase();

  const topLevelClass = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition ${
      active ? "bg-brand text-white" : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
    }`;

  const sidebarInner = (
    <>
      <div className="border-b border-sidebar-border px-4 py-4">
        <img
          src="/logo-harvest-best.png"
          alt="Harvest Best"
          className="mx-auto h-16 w-auto rounded-md bg-white p-1.5 object-contain"
        />
        <div className="mt-2 text-center leading-tight">
          <p className="text-sm font-bold text-white">HOPS</p>
          <p className="text-[11px] text-sidebar-text-muted">Harvest Best Operations Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        {isBrokerCarrier && (
          <Link
            href={BROKER_CARRIER_PATH}
            className={topLevelClass(pathname.startsWith(BROKER_CARRIER_PATH))}
          >
            <CategoryIcon label="Logistics" className="h-5 w-5 shrink-0" />
            Broker Rate Entry
          </Link>
        )}
        {nav.map((category) => {
          if (category.href) {
            const active = pathname === category.href;
            return (
              <Link key={category.label} href={category.href} className={topLevelClass(active)}>
                <CategoryIcon label={category.label} className="h-5 w-5 shrink-0" />
                {category.label}
              </Link>
            );
          }

          const items = category.items ?? [];

          // A single-item category has nothing to expand into - link
          // straight to that one page instead of a pointless accordion.
          if (items.length === 1) {
            const only = items[0];
            const active = pathname === only.href || pathname.startsWith(`${only.href}/`);
            return (
              <Link key={category.label} href={only.href} className={topLevelClass(active)}>
                <CategoryIcon label={category.label} className="h-5 w-5 shrink-0" />
                {category.label}
              </Link>
            );
          }

          const active = items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
          const open = openCategory === category.label;

          return (
            <div key={category.label}>
              <button
                onClick={() => setOpenCategory(open ? null : category.label)}
                className={topLevelClass(active)}
              >
                <CategoryIcon label={category.label} className="h-5 w-5 shrink-0" />
                <span className="flex-1">{category.label}</span>
                <ChevronIcon open={open} />
              </button>
              {open && (
                <div className="mt-0.5 ml-4 space-y-0.5 border-l border-sidebar-border pl-3">
                  {items.map((item) => {
                    const itemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-md px-2.5 py-1.5 text-sm ${
                          itemActive
                            ? "font-medium text-white"
                            : "text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{email ?? "Signed in"}</p>
            {roleLabel && <p className="truncate text-[11px] text-sidebar-text-muted">{roleLabel}</p>}
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-1 w-full rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-sidebar-text-muted hover:bg-sidebar-hover hover:text-white"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar - the sidebar itself is hidden below lg, so this is
          the only way to reach navigation on a phone-width screen (this app
          also ships as an Android/Capacitor + PWA install, where narrow
          viewports are the norm, not the exception). */}
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 lg:hidden print:hidden">
        <div className="flex items-center gap-2">
          <img
            src="/logo-harvest-best.png"
            alt="Harvest Best"
            className="h-8 w-auto rounded bg-white p-1 object-contain"
          />
          <span className="text-sm font-bold text-white">HOPS</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 text-sidebar-text hover:bg-sidebar-hover hover:text-white"
        >
          <MenuIcon />
        </button>
      </div>

      {/* Desktop sidebar - always visible, part of the normal flex layout */}
      <header className="hidden h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-text print:hidden lg:flex">
        {sidebarInner}
      </header>

      {/* Mobile drawer - only mounted while open, sits above everything */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <header className="flex h-full w-72 max-w-[80vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-text">
            {sidebarInner}
          </header>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex-1 bg-black/50"
          />
        </div>
      )}
    </>
  );
}
