import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl, readRateToken } from "@/lib/carrierRates/token";
import { rateWeekLabel } from "@/lib/carrierRates/email";
import { notifyStaff } from "@/lib/brokerPortal/notify";
import { adminClient } from "@/lib/supabase/admin";

// The "I've submitted my rates" button in the weekly rate email. No login (the link carries a signed token for that
// carrier and week). Opening the link only shows a confirmation page - an email scanner that pre-opens links
// can't mark anyone done - and the big button on that page is what records it and tells Harvest Best.
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{margin:0;background:#eef3ee;font-family:Arial,Helvetica,sans-serif;color:#1f2937}
.wrap{max-width:560px;margin:0 auto;padding:24px 14px}
.card{background:#fff;border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,.12);overflow:hidden}
.head{background:linear-gradient(135deg,#14532d,#16a34a);color:#fff;padding:22px 24px}
.head b{font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.85}
.head h1{margin:6px 0 0;font-size:24px}
.body{padding:24px;font-size:16px;line-height:24px}
.btn{display:block;width:100%;box-sizing:border-box;text-align:center;border:0;border-radius:14px;padding:20px 16px;font-size:20px;font-weight:bold;cursor:pointer;text-decoration:none;margin-top:14px;font-family:inherit}
.go{background:#fbbf24;color:#451a03;border:3px solid #d97706}
.portal{background:#16a34a;color:#fff;border:3px solid #15803d}
.warn{background:#fef3c7;border-left:6px solid #f59e0b;border-radius:8px;padding:12px 14px;color:#78350f;font-size:15px}
.ok{background:#dcfce7;border-left:6px solid #16a34a;border-radius:8px;padding:12px 14px;color:#14532d;font-size:15px}
small{color:#6b7280}
</style></head><body><div class="wrap"><div class="card"><div class="head"><b>Harvest Best</b><h1>${esc(title)}</h1></div><div class="body">${body}</div></div></div></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function look(token: string | null) {
  const parsed = token ? readRateToken(token) : null;
  if (!parsed) return null;
  if (parsed.brokerId === "test") return { ...parsed, name: "Test carrier", test: true as const, count: 0, completedAt: null as string | null };
  const db = adminClient();
  const { data: broker } = await db.from("brokers").select("name").eq("id", parsed.brokerId).maybeSingle();
  if (!broker) return null;
  const { count } = await db
    .from("broker_rate_entries")
    .select("id", { count: "exact", head: true })
    .eq("broker_id", parsed.brokerId)
    .eq("week_start_date", parsed.weekStart)
    .not("rate", "is", null);
  const { data: row } = await db.from("broker_rate_requests").select("completed_at").eq("broker_id", parsed.brokerId).eq("week_start", parsed.weekStart).maybeSingle();
  return { ...parsed, name: broker.name as string, test: false as const, count: count ?? 0, completedAt: (row?.completed_at as string | null) ?? null };
}

const BAD_LINK = () => page("This link isn't valid", `<p>Sorry - this link didn't work. Please use the button in the most recent email from Harvest Best, or open the <a href="${appBaseUrl()}/logistics/broker-rate-entry">rate portal</a> directly.</p>`, 400);

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  const info = await look(token);
  if (!info || !token) return BAD_LINK();
  const portal = `${appBaseUrl()}/logistics/broker-rate-entry`;
  const week = rateWeekLabel(info.weekStart);

  if (info.completedAt) {
    return page("You're all set", `<div class="ok"><b>Thank you, ${esc(info.name)}.</b> We already have you marked as done for the ${esc(week.replace(/^Week/, "week"))}.</div><a class="btn portal" href="${portal}">Open the Rate Portal</a>`);
  }
  const seen =
    info.count > 0
      ? `<div class="ok">We can see <b>${info.count} rate${info.count === 1 ? "" : "s"}</b> you entered for the ${esc(week.replace(/^Week/, "week"))}.</div>`
      : `<div class="warn"><b>We don't see any rates from you yet this week.</b> Please enter them in the rate portal first, then come back and tap the button below.</div><a class="btn portal" href="${portal}">Open the Rate Portal</a>`;
  return page(
    "Submit my rates",
    `<p>Hi <b>${esc(info.name)}</b> team - confirm that your rates for the ${esc(week.replace(/^Week/, "week"))} are in.</p>${seen}
<form method="post" action="/api/carrier-rates/done"><input type="hidden" name="t" value="${esc(token)}">
<button class="btn go" type="submit">&#10003;&nbsp; Yes - I've submitted my rates</button></form>
<p><small>This tells Harvest Best right away that you're done and stops the reminder emails.${info.test ? " (This is the test email - nothing will be recorded.)" : ""}</small></p>`,
  );
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = form ? String(form.get("t") ?? "") : "";
  const info = await look(token);
  if (!info) return BAD_LINK();
  const week = rateWeekLabel(info.weekStart);

  if (info.test) {
    return page("Test only", `<div class="ok"><b>That's how it works.</b> This was the test email, so nothing was recorded and nobody was notified.</div>`);
  }
  if (!info.completedAt) {
    const db = adminClient();
    const { data: row } = await db.from("broker_rate_requests").select("sends").eq("broker_id", info.brokerId).eq("week_start", info.weekStart).maybeSingle();
    const { error } = await db.from("broker_rate_requests").upsert(
      { broker_id: info.brokerId, week_start: info.weekStart, completed_at: new Date().toISOString(), completed_via: "button", sends: (row?.sends as number | undefined) ?? 0 },
      { onConflict: "broker_id,week_start" },
    );
    if (error) return page("Something went wrong", `<p>We couldn't record that just now - please try the button again in a minute.</p>`, 500);
    await notifyStaff(
      `${info.name}: rates updated`,
      `${info.name} says their rates are updated for the ${week.replace(/^Week/, "week")}.${info.count > 0 ? ` HOPS can see ${info.count} rate${info.count === 1 ? "" : "s"} entered.` : " HOPS can't see any rates entered yet - worth a look."}`,
      { footer: "Check them under Logistics > Freight Rates.", pagePath: "/logistics/rates" },
    );
  }
  return page(
    "Thank you!",
    `<div class="ok"><b>Thank you, ${esc(info.name)}.</b> Harvest Best has been told your rates are updated. No more reminders this week.</div>${
      info.count === 0 ? `<p class="warn" style="margin-top:14px">We couldn't see any rates entered yet. If you meant to add some, please do so in the rate portal.</p><a class="btn portal" href="${appBaseUrl()}/logistics/broker-rate-entry">Open the Rate Portal</a>` : ""
    }`,
  );
}
