"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canAccessTab, type Role, type Tab } from "@/lib/roles";

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
      { href: "/warehouse/local-inbounds", label: "Local Inbounds" },
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
    ],
  },
  {
    label: "Management",
    tab: "management",
    items: [
      { href: "/management/workflow", label: "Workflow" },
      { href: "/management/callout-sheet", label: "Callout Sheet" },
      { href: "/management/users", label: "User Roles" },
    ],
  },
  {
    label: "Compliance",
    tab: "compliance",
    items: [{ href: "/compliance/pas-files", label: "PAS Files" }],
  },
];

export default function NavBar({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const nav = NAV.filter((category) => !category.tab || canAccessTab(role, category.tab));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenCategory(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (pathname === "/login") return null;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const buttonClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
      active
        ? "bg-green-600 text-white"
        : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
    }`;

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/90 backdrop-blur print:hidden dark:border-white/10 dark:bg-black/70">
      <nav
        ref={navRef}
        className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3"
      >
        <div className="flex flex-wrap items-center gap-1">
          {nav.map((category) => {
            if (category.href) {
              const active = pathname === category.href;
              return (
                <Link key={category.label} href={category.href} className={buttonClass(active)}>
                  {category.label}
                </Link>
              );
            }

            const items = category.items ?? [];
            const active = items.some(
              (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
            );
            const open = openCategory === category.label;

            return (
              <div key={category.label} className="relative">
                <button
                  onClick={() => setOpenCategory(open ? null : category.label)}
                  className={buttonClass(active)}
                >
                  {category.label} <span className="text-xs">▾</span>
                </button>
                {open && (
                  <div className="absolute left-0 top-full z-30 mt-1 min-w-[11rem] rounded-md border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
                    {items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpenCategory(null)}
                        className={`block px-3 py-2 text-sm ${
                          pathname === item.href
                            ? "font-medium text-green-600"
                            : "text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={signOut}
          className="rounded-md px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}
