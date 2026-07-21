"use client";

// A skeuomorphic aircraft-panel style flip switch - metal bezel, a lever
// that physically flips between two slots, a backlit LED, and a stenciled
// label that lights up red when engaged.
export default function FighterJetToggle({
  active,
  onToggle,
  label = "REQUEST STATEMENT",
}: {
  active: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={active}
      title={active ? "Statement requested - click to clear" : "Flag this carrier for a statement request"}
      className="flex select-none flex-col items-center gap-1"
    >
      <div className="relative flex h-16 w-9 items-center justify-center rounded-[5px] border border-black/70 bg-gradient-to-b from-zinc-400 via-zinc-600 to-zinc-800 p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.5),0_2px_3px_rgba(0,0,0,0.6)]">
        <span className="absolute left-0.5 top-0.5 h-[3px] w-[3px] rounded-full bg-black/80" />
        <span className="absolute right-0.5 top-0.5 h-[3px] w-[3px] rounded-full bg-black/80" />
        <span className="absolute bottom-0.5 left-0.5 h-[3px] w-[3px] rounded-full bg-black/80" />
        <span className="absolute bottom-0.5 right-0.5 h-[3px] w-[3px] rounded-full bg-black/80" />

        <div
          className={`flex h-full w-3.5 rounded-full bg-black py-0.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.95)] ${
            active ? "items-start" : "items-end"
          }`}
        >
          <div className="mx-auto h-6 w-4 rounded-full bg-gradient-to-b from-gray-50 via-gray-300 to-gray-500 shadow-md transition-all duration-150 ease-out" />
        </div>

        <span
          className={`absolute -right-1 top-2 h-1.5 w-1.5 rounded-full transition-all ${
            active ? "bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.9)]" : "bg-red-950/70"
          }`}
        />
      </div>
      <span
        className={`text-center text-[8px] font-bold uppercase leading-tight tracking-wider transition-colors ${
          active ? "text-red-600 dark:text-red-400" : "text-black/40 dark:text-white/30"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
