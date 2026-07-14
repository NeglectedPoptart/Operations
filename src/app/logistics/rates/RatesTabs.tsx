"use client";

import { useState, type ReactNode } from "react";

export default function RatesTabs({
  routeAverages,
  brokerTracker,
}: {
  routeAverages: ReactNode;
  brokerTracker: ReactNode;
}) {
  const [tab, setTab] = useState<"routes" | "tracker">("routes");

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium ${
      active
        ? "bg-green-600 text-white"
        : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
    }`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Freight Rates</h1>
      <div className="flex gap-2 border-b border-black/10 pb-3 dark:border-white/10">
        <button onClick={() => setTab("routes")} className={tabClass(tab === "routes")}>
          Route Averages
        </button>
        <button onClick={() => setTab("tracker")} className={tabClass(tab === "tracker")}>
          Broker Tracker
        </button>
      </div>
      <div className={tab === "routes" ? "" : "hidden"}>{routeAverages}</div>
      <div className={tab === "tracker" ? "" : "hidden"}>{brokerTracker}</div>
    </div>
  );
}
