import type { SupabaseClient } from "@supabase/supabase-js";

// What HOPS's background worker is doing right now, for the live status card on SubManagement > Agents.
// One row in agent_state (key "tick_status"): written when a pass starts, updated as it moves between steps, and
// closed out when it finishes. The page reads it every few seconds. Never throws - a status write failing must not
// stop the work it describes.

export const TICK_STATUS_KEY = "tick_status";

export interface TickStatus {
  state: "running" | "idle";
  // What started this pass: the 15-minute timer, or someone pressing "Check inbox now".
  source: "timer" | "button";
  startedAt: string;
  // What it is doing at the moment ("Reading email from ...").
  step: string;
  // Filled in when the pass finishes.
  finishedAt: string | null;
  seen: number; // new emails looked at
  handled: number; // emails HOPS acted on
  left: number; // emails it didn't recognise and left for a person
  error: string | null;
}

export async function writeTickStatus(db: SupabaseClient, status: TickStatus): Promise<void> {
  try {
    await db.from("agent_state").upsert({ key: TICK_STATUS_KEY, value: JSON.stringify(status), updated_at: new Date().toISOString() });
  } catch {
    // best effort
  }
}

// Wraps one background pass: marks it running, hands `work` a function to report its steps, then records the result.
export async function trackedPass<T extends { processed?: number; seen?: number; left?: number }>(
  db: SupabaseClient,
  source: TickStatus["source"],
  work: (step: (text: string) => Promise<void>) => Promise<T>,
): Promise<T> {
  const base: TickStatus = { state: "running", source, startedAt: new Date().toISOString(), step: "Starting", finishedAt: null, seen: 0, handled: 0, left: 0, error: null };
  await writeTickStatus(db, base);
  try {
    const result = await work((text) => writeTickStatus(db, { ...base, step: text }));
    await writeTickStatus(db, {
      ...base,
      state: "idle",
      step: "Idle",
      finishedAt: new Date().toISOString(),
      seen: result.seen ?? 0,
      handled: result.processed ?? 0,
      left: result.left ?? 0,
    });
    return result;
  } catch (err) {
    await writeTickStatus(db, { ...base, state: "idle", step: "Idle", finishedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
