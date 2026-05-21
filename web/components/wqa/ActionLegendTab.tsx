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
  action: TriageAction | "Review" | "No Action";
  meaning: string;
  next: string;
};

// "Review" + "No Action" appear in the SOP legend as bucket labels even
// though triage emits Investigate/Evaluate + Leave as 404 / Non-* — the
// rows below keep the same human-facing taxonomy as the workbook.
const LEGEND: LegendRow[] = [
  {
    action: "Optimize",
    meaning: "URL stays. At least one positive signal — sessions, impressions, refs, or rank.",
    next: "Enters Phase 2 (Technical SEO) and Phase 3 (Keyword / Cluster) pipelines.",
  },
  {
    action: "Redirect",
    meaning: "Needs a 301 to a better URL. Variants, broken with equity, HTTP, chains.",
    next: "Listed on the Redirect tab grouped by type. Developer executes the 301.",
  },
  {
    action: "Restore",
    meaning: "404 (or 5xx) but should exist — has rankings, traffic, or links worth preserving.",
    next: "Listed on the Restore tab with target H1 / Title / Meta. Content specs, dev restores.",
  },
  {
    action: "Remove",
    meaning: "Live page with zero value signals — no traffic, impressions, refs, or rank.",
    next: "Listed on the Remove tab. Skyward applies noindex or removes the URL.",
  },
  {
    action: "Consolidate",
    meaning: "Duplicate template page that overlaps a stronger parent in intent.",
    next: "Merge content into the canonical parent and 301 the duplicate URL.",
  },
  {
    action: "Evaluate",
    meaning: "Has internal links but no external signals — needs human judgment.",
    next: "Reviewed at Checkpoint 1; promote to Optimize, redirect, or remove.",
  },
  {
    action: "Review",
    meaning: "Some signals present but the obvious action isn't clear from the rules.",
    next: "Flagged for review; the Logic column explains which signals are conflicting.",
  },
  {
    action: "Investigate",
    meaning: "Data conflict — primary URL serving 3xx, unexpected status code, or 5xx with signals.",
    next: "Manual investigation by Skyward. Resolve the underlying confusion, then re-triage.",
  },
  {
    action: "No Action",
    meaning: "Duplicate variant, system URL (wp-content / asset), fragment, or intentionally excluded.",
    next: "Accounted for, no work needed.",
  },
];

function bandFor(action: LegendRow["action"]): { band: string; dot: string } {
  if (action === "Review")
    return { band: "bg-yellow-50 text-yellow-800", dot: "bg-yellow-500" };
  if (action === "No Action")
    return { band: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" };
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
