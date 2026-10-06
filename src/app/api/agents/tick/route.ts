import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { pollInbox, runAgents, serviceClient } from "@/lib/agents/run";

// Called every 15 minutes by Supabase pg_cron (see migration 115) - Vercel's
// free plan only allows one cron a day. No user session here, so it's
// gated on a shared secret and uses the service-role client. Excluded from
// the login redirect in middleware.ts.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const secret = process.env.AGENT_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = serviceClient();
  const inbox = await pollInbox(db).catch((err) => ({ error: String(err) }));
  const run = await runAgents(db).catch((err) => ({ error: String(err) }));

  revalidatePath("/submanagement/agents");
  revalidatePath("/logistics/board");
  revalidatePath("/logistics");
  return NextResponse.json({ inbox, run });
}

export const GET = handle;
export const POST = handle;
