import { createHmac, timingSafeEqual } from "node:crypto";

// The "I've submitted my rates" link in the weekly rate email works without logging in, so it carries a signed
// token: which carrier and which week, signed with the server's secret. Nobody can make one for another carrier.

function secret(): string {
  const s = process.env.AGENT_CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("No signing secret is set (AGENT_CRON_SECRET).");
  return s;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

// brokerId is "test" for the preview email sent to the test address - its done page records nothing.
export function makeRateToken(brokerId: string, weekStart: string): string {
  const payload = Buffer.from(`${brokerId}|${weekStart}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readRateToken(token: string): { brokerId: string; weekStart: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [brokerId, weekStart] = Buffer.from(payload, "base64url").toString().split("|");
  if (!brokerId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart ?? "")) return null;
  return { brokerId, weekStart };
}

// The address the carrier's links point at.
export function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://operations-roan.vercel.app";
}
