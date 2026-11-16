"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const DATA_MS = 45_000; // how often the page's data is re-fetched while the tab is on screen
const VERSION_MS = 60_000; // how often we ask which version of HOPS is live
const IDLE_RELOAD_MS = 120_000; // an idle tab reloads itself for a new version after this long
const AWAY_REFRESH_MS = 30_000; // coming back to a tab that was in the background this long refreshes it at once

// Pages that already update themselves live, or where a refresh underneath you would only get in the way.
const SKIP_DATA_REFRESH = ["/messages"];

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

function typingInAField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

// Keeps every open HOPS tab current without anyone pressing refresh:
//  1. Data: the page's data is re-fetched every 45 seconds while the tab is visible and nobody is typing in a field
//     (the page itself is not reloaded - open windows and what you've typed stay as they are).
//  2. New version: when a new HOPS is deployed, an idle tab reloads itself; a tab someone is working in shows a
//     "new version ready" bar instead of interrupting them.
export default function AutoRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [update, setUpdate] = useState(false);
  const updateRef = useRef(false);
  const lastInput = useRef(0);
  const hiddenAt = useRef<number | null>(null);
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    lastInput.current = Date.now();
    const touch = () => {
      lastInput.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { capture: true, passive: true }));

    function refreshData() {
      if (document.visibilityState !== "visible" || updateRef.current || typingInAField()) return;
      if (SKIP_DATA_REFRESH.some((p) => pathRef.current === p || pathRef.current.startsWith(`${p}/`))) return;
      router.refresh();
    }

    async function checkVersion() {
      if (!BUILD) return; // local development - nothing to compare
      try {
        const res = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return;
        const { v } = (await res.json()) as { v?: string };
        if (v && v !== BUILD) {
          updateRef.current = true;
          setUpdate(true);
        }
      } catch {
        // offline / signed out - try again next time
      }
    }

    // A new version is ready: reload quietly if nobody is working in this tab, otherwise leave the bar up.
    function maybeReload() {
      if (!updateRef.current) return;
      if (Date.now() - lastInput.current > IDLE_RELOAD_MS && !typingInAField()) window.location.reload();
    }

    const dataTimer = setInterval(refreshData, DATA_MS);
    const versionTimer = setInterval(() => void checkVersion().then(maybeReload), VERSION_MS);
    const idleTimer = setInterval(maybeReload, 15_000);
    void checkVersion();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      void checkVersion();
      if (away > AWAY_REFRESH_MS) refreshData();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
      clearInterval(dataTimer);
      clearInterval(versionTimer);
      clearInterval(idleTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  if (!update) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[9000] flex -translate-x-1/2 items-center gap-3 rounded-full bg-green-700 px-4 py-2 text-sm font-medium text-white shadow-lg print:hidden">
      <span>A new version of HOPS is ready.</span>
      <button onClick={() => window.location.reload()} className="rounded-full bg-white px-3 py-1 font-semibold text-green-800 hover:bg-green-50">
        Refresh now
      </button>
    </div>
  );
}
