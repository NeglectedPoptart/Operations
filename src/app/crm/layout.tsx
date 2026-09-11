import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { Role } from "@/lib/roles";
import type { CrmDailyGoal } from "@/lib/types";
import DailyGoalsBar, { type GoalUser } from "./DailyGoalsBar";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const today = todayISO();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: goalUsers }, { data: goals }, { data: myProfile }] = await Promise.all([
    supabase.from("profiles").select("id, email").in("role", ["admin", "executive", "sales", "buyer_sales"]),
    supabase.from("crm_daily_goals").select("*").eq("goal_date", today),
    user ? supabase.from("profiles").select("role").eq("id", user.id).single() : Promise.resolve({ data: null }),
  ]);

  const role = (myProfile?.role as Role | undefined) ?? null;
  const isAdminOrExec = role === "admin" || role === "executive";

  return (
    <>
      <DailyGoalsBar
        users={(goalUsers ?? []) as GoalUser[]}
        initialGoals={(goals ?? []) as CrmDailyGoal[]}
        todayIso={today}
        currentUserId={user?.id ?? ""}
        isAdminOrExec={isAdminOrExec}
      />
      {/* Reserves room for the fixed Goals sidebar on wider screens so it
          never sits on top of the company list; on narrow screens there's
          no room to spare, so it just overlays instead. */}
      <div className="lg:pr-80">{children}</div>
    </>
  );
}
