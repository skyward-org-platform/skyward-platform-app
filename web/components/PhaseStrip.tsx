"use client";

// Reusable 7-cell pipeline phase strip from the v2 design (screen 4).
// Used in:
//   - Step 4: Dashboard (active engagements table)
//   - Step 6: Clients list (pipeline coverage column) + Project cards
//   - Property hero (interactive: click to approve / view state)
//
// Two display modes:
//   - Binary (default): each cell is done / current / empty, driven by
//     `currentPhase`. Used in the dashboard + clients list where we only
//     have a single coarse phase number per property.
//   - Gate (state machine): gray / black / green cells driven by `phases`
//     state per Paul's "commit + push" gate model. Used on the property
//     hero where we know per-phase data presence + approval status.
//
// The gate prop is a superset - when provided it overrides the binary
// rendering. Callers that don't pass `phases` get the legacy behavior.

import { useState } from "react";

export const PHASE_NAMES = [
  "Onboard",
  "WQA",
  "Tech SEO",
  "Keywords",
  "Content",
  "Authority",
  "Tracking",
] as const;

export type PhaseGateState = "gray" | "black" | "green";

export type PhaseGate = {
  state: PhaseGateState;
  /** ISO timestamp of approval, if any. Shown in the popover. */
  approvedAt?: string | null;
  /** Free-text approver name/email. Shown in the popover. */
  approvedBy?: string | null;
  /** One-line label describing what data populated this cell. Renders
   *  as a tooltip on the cell and in the popover body. */
  detail?: string;
};

export function PhaseStrip({
  currentPhase,
  phases,
  showLabels = false,
  className = "",
  style,
  onApprove,
}: {
  currentPhase: number;
  phases?: PhaseGate[];
  showLabels?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** When provided, clicking a cell opens a popover with an Approve
   *  button (when black) or approval metadata (when green). Server
   *  action handle goes here; receives the phase index 0-6. */
  onApprove?: (phaseIndex: number) => Promise<void> | void;
}) {
  const phase = Math.max(0, Math.min(6, Math.floor(currentPhase ?? 0)));
  const useGate = Array.isArray(phases) && phases.length === PHASE_NAMES.length;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className={className} style={style}>
      <div className="flex gap-[3px] relative">
        {PHASE_NAMES.map((name, i) => {
          if (useGate) {
            const g = phases![i];
            const isOpen = openIndex === i;
            const cellColor =
              g.state === "green"
                ? "bg-emerald-600"
                : g.state === "black"
                  ? "bg-slate-900"
                  : "bg-slate-200";
            const stateLabel =
              g.state === "green"
                ? "approved"
                : g.state === "black"
                  ? "data ready, awaiting approval"
                  : "no data yet";
            return (
              <div key={i} className="flex-1 relative">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className={`w-full h-[8px] rounded-[1px] ${cellColor} relative overflow-hidden flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity ${isOpen ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                  title={g.detail ?? `${name} - ${stateLabel}`}
                  aria-label={`Phase ${i} ${name} - ${stateLabel} - click to view`}
                >
                  {g.state === "green" && (
                    <span className="text-white text-[7px] font-bold leading-none">
                      ✓
                    </span>
                  )}
                </button>
                {isOpen && (
                  <PhaseCellPopover
                    name={name}
                    gate={g}
                    phaseIndex={i}
                    onApprove={onApprove}
                    onClose={() => setOpenIndex(null)}
                    pending={pending}
                    setPending={setPending}
                  />
                )}
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
        <div className="flex gap-[3px] mt-1.5">
          {PHASE_NAMES.map((name, i) => {
            const g = useGate ? phases![i] : null;
            const stateLabel =
              g === null
                ? null
                : g.state === "green"
                  ? "Approved"
                  : g.state === "black"
                    ? "Ready"
                    : "—";
            const stateColor =
              g === null
                ? ""
                : g.state === "green"
                  ? "text-emerald-700 font-semibold"
                  : g.state === "black"
                    ? "text-slate-700 font-medium"
                    : "text-slate-300";
            return (
              <div
                key={name}
                className="flex-1 flex flex-col items-center leading-tight"
              >
                <div className="text-[9px] text-slate-400 tracking-wider">
                  {name}
                </div>
                {stateLabel !== null && (
                  <div
                    className={`text-[10px] mt-0.5 ${stateColor}`}
                    title={g?.detail}
                  >
                    {stateLabel}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PhaseCellPopover({
  name,
  gate,
  phaseIndex,
  onApprove,
  onClose,
  pending,
  setPending,
}: {
  name: string;
  gate: PhaseGate;
  phaseIndex: number;
  onApprove?: (phaseIndex: number) => Promise<void> | void;
  onClose: () => void;
  pending: boolean;
  setPending: (v: boolean) => void;
}) {
  const handleApprove = async () => {
    if (!onApprove) return;
    setPending(true);
    try {
      await onApprove(phaseIndex);
      onClose();
    } finally {
      setPending(false);
    }
  };
  const stateChip =
    gate.state === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : gate.state === "black"
        ? "bg-slate-900 text-white border-slate-900"
        : "bg-slate-50 text-slate-500 border-slate-200";
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-[280px] bg-white border rounded-md shadow-lg p-3 text-[11px] text-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-900 text-[12px]">
            Phase {phaseIndex} · {name}
          </div>
          <span
            className={`inline-flex items-center text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${stateChip}`}
          >
            {gate.state === "green"
              ? "Approved"
              : gate.state === "black"
                ? "Ready"
                : "No data"}
          </span>
        </div>
        {gate.detail && (
          <p className="text-slate-600 leading-snug mb-2">{gate.detail}</p>
        )}
        {gate.state === "green" && (
          <div className="text-slate-500 leading-snug mb-2">
            Approved
            {gate.approvedAt && (
              <>
                {" "}
                <span className="tabular-nums">
                  {fmtRelative(gate.approvedAt)}
                </span>
              </>
            )}
            {gate.approvedBy && (
              <>
                {" by "}
                <span className="text-slate-700">{gate.approvedBy}</span>
              </>
            )}
            . Downstream phases consume current live state.
          </div>
        )}
        {gate.state === "black" && onApprove && (
          <button
            type="button"
            onClick={handleApprove}
            disabled={pending}
            className="w-full mt-1 px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-medium rounded hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? "Approving..." : `Approve Phase ${phaseIndex}`}
          </button>
        )}
        {gate.state === "black" && !onApprove && (
          <div className="text-slate-500 text-[10px] italic">
            Approval action not wired for this surface.
          </div>
        )}
        {gate.state === "gray" && (
          <div className="text-slate-500 text-[10px] leading-snug">
            Populate the underlying data before this phase can be approved.
          </div>
        )}
      </div>
    </>
  );
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
