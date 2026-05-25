"use client";

// Per WQA SOP Tab 1 "Action Legend" — static reference for every action
// the triage tree can assign. Used when an analyst pauses on a row and
// needs the "what does Investigate mean again?" answer in two lines, plus
// the "what happens next" so the queue handoff is unambiguous.
//
// Mirrors build_phase1_wqa.py::write_action_legend. Action set ordered per
// SOP § 5.1.

import { TabHeader } from "@/components/wqa/helpers";
import { ACTION_TINT, type TriageAction } from "@/lib/wqa-triage";

type LegendRow = {
  action: TriageAction | "Keep";
  meaning: string;
  next: string;
};

// P2 action semantics v2: 7-action canon. Legacy Evaluate / Review / No
// Action / Leave as 404 / Non-* labels collapse into Investigate or Keep
// (per the toAction7 mapping). One row per canonical action.
const LEGEND: LegendRow[] = [
  {
    action: "Optimize",
    meaning: "URL stays. At least one positive signal: sessions, impressions, refs, or rank.",
    next: "Enters Phase 2 (Technical SEO) and Phase 3 (Keyword / Cluster) pipelines.",
  },
  {
    action: "Restore",
    meaning: "4xx or 5xx but should exist. Has rankings, traffic, or links worth preserving.",
    next: "Listed on the Restore tab with target H1 / Title / Meta. Content specs, dev restores.",
  },
  {
    action: "Redirect",
    meaning: "Needs a 301 to a better URL. Variants, broken with equity, HTTP, chains.",
    next: "Listed on the Redirect tab grouped by type. Developer executes the 301.",
  },
  {
    action: "Consolidate",
    meaning: "Canonical-mapped to a primary URL. Duplicate template, non-primary variant, near-duplicate.",
    next: "Merge content into the canonical parent and 301 the duplicate URL.",
  },
  {
    action: "Remove",
    meaning: "Live page with zero value signals. No traffic, impressions, refs, or rank.",
    next: "Listed on the Remove tab. Skyward applies noindex or removes the URL.",
  },
  {
    action: "Keep",
    meaning: "Stay as is. Strategic decision OR system / fragment / parameter URL with no work needed.",
    next: "No queue. Use logic_code=system_url or legitimate_keep to distinguish the reason.",
  },
  {
    action: "Investigate",
    meaning: "Needs human judgment. Internal-links-only, data conflict, or unexpected signals.",
    next: "Manual judgment by Skyward. logic_code explains which conflict triggered it; resolve and re-triage.",
  },
];

function bandFor(action: LegendRow["action"]): { band: string; dot: string } {
  if (action === "Keep")
    return { band: "bg-slate-100 text-slate-700", dot: "bg-slate-500" };
  return ACTION_TINT[action];
}

export function ActionLegendTab() {
  return (
    <section>
      <TabHeader
        title="Action Legend"
        subtitle={
          <>
            Reference card for every action the WQA triage tree can assign.
            Per WQA SOP § 5.1. Use this when an action label needs context —
            what it means, and what happens to the URL next.
          </>
        }
        count={LEGEND.length}
      />

      <div className="border rounded-lg bg-card overflow-hidden">
        <ul className="divide-y">
          {LEGEND.map((l) => {
            const tint = bandFor(l.action);
            return (
              <li key={l.action} className="flex gap-4 px-5 py-3 items-start">
                <div className="w-32 shrink-0 pt-0.5">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${tint.band}`}
                  >
                    <span className={`size-1.5 rounded-full ${tint.dot}`} />
                    {l.action}
                  </span>
                </div>
                <div className="flex-1 min-w-0 space-y-0.5 text-[12px] leading-relaxed">
                  <div>{l.meaning}</div>
                  <div className="text-muted-foreground">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-1">
                      Next:
                    </span>
                    {l.next}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
