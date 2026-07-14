export interface BarDatum {
  label: string;
  value: number;
}

// Single-hue horizontal bars for comparing magnitude across categories -
// value is always shown as a direct label, never color-alone.
export default function HorizontalBarChart({
  data,
  formatValue = (v: number) => v.toLocaleString(),
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-black/40 dark:text-white/40">No data yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-32 shrink-0 truncate text-sm text-black/70 dark:text-white/70" title={d.label}>
            {d.label}
          </span>
          <div className="h-5 flex-1 rounded bg-black/5 dark:bg-white/10">
            <div
              className="h-5 rounded bg-green-600"
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-sm font-medium">{formatValue(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
