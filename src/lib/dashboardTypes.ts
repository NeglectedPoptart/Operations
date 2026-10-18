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
export interface PaneConfig {
  tabs: string[]; // page paths open in this pane
  active: string | null;
}

export interface WorkspaceConfig {
  panes: PaneConfig[]; // 1 or 2
  stacked: boolean; // two panes one above the other instead of side by side
  height: number; // px height of the pane area
  widgets: string[]; // widget ids shown, in order
  notes: string; // the My notes widget
}

export interface SavedLayout {
  id: string;
  name: string;
  config: WorkspaceConfig;
  is_default: boolean;
}
