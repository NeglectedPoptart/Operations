// The weekly "please update your rates" email. Table layout with inline styles and real buttons (not images), so it
// looks the same in Outlook, Gmail and phones. The banner picture is attached inline as cid:ratebanner.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function rateWeekLabel(weekStart: string): string {
  return `Week of ${new Date(`${weekStart}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}`;
}

function button(href: string, label: string, bg: string, color: string, border: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;"><tr><td align="center" bgcolor="${bg}" style="border-radius:14px;border:3px solid ${border};">
<a href="${esc(href)}" target="_blank" style="display:block;padding:20px 38px;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:26px;font-weight:bold;color:${color};text-decoration:none;border-radius:12px;">${label}</a>
</td></tr></table>`;
}

function step(n: string, title: string, text: string): string {
  return `<td width="33%" valign="top" align="center" style="padding:0 6px;">
<div style="width:46px;height:46px;line-height:46px;border-radius:23px;background:#16a34a;color:#ffffff;font-family:Arial,sans-serif;font-size:22px;font-weight:bold;margin:0 auto 8px;">${n}</div>
<div style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#14532d;">${title}</div>
<div style="font-family:Arial,sans-serif;font-size:13px;line-height:18px;color:#4b5563;margin-top:3px;">${text}</div>
</td>`;
}

export function buildRateEmail(input: {
  carrier: string;
  weekStart: string;
  portalUrl: string;
  doneUrl: string;
  // 0 for the first email of the week, 1 for the first reminder, and so on.
  reminder: number;
  test?: boolean;
}): { subject: string; html: string } {
  const week = rateWeekLabel(input.weekStart);
  const short = week.replace("Week of ", "");
  const subject =
    (input.test ? "[TEST] " : "") +
    (input.reminder === 0 ? `Please update your weekly rates - ${short}` : `Reminder ${input.reminder}: please update your weekly rates - ${short}`);

  const alert =
    input.reminder > 0
      ? `<tr><td style="padding:0 28px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#fef3c7" style="border-left:6px solid #f59e0b;border-radius:8px;padding:14px 16px;font-family:Arial,sans-serif;font-size:15px;line-height:21px;color:#78350f;">
<b>&#9200; Reminder ${input.reminder}</b> &mdash; we haven&rsquo;t seen your rates yet this week. We&rsquo;ll send a friendly reminder every hour until they&rsquo;re in.</td></tr></table></td></tr>`
      : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef3ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef3ee"><tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.12);">
<tr><td><img src="cid:ratebanner" alt="Harvest Best - Weekly Rate Update" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>
<tr><td style="padding:26px 28px 8px;font-family:Arial,Helvetica,sans-serif;">
<div style="font-size:22px;font-weight:bold;color:#14532d;">Hi ${esc(input.carrier)} team,</div>
<div style="font-size:16px;line-height:24px;color:#1f2937;margin-top:10px;">${input.reminder === 0 ? "Happy Monday! " : ""}It&rsquo;s time for your weekly rate update. Please log in to the Harvest Best rate portal and enter your current lane rates for the <b>${esc(week.replace(/^Week/, "week"))}</b>. It only takes a few minutes.</div>
</td></tr>
${alert}
<tr><td style="padding:14px 22px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${step("1", "Log in", "Open the rate portal with your Harvest Best login.")}
${step("2", "Enter your rates", "Type your rate for each lane you run.")}
${step("3", "Tap Done", "Let us know you&rsquo;re finished with the green button below.")}
</tr></table></td></tr>
<tr><td style="padding:22px 28px 6px;">${button(input.portalUrl, "&#128666;&nbsp; Open the Rate Portal &rarr;", "#16a34a", "#ffffff", "#15803d")}</td></tr>
<tr><td align="center" style="padding:6px 28px 0;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;">You&rsquo;ll be asked to sign in first if you aren&rsquo;t already.</td></tr>
<tr><td style="padding:22px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:2px dashed #d1d5db;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:14px 28px 4px;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;color:#14532d;">Finished entering your rates?</td></tr>
<tr><td style="padding:8px 28px 6px;">${button(input.doneUrl, "&#10003;&nbsp; I&rsquo;ve submitted my rates", "#fbbf24", "#451a03", "#d97706")}</td></tr>
<tr><td align="center" style="padding:8px 34px 24px;font-family:Arial,sans-serif;font-size:13px;line-height:19px;color:#4b5563;">Tap this once your rates are in. It tells Harvest Best right away that you&rsquo;re done, and we&rsquo;ll stop the reminders.</td></tr>
<tr><td bgcolor="#14532d" align="center" style="padding:18px 24px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#bbf7d0;">
<b style="color:#ffffff;font-size:14px;">Harvest Best Inc.</b><br>Sent by HOPS, the Harvest Best Operations Platform. Questions? Just reply to this email.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, html };
}
