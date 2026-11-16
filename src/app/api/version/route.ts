import { NextResponse } from "next/server";

// Which version of HOPS is live right now. Open tabs ask this every minute (see AutoRefresh) and update
// themselves when it changes.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ v: process.env.VERCEL_GIT_COMMIT_SHA ?? "" }, { headers: { "cache-control": "no-store" } });
}
