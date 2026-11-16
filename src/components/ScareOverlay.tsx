"use client";

import { useEffect, useRef, useState } from "react";
import { claimScare } from "@/app/scare/actions";

const POLL_MS = 8000;
const SHOW_MS = 4000;

// A short, loud screech made on the spot (no audio file). Browsers only allow sound after the person has
// touched the page, which anyone using HOPS has - if it's blocked, the picture still shows.
function screech() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume();
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.7, t + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    master.connect(ctx.destination);

    for (const [from, to, type] of [
      [1300, 180, "sawtooth"],
      [1750, 240, "square"],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + 1.1);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 1.3);
    }

    const noise = ctx.createBuffer(1, ctx.sampleRate * 1.3, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    src.connect(ng).connect(master);
    src.start(t);
    window.setTimeout(() => void ctx.close(), 1800);
  } catch {
    // no sound - fine
  }
}

// The jump scare. Sent from Supreme Tab > Scare; shows on the person's screen while they're using HOPS.
// One white flash on the way in (never a strobe), then a huge face lunges at the screen. Tap or Esc to close.
export default function ScareOverlay() {
  const [show, setShow] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const scared = await claimScare();
        if (!cancelled && scared) setShow(true);
      } catch (err) {
        // A tab left open across a deploy still has the old bundle; reload picks up the new one.
        const message = err instanceof Error ? err.message : String(err);
        if (/server action|deployment/i.test(message)) window.location.reload();
      } finally {
        busy.current = false;
      }
    }

    void check();
    const interval = setInterval(check, POLL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!show) return;
    screech();
    const timer = setTimeout(() => setShow(false), SHOW_MS);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShow(false);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="alertdialog"
      aria-label="Boo!"
      onClick={() => setShow(false)}
      className="scare-bg fixed inset-0 z-[99999] flex cursor-pointer items-center justify-center overflow-hidden bg-black"
    >
      <style>{`
        @keyframes scare-lunge { 0% { transform: scale(.15); } 12% { transform: scale(1.35); } 100% { transform: scale(1.7); } }
        @keyframes scare-shake { 0%,100% { translate: 0 0; } 20% { translate: -2.2vmin 1.4vmin; } 40% { translate: 2vmin -1.6vmin; } 60% { translate: -1.6vmin -2vmin; } 80% { translate: 1.8vmin 1.8vmin; } }
        @keyframes scare-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes scare-out { 0%,85% { opacity: 1; } 100% { opacity: 0; } }
        .scare-bg { animation: scare-out ${SHOW_MS}ms linear forwards; }
        .scare-face { width: min(95vw, 95vh); height: min(95vw, 95vh); animation: scare-lunge ${SHOW_MS}ms cubic-bezier(.1,.9,.2,1) forwards, scare-shake .16s linear 6; }
        .scare-flash { animation: scare-flash .35s ease-out forwards; }
        @media (prefers-reduced-motion: reduce) {
          .scare-face { animation: none; transform: scale(1.3); }
          .scare-flash { display: none; }
        }
      `}</style>
      <div className="scare-flash pointer-events-none absolute inset-0 bg-white" />
      <svg className="scare-face" viewBox="0 0 400 400" aria-hidden="true">
        <defs>
          <radialGradient id="scare-skin" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#f4f0e6" />
            <stop offset="70%" stopColor="#bdb7a4" />
            <stop offset="100%" stopColor="#5d5848" />
          </radialGradient>
          <radialGradient id="scare-eye" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff2a1f" />
            <stop offset="55%" stopColor="#7a0500" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
        </defs>
        {/* head */}
        <path d="M200 12C292 12 352 80 348 178c-3 78-34 150-84 190-18 14-110 14-128 0C86 328 55 256 52 178 48 80 108 12 200 12Z" fill="url(#scare-skin)" />
        {/* cracks */}
        <path d="M200 14l-12 46 18 30-14 40M120 52l30 40-12 30M290 60l-34 42 16 28" stroke="#2a261c" strokeWidth="3" fill="none" opacity=".6" />
        {/* eye sockets */}
        <ellipse cx="140" cy="148" rx="52" ry="62" fill="#050403" transform="rotate(-12 140 148)" />
        <ellipse cx="260" cy="148" rx="52" ry="62" fill="#050403" transform="rotate(12 260 148)" />
        <circle cx="142" cy="156" r="22" fill="url(#scare-eye)" />
        <circle cx="258" cy="156" r="22" fill="url(#scare-eye)" />
        <circle cx="142" cy="156" r="5" fill="#000" />
        <circle cx="258" cy="156" r="5" fill="#000" />
        {/* brow */}
        <path d="M82 96c34 0 62 14 84 44M318 96c-34 0-62 14-84 44" stroke="#1d1a13" strokeWidth="10" strokeLinecap="round" fill="none" />
        {/* nose */}
        <path d="M200 176l-16 52h32z" fill="#0b0a07" opacity=".85" />
        {/* mouth */}
        <path d="M96 262c30-26 62-34 104-34s74 8 104 34c-8 70-50 122-104 122S104 332 96 262Z" fill="#0a0000" />
        <path d="M118 262c26-14 52-18 82-18s56 4 82 18l-14 20-24-14-18 22-26-20-26 20-18-22-24 14Z" fill="#eee9d8" />
        <path d="M130 352l16-34 14 40 18-46 22 50 22-50 18 46 14-40 16 34" stroke="#eee9d8" strokeWidth="14" strokeLinejoin="round" fill="none" />
        <ellipse cx="200" cy="336" rx="34" ry="14" fill="#7a0b0b" />
      </svg>
      <div className="pointer-events-none absolute bottom-[4vh] w-full text-center text-[min(9vw,9vh)] font-black tracking-widest text-red-600 drop-shadow-[0_0_20px_rgba(255,0,0,.8)]">BOO!</div>
    </div>
  );
}
