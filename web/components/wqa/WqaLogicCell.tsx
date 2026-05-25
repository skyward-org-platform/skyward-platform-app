"use client";

// Inline pill that renders the closed-set logic_code for a row. The code
// stays visible (monospace, small) so operators can grep / sort by it;
// the human-readable label lives in the tooltip. Logic_code is supplied
// by the Python pipeline (Chunk 5 wires it into BQ wqa_output); rows
// without one fall back to "—".

import { LOGIC_CODE_LABELS, type LogicCode } from "@/lib/wqa-decisions";

export function WqaLogicCell({ code }: { code: LogicCode | null }) {
  if (!code) return <span className="text-[10px] text-muted-foreground">—</span>;
  const label = LOGIC_CODE_LABELS[code] ?? code;
  return (
    <span
      className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-700"
      title={label}
    >
      {code}
    </span>
  );
}
