import type { Metadata, Viewport } from "next";
import { Rajdhani } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import ConfirmProvider from "@/components/ConfirmProvider";
import DailyReminderModal from "@/components/DailyReminderModal";
import NavBar from "@/components/NavBar";
import NflTeamPrompt from "@/components/NflTeamPrompt";
import NotesLauncher from "@/components/notes/NotesLauncher";
import NotificationPopup from "@/components/NotificationPopup";
import PushRegistration from "@/components/PushRegistration";
import TimezoneSync from "@/components/TimezoneSync";
import { NFL_NO_TEAM } from "@/lib/nfl";
import { todayISO } from "@/lib/dates";
import { getDailyReminderCheck, type DailyReminderCheck } from "@/lib/dailyReminders";
import { createClient } from "@/lib/supabase/server";
import { FULL_ACCESS, isSupremeUser, isWarehouseQcLike, type Role, type RoleAccess } from "@/lib/roles";
import { loadRoleAccess, loadRoles } from "@/lib/roleAccess";
import "./globals.css";

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Operations Board",
  description: "Load board, delivery schedule, and rate tracker",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Operations",
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: Role | null = null;
  let access: RoleAccess = { tabs: [], hiddenPages: [], allowedPages: [] };
  let roleLabel: string | null = null;
  let reminderCheck: DailyReminderCheck | null = null;
  let savedTimezone: string | null = null;
  let timezoneIsManual = false;
  // null = not asked yet. If the column is missing (migration not run) don't ask.
  let userName: string | null = null;
  let nflTeam: string | null = NFL_NO_TEAM;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, last_reminder_seen_date")
      .eq("id", user.id)
      .single();
    role = (profile?.role ?? null) as Role | null;
    access = isSupremeUser(user.email ?? null) ? FULL_ACCESS : await loadRoleAccess(supabase, role);
    roleLabel = (await loadRoles(supabase)).find((r) => r.key === role)?.label ?? null;
    // Separate, error-tolerant read: the time zone columns come from a later
    // migration, and a missing column must never take the layout down.
    const { data: tzRow } = await supabase.from("profiles").select("timezone, timezone_source").eq("id", user.id).maybeSingle();
    savedTimezone = (tzRow?.timezone as string | null | undefined) ?? null;
    timezoneIsManual = tzRow?.timezone_source === "manual";
    const { data: nflRow, error: nflError } = await supabase.from("profiles").select("nfl_team").eq("id", user.id).maybeSingle();
    if (!nflError) nflTeam = (nflRow?.nfl_team as string | null | undefined) ?? null;
    // The name they chose, else their employee record - tolerant of the column/link not existing.
    const { data: nameRow } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    userName = (nameRow?.display_name as string | null | undefined)?.trim() || null;
    if (!userName) {
      const { data: emp } = await supabase.from("employees").select("name").eq("linked_user_id", user.id).maybeSingle();
      userName = (emp?.name as string | null | undefined)?.trim() || null;
    }
    const lastSeen = profile?.last_reminder_seen_date as string | null;
    if (isWarehouseQcLike(role) && lastSeen !== todayISO()) {
      reminderCheck = await getDailyReminderCheck(supabase);
    }
  }

  // A broker/carrier login only ever sees its one page (enforced in
  // middleware.ts) - none of the internal-team chrome (nav dropdowns, the
  // Warehouse/QC reminder, internal Notify popups, push registration)
  // belongs in front of an outside carrier, so it's all skipped here too.
  const isBrokerCarrier = role === "broker_carrier";

  return (
    <html lang="en" suppressHydrationWarning className={`${rajdhani.variable} h-full antialiased`}>
      <head>
        {/* Marks a pop-out window before the page paints, so the menu never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(window.name.indexOf("hops-popout")===0)document.documentElement.setAttribute("data-popout","1")}catch(e){}` }} />
      </head>
      <body className="min-h-full">
        <ConfirmProvider>
          {user ? (
            <div className="flex h-screen flex-col lg:flex-row print:h-auto">
              <div className="popout-hide contents">
                <NavBar role={role} email={user.email ?? null} access={access} roleLabel={roleLabel} nflTeam={nflTeam} userName={userName} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
                <div className="popout-hide contents">
                  {!isBrokerCarrier && reminderCheck && <DailyReminderModal check={reminderCheck} />}
                  {!isBrokerCarrier && <NotificationPopup />}
                  {!isBrokerCarrier && <NotesLauncher />}
                  {!isBrokerCarrier && <NflTeamPrompt team={nflTeam} />}
                </div>
                {!isBrokerCarrier && <PushRegistration />}
                <TimezoneSync saved={savedTimezone} manual={timezoneIsManual} />
                <main className="popout-main flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 print:overflow-visible print:px-0 print:py-0">
                  <div className="mx-auto w-full max-w-7xl">{children}</div>
                </main>
              </div>
            </div>
          ) : (
            <div className="flex min-h-screen flex-col">
              <AppHeader />
              <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
            </div>
          )}
        </ConfirmProvider>
      </body>
    </html>
  );
}
