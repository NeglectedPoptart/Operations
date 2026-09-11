import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { Role } from "@/lib/roles";
import type { CrmDailyGoal } from "@/lib/types";
import DailyGoalsBar, { type GoalUser } from "./DailyGoalsBar";

export const dynamic = "force-dynamic";

// These people still show up everywhere else (bucket/pipeline assignment,
// "All Pipelines") - they're just opted out of the Goals panel itself, per
// request. A plain email list, not a role filter, since it's specific
// people rather than a role-wide rule.
const GOALS_EXCLUDED_EMAILS = new Set([
  "nhalim@harvestbestinc.com",
  "jromero@harvestbestinc.com",
  "tcamph@harvestbestinc.com",
  "avasquez@harvestbestwest.com",
]);

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
  const goalsRoster = (goalUsers ?? []).filter((u) => !GOALS_EXCLUDED_EMAILS.has((u.email ?? "").toLowerCase()));

  return (
    <>
      <DailyGoalsBar
        users={goalsRoster as GoalUser[]}
        initialGoals={(goals ?? []) as CrmDailyGoal[]}
        todayIso={today}
        currentUserId={user?.id ?? ""}
        isAdminOrExec={isAdminOrExec}
      />
      {/* Reserves room for the fixed Goals sidebar so it never sits on top
          of (and hides) the company list/tab row underneath it - the sidebar
          is always fixed regardless of viewport width, so this padding has
          to be unconditional too, not just at a wide breakpoint. */}
      <div className="pr-80">{children}</div>
    </>
  );
}
