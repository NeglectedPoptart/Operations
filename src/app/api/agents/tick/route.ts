import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { pollInbox, runAgents, serviceClient } from "@/lib/agents/run";
import { trackedPass } from "@/lib/agents/status";

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
  // The live status card on SubManagement > Agents reads what this pass is doing (see lib/agents/status.ts).
  const result = await trackedPass(db, "timer", async (step) => {
    const inbox = await pollInbox(db, step).catch((err) => ({ error: String(err), processed: 0, seen: 0, left: 0 }));
    await step("Running the scheduled agents (ETA follow-ups, price sheets, statements)");
    const run = await runAgents(db).catch((err) => ({ error: String(err) }));
    return { processed: inbox.processed, seen: inbox.seen, left: inbox.left, inbox, run };
  });

  revalidatePath("/submanagement/agents");
  revalidatePath("/logistics/board");
  revalidatePath("/logistics");
  return NextResponse.json({ inbox: result.inbox, run: result.run });
}

export const GET = handle;
export const POST = handle;
