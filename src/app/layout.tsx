import type { Metadata, Viewport } from "next";
import { Rajdhani } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import ConfirmProvider from "@/components/ConfirmProvider";
import DailyReminderModal from "@/components/DailyReminderModal";
import NavBar from "@/components/NavBar";
import NotificationPopup from "@/components/NotificationPopup";
import PushRegistration from "@/components/PushRegistration";
import { todayISO } from "@/lib/dates";
import { getDailyReminderCheck, type DailyReminderCheck } from "@/lib/dailyReminders";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";
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
  let reminderCheck: DailyReminderCheck | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, last_reminder_seen_date")
      .eq("id", user.id)
      .single();
    role = (profile?.role ?? null) as Role | null;
    const lastSeen = profile?.last_reminder_seen_date as string | null;
    if (role === "warehouse_qc" && lastSeen !== todayISO()) {
      reminderCheck = await getDailyReminderCheck(supabase);
    }
  }

  // A broker/carrier login only ever sees its one page (enforced in
  // middleware.ts) - none of the internal-team chrome (nav dropdowns, the
  // Warehouse/QC reminder, internal Notify popups, push registration)
  // belongs in front of an outside carrier, so it's all skipped here too.
  const isBrokerCarrier = role === "broker_carrier";

  return (
    <html lang="en" className={`${rajdhani.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ConfirmProvider>
          <AppHeader />
          <NavBar role={role} />
          {!isBrokerCarrier && reminderCheck && <DailyReminderModal check={reminderCheck} />}
          {user && !isBrokerCarrier && <NotificationPopup />}
          {user && !isBrokerCarrier && <PushRegistration />}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
            {children}
          </main>
        </ConfirmProvider>
      </body>
    </html>
  );
}
