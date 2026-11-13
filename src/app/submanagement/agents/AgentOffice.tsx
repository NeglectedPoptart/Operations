"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Agent, AgentEvent } from "@/lib/agents/types";
import { runAgentNow, updateAgent } from "./actions";

// The Agents as a little office: each agent is a character who looks like their job, wanders the office on their
// own, and can be clicked to talk to - ask how they are, what they have been doing, run them, switch them on or
// off, or open their settings.

// ---- who each agent is ----------------------------------------------------------------------------

type Hair = "short" | "long" | "bun" | "bob";
type Gear = "cap" | "hardhat" | "headset" | "glasses" | "vest" | "envelope" | "basket" | "clipboard" | "tie" | "pricetag" | "sheet";

interface Look {
  name: string;
  role: string;
  skin: string;
  hair: string;
  hairStyle: Hair;
  shirt: string;
  pants: string;
  gear: Gear[];
  // What they say about themselves.
  intro: string;
  // Little things they go off to do.
  errand: string;
}

const LOOKS: Record<string, Look> = {
  load_eta: {
    name: "Dex",
    role: "Dispatcher",
    skin: "#e0ac84",
    hair: "#2b2118",
    hairStyle: "short",
    shirt: "#f97316",
    pants: "#334155",
    gear: ["cap", "headset", "vest", "clipboard"],
    intro: "I keep an eye on every truck. I email the carriers for their location and ETA, read what they send back, and put it on the load - POD photos too.",
    errand: "checking on trucks",
  },
  customer_eta: {
    name: "Cora",
    role: "Customer care",
    skin: "#f1c9a5",
    hair: "#7c3f1d",
    hairStyle: "long",
    shirt: "#2563eb",
    pants: "#1e293b",
    gear: ["headset", "envelope"],
    intro: "I keep your customers in the loop. When a load is on the road with an ETA, I email the customer the latest.",
    errand: "writing to customers",
  },
  buyers_list: {
    name: "Benny",
    role: "Buyer",
    skin: "#c68642",
    hair: "#111827",
    hairStyle: "short",
    shirt: "#15803d",
    pants: "#44403c",
    gear: ["glasses", "basket"],
    intro: "I do the shopping rounds. I email the buyers about what is still needed on the Buyers List and read what they answer.",
    errand: "looking over the produce",
  },
  orders_pending: {
    name: "Olive",
    role: "Order desk",
    skin: "#8d5524",
    hair: "#1f1a17",
    hairStyle: "bun",
    shirt: "#0ea5e9",
    pants: "#334155",
    gear: ["hardhat", "glasses", "clipboard"],
    intro: "I chase the pending orders. I send the Orders follow-up and read the replies so nothing slips through.",
    errand: "checking the orders",
  },
  delivered_sheets: {
    name: "Penny",
    role: "Price sheets",
    skin: "#f5d0b0",
    hair: "#d4a017",
    hairStyle: "bob",
    shirt: "#6b21a8",
    pants: "#3b0764",
    gear: ["tie", "pricetag", "sheet"],
    intro: "I am the price list person. Once the morning FOB prices are in, I send the Delivered price sheets out to the customers.",
    errand: "printing price sheets",
  },
};

const FALLBACK: Look = { name: "Agent", role: "Helper", skin: "#e0ac84", hair: "#3f3f46", hairStyle: "short", shirt: "#64748b", pants: "#334155", gear: ["tie"], intro: "I help out around HOPS.", errand: "working" };

export const lookFor = (key: string): Look => LOOKS[key] ?? FALLBACK;

// ---- the characters -------------------------------------------------------------------------------

function Person({ look, mode, size }: { look: Look; mode: "walk" | "work" | "idle" | "sleep" | "talk"; size: string }) {
  const g = (x: Gear) => look.gear.includes(x);
  const sitting = mode === "work" || mode === "sleep";
  const asleep = mode === "sleep";
  const hairBack = look.hairStyle === "long" || look.hairStyle === "bob";
  return (
    <svg viewBox="0 0 64 96" style={{ width: size, height: "auto", overflow: "visible" }} className={`ao-person ao-${mode}`} aria-hidden="true">
      {!sitting && <ellipse cx="32" cy="92" rx="16" ry="3.6" fill="rgba(0,0,0,.2)" />}
      {/* back hair */}
      {hairBack && <rect x="17" y="14" width="30" height={look.hairStyle === "long" ? 32 : 22} rx="10" fill={look.hair} />}
      {/* legs */}
      {!sitting && (
        <g>
          <g className="ao-leg ao-leg-l">
            <rect x="23" y="62" width="8" height="26" rx="3" fill={look.pants} />
            <rect x="21" y="85" width="12" height="6" rx="3" fill="#1f2937" />
          </g>
          <g className="ao-leg ao-leg-r">
            <rect x="33" y="62" width="8" height="26" rx="3" fill={look.pants} />
            <rect x="31" y="85" width="12" height="6" rx="3" fill="#1f2937" />
          </g>
        </g>
      )}
      {sitting && <rect x="21" y="62" width="22" height="22" rx="4" fill={look.pants} />}
      <g className="ao-body">
        {/* left arm (behind) */}
        <g className="ao-arm ao-arm-l">
          <rect x="13" y="38" width="8" height="24" rx="4" fill={look.shirt} />
          <circle cx="17" cy="63" r="4" fill={look.skin} />
        </g>
        {/* torso */}
        <rect x="18" y="36" width="28" height="30" rx="9" fill={look.shirt} />
        {g("vest") && (
          <g>
            <rect x="18" y="36" width="28" height="30" rx="9" fill="#fb923c" opacity=".55" />
            <rect x="18" y="47" width="28" height="3.5" fill="#fef3c7" />
            <rect x="18" y="56" width="28" height="3.5" fill="#fef3c7" />
          </g>
        )}
        {g("tie") && <path d="M30 37 L34 37 L35 52 L32 56 L29 52 Z" fill="#fde68a" />}
        {g("pricetag") && (
          <g>
            <rect x="37" y="42" width="10" height="8" rx="1.5" fill="#fff" />
            <text x="42" y="48.6" fontSize="7" fontWeight="700" textAnchor="middle" fill="#6b21a8">
              $
            </text>
          </g>
        )}
        {g("basket") && (
          <g>
            <rect x="19" y="46" width="26" height="16" rx="3" fill="#166534" />
            <rect x="21" y="49" width="22" height="2.5" rx="1" fill="#86efac" opacity=".7" />
          </g>
        )}
        {/* neck + head */}
        <rect x="28" y="32" width="8" height="7" fill={look.skin} />
        <g className="ao-head">
          <circle cx="32" cy="23" r="13" fill={look.skin} />
          {/* front hair */}
          {look.hairStyle === "bun" && <circle cx="32" cy="7" r="6" fill={look.hair} />}
          <path d="M19 22 Q19 8 32 8 Q45 8 45 22 Q40 15 32 15 Q24 15 19 22 Z" fill={look.hair} />
          {/* face */}
          {asleep ? (
            <g stroke="#3f2d20" strokeWidth="1.6" fill="none" strokeLinecap="round">
              <path d="M24.5 24 q2.5 2.2 5 0" />
              <path d="M34.5 24 q2.5 2.2 5 0" />
            </g>
          ) : (
            <g className="ao-eyes">
              <circle cx="27.5" cy="24" r="1.9" fill="#1f2937" />
              <circle cx="36.5" cy="24" r="1.9" fill="#1f2937" />
            </g>
          )}
          <path d={asleep ? "M29 31 q3 1.2 6 0" : "M28 30 q4 4 8 0"} stroke="#7c2d12" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {g("glasses") && (
            <g stroke="#111827" strokeWidth="1.3" fill="rgba(255,255,255,.25)">
              <circle cx="27.5" cy="24" r="4.4" />
              <circle cx="36.5" cy="24" r="4.4" />
              <path d="M31.9 24 h.2" />
            </g>
          )}
          {g("cap") && (
            <g>
              <path d="M18.5 19 Q32 2 45.5 19 Z" fill="#16a34a" />
              <rect x="16" y="17.5" width="20" height="3.6" rx="1.8" fill="#15803d" />
            </g>
          )}
          {g("hardhat") && (
            <g>
              <path d="M18.5 19 Q32 1 45.5 19 Z" fill="#facc15" />
              <rect x="16.5" y="17.5" width="31" height="3.6" rx="1.8" fill="#eab308" />
              <rect x="29.5" y="5" width="5" height="12" rx="2" fill="#fde047" />
            </g>
          )}
          {g("headset") && (
            <g stroke="#111827" fill="none" strokeLinecap="round">
              <path d="M19.5 24 Q19 6 32 6.5 Q45 6 44.5 24" strokeWidth="2.6" />
              <circle cx="19.5" cy="26" r="3.8" fill="#111827" />
              <circle cx="44.5" cy="26" r="3.8" fill="#111827" />
              <path d="M44.5 29 Q46 36 37 35.5" strokeWidth="1.8" />
              <circle cx="36.6" cy="35.5" r="2" fill="#111827" />
            </g>
          )}
        </g>
        {/* right arm (front) and what it holds */}
        <g className="ao-arm ao-arm-r">
          <rect x="43" y="38" width="8" height="24" rx="4" fill={look.shirt} />
          <circle cx="47" cy="63" r="4" fill={look.skin} />
          {g("clipboard") && (
            <g transform="translate(46,48)">
              <rect width="14" height="19" rx="2" fill="#92400e" />
              <rect x="1.5" y="3" width="11" height="14" rx="1" fill="#fff" />
              <path d="M3.5 7h7M3.5 10h7M3.5 13h4" stroke="#94a3b8" strokeWidth="1" />
            </g>
          )}
          {g("envelope") && (
            <g transform="translate(46,56)">
              <rect width="16" height="11" rx="1.6" fill="#fff" stroke="#94a3b8" />
              <path d="M.8 1.2 L8 7 L15.2 1.2" fill="none" stroke="#94a3b8" />
            </g>
          )}
          {g("sheet") && (
            <g transform="translate(45,46)">
              <rect width="15" height="20" rx="1.5" fill="#fff" stroke="#c4b5fd" />
              <rect x="1.5" y="2" width="12" height="3.5" fill="#6b21a8" />
              <path d="M3 8.5h9M3 11.5h9M3 14.5h9M3 17.5h6" stroke="#a78bfa" strokeWidth="1.1" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

// ---- the office -----------------------------------------------------------------------------------

interface Spot {
  x: number; // % across the office
  y: number; // % down the office (where the feet are)
}

// Where each agent sits, left to right and back to front.
const DESKS: Spot[] = [
  { x: 18, y: 60 },
  { x: 50, y: 56 },
  { x: 82, y: 60 },
  { x: 33, y: 86 },
  { x: 67, y: 86 },
];

// Places to wander off to.
const SPOTS: (Spot & { icon: string; label: string })[] = [
  { x: 9, y: 50, icon: "☕", label: "getting coffee" },
  { x: 93, y: 50, icon: "💧", label: "at the water cooler" },
  { x: 50, y: 42, icon: "📝", label: "at the whiteboard" },
  { x: 5, y: 80, icon: "🌿", label: "watering the plant" },
  { x: 30, y: 42, icon: "🌤️", label: "looking out the window" },
  { x: 91, y: 80, icon: "🖨️", label: "at the printer" },
  { x: 70, y: 42, icon: "🗂️", label: "filing" },
];

type Mode = "walk" | "work" | "idle" | "sleep" | "talk";
interface Char {
  x: number;
  y: number;
  facing: 1 | -1;
  mode: Mode;
  ms: number; // how long the current walk takes
  thought: string | null;
}

const WALK_SPEED = 13; // % of the office per second
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const dist = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, (a.y - b.y) * 0.6);

function whenText(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const OFFICE_CSS = `
.ao-scene { container-type: inline-size; }
.ao-person { display:block; }
.ao-leg, .ao-arm { transform-box: fill-box; transform-origin: 50% 5%; }
.ao-walk .ao-leg-l { animation: ao-swing .5s ease-in-out infinite; }
.ao-walk .ao-leg-r { animation: ao-swing .5s ease-in-out infinite reverse; }
.ao-walk .ao-arm-l { animation: ao-swing .5s ease-in-out infinite reverse; }
.ao-walk .ao-arm-r { animation: ao-swing .5s ease-in-out infinite; }
.ao-walk .ao-body { animation: ao-bob .25s ease-in-out infinite alternate; }
.ao-work .ao-arm-r { animation: ao-type .38s ease-in-out infinite alternate; }
.ao-work .ao-arm-l { animation: ao-type .38s ease-in-out infinite alternate-reverse; }
.ao-idle .ao-head, .ao-talk .ao-head { animation: ao-nod 2.4s ease-in-out infinite; }
.ao-sleep .ao-head { transform-box: fill-box; transform-origin: 50% 100%; transform: rotate(14deg) translateY(3px); }
.ao-eyes { animation: ao-blink 5s infinite; transform-box: fill-box; transform-origin: center; }
@keyframes ao-swing { 0%,100% { transform: rotate(-24deg); } 50% { transform: rotate(24deg); } }
@keyframes ao-bob { from { transform: translateY(0); } to { transform: translateY(-2px); } }
@keyframes ao-type { from { transform: rotate(-4deg); } to { transform: rotate(5deg); } }
@keyframes ao-nod { 0%,100% { transform: translateY(0); } 50% { transform: translateY(1px); } }
@keyframes ao-blink { 0%,94%,100% { transform: scaleY(1); } 97% { transform: scaleY(.1); } }
@keyframes ao-float { 0% { opacity: 0; transform: translate(0,6px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(8px,-14px); } }
@keyframes ao-pop { from { opacity: 0; transform: translateY(6px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes ao-dots { 0%,80%,100% { opacity: .25; } 40% { opacity: 1; } }
.ao-zzz span { position:absolute; font-weight:800; color:#1e3a8a; animation: ao-float 2.6s ease-in infinite; }
.ao-pop { animation: ao-pop .22s ease-out; }
.ao-dot { animation: ao-dots 1s infinite; }
@media (prefers-reduced-motion: reduce) {
  .ao-walk .ao-leg, .ao-walk .ao-arm, .ao-walk .ao-body, .ao-work .ao-arm, .ao-idle .ao-head, .ao-talk .ao-head, .ao-eyes, .ao-zzz span { animation: none !important; }
}
`;

function Desk({ x, y }: Spot) {
  return (
    <div className="pointer-events-none absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -100%)", zIndex: Math.round(y * 10) + 5, width: "clamp(78px, 15cqw, 150px)" }}>
      <svg viewBox="0 0 120 64" className="block w-full" aria-hidden="true">
        {/* monitor */}
        <rect x="46" y="12" width="28" height="15" rx="2.5" fill="#1f2937" />
        <rect x="48.5" y="14.5" width="23" height="10" rx="1.2" fill="#bae6fd" />
        <path d="M51 22 l5 -4 l4 2.5 l5 -5 l5 4" stroke="#38bdf8" strokeWidth="1.4" fill="none" />
        <rect x="57" y="27" width="6" height="3" fill="#374151" />
        {/* desk top and front */}
        <rect x="4" y="30" width="112" height="9" rx="3" fill="#b9814f" />
        <rect x="4" y="36" width="112" height="3" fill="#8f5f33" />
        <rect x="8" y="39" width="104" height="24" rx="2" fill="#a16f3f" />
        <rect x="14" y="43" width="42" height="16" rx="2" fill="#8f5f33" />
        <rect x="64" y="43" width="42" height="16" rx="2" fill="#8f5f33" />
        <circle cx="35" cy="51" r="1.8" fill="#fde68a" />
        <circle cx="85" cy="51" r="1.8" fill="#fde68a" />
        {/* keyboard, mug, plant */}
        <rect x="46" y="31" width="28" height="4" rx="1.5" fill="#d1d5db" />
        <rect x="90" y="23" width="9" height="8" rx="1.5" fill="#fff" />
        <path d="M99 25 q4 2 0 5" stroke="#fff" strokeWidth="1.6" fill="none" />
        <rect x="12" y="25" width="8" height="6" rx="1" fill="#c2410c" />
        <path d="M16 25 q-4 -8 -7 -7 M16 25 q0 -9 1 -11 M16 25 q4 -7 7 -7" stroke="#16a34a" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Plant({ x, y, scale = 1 }: Spot & { scale?: number }) {
  return (
    <div className="pointer-events-none absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -100%)", zIndex: Math.round(y * 10), width: `clamp(${30 * scale}px, ${5 * scale}cqw, ${56 * scale}px)` }}>
      <svg viewBox="0 0 40 60" className="block w-full" aria-hidden="true">
        <path d="M20 40 q-16 -6 -14 -26 q12 4 14 26 M20 40 q14 -8 14 -30 q-12 6 -14 30 M20 40 q-2 -14 0 -34 q4 14 0 34" fill="#22c55e" stroke="#15803d" strokeWidth="1" />
        <path d="M9 40 h22 l-3 18 h-16 z" fill="#c2410c" />
        <rect x="8" y="38" width="24" height="4" rx="2" fill="#9a3412" />
      </svg>
    </div>
  );
}

function Furniture() {
  return (
    <>
      {/* back wall */}
      <div className="absolute inset-x-0 top-0" style={{ height: "34%", background: "linear-gradient(#f4efe6, #e8dfd0)", borderBottom: "6px solid #c9b79c" }} />
      {/* windows */}
      {[14, 38, 62].map((x) => (
        <div key={x} className="absolute overflow-hidden rounded-sm" style={{ left: `${x}%`, top: "5%", width: "20%", height: "21%", background: "linear-gradient(#7dd3fc, #e0f2fe)", border: "5px solid #fff", boxShadow: "0 0 0 2px #cbd5e1" }}>
          <svg viewBox="0 0 100 50" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <ellipse cx="25" cy="14" rx="12" ry="5" fill="#fff" opacity=".85" />
            <ellipse cx="34" cy="12" rx="9" ry="4.5" fill="#fff" opacity=".85" />
            <path d="M0 50 V36 h10 v-8 h9 v10 h8 v-14 h10 v18 h9 v-9 h11 v13 h10 v-10 h9 v19 z" fill="#94a3b8" opacity=".7" />
          </svg>
          <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-white" />
        </div>
      ))}
      {/* sign */}
      <div className="absolute rounded-md px-3 py-1 text-center font-bold tracking-wide text-white shadow" style={{ left: "50%", top: "2%", transform: "translateX(-50%)", background: "#166534", fontSize: "clamp(8px, 1.5cqw, 14px)" }}>
        HOPS OPERATIONS
      </div>
      {/* whiteboard */}
      <div className="absolute rounded-sm bg-white shadow" style={{ left: "44%", top: "27%", width: "12%", height: "9%", border: "3px solid #94a3b8", zIndex: 1 }}>
        <svg viewBox="0 0 60 30" className="h-full w-full" aria-hidden="true">
          <path d="M5 8 h30 M5 15 h42 M5 22 h24" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="50" cy="8" r="3" fill="none" stroke="#dc2626" strokeWidth="1.6" />
        </svg>
      </div>
      {/* filing cabinet */}
      <div className="absolute rounded-sm" style={{ left: "66%", top: "26%", width: "7%", height: "13%", background: "linear-gradient(#9ca3af, #6b7280)", border: "2px solid #4b5563", zIndex: 1 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mx-[10%] mt-[8%] h-[24%] rounded-[2px] bg-black/20">
            <div className="mx-auto mt-[22%] h-[18%] w-[40%] rounded-full bg-white/70" />
          </div>
        ))}
      </div>
      {/* coffee machine */}
      <div className="absolute" style={{ left: "5%", top: "30%", width: "5%", height: "9%", background: "#374151", borderRadius: "4px", zIndex: 1 }}>
        <div className="mx-auto mt-[18%] h-[26%] w-[50%] rounded-sm bg-red-500" />
        <div className="mx-auto mt-[12%] h-[22%] w-[40%] rounded-b bg-white" />
      </div>
      {/* water cooler */}
      <div className="absolute" style={{ left: "90%", top: "28%", width: "5%", height: "14%", zIndex: 1 }}>
        <div className="mx-auto h-[45%] w-[78%] rounded-t-full border-2 border-sky-200 bg-sky-300/70" />
        <div className="mx-auto h-[55%] w-full rounded-sm bg-slate-200 shadow-inner" />
      </div>
      {/* floor */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          top: "34%",
          background: "repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, transparent 2px 64px), repeating-linear-gradient(0deg, rgba(0,0,0,.05) 0 2px, transparent 2px 64px), linear-gradient(#94a3a0, #7d908c)",
        }}
      />
      {/* rug */}
      <div className="absolute rounded-[40%]" style={{ left: "30%", top: "62%", width: "40%", height: "26%", background: "radial-gradient(ellipse at center, #fbbf24 0 14%, #16a34a 15% 40%, #166534 41% 100%)", opacity: 0.55 }} />
      <Plant x={3} y={62} scale={1.2} />
      <Plant x={97} y={62} scale={1.2} />
      <Plant x={97} y={96} />
    </>
  );
}

// ---- the whole thing ------------------------------------------------------------------------------

export default function AgentOffice({
  agents,
  events,
  waiting,
  renderSettings,
}: {
  agents: Agent[];
  events: AgentEvent[];
  // How many things are waiting for a person (emails to approve, replies to review) per agent id.
  waiting: Record<string, number>;
  renderSettings: (agent: Agent) => ReactNode;
}) {
  const [chars, setChars] = useState<Record<string, Char>>(() => {
    const out: Record<string, Char> = {};
    agents.forEach((a, i) => {
      const desk = DESKS[i % DESKS.length];
      out[a.id] = { x: desk.x, y: desk.y, facing: 1, mode: a.enabled ? "work" : "sleep", ms: 0, thought: null };
    });
    return out;
  });
  const [talkingId, setTalkingId] = useState<string | null>(null);
  const agentsRef = useRef(agents);
  const talkingRef = useRef<string | null>(null);
  const charsRef = useRef(chars);
  useEffect(() => {
    agentsRef.current = agents;
    talkingRef.current = talkingId;
    charsRef.current = chars;
  });

  const deskOf = useCallback((id: string): Spot => {
    const i = agentsRef.current.findIndex((a) => a.id === id);
    return DESKS[(i < 0 ? 0 : i) % DESKS.length];
  }, []);

  // Switching an agent off sends them back to their desk for a nap; switching on wakes them up.
  useEffect(() => {
    const prev = charsRef.current;
    const next = { ...prev };
    const naps: { id: string; after: number }[] = [];
    for (const a of agents) {
      const c = prev[a.id];
      const desk = deskOf(a.id);
      if (!c) {
        next[a.id] = { x: desk.x, y: desk.y, facing: 1, mode: a.enabled ? "work" : "sleep", ms: 0, thought: null };
      } else if (!a.enabled && c.mode !== "sleep" && c.mode !== "walk") {
        const ms = (dist(c, desk) / WALK_SPEED) * 1000;
        next[a.id] = { x: desk.x, y: desk.y, facing: desk.x >= c.x ? 1 : -1, mode: ms > 50 ? "walk" : "sleep", ms, thought: null };
        if (ms > 50) naps.push({ id: a.id, after: ms + 60 });
      } else if (a.enabled && c.mode === "sleep") {
        next[a.id] = { ...c, mode: "work", thought: "💡" };
      }
    }
    if (JSON.stringify(next) === JSON.stringify(prev)) return;
    charsRef.current = next;
    setChars(next);
    const timers = naps.map((n) =>
      setTimeout(() => {
        if (agentsRef.current.find((x) => x.id === n.id)?.enabled) return;
        charsRef.current = { ...charsRef.current, [n.id]: { ...charsRef.current[n.id], mode: "sleep" } };
        setChars(charsRef.current);
      }, n.after),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [agents, deskOf]);

  // The wandering: each agent, every few seconds, heads for a spot, stays a moment, and goes back to work.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let stopped = false;

    function later(ms: number, fn: () => void) {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!stopped) fn();
      }, ms);
      timers.add(t);
    }

    function put(id: string, c: Char) {
      charsRef.current = { ...charsRef.current, [id]: c };
      setChars(charsRef.current);
    }

    function step(id: string) {
      const agent = agentsRef.current.find((a) => a.id === id);
      const cur = charsRef.current[id];
      if (!agent || !cur) return;
      if (document.hidden || talkingRef.current === id || cur.mode === "walk") return later(2500, () => step(id));
      if (!agent.enabled) return later(5000, () => step(id));

      const desk = deskOf(id);
      const atDesk = Math.abs(cur.x - desk.x) < 1 && Math.abs(cur.y - desk.y) < 1;
      let target: Spot & { icon?: string };
      if (atDesk) {
        const others = agentsRef.current.filter((a) => a.id !== id);
        if (others.length > 0 && Math.random() < 0.28) {
          const vd = deskOf(pick(others).id);
          target = { x: Math.min(96, Math.max(4, vd.x + pick([-9, 9]))), y: Math.min(97, vd.y + 4), icon: "💬" };
        } else {
          const spot = pick(SPOTS);
          target = { x: spot.x + rand(-2, 2), y: spot.y + rand(-1, 2), icon: spot.icon };
        }
      } else {
        target = desk;
      }
      const goingHome = target.x === desk.x && target.y === desk.y;
      const ms = (dist(cur, target) / WALK_SPEED) * 1000;
      put(id, { x: target.x, y: target.y, facing: target.x >= cur.x ? 1 : -1, mode: "walk", ms, thought: null });
      later(ms + 60, () => {
        const c = charsRef.current[id];
        if (!c) return;
        if (talkingRef.current === id) return;
        put(id, { ...c, mode: goingHome ? "work" : "idle", thought: goingHome ? null : (target.icon ?? null) });
        later(goingHome ? rand(5000, 12000) : rand(2500, 5000), () => step(id));
      });
    }

    agentsRef.current.forEach((a, i) => later(1500 + i * 1800 + rand(0, 1500), () => step(a.id)));
    return () => {
      stopped = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [agents.length, deskOf]);

  const talking = agents.find((a) => a.id === talkingId) ?? null;

  function talkTo(id: string) {
    setTalkingId(id);
    setChars((prev) => (prev[id] && prev[id].mode !== "sleep" ? { ...prev, [id]: { ...prev[id], mode: "talk", thought: "💬", ms: 0 } } : prev));
  }

  function stopTalking() {
    const id = talkingId;
    setTalkingId(null);
    if (!id) return;
    setChars((prev) => {
      const c = prev[id];
      if (!c || c.mode !== "talk") return prev;
      const desk = deskOf(id);
      const atDesk = Math.abs(c.x - desk.x) < 1 && Math.abs(c.y - desk.y) < 1;
      return { ...prev, [id]: { ...c, mode: atDesk ? "work" : "idle", thought: null } };
    });
  }

  // The most recent thing each agent logged, to show a worry sign when it was an error.
  const lastEvent = (id: string) => events.find((e) => e.agent_id === id);

  return (
    <>
      <style>{OFFICE_CSS}</style>
      <div className="ao-scene relative isolate w-full select-none overflow-hidden rounded-xl border-2 border-slate-400/60 shadow-inner" style={{ aspectRatio: "16 / 9", minHeight: 300 }}>
        <Furniture />
        {agents.map((a, i) => (
          <Desk key={`desk-${a.id}`} {...DESKS[i % DESKS.length]} />
        ))}
        {agents.map((a) => {
          const c = chars[a.id];
          if (!c) return null;
          const look = lookFor(a.key);
          const count = waiting[a.id] ?? 0;
          const err = lastEvent(a.id)?.kind === "error";
          const sitting = c.mode === "work" || c.mode === "sleep";
          return (
            <button
              key={a.id}
              onClick={() => talkTo(a.id)}
              aria-label={`Talk to ${look.name}, the ${look.role}`}
              className="group absolute cursor-pointer outline-none"
              style={{
                left: `${c.x}%`,
                top: `${c.y}%`,
                transform: sitting ? "translate(-50%, calc(-100% - clamp(10px, 2.2cqw, 20px)))" : "translate(-50%, -100%)",
                transition: c.mode === "walk" ? `left ${c.ms}ms linear, top ${c.ms}ms linear` : "none",
                zIndex: Math.round(c.y * 10) + (sitting ? 0 : 1),
                width: "clamp(44px, 7.5cqw, 84px)",
              }}
            >
              {/* what is on their mind */}
              <span className="pointer-events-none absolute left-1/2 -top-1 flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap">
                {c.mode === "sleep" ? (
                  <span className="ao-zzz relative block h-5 w-8">
                    <span style={{ left: 0, fontSize: 11 }}>z</span>
                    <span style={{ left: 8, fontSize: 14, animationDelay: ".8s" }}>Z</span>
                    <span style={{ left: 16, fontSize: 17, animationDelay: "1.6s" }}>Z</span>
                  </span>
                ) : (
                  c.thought && <span className="ao-pop rounded-full bg-white px-1.5 py-0.5 text-sm shadow">{c.thought}</span>
                )}
                {err && <span title="Something went wrong on its last run" className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white shadow">!</span>}
                {count > 0 && (
                  <span title={`${count} thing${count === 1 ? "" : "s"} waiting for you`} className="rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950 shadow">
                    ✉ {count}
                  </span>
                )}
              </span>
              <span className="block transition-transform group-hover:scale-110 group-focus-visible:scale-110" style={{ transform: `scaleX(${c.facing})` }}>
                <Person look={look} mode={c.mode} size="100%" />
              </span>
            </button>
          );
        })}
        {/* name tags float above everything, so a desk never hides them */}
        {agents.map((a) => {
          const c = chars[a.id];
          if (!c) return null;
          return (
            <span
              key={`tag-${a.id}`}
              className="pointer-events-none absolute flex items-center gap-1 whitespace-nowrap rounded-full bg-black/70 px-2 py-px text-[10px] font-semibold text-white"
              style={{ left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%, 4px)", zIndex: 2000, transition: c.mode === "walk" ? `left ${c.ms}ms linear, top ${c.ms}ms linear` : "none" }}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${a.enabled ? "bg-green-400" : "bg-slate-400"}`} />
              {lookFor(a.key).name}
            </span>
          );
        })}
        <p className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-black/40 px-2 py-0.5 text-[10px] text-white">Click anyone to talk to them</p>
      </div>

      {talking && <AgentChat key={talking.id} agent={talking} events={events} waiting={waiting[talking.id] ?? 0} renderSettings={renderSettings} onClose={stopTalking} />}
    </>
  );
}

// ---- talking to an agent --------------------------------------------------------------------------

interface Bubble {
  from: "agent" | "you";
  content: ReactNode;
}

function AgentChat({ agent, events, waiting, renderSettings, onClose }: { agent: Agent; events: AgentEvent[]; waiting: number; renderSettings: (agent: Agent) => ReactNode; onClose: () => void }) {
  const look = lookFor(agent.key);
  const [log, setLog] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const mine = events.filter((e) => e.agent_id === agent.id);

  const schedule = (a: Agent) => {
    if (a.key === "delivered_sheets") return "I go out as soon as today's FOB prices have been filled in.";
    if (a.config.send_times?.length) return `I go out at ${a.config.send_times.join(", ")} (Central).`;
    return `I run about every ${a.interval_hours} hours.`;
  };

  const statusLine = (a: Agent) =>
    a.enabled ? "I'm on shift and ready." : "I'm switched off right now, so I'm having a nap. Turn me on and I'll get back to it.";

  function say(content: ReactNode, delay = 650) {
    setTyping(true);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setLog((l) => [...l, { from: "agent", content }]);
        setTyping(false);
        resolve();
      }, delay);
    });
  }

  // The hello.
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    let cancelled = false;
    (async () => {
      await say(
        <>
          Hi! I&apos;m <b>{look.name}</b>, the {look.role.toLowerCase()}. {statusLine(agent)}
          {waiting > 0 && (
            <>
              {" "}
              <b>
                I have {waiting} thing{waiting === 1 ? "" : "s"} waiting for you
              </b>{" "}
              - check Emails to approve and Replies to review above.
            </>
          )}
        </>,
        500,
      );
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, typing, showSettings]);

  async function ask(label: string, reply: () => Promise<ReactNode> | ReactNode) {
    if (typing) return;
    setLog((l) => [...l, { from: "you", content: label }]);
    setTyping(true);
    let content: ReactNode;
    try {
      content = await reply();
    } catch (e) {
      content = `Oops - something went wrong: ${e instanceof Error ? e.message : "try again"}`;
    }
    await say(content, 450);
  }

  const options: { id: string; label: string; run: () => Promise<ReactNode> | ReactNode }[] = [
    {
      id: "how",
      label: "How are you doing?",
      run: () => {
        const a = agent;
        const last = events.find((e) => e.agent_id === a.id);
        return (
          <>
            {statusLine(a)} {schedule(a)}{" "}
            {a.mode === "approve" ? "You approve each email before I send it." : "I send on my own."} I last ran <b>{whenText(a.last_run_at)}</b>.
            {last?.kind === "error" && <span className="mt-1 block text-red-700">My last run hit a problem: {last.message}</span>}
          </>
        );
      },
    },
    {
      id: "what",
      label: "What do you do?",
      run: () => (
        <>
          {look.intro}
          {agent.description && <span className="mt-1 block text-xs opacity-70">{agent.description}</span>}
        </>
      ),
    },
    {
      id: "up",
      label: "What have you been up to?",
      run: () =>
        mine.length === 0 ? (
          "Nothing yet - no activity from me so far."
        ) : (
          <>
            Here&apos;s my latest:
            <ul className="mt-1 space-y-1 text-xs">
              {mine.slice(0, 6).map((e) => (
                <li key={e.id} className={e.kind === "error" ? "text-red-700" : ""}>
                  <span className="opacity-60">{whenText(e.created_at)}</span> - {e.message}
                </li>
              ))}
            </ul>
          </>
        ),
    },
    {
      id: "run",
      label: "Run now",
      run: async () => {
        const a = agent;
        if (a.key === "delivered_sheets") {
          const test = (a.config.test_to ?? []).length > 0;
          const ok = window.confirm(
            test
              ? "Email today's Delivered price sheets now? Test mode is on, so they go only to the test address."
              : "Email today's Delivered price sheets to the customer lists now? This sends them even if the FOB prices haven't been applied by email yet.",
          );
          if (!ok) return "No problem - I'll hold off.";
        }
        const r = await runAgentNow(a.id);
        if (a.key === "delivered_sheets") {
          return r.created > 0 ? `Done - ${r.created} price sheet${r.created === 1 ? "" : "s"} emailed.` : r.skipped.length > 0 ? r.skipped.join(" ") : "Nothing to send - each sheet goes out once a day, and today's may already have gone.";
        }
        return r.created > 0
          ? `Done - ${r.created} email${r.created === 1 ? "" : "s"} created. ${a.mode === "approve" ? "They're waiting under Emails to approve." : ""}`
          : r.skipped.length > 0
            ? r.skipped.join(" ")
            : "I checked and nothing needed a follow-up right now.";
      },
    },
    {
      id: "toggle",
      label: agent.enabled ? "Take a break (turn off)" : "Wake up! (turn on)",
      run: async () => {
        const a = agent;
        await updateAgent(a.id, { enabled: !a.enabled });
        return a.enabled ? "Okay, off I go for a nap. 😴" : "I'm up! Back to work. ☕";
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-black/10 bg-gradient-to-r from-green-700 to-green-600 px-4 py-3 text-white">
          <div className="flex h-14 w-14 shrink-0 items-end justify-center overflow-hidden rounded-xl bg-white/90">
            <div style={{ width: 40 }}>
              <Person look={look} mode={agent.enabled ? "idle" : "sleep"} size="100%" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold leading-tight">{look.name}</p>
            <p className="text-xs opacity-90">
              {look.role} · {agent.name} · <span className="font-semibold">{agent.enabled ? "ON" : "OFF"}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-xl leading-none hover:bg-white/20" aria-label="Close">
            ×
          </button>
        </header>

        <div ref={scroller} className="min-h-[14rem] flex-1 space-y-2.5 overflow-y-auto bg-slate-50 px-4 py-4">
          {log.map((b, i) => (
            <div key={i} className={`ao-pop flex ${b.from === "you" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${b.from === "you" ? "rounded-br-sm bg-green-600 text-white" : "rounded-bl-sm border border-black/10 bg-white"}`}>{b.content}</div>
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="flex gap-1 rounded-2xl rounded-bl-sm border border-black/10 bg-white px-3.5 py-3 shadow-sm">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="ao-dot h-2 w-2 rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.18}s` }} />
                ))}
              </div>
            </div>
          )}
          {showSettings && <div className="rounded-xl border border-black/10 bg-white p-2">{renderSettings(agent)}</div>}
        </div>

        <footer className="border-t border-black/10 bg-white px-3 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase text-black/45">Say something to {look.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => (
              <button
                key={o.id}
                disabled={typing}
                onClick={() => void ask(o.label, o.run)}
                className="rounded-full border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                {o.label}
              </button>
            ))}
            <button
              onClick={() => {
                if (!showSettings) setLog((l) => [...l, { from: "you", content: "Show me your settings" }, { from: "agent", content: "Sure! Everything about how I work is right here:" }]);
                setShowSettings((s) => !s);
              }}
              className="rounded-full border border-black/25 px-3 py-1.5 text-xs font-semibold hover:bg-black/5"
            >
              {showSettings ? "Hide settings" : "Open your settings"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
