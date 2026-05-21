// Reusable 7-cell pipeline phase strip from the v2 design (screen 4).
// Used here, also reused in:
//   - Step 4: Dashboard (active engagements table)
//   - Step 6: Clients list (pipeline coverage column) + Project cards
//
// `currentPhase` is 0-6. Cells strictly below it are `done`, the equal cell is
// `current`, anything above is empty. `showLabels` adds the 7-span label row
// beneath (used on the Property hero; other surfaces use the bare strip).
//
// Styled with utility classes that exist today. The visual refresh in V1.1
// Phase 5 will swap the palette via v2-tokens.css — the component contract
// stays the same.

export const PHASE_NAMES = [
  "Onboard",
  "WQA",
  "Tech SEO",
  "Keywords",
  "Content",
  "Authority",
  "Tracking",
] as const;

export function PhaseStrip({
  currentPhase,
  showLabels = false,
  className = "",
  style,
}: {
  currentPhase: number;
  showLabels?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const phase = Math.max(0, Math.min(6, Math.floor(currentPhase ?? 0)));

  return (
    <div className={className} style={style}>
      <div className="flex gap-[3px]">
        {PHASE_NAMES.map((_, i) => {
          const state =
            i < phase ? "done" : i === phase ? "current" : "empty";
          const bg =
            state === "done"
              ? "bg-slate-900"
              : state === "current"
              ? "bg-blue-600"
              : "bg-slate-200";
          return (
            <div
              key={i}
              className={`flex-1 h-[5px] rounded-[1px] ${bg}`}
              aria-label={`Phase ${i} ${PHASE_NAMES[i]} — ${state}`}
            />
          );
        })}
      </div>

      {showLabels && (
        <div className="flex gap-[3px] mt-1.5 text-[9px] text-slate-400 tracking-wider">
          {PHASE_NAMES.map((name) => (
            <span key={name} className="flex-1 text-center">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
