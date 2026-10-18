"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { DashboardData, PaneConfig, SavedLayout, WorkspaceConfig } from "@/lib/dashboardTypes";
import { deleteLayout, getDashboardData, saveLayout, setDefaultLayout } from "./actions";
import { WIDGETS, WidgetBody } from "./Widgets";

export interface ModuleOption {
  href: string;
  label: string;
  category: string;
}

const STORAGE_KEY = "hops-dashboard-workspace";
const REFRESH_MS = 90_000;
const HEIGHTS = [
  { label: "Short", value: 520 },
  { label: "Medium", value: 720 },
  { label: "Tall", value: 920 },
];

const btn = "rounded-md border border-black/20 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";
const btnOn = "rounded-md bg-black px-2.5 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black";

function starterConfig(modules: ModuleOption[]): WorkspaceConfig {
  const has = (href: string) => modules.some((m) => m.href === href);
  const first = ["/warehouse/orders", "/logistics/board"].find(has) ?? modules[0]?.href ?? null;
  const second = ["/mexico/arrivals", "/qc/inspections"].find((h) => has(h) && h !== first) ?? null;
  return {
    panes: [
      { tabs: first ? [first] : [], active: first },
      { tabs: second ? [second] : [], active: second },
    ],
    stacked: false,
    height: 720,
    widgets: ["orders", "qc", "arrivals", "agents", "out"],
    notes: "",
  };
}

// A saved or stored config may name pages that are gone or that this person can no longer open.
function cleanConfig(config: WorkspaceConfig, modules: ModuleOption[]): WorkspaceConfig {
  const known = new Set(modules.map((m) => m.href));
  const panes = (config.panes ?? []).slice(0, 2).map((p): PaneConfig => {
    const tabs = (p.tabs ?? []).filter((t) => known.has(t));
    return { tabs, active: p.active && tabs.includes(p.active) ? p.active : tabs[0] ?? null };
  });
  return {
    panes: panes.length > 0 ? panes : [{ tabs: [], active: null }],
    stacked: !!config.stacked,
    height: HEIGHTS.some((h) => h.value === config.height) ? config.height : 720,
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
    if (def) return cleanConfig(def.config, modules);
    return starterConfig(modules);
  });
  const [focusPane, setFocusPane] = useState(0);
  const [maximized, setMaximized] = useState<number | null>(null);
  const [reloads, setReloads] = useState<Record<string, number>>({});
  // Pages that have been shown at least once - so a tab's page loads when first opened and then stays loaded.
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(null), 3000);
  }

  // The page of each pane's active tab counts as shown.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown((prev) => {
      const next = new Set(prev);
      config.panes.forEach((p, i) => p.active && next.add(`${i}|${p.active}`));
      return next.size === prev.size ? prev : next;
    });
  }, [config.panes]);

  function patchPane(index: number, patch: Partial<PaneConfig>) {
    setConfig((c) => ({ ...c, panes: c.panes.map((p, i) => (i === index ? { ...p, ...patch } : p)) }));
  }

  function openModule(href: string, paneIndex = focusPane) {
    setConfig((c) => {
      const idx = Math.min(paneIndex, c.panes.length - 1);
      return {
        ...c,
        panes: c.panes.map((p, i) => (i === idx ? { tabs: p.tabs.includes(href) ? p.tabs : [...p.tabs, href], active: href } : p)),
      };
    });
    setPickerOpen(false);
  }

  function closeTab(paneIndex: number, href: string) {
    setConfig((c) => ({
      ...c,
      panes: c.panes.map((p, i) => {
        if (i !== paneIndex) return p;
        const tabs = p.tabs.filter((t) => t !== href);
        return { tabs, active: p.active === href ? tabs[tabs.length - 1] ?? null : p.active };
      }),
    }));
    setShown((prev) => {
      const next = new Set(prev);
      next.delete(`${paneIndex}|${href}`);
      return next;
    });
  }

  function moveTab(fromPane: number, href: string) {
    setConfig((c) => {
      if (c.panes.length < 2) return c;
      const to = fromPane === 0 ? 1 : 0;
      const from = c.panes[fromPane];
      const tabsFrom = from.tabs.filter((t) => t !== href);
      return {
        ...c,
        panes: c.panes.map((p, i) => {
          if (i === fromPane) return { tabs: tabsFrom, active: from.active === href ? tabsFrom[tabsFrom.length - 1] ?? null : from.active };
          if (i === to) return { tabs: p.tabs.includes(href) ? p.tabs : [...p.tabs, href], active: href };
          return p;
        }),
      };
    });
    setShown((prev) => {
      const next = new Set(prev);
      next.delete(`${fromPane}|${href}`);
      return next;
    });
  }

  function toggleSplit() {
    setMaximized(null);
    setConfig((c) => {
      if (c.panes.length === 1) return { ...c, panes: [...c.panes, { tabs: [], active: null }] };
      // Back to one pane: the second pane's tabs join the first.
      const [a, b] = c.panes;
      return { ...c, panes: [{ tabs: [...a.tabs, ...b.tabs.filter((t) => !a.tabs.includes(t))], active: a.active ?? b.active }] };
    });
    setShown(new Set());
    setFocusPane(0);
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
    setMaximized(null);
    setFocusPane(0);
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

  const visiblePanes = maximized === null ? config.panes.map((p, i) => ({ p, i })) : [{ p: config.panes[maximized], i: maximized }];
  const widgetDefs = config.widgets.map((id) => WIDGETS.find((w) => w.id === id)).filter((w): w is (typeof WIDGETS)[number] => !!w);

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Workspace</h1>

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
        <button className={config.panes.length > 1 ? btnOn : btn} onClick={toggleSplit}>
          {config.panes.length > 1 ? "Split: on" : "Split"}
        </button>
        {config.panes.length > 1 && (
          <button className={btn} onClick={() => setConfig((c) => ({ ...c, stacked: !c.stacked }))}>
            {config.stacked ? "Side by side" : "Stack"}
          </button>
        )}
        <select
          value={config.height}
          onChange={(e) => setConfig((c) => ({ ...c, height: Number(e.target.value) }))}
          className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-black"
          aria-label="Pane height"
        >
          {HEIGHTS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <button className={btn} onClick={() => setWidgetMenuOpen((o) => !o)}>
            Widgets ({config.widgets.length})
          </button>
          {widgetMenuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-black/15 bg-white p-2 text-black shadow-lg dark:border-white/20 dark:bg-neutral-900 dark:text-white">
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
        <button className={btn} onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Panes */}
      <div className={`grid gap-3 ${config.panes.length > 1 && !config.stacked && maximized === null ? "lg:grid-cols-2" : "grid-cols-1"}`} onClick={() => setWidgetMenuOpen(false)}>
        {visiblePanes.map(({ p, i }) => (
          <section
            key={i}
            onMouseDown={() => setFocusPane(i)}
            style={{ height: config.height }}
            className={`flex min-w-0 flex-col overflow-hidden rounded-lg border bg-white dark:bg-neutral-900 ${focusPane === i && config.panes.length > 1 ? "border-green-600" : "border-black/15 dark:border-white/15"}`}
          >
            <div className="flex items-end gap-1 border-b border-black/10 bg-black/[0.03] px-2 pt-1.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {p.tabs.map((href) => (
                  <span
                    key={href}
                    className={`group flex items-center gap-1 rounded-t-md border border-b-0 px-2 py-1 text-xs ${
                      p.active === href ? "border-black/15 bg-white font-medium dark:border-white/15 dark:bg-neutral-900" : "border-transparent text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                    }`}
                  >
                    <button onClick={() => patchPane(i, { active: href })} className="max-w-[10rem] truncate">
                      {labelOf.get(href) ?? href}
                    </button>
                    {config.panes.length > 1 && (
                      <button onClick={() => moveTab(i, href)} title={`Move to the other pane`} className="text-black/30 hover:text-green-700 dark:text-white/30">
                        {config.stacked ? "↕" : "⇄"}
                      </button>
                    )}
                    <button onClick={() => closeTab(i, href)} title="Close" className="text-black/30 hover:text-red-600 dark:text-white/30">
                      ×
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <button
                    onClick={() => {
                      setFocusPane(i);
                      setPickerOpen((o) => !o);
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                  >
                    + Open
                  </button>
                  {pickerOpen && focusPane === i && (
                    <div className="absolute left-0 top-full z-30 mt-1 max-h-80 w-60 overflow-y-auto rounded-lg border border-black/15 bg-white p-2 text-black shadow-lg dark:border-white/20 dark:bg-neutral-900 dark:text-white">
                      {grouped.map(([category, list]) => (
                        <div key={category} className="mb-1">
                          <p className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/40 dark:text-white/40">{category}</p>
                          {list.map((m) => (
                            <button key={m.href} onClick={() => openModule(m.href, i)} className="block w-full rounded px-1.5 py-1 text-left text-xs hover:bg-black/5 dark:hover:bg-white/10">
                              {m.label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {p.active && (
                <div className="flex shrink-0 gap-1 pb-1">
                  <button className={btn} title="Reload this page" onClick={() => setReloads((r) => ({ ...r, [`${i}|${p.active}`]: (r[`${i}|${p.active}`] ?? 0) + 1 }))}>
                    ↻
                  </button>
                  <button className={btn} title="Open in its own window" onClick={() => popOut(p.active!)}>
                    Pop out
                  </button>
                  {config.panes.length > 1 && (
                    <button className={btn} onClick={() => setMaximized(maximized === i ? null : i)}>
                      {maximized === i ? "Restore" : "Maximize"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="relative min-h-0 flex-1">
              {p.tabs.map((href) => {
                const key = `${i}|${href}`;
                const active = p.active === href;
                if (!shown.has(key) && !active) return null;
                return (
                  <iframe
                    key={`${key}|${reloads[key] ?? 0}`}
                    // Named like a pop-out window, so the page shows without its menu.
                    name={`hops-popout:embed-${i}-${href}`}
                    src={href}
                    title={labelOf.get(href) ?? href}
                    className={`absolute inset-0 h-full w-full border-0 bg-white ${active ? "" : "hidden"}`}
                  />
                );
              })}
              {!p.active && (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-black/50 dark:text-white/50">
                  Nothing open here. Click <b className="mx-1">+ Open</b> and pick a page.
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Widgets */}
      {widgetDefs.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {widgetDefs.map((w) => (
            <div key={w.id} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
              <div className="mb-2 flex items-center justify-between gap-2">
                {w.href ? (
                  <button onClick={() => openModule(w.href!)} className="text-left text-sm font-bold hover:underline" title="Open this page in the workspace">
                    {w.label}
                  </button>
                ) : (
                  <span className="text-sm font-bold">{w.label}</span>
                )}
                <button onClick={() => toggleWidget(w.id)} title="Remove this widget" className="text-black/30 hover:text-red-600 dark:text-white/30">
                  ×
                </button>
              </div>
              <WidgetBody id={w.id} data={data} notes={config.notes} onNotes={(notes) => setConfig((c) => ({ ...c, notes }))} />
            </div>
          ))}
        </div>
      )}
      {data && <p className="text-[11px] text-black/40 dark:text-white/40">Numbers updated {new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · refresh every minute and a half</p>}
    </div>
  );
}
