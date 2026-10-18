import { createClient } from "@/lib/supabase/server";
import { NAV } from "@/lib/navConfig";
import { FULL_ACCESS, canAccessTab, isSupremeUser, type Role } from "@/lib/roles";
import { loadRoleAccess } from "@/lib/roleAccess";
import { canOpenPage } from "@/lib/pageAccess";
import { listLayouts } from "./actions";
import DashboardClient, { type ModuleOption } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await canOpenPage(supabase, user, "/dashboard"))) {
    return <p className="text-sm text-black/60 dark:text-white/60">You do not have access to the Dashboard.</p>;
  }

  // Every page this person can open - what the + Open picker offers.
  const supreme = isSupremeUser(user?.email ?? null);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).maybeSingle();
  const role = (profile?.role ?? null) as Role | null;
  const access = supreme ? FULL_ACCESS : await loadRoleAccess(supabase, role);

  const modules: ModuleOption[] = [];
  for (const category of NAV) {
    if (!category.items || category.label === "Dashboard") continue;
    if (category.supremeOnly && !supreme) continue;
    for (const item of category.items) {
      const granted = access.allowedPages.includes(item.href);
      if (!granted) {
        if (category.tab && !canAccessTab(access, category.tab)) continue;
        if (access.hiddenPages.includes(item.href)) continue;
        if (role && item.excludeRoles?.includes(role)) continue;
        if (item.supremeOnly && !supreme) continue;
        if (item.onlyRoles && !supreme && !(role && item.onlyRoles.includes(role))) continue;
      }
      modules.push({ href: item.href, label: item.label, category: category.label });
    }
  }

  const layouts = await listLayouts();
  return <DashboardClient modules={modules} layouts={layouts} />;
}
