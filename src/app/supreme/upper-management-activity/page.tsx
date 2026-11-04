import { addDays, todayISO } from "@/lib/dates";
import { isSupremeUser } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { GREEN, centralParts, dayMd, empty, heading, note, pill, stamp, stats, table } from "@/lib/weeklyReports/html";
import { defaultRange, rangeLabel } from "@/lib/weeklyReports/reports";

export const dynamic = "force-dynamic";

const words = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// What upper management can be shown beyond the weekly emails: the Compliance change log (every PAS
// file added, changed or removed, by whom and when) and the history of weekly reports sent.
export default async function UpperManagementActivityPage({ searchParams }: { searchParams: Promise<{ end?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSupremeUser(user?.email ?? null)) return <p className="text-sm text-black/60 dark:text-white/60">Upper Management Activity is only available to the owner account.</p>;

  const { end: endParam } = await searchParams;
  const today = todayISO();
  const end = endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : today;
  const range = defaultRange(end);

  const [logRes, sendsRes] = await Promise.all([
    supabase.from("pas_file_log").select("*").gte("created_at", `${addDays(range.start, -1)}T00:00:00`).order("created_at", { ascending: false }),
    supabase.from("report_sends").select("*").order("created_at", { ascending: false }).limit(15),
  ]);

  const changes = ((logRes.data ?? []) as { pas_file_id: string; order_no: string | null; po: string | null; customer: string | null; action: string; changed_fields: string[]; changed_by: string | null; created_at: string }[]).filter((c) => {
    const d = centralParts(c.created_at).date;
    return d >= range.start && d <= range.end;
  });
  const distinct = (a: string) => new Set(changes.filter((c) => c.action === a).map((c) => c.pas_file_id)).size;

  const complianceHtml = logRes.error
    ? note("The Compliance change log isn't set up yet (run migration 162).")
    : [
        stats([
          ["Files added", distinct("added")],
          ["Files changed", distinct("changed")],
          ["Files removed", distinct("removed")],
          ["Edits logged", changes.length],
        ]),
        table(
          ["When", "What", "Order", "PO", "Customer", "Fields changed", "By"],
          changes.map((c) => [stamp(c.created_at), { html: pill(words(c.action), c.action === "removed" ? "#c62828" : c.action === "added" ? GREEN : "#ef6c00") }, c.order_no, c.po, c.customer, (c.changed_fields ?? []).map(words).join(", "), c.changed_by]),
          { max: 300 },
        ) || empty("No PAS file changes logged in this period."),
      ].join("");

  const sendsHtml = sendsRes.error
    ? note("The report history isn't set up yet (run migration 162).")
    : table(
        ["Sent", "By", "To", "Reports", "Range"],
        (sendsRes.data ?? []).map((s) => [stamp(s.created_at), s.sent_by, (s.to_emails as string[]).join(", "), (s.reports as string[]).map(words).join(", "), `${dayMd(s.range_start)} - ${dayMd(s.range_end)}`]),
      ) || empty("No weekly reports have been emailed yet.");

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Upper Management Activity</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Compliance changes for the 5 days ending <b>{end === today ? "today" : end}</b>: <b>{rangeLabel(range)}</b>
          </p>
        </div>
        <form className="flex items-end gap-2 text-sm" action="/supreme/upper-management-activity">
          <label className="space-y-0.5">
            <span className="block text-xs text-black/60 dark:text-white/60">Last day of the range</span>
            <input type="date" name="end" defaultValue={end} max={today} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black" />
          </label>
          <button className="rounded-md border border-black/20 px-3 py-1 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">Go</button>
        </form>
      </div>

      <section className="space-y-1 rounded-xl border border-black/10 bg-white p-4 text-black shadow-sm dark:border-white/10">
        <div dangerouslySetInnerHTML={{ __html: heading("Compliance - PAS file changes") + complianceHtml }} />
      </section>

      <section className="space-y-1 rounded-xl border border-black/10 bg-white p-4 text-black shadow-sm dark:border-white/10">
        <div dangerouslySetInnerHTML={{ __html: heading("Weekly reports sent") + sendsHtml }} />
      </section>
    </div>
  );
}
