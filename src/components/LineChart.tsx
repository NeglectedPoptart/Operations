"use client";

import { useMemo, useState } from "react";
import { niceTicks, type ChartPoint, type ChartSeries } from "@/lib/qcCharts";

export type { ChartPoint, ChartSeries };

const W = 900;
const H = 340;
const PAD = { left: 56, right: 18, top: 30, bottom: 34 };

function dayLabel(t: number): string {
  const d = new Date(t);
  return d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
}

// A plain SVG line chart (the app doesn't carry a chart library): one line per
// series over time, round-number axes, hover to read a point, click to open it.
export default function LineChart({
  series,
  unit,
  fromZero,
}: {
  series: ChartSeries[];
  unit: string;
  fromZero: boolean;
}) {
  const [hover, setHover] = useState<{ s: number; p: number } | null>(null);

  const geo = useMemo(() => {
    const all = series.flatMap((s) => [...s.points, ...(s.dots ?? [])]);
    if (all.length === 0) return null;
    let xMin = Math.min(...all.map((p) => p.t));
    let xMax = Math.max(...all.map((p) => p.t));
    if (xMin === xMax) {
      xMin -= 43_200_000;
      xMax += 43_200_000;
    }
    let yMin = Math.min(...all.map((p) => p.y));
    let yMax = Math.max(...all.map((p) => p.y));
    if (fromZero) yMin = Math.min(0, yMin);
    const span = yMax - yMin || Math.abs(yMax) || 1;
    if (!fromZero) yMin -= span * 0.08;
    yMax += span * 0.08;
    const ticks = niceTicks(yMin, yMax, 5);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const x = (t: number) => PAD.left + ((t - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - ((v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
    const xTicks = Array.from({ length: 6 }, (_, i) => xMin + ((xMax - xMin) * i) / 5);
    return { x, y, ticks, xTicks };
  }, [series, fromZero]);

  if (!geo) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-black/20 text-sm text-black/40 dark:border-white/20 dark:text-white/40">
        Nothing to chart for these choices.
      </div>
    );
  }

  const hovered = hover ? series[hover.s]?.points[hover.p] : null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart">
          {geo.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={geo.y(v)} y2={geo.y(v)} stroke="currentColor" strokeOpacity={0.12} />
              <text x={PAD.left - 8} y={geo.y(v) + 4} textAnchor="end" fontSize={12} fill="currentColor" fillOpacity={0.6}>
                {v}
              </text>
            </g>
          ))}
          {geo.xTicks.map((t) => (
            <text key={t} x={geo.x(t)} y={H - 10} textAnchor="middle" fontSize={12} fill="currentColor" fillOpacity={0.6}>
              {dayLabel(t)}
            </text>
          ))}
          <text x={PAD.left - 8} y={14} textAnchor="end" fontSize={12} fill="currentColor" fillOpacity={0.6}>
            {unit}
          </text>

          {series.map((s, si) => (
            <g key={s.name}>
              {(s.dots ?? []).map((d, i) => (
                <circle key={i} cx={geo.x(d.t)} cy={geo.y(d.y)} r={2.5} fill={s.color} fillOpacity={0.25} />
              ))}
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                points={[...s.points].sort((a, b) => a.t - b.t).map((p) => `${geo.x(p.t)},${geo.y(p.y)}`).join(" ")}
              />
              {s.points.map((p, pi) => (
                <circle
                  key={pi}
                  cx={geo.x(p.t)}
                  cy={geo.y(p.y)}
                  r={hover?.s === si && hover.p === pi ? 6 : 3.5}
                  fill={s.color}
                  stroke="white"
                  strokeWidth={1.5}
                  className={p.href ? "cursor-pointer" : undefined}
                  onMouseEnter={() => setHover({ s: si, p: pi })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => p.href && window.open(p.href, "_blank")}
                />
              ))}
            </g>
          ))}
        </svg>

        {hovered && hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-[16rem] rounded-md bg-black/85 px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{
              left: `${(geo.x(hovered.t) / W) * 100}%`,
              top: `${(geo.y(hovered.y) / H) * 100}%`,
              transform: "translate(-50%, -115%)",
            }}
          >
            <p className="font-semibold">
              {Number(hovered.y.toFixed(2))}
              {unit ? ` ${unit}` : ""}
            </p>
            <p className="text-white/80">{hovered.label}</p>
            {hovered.href && <p className="text-white/60">Click to open the report</p>}
          </div>
        )}
      </div>

      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
