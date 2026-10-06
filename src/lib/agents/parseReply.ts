import Anthropic from "@anthropic-ai/sdk";
import type { ProposedBuyerUpdate, ProposedLoadUpdate } from "./types";

// Turns a free-text email reply ("truck's in Amarillo, should deliver
// tomorrow 6am") into structured load updates. Claude only proposes -
// nothing here writes to HOPS; see applyReply in run.ts.

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const nullable = (type: "string" | "boolean") => ({ anyOf: [{ type }, { type: "null" }] });

const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "updates"],
  properties: {
    summary: { type: "string", description: "One short sentence: what the reply says." },
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["load_number", "eta_note", "append_note", "ready_to_load", "new_status", "delivered", "confident"],
        properties: {
          load_number: { type: "integer", description: "The load's number from the original email (1 if only one load)." },
          eta_note: nullable("string"),
          append_note: nullable("string"),
          ready_to_load: nullable("boolean"),
          new_status: { anyOf: [{ type: "string", enum: ["on_the_road", "complete"] }, { type: "null" }] },
          delivered: nullable("boolean"),
          confident: { type: "boolean" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You read email replies to automated follow-ups sent by Harvest Best, a produce company, and turn them into updates for its operations system (HOPS).

For each load the reply gives information about, return one entry in "updates":
- load_number: the number of the load in the original email (use 1 when the email covered a single load).
- eta_note: a short ETA/location note in the style dispatchers write, e.g. "Amarillo TX 9/26 2pm - ETA 9/27 0600". Only when the reply gives location or timing for a load that is moving. Otherwise null.
- append_note: any other useful status for the load (loading time, delay reason, problem), written briefly. Otherwise null.
- ready_to_load: true only if the reply clearly says the load is ready or loaded; false only if it clearly says it is not ready; otherwise null.
- new_status: "on_the_road" if the reply says the truck has loaded and left; otherwise null. Never return "complete" - a delivered load is reported with "delivered" instead.
- delivered: true if the reply says this load has been delivered/unloaded/dropped (even if proof of delivery will come later or is attached); false if it clearly says it has not been delivered yet; otherwise null. Do not set it just because an ETA is given.
- confident: false if the reply is ambiguous, you had to guess which load it means, or it raises a problem a person should see (rejection, damage, temperature issue, claim, cancellation).

Attached files are checked separately - do not mention them unless the reply text does. Leave out loads the reply says nothing about. If the reply is only an acknowledgment, out-of-office, or unrelated, return an empty "updates" list. Never invent times or places that aren't in the reply.`;

export async function parseReply(input: {
  agentKey: string;
  originalBody: string;
  replyText: string;
  loadCount: number;
}): Promise<{ summary: string; updates: ProposedLoadUpdate[] }> {
  const client = new Anthropic();

  // Haiku: reading a short reply into a fixed schema is simple extraction,
  // and it's ~5x cheaper than Opus. Anything it isn't sure about is flagged
  // not-confident and lands in Review anyway.
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4000,
    output_config: {
      format: { type: "json_schema", schema: REPLY_SCHEMA },
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Agent: ${input.agentKey}\n\n<original_email>\n${input.originalBody}\n</original_email>\n\n<reply>\n${input.replyText}\n</reply>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to read this reply - review it by hand.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no result.");

  const parsed = JSON.parse(text.text) as {
    summary: string;
    updates: (Omit<ProposedLoadUpdate, "load_id"> & { load_number: number })[];
  };
  return {
    summary: parsed.summary,
    // load_number -> index into the thread's record_ids happens in run.ts;
    // anything out of range is kept but flagged not-confident there.
    updates: parsed.updates.map((u) => ({ ...u, load_id: "" })),
  };
}

// ---------------------------------------------------------------------------
// Proof of delivery check. A load only goes Complete on a POD Claude has
// actually read and matched to the load.

const POD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_pod", "load_number", "confident", "note"],
  properties: {
    is_pod: { type: "boolean" },
    load_number: { anyOf: [{ type: "integer" }, { type: "null" }] },
    confident: { type: "boolean" },
    note: { type: "string", description: "One short sentence: what the document is and who signed or received." },
  },
} as const;

const POD_SYSTEM = `You check files that trucking carriers email back to a produce company (Harvest Best) to decide whether a file is a signed proof of delivery (POD).

A POD is a delivery receipt or bill of lading showing the load was received: a receiver's signature or stamp, a delivery date, and usually reference numbers (PO, order, BOL, customer, destination). These are NOT a POD: rate confirmations, invoices, unsigned or blank bills of lading, pickup-only paperwork, lumper receipts, photos of a truck or trailer, screenshots of tracking, signature logos.

Return:
- is_pod: true only if the file shows evidence the freight was received (signature/stamp by the receiver or a clear received-on date).
- load_number: which numbered load in the list the document belongs to, by comparing PO numbers, order numbers, customer and destination. If there is exactly one load in the list, the document is a POD, and nothing in it contradicts that load, return 1. Null if you cannot tell which load.
- confident: true only if is_pod is clear AND the load match is clear (an identifier matches, or the single-load case above). False if the scan is unreadable, unsigned, or its references point at a different load.
- note: one short sentence.`;

export async function verifyPod(input: {
  data: Buffer;
  contentType: string;
  loads: { number: number; description: string }[];
}): Promise<{ is_pod: boolean; load_number: number | null; confident: boolean; note: string }> {
  const client = new Anthropic();
  const base64 = input.data.toString("base64");
  const file =
    input.contentType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: input.contentType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 },
        } as const);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1000,
    output_config: { format: { type: "json_schema", schema: POD_SCHEMA } },
    system: POD_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          file,
          {
            type: "text",
            text: `Loads in the email this file came with:\n${input.loads.map((l) => `${l.number}) ${l.description}`).join("\n")}`,
          },
        ],
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text");
  if (response.stop_reason === "refusal" || !text || text.type !== "text") {
    return { is_pod: false, load_number: null, confident: false, note: "Claude could not read this file - check it by hand." };
  }
  return JSON.parse(text.text) as { is_pod: boolean; load_number: number | null; confident: boolean; note: string };
}

// ---------------------------------------------------------------------------
// Buyers List replies: a status per numbered line, or "already purchased".

const BUYERS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "updates"],
  properties: {
    summary: { type: "string", description: "One short sentence: what the reply says." },
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item_number", "note", "qty_needed", "purchased", "confident"],
        properties: {
          item_number: { type: "integer", description: "The line's number in the original email." },
          note: nullable("string"),
          qty_needed: { anyOf: [{ type: "integer" }, { type: "null" }] },
          purchased: nullable("boolean"),
          confident: { type: "boolean" },
        },
      },
    },
  },
} as const;

const BUYERS_SYSTEM = `You read email replies to a Buyers List follow-up sent by Harvest Best, a produce company. The email lists numbered commodity lines the company still needs to buy; the reply says where each stands.

For each numbered line the reply gives information about, return one entry in "updates":
- item_number: the line's number in the original email.
- note: a short status in the buyer's words, e.g. "Pending quote from Rio Farms, call Thurs" or "Bought 2 loads, arriving Fri". Null if the reply gives no status beyond "purchased".
- qty_needed: the quantity still needed ONLY if the reply states a new remaining number (same unit as the list); otherwise null.
- purchased: true only if the reply clearly says the full need for this line has been bought, ordered or covered. False/null for anything partial, pending, quoted or "working on it".
- confident: false if you had to guess which line is meant, the reply is ambiguous, or it is unclear whether the line is fully purchased.

Replies may be written by several people; treat the whole reply as one status update. Leave out lines the reply says nothing about. If the reply is only an acknowledgment, out-of-office or unrelated, return an empty "updates" list. Never invent details.`;

export async function parseBuyersReply(input: {
  originalBody: string;
  replyText: string;
}): Promise<{ summary: string; updates: Omit<ProposedBuyerUpdate, "item_id">[] }> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: BUYERS_SCHEMA } },
    system: BUYERS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `<original_email>\n${input.originalBody}\n</original_email>\n\n<reply>\n${input.replyText}\n</reply>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to read this reply - review it by hand.");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no result.");
  return JSON.parse(text.text) as { summary: string; updates: Omit<ProposedBuyerUpdate, "item_id">[] };
}
