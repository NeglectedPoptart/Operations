// What the Dashboard widgets show, gathered in one go by getDashboardData.
// A section is missing (undefined) when its query failed, so one broken table
// never blanks the whole strip.

export interface DashboardData {
  fetchedAt: string;
  today: string;
  orders?: {
    today: number;
    tomorrow: number;
    later: number;
    all: number;
    labels: { name: string; color: string; opacity: number; count: number }[];
    noLabel: number;
  };
  loads?: {
    onRoad: number;
    podPending: number;
    list: { id: string; label: string; eta: string | null; podPending: boolean }[];
  };
  arrivals?: {
    total: number;
    arrived: number;
    list: { grower: string; commodity: string; arrived: boolean }[];
  };
  qc?: {
    total: number;
    pass: number;
    caution: number;
    fail: number;
    other: number;
    worst: { lot: string; product: string; result: string }[];
  };
  trend?: { points: { date: string; value: number }[] };
  ar?: { total: number; escalated: number; buckets: { label: string; value: number }[] };
  cold?: { items: number; issues: number; dumps: number; cases: number };
  buyers?: { count: number; top: { name: string; qty: number }[] };
  agents?: { drafts: number; replies: number; answeredToday: number };
  out?: { today: { name: string; kind: string; note: string | null }[]; startingThisWeek: number };
  devices?: { total: number; flagged: number; unassigned: number };
}

// What a saved workspace holds.

// A free-floating window. Position and size are fractions of the workspace
// area (0 to 1), so a layout fits whatever the screen size is.
export interface WindowConfig {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number; // stacking order - the highest is in front
  tabs: string[]; // page paths open in this window
  active: string | null;
  // Where it was before Maximize, so Restore can put it back.
  restore?: { x: number; y: number; w: number; h: number };
  // How much the page inside is shrunk to fit more on screen (1 = normal).
  zoom?: number;
}

export interface WorkspaceConfig {
  windows: WindowConfig[];
  widgetsOpen: boolean; // the widget strip along the bottom
  widgets: string[]; // widget ids shown, in order
  notes: string; // the My notes widget
  // From the first version (two fixed panes) - converted to windows when loaded.
  panes?: { tabs: string[]; active: string | null }[];
  stacked?: boolean;
}

export interface SavedLayout {
  id: string;
  name: string;
  config: WorkspaceConfig;
  is_default: boolean;
}
