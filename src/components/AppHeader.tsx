// Plain branding strip above the nav bar, on every page (including
// /login - unlike NavBar, this never checks role/pathname since there's
// nothing in it but the logo and product name).
const GOLD_GRADIENT =
  "linear-gradient(180deg, #bf953f 0%, #fcf6ba 25%, #b38728 50%, #fbf5b7 75%, #aa771c 100%)";

export default function AppHeader() {
  return (
    <div className="border-b border-black/10 bg-white px-4 py-2 print:hidden dark:border-white/10 dark:bg-black">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, not a photo needing optimization */}
        <img src="/logo-harvest-best.png" alt="Harvest Best" className="h-12 w-auto shrink-0" />
        <div className="leading-tight">
          <p
            className="bg-clip-text text-lg font-extrabold tracking-wide text-transparent"
            style={{ backgroundImage: GOLD_GRADIENT }}
          >
            HOPS
          </p>
          <p className="text-[11px] text-black/50 dark:text-white/50">HarvestBest Operations Platform</p>
        </div>
      </div>
    </div>
  );
}
