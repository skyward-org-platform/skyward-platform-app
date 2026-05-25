// Reusable 7-cell pipeline phase strip from the v2 design (screen 4).
// Used in:
//   - Step 4: Dashboard (active engagements table)
//   - Step 6: Clients list (pipeline coverage column) + Project cards
//   - Property hero
//
// Two display modes:
//   - Binary (default): each cell is done / current / empty, driven by
//     `currentPhase`. Used in the dashboard + clients list where we only
//     have a single coarse phase number per property.
//   - Percent: each cell is a partial-fill mini progress bar with a %
//     label below, driven by `phases`. Used on the property hero where
//     we have per-phase completion signals.
//
// The percent prop is a superset - when provided it overrides the binary
// rendering. Callers that don't pass `phases` get the legacy behavior.

export const PHASE_NAMES = [
  "Onboard",
  "WQA",
  "Tech SEO",
  "Keywords",
  "Content",
  "Authority",
  "Tracking",
] as const;

export type PhasePercent = {
  /** 0-100. null means "no data yet" - cell renders empty + "—" label. */
  percent: number | null;
  /** Optional override label under the cell (defaults to "N%" or "—"). */
  label?: string;
  /** Optional title attribute for the cell - explains the derivation. */
  title?: string;
};

export function PhaseStrip({
  currentPhase,
  phases,
  showLabels = false,
  className = "",
  style,
}: {
  currentPhase: number;
  phases?: PhasePercent[];
  showLabels?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const phase = Math.max(0, Math.min(6, Math.floor(currentPhase ?? 0)));
  const usePercent = Array.isArray(phases) && phases.length === PHASE_NAMES.length;

  return (
    <div className={className} style={style}>
      <div className="flex gap-[3px]">
        {PHASE_NAMES.map((name, i) => {
          if (usePercent) {
            const p = phases![i];
            const pct =
              p.percent === null ? null : Math.max(0, Math.min(100, p.percent));
            const fill =
              pct === null
                ? 0
                : pct >= 100
                  ? 100
                  : pct;
            const filledColor =
              pct === null
                ? "bg-slate-200"
                : pct >= 100
                  ? "bg-slate-900"
                  : i === phase
                    ? "bg-blue-600"
                    : "bg-slate-700";
            return (
              <div
                key={i}
                className="flex-1 h-[6px] rounded-[1px] bg-slate-200 relative overflow-hidden"
                title={p.title ?? `${name} - ${p.percent === null ? "no data" : `${Math.round(p.percent)}%`}`}
                aria-label={`Phase ${i} ${name} - ${p.percent === null ? "no data" : `${Math.round(p.percent)}%`}`}
              >
                <div
                  className={`h-full ${filledColor}`}
                  style={{ width: `${fill}%` }}
                />
              </div>
            );
          }
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
              aria-label={`Phase ${i} ${PHASE_NAMES[i]} - ${state}`}
            />
          );
        })}
      </div>

      {showLabels && (
        <div className="flex gap-[3px] mt-1.5 text-[9px] text-slate-400 tracking-wider">
          {PHASE_NAMES.map((name, i) => {
            const p = usePercent ? phases![i] : null;
            const pctLabel =
              p === null
                ? null
                : p.label
                  ? p.label
                  : p.percent === null
                    ? "—"
                    : `${Math.round(p.percent)}%`;
            return (
              <span
                key={name}
                className="flex-1 text-center flex flex-col items-center"
              >
                <span>{name}</span>
                {pctLabel !== null && (
                  <span
                    className={
                      "tabular-nums text-[9px] mt-0.5 " +
                      (p?.percent === null
                        ? "text-slate-300"
                        : p?.percent !== undefined && p.percent >= 100
                          ? "text-slate-700 font-semibold"
                          : "text-slate-500")
                    }
                  >
                    {pctLabel}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
