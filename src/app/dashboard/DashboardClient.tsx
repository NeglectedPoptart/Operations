"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { DashboardData, SavedLayout, WindowConfig, WorkspaceConfig } from "@/lib/dashboardTypes";
import { deleteLayout, getDashboardData, saveLayout, setDefaultLayout } from "./actions";
import { WIDGETS, WidgetBody } from "./Widgets";

export interface ModuleOption {
  href: string;
  label: string;
  category: string;
}

type Rect = { x: number; y: number; w: number; h: number };

const STORAGE_KEY = "hops-dashboard-workspace-v2";
const REFRESH_MS = 90_000;
const MIN_W_PX = 300;
const MIN_H_PX = 180;
const ZOOMS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

const btn = "rounded-md border border-black/20 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";
const btnOn = "rounded-md bg-black px-2.5 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 10000) / 10000;
let idCounter = 0;
const newId = () => `w${Date.now().toString(36)}${(idCounter++).toString(36)}`;

// Rectangles that tile n windows across the area.
function tileRects(n: number): Rect[] {
  const gap = 0.004;
  const inset = (r: Rect): Rect => ({ x: r.x + gap, y: r.y + gap, w: r.w - gap * 2, h: r.h - gap * 2 });
  if (n <= 0) return [];
  if (n === 1) return [inset({ x: 0, y: 0, w: 1, h: 1 })];
  if (n === 2) return [inset({ x: 0, y: 0, w: 0.5, h: 1 }), inset({ x: 0.5, y: 0, w: 0.5, h: 1 })];
  if (n === 3) return [inset({ x: 0, y: 0, w: 0.5, h: 1 }), inset({ x: 0.5, y: 0, w: 0.5, h: 0.5 }), inset({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 })];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => inset({ x: (i % cols) / cols, y: Math.floor(i / cols) / rows, w: 1 / cols, h: 1 / rows }));
}

function makeWindow(rect: Rect, z: number, href: string | null): WindowConfig {
  return { id: newId(), ...rect, z, tabs: href ? [href] : [], active: href };
}

function starterConfig(modules: ModuleOption[]): WorkspaceConfig {
  const has = (href: string) => modules.some((m) => m.href === href);
  const first = ["/warehouse/orders", "/logistics/board"].find(has) ?? modules[0]?.href ?? null;
  const second = ["/mexico/arrivals", "/qc/inspections"].find((h) => has(h) && h !== first) ?? null;
  const rects = tileRects(second ? 2 : 1);
  return {
    windows: [makeWindow(rects[0], 1, first), ...(second ? [makeWindow(rects[1], 2, second)] : [])],
    widgetsOpen: true,
    widgets: ["orders", "qc", "arrivals", "agents", "out"],
    notes: "",
  };
}

// A saved or stored config may name pages that are gone or that this person can no longer open,
// and a first-version one has two fixed panes instead of windows.
function cleanConfig(config: WorkspaceConfig, modules: ModuleOption[]): WorkspaceConfig {
  const known = new Set(modules.map((m) => m.href));
  let windows = config.windows;
  if (!windows && config.panes) {
    const rects = config.panes.length > 1 ? (config.stacked ? [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] : tileRects(2)) : tileRects(1);
    windows = config.panes.slice(0, 2).map((p, i) => ({ id: newId(), ...rects[i], z: i + 1, tabs: p.tabs, active: p.active }));
  }
  const cleaned = (windows ?? []).map((w, i): WindowConfig => {
    const tabs = (w.tabs ?? []).filter((t) => known.has(t));
    return {
      id: w.id || newId(),
      x: clamp(Number(w.x) || 0, 0, 0.9),
      y: clamp(Number(w.y) || 0, 0, 0.9),
      w: clamp(Number(w.w) || 0.5, 0.1, 1),
      h: clamp(Number(w.h) || 0.5, 0.1, 1),
      z: Number(w.z) || i + 1,
      tabs,
      active: w.active && tabs.includes(w.active) ? w.active : tabs[0] ?? null,
      restore: w.restore,
      zoom: ZOOMS.includes(w.zoom ?? 1) ? w.zoom : undefined,
    };
  });
  return {
    windows: cleaned,
    widgetsOpen: config.widgetsOpen !== false,
    widgets: (config.widgets ?? []).filter((w) => WIDGETS.some((x) => x.id === w)),
    notes: config.notes ?? "",
  };
}

export default function DashboardClient({ modules, layouts: initialLayouts }: { modules: ModuleOption[]; layouts: SavedLayout[] }) {
  const confirm = useConfirm();
  const labelOf = useMemo(() => new Map(modules.map((m) => [m.href, m.label])), [modules]);

  const [layouts, setLayouts] = useState(initialLayouts);
  const [currentId, setCurrentId] = useState<string | null>(() => initialLayouts.find((l) => l.is_default)?.id ?? null);
  const [config, setConfig] = useState<WorkspaceConfig>(() => {
    const def = initialLayouts.find((l) => l.is_default);
    return def ? cleanConfig(def.config, modules) : starterConfig(modules);
  });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [reloads, setReloads] = useState<Record<string, number>>({});
  // Pages that have been shown at least once - a tab's page loads when first opened, then stays loaded.
  const [shown, setShown] = useState<Set<string>>(new Set());
  // null = closed; "new" = open the page in a new window; otherwise the window id to add a tab to.
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState({ w: 1200, h: 700 });
  // Latest values for the drag handlers, which outlive a single render.
  const configRef = useRef(config);
  const canvasSizeRef = useRef(canvas);
  useEffect(() => {
    configRef.current = config;
    canvasSizeRef.current = canvas;
  });

  // Remember the workspace on this browser too, so a reload comes back to it.
  useEffect(() => {
    if (initialLayouts.some((l) => l.is_default)) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setConfig(cleanConfig(JSON.parse(raw) as WorkspaceConfig, modules));
    } catch {
      // nothing stored or storage blocked - keep the starter
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // storage blocked
    }
  }, [config]);

  // The workspace area's size, for turning fractions into pixels.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setCanvas({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [config.widgetsOpen]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await getDashboardData();
      if (next) setData(next);
    } catch {
      // keep the last numbers
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // A window's active tab counts as shown.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown((prev) => {
      const next = new Set(prev);
      for (const w of config.windows) if (w.active) next.add(`${w.id}|${w.active}`);
      return next.size === prev.size ? prev : next;
    });
  }, [config.windows]);

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(null), 3000);
  }

  const patchWindow = (id: string, patch: Partial<WindowConfig>) =>
    setConfig((c) => ({ ...c, windows: c.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));

  function bringToFront(id: string) {
    setFocusId(id);
    setConfig((c) => {
      const top = Math.max(0, ...c.windows.map((w) => w.z));
      const w = c.windows.find((x) => x.id === id);
      if (!w || w.z === top) return c;
      return { ...c, windows: c.windows.map((x) => (x.id === id ? { ...x, z: top + 1 } : x)) };
    });
  }

  // Dragging and resizing ---------------------------------------------------
  function startDrag(e: ReactPointerEvent, id: string, mode: "move" | string) {
    if (mode === "move" && (e.target as HTMLElement).closest("button, input, select, [data-nodrag]")) return;
    e.preventDefault();
    bringToFront(id);
    const win = configRef.current.windows.find((w) => w.id === id);
    if (!win || win.restore) return; // a maximized window stays put (restore first)
    const start = { x: e.clientX, y: e.clientY };
    const orig: Rect = { x: win.x, y: win.y, w: win.w, h: win.h };
    setDragging(true);

    const move = (ev: PointerEvent) => {
      const { w: cw, h: ch } = canvasSizeRef.current;
      const dx = (ev.clientX - start.x) / cw;
      const dy = (ev.clientY - start.y) / ch;
      const minW = MIN_W_PX / cw;
      const minH = MIN_H_PX / ch;
      let { x, y, w, h } = orig;
      if (mode === "move") {
        x = clamp(orig.x + dx, 0, 1 - orig.w);
        y = clamp(orig.y + dy, 0, 1 - orig.h);
      } else {
        if (mode.includes("e")) w = clamp(orig.w + dx, minW, 1 - orig.x);
        if (mode.includes("s")) h = clamp(orig.h + dy, minH, 1 - orig.y);
        if (mode.includes("w")) {
          const nx = clamp(orig.x + dx, 0, orig.x + orig.w - minW);
          w = orig.w + (orig.x - nx);
          x = nx;
        }
        if (mode.includes("n")) {
          const ny = clamp(orig.y + dy, 0, orig.y + orig.h - minH);
          h = orig.h + (orig.y - ny);
          y = ny;
        }
      }
      patchWindow(id, { x: round(x), y: round(y), w: round(w), h: round(h) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function toggleMaximize(id: string) {
    setConfig((c) => ({
      ...c,
      windows: c.windows.map((w) => {
        if (w.id !== id) return w;
        if (w.restore) return { ...w, ...w.restore, restore: undefined };
        return { ...w, restore: { x: w.x, y: w.y, w: w.w, h: w.h }, x: 0, y: 0, w: 1, h: 1 };
      }),
    }));
    bringToFront(id);
  }

  // Windows and tabs --------------------------------------------------------
  function addWindow(href: string | null) {
    setConfig((c) => {
      const top = Math.max(0, ...c.windows.map((w) => w.z));
      const anchor = c.windows.find((w) => w.id === focusId) ?? c.windows[c.windows.length - 1];
      const rect: Rect = anchor
        ? { x: clamp(anchor.x + 0.04, 0, 0.4), y: clamp(anchor.y + 0.05, 0, 0.4), w: 0.55, h: 0.6 }
        : { x: 0.02, y: 0.02, w: 0.96, h: 0.96 };
      const win = makeWindow(rect, top + 1, href);
      setFocusId(win.id);
      return { ...c, windows: [...c.windows, win] };
    });
  }

  function openModule(href: string, target: string) {
    setPickerFor(null);
    if (target === "new") {
      addWindow(href);
      return;
    }
    setConfig((c) => ({
      ...c,
      windows: c.windows.map((w) => (w.id === target ? { ...w, tabs: w.tabs.includes(href) ? w.tabs : [...w.tabs, href], active: href } : w)),
    }));
    bringToFront(target);
  }

  // A widget title opens its page in the front window (or a new one).
  function openFromWidget(href: string) {
    const target = focusId && config.windows.some((w) => w.id === focusId) ? focusId : config.windows[config.windows.length - 1]?.id;
    openModule(href, target ?? "new");
  }

  function closeTab(id: string, href: string) {
    setConfig((c) => ({
      ...c,
      windows: c.windows.map((w) => {
        if (w.id !== id) return w;
        const tabs = w.tabs.filter((t) => t !== href);
        return { ...w, tabs, active: w.active === href ? tabs[tabs.length - 1] ?? null : w.active };
      }),
    }));
    setShown((prev) => {
      const next = new Set(prev);
      next.delete(`${id}|${href}`);
      return next;
    });
  }

  // A tab becomes a window of its own.
  function detachTab(id: string, href: string) {
    closeTab(id, href);
    addWindow(href);
  }

  function closeWindow(id: string) {
    setConfig((c) => ({ ...c, windows: c.windows.filter((w) => w.id !== id) }));
  }

  function tile() {
    setConfig((c) => {
      const ordered = [...c.windows].sort((a, b) => a.z - b.z);
      const rects = tileRects(ordered.length);
      const byId = new Map(ordered.map((w, i) => [w.id, rects[i]]));
      return { ...c, windows: c.windows.map((w) => ({ ...w, ...byId.get(w.id)!, restore: undefined })) };
    });
  }

  function cascade() {
    setConfig((c) => {
      const ordered = [...c.windows].sort((a, b) => a.z - b.z);
      const step = Math.min(0.06, 0.35 / Math.max(1, ordered.length - 1));
      return {
        ...c,
        windows: c.windows.map((w) => {
          const i = ordered.findIndex((o) => o.id === w.id);
          return { ...w, x: round(i * step), y: round(i * step), w: 0.62, h: 0.66, restore: undefined };
        }),
      };
    });
  }

  function popOut(href: string) {
    const w = Math.min(1280, window.screen.availWidth - 120);
    const h = Math.min(900, window.screen.availHeight - 120);
    const win = window.open(href, `hops-popout:${href}`, `popup=yes,width=${w},height=${h},left=${window.screenX + 60},top=${window.screenY + 60}`);
    if (!win) alert("Your browser blocked the new window - allow pop-ups for this site and try again.");
  }

  function toggleWidget(id: string) {
    setConfig((c) => ({ ...c, widgets: c.widgets.includes(id) ? c.widgets.filter((w) => w !== id) : [...c.widgets, id] }));
  }

  // Layouts ----------------------------------------------------------------
  const current = layouts.find((l) => l.id === currentId) ?? null;

  function applyLayout(id: string) {
    if (!id) {
      setCurrentId(null);
      return;
    }
    const layout = layouts.find((l) => l.id === id);
    if (!layout) return;
    setCurrentId(id);
    setConfig(cleanConfig(layout.config, modules));
    setShown(new Set());
    setFocusId(null);
  }

  async function save(name: string, makeDefault: boolean) {
    const result = await saveLayout(name, config, makeDefault);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    const saved = result.layout;
    setLayouts((prev) => {
      const others = prev.filter((l) => l.id !== saved.id).map((l) => (makeDefault ? { ...l, is_default: false } : l));
      return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    setCurrentId(saved.id);
    setSaveName(null);
    flash(`Saved "${saved.name}".`);
  }

  async function removeLayout() {
    if (!current) return;
    if (!(await confirm(`Delete the layout "${current.name}"?`))) return;
    const result = await deleteLayout(current.id);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    setLayouts((prev) => prev.filter((l) => l.id !== current.id));
    setCurrentId(null);
  }

  async function makeDefault() {
    if (!current) return;
    const result = await setDefaultLayout(current.id);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    setLayouts((prev) => prev.map((l) => ({ ...l, is_default: l.id === current.id })));
    flash(`"${current.name}" opens first from now on.`);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ModuleOption[]>();
    for (const m of modules) map.set(m.category, [...(map.get(m.category) ?? []), m]);
    return [...map.entries()];
  }, [modules]);

  const widgetDefs = config.widgets.map((id) => WIDGETS.find((w) => w.id === id)).filter((w): w is (typeof WIDGETS)[number] => !!w);
  const showStrip = config.widgetsOpen && widgetDefs.length > 0;
  // Fill the screen: the area takes what is left under the page header and the widget strip.
  const areaHeight = `max(420px, calc(100vh - ${showStrip ? 360 : 150}px))`;

  return (
    // Break out of the page's centered column so the workspace uses the whole content area.
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen space-y-2 px-3 lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)]">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-bold">Workspace</h1>

        <select value={currentId ?? ""} onChange={(e) => applyLayout(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-black">
          <option value="">{current ? "Layout..." : "Unsaved layout"}</option>
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.is_default ? " (opens first)" : ""}
            </option>
          ))}
        </select>
        {current && (
          <>
            <button className={btn} onClick={() => save(current.name, current.is_default)}>
              Save changes
            </button>
            {!current.is_default && (
              <button className={btn} onClick={makeDefault}>
                Open this first
              </button>
            )}
            <button className={`${btn} text-red-600`} onClick={removeLayout}>
              Delete
            </button>
          </>
        )}
        {saveName === null ? (
          <button className={btn} onClick={() => setSaveName("")}>
            Save as new...
          </button>
        ) : (
          <span className="flex items-center gap-1">
            <input
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && saveName.trim()) void save(saveName, false);
                if (e.key === "Escape") setSaveName(null);
              }}
              placeholder="Layout name (Morning...)"
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-black"
            />
            <button className={btnOn} disabled={!saveName.trim()} onClick={() => save(saveName, false)}>
              Save
            </button>
            <button className={btn} onClick={() => setSaveName(null)}>
              Cancel
            </button>
          </span>
        )}

        <span className="flex-1" />
        {message && <span className="text-xs font-medium text-green-700 dark:text-green-400">{message}</span>}
        <button className={btnOn} onClick={() => setPickerFor("new")}>
          + Window
        </button>
        <button className={btn} onClick={tile} disabled={config.windows.length === 0} title="Arrange the windows to fill the area">
          Tile
        </button>
        <button className={btn} onClick={cascade} disabled={config.windows.length === 0}>
          Cascade
        </button>
        <div className="relative">
          <button className={btn} onClick={() => setWidgetMenuOpen((o) => !o)}>
            Widgets ({config.widgets.length})
          </button>
          {widgetMenuOpen && (
            <div className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-black/15 bg-white p-2 text-black shadow-lg dark:border-white/20 dark:bg-neutral-900 dark:text-white">
              {WIDGETS.map((w) => (
                <label key={w.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10">
                  <input type="checkbox" checked={config.widgets.includes(w.id)} onChange={() => toggleWidget(w.id)} />
                  {w.label}
                </label>
              ))}
              <button className="mt-1 w-full rounded px-1.5 py-1 text-left text-xs text-black/50 hover:bg-black/5 dark:text-white/50" onClick={() => setWidgetMenuOpen(false)}>
                Close
              </button>
            </div>
          )}
        </div>
        <button className={config.widgetsOpen ? btnOn : btn} onClick={() => setConfig((c) => ({ ...c, widgetsOpen: !c.widgetsOpen }))}>
          {config.widgetsOpen ? "Hide strip" : "Show strip"}
        </button>
        <button className={btn} onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* The workspace area: free windows you can move and resize */}
      <div
        ref={canvasRef}
        onClick={() => setWidgetMenuOpen(false)}
        style={{ height: areaHeight }}
        className="relative overflow-hidden rounded-lg border border-dashed border-black/15 bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.03]"
      >
        {config.windows.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-black/50 dark:text-white/50">
            <p>No windows open.</p>
            <button className={btnOn} onClick={() => setPickerFor("new")}>
              + Window
            </button>
          </div>
        )}
        {config.windows.map((win) => {
          const left = win.x * canvas.w;
          const top = win.y * canvas.h;
          const width = win.w * canvas.w;
          const height = win.h * canvas.h;
          const focused = focusId === win.id;
          const maximized = !!win.restore;
          const resizeHandle = (mode: string, style: string) => (
            <div key={mode} onPointerDown={(e) => startDrag(e, win.id, mode)} className={`absolute z-10 ${style}`} />
          );
          return (
            <section
              key={win.id}
              onPointerDownCapture={() => focusId !== win.id && bringToFront(win.id)}
              style={{ left, top, width, height, zIndex: win.z }}
              className={`absolute flex flex-col overflow-hidden rounded-lg border bg-white shadow-md dark:bg-neutral-900 ${focused ? "border-green-600" : "border-black/20 dark:border-white/20"}`}
            >
              {/* Title bar: drag it to move the window; double-click to maximize */}
              <div
                onPointerDown={(e) => startDrag(e, win.id, "move")}
                onDoubleClick={(e) => {
                  if (!(e.target as HTMLElement).closest("button, input, select")) toggleMaximize(win.id);
                }}
                className={`flex shrink-0 select-none items-end gap-1 border-b border-black/10 px-2 pt-1.5 dark:border-white/10 ${focused ? "cursor-move bg-green-50 dark:bg-green-950/30" : "cursor-move bg-black/[0.04] dark:bg-white/[0.05]"}`}
              >
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {win.tabs.map((href) => (
                    <span
                      key={href}
                      className={`flex items-center gap-1 rounded-t-md border border-b-0 px-2 py-1 text-xs ${
                        win.active === href ? "border-black/15 bg-white font-medium dark:border-white/15 dark:bg-neutral-900" : "border-transparent text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                      }`}
                    >
                      <button onClick={() => patchWindow(win.id, { active: href })} className="max-w-[10rem] truncate">
                        {labelOf.get(href) ?? href}
                      </button>
                      {win.tabs.length > 1 && (
                        <button onClick={() => detachTab(win.id, href)} title="Move this tab to its own window" className="text-black/30 hover:text-green-700 dark:text-white/30">
                          ⧉
                        </button>
                      )}
                      <button onClick={() => closeTab(win.id, href)} title="Close this tab" className="text-black/30 hover:text-red-600 dark:text-white/30">
                        ×
                      </button>
                    </span>
                  ))}
                  <button onClick={() => setPickerFor(win.id)} className="rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20">
                    + Tab
                  </button>
                </div>
                <div className="flex shrink-0 gap-1 pb-1">
                  {win.active && (
                    <>
                      <span className="flex items-center" title="Shrink the page to fit more on screen">
                        <button className={btn} disabled={(win.zoom ?? 1) <= ZOOMS[ZOOMS.length - 1]} onClick={() => patchWindow(win.id, { zoom: ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(win.zoom ?? 1) + 1)] })}>
                          -
                        </button>
                        <span className="w-9 text-center text-[11px] text-black/60 dark:text-white/60">{Math.round((win.zoom ?? 1) * 100)}%</span>
                        <button className={btn} disabled={(win.zoom ?? 1) >= 1} onClick={() => patchWindow(win.id, { zoom: ZOOMS[Math.max(0, ZOOMS.indexOf(win.zoom ?? 1) - 1)] })}>
                          +
                        </button>
                      </span>
                      <button className={btn} title="Reload this page" onClick={() => setReloads((r) => ({ ...r, [`${win.id}|${win.active}`]: (r[`${win.id}|${win.active}`] ?? 0) + 1 }))}>
                        ↻
                      </button>
                      <button className={btn} title="Open in its own browser window" onClick={() => popOut(win.active!)}>
                        Pop out
                      </button>
                    </>
                  )}
                  <button className={btn} onClick={() => toggleMaximize(win.id)} title={maximized ? "Put it back" : "Fill the area"}>
                    {maximized ? "Restore" : "Maximize"}
                  </button>
                  <button className={`${btn} text-red-600`} onClick={() => closeWindow(win.id)} title="Close this window">
                    ×
                  </button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1">
                {win.tabs.map((href) => {
                  const key = `${win.id}|${href}`;
                  const active = win.active === href;
                  if (!shown.has(key) && !active) return null;
                  return (
                    <iframe
                      key={`${key}|${reloads[key] ?? 0}`}
                      // Named like a pop-out window, so the page shows without its menu.
                      name={`hops-popout:embed-${win.id}-${href}`}
                      src={href}
                      title={labelOf.get(href) ?? href}
                      style={{ width: `${100 / (win.zoom ?? 1)}%`, height: `${100 / (win.zoom ?? 1)}%`, transform: `scale(${win.zoom ?? 1})`, transformOrigin: "top left" }}
                      className={`absolute left-0 top-0 border-0 bg-white ${active ? "" : "hidden"} ${dragging || !focused ? "pointer-events-none" : ""}`}
                    />
                  );
                })}
                {!win.active && (
                  <div className="flex h-full items-center justify-center p-6 text-center text-sm text-black/50 dark:text-white/50">
                    Empty window. Click <b className="mx-1">+ Tab</b> and pick a page.
                  </div>
                )}
                {/* Clicking an unfocused window's page first brings the window forward. */}
                {!focused && !dragging && <div className="absolute inset-0" onPointerDown={() => bringToFront(win.id)} />}
              </div>

              {!maximized && (
                <>
                  {resizeHandle("n", "left-2 right-2 top-0 h-1.5 cursor-n-resize")}
                  {resizeHandle("s", "bottom-0 left-2 right-2 h-1.5 cursor-s-resize")}
                  {resizeHandle("w", "bottom-2 left-0 top-2 w-1.5 cursor-w-resize")}
                  {resizeHandle("e", "bottom-2 right-0 top-2 w-1.5 cursor-e-resize")}
                  {resizeHandle("nw", "left-0 top-0 h-3 w-3 cursor-nw-resize")}
                  {resizeHandle("ne", "right-0 top-0 h-3 w-3 cursor-ne-resize")}
                  {resizeHandle("sw", "bottom-0 left-0 h-3 w-3 cursor-sw-resize")}
                  {resizeHandle("se", "bottom-0 right-0 h-3.5 w-3.5 cursor-se-resize")}
                </>
              )}
            </section>
          );
        })}
      </div>

      {/* Widget strip along the bottom */}
      {showStrip && (
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ height: 190 }}>
          {widgetDefs.map((w) => (
            <div key={w.id} className={`h-full shrink-0 overflow-y-auto rounded-lg border border-black/10 p-3 dark:border-white/10 ${w.id === "notes" ? "w-80" : "w-64"}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                {w.href ? (
                  <button onClick={() => openFromWidget(w.href!)} className="text-left text-sm font-bold hover:underline" title="Open this page in a window">
                    {w.label}
                  </button>
                ) : (
                  <span className="text-sm font-bold">{w.label}</span>
                )}
                <button onClick={() => toggleWidget(w.id)} title="Remove this widget" className="text-black/30 hover:text-red-600 dark:text-white/30">
                  ×
                </button>
              </div>
              <div className={w.id === "notes" ? "h-[138px]" : ""}>
                <WidgetBody id={w.id} data={data} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Page picker */}
      {pickerFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPickerFor(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 text-black shadow-xl dark:bg-neutral-900 dark:text-white" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">{pickerFor === "new" ? "Open in a new window" : "Add a tab"}</p>
              <button onClick={() => setPickerFor(null)} className="text-black/40 hover:text-black dark:text-white/40">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {grouped.map(([category, list]) => (
                <div key={category} className="mb-2">
                  <p className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/40 dark:text-white/40">{category}</p>
                  {list.map((m) => (
                    <button key={m.href} onClick={() => openModule(m.href, pickerFor)} className="block w-full rounded px-1.5 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10">
                      {m.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data && showStrip && (
        <p className="text-[11px] text-black/40 dark:text-white/40">
          Numbers updated {new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · refresh every minute and a half
        </p>
      )}
    </div>
  );
}
