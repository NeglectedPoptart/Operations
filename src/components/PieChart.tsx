export interface PieSlice {
  label: string;
  value: number;
  colorVar: string;
}

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sliceArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = pointOnCircle(cx, cy, r, endAngle);
  const end = pointOnCircle(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

// A plain-pie (no donut hole) as requested, built as static SVG - no chart
// library needed for three slices. Colors are passed as CSS variable
// references (--series-n) so light/dark swap happens in the parent's <style>
// block per the data-viz skill's palette pattern.
export default function PieChart({ slices, size = 140 }: { slices: PieSlice[]; size?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = size / 2;

  if (total === 0) {
    return <p className="text-sm text-black/40 dark:text-white/40">No data yet.</p>;
  }

  const arcs = slices
    .filter((s) => s.value > 0)
    .reduce<Array<PieSlice & { startAngle: number; endAngle: number; isFullCircle: boolean }>>(
      (acc, s) => {
        const runningTotal = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
        const startAngle = runningTotal;
        const endAngle = startAngle + (s.value / total) * 360;
        acc.push({ ...s, startAngle, endAngle, isFullCircle: endAngle - startAngle >= 360 });
        return acc;
      },
      [],
    );

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="AM Holdovers by status">
        {arcs.map((a) =>
          a.isFullCircle ? (
            <circle key={a.label} cx={r} cy={r} r={r} fill={a.colorVar}>
              <title>{`${a.label}: ${a.value}`}</title>
            </circle>
          ) : (
            <path key={a.label} d={sliceArcPath(r, r, r, a.startAngle, a.endAngle)} fill={a.colorVar}>
              <title>{`${a.label}: ${a.value} (${Math.round((a.value / total) * 100)}%)`}</title>
            </path>
          ),
        )}
      </svg>
      <ul className="space-y-1 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: s.colorVar }}
              aria-hidden
            />
            <span className="text-black/70 dark:text-white/70">
              {s.label}: <span className="font-medium">{s.value}</span>{" "}
              <span className="text-black/40 dark:text-white/40">
                ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
