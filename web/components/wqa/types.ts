// Shared types for the per-action WQA tabs. Each tab takes the already-
// triaged rows and slices to the action it cares about, then renders the
// action-specific column set per Adam's WQA SOP workbook tabs.

import type { WqaRow } from "@/lib/wqa";
import type { TriageAction, TriageResult } from "@/lib/wqa-triage";
import type { PageExecutionRow } from "@/lib/page-execution";

export type TriagedRow = { row: WqaRow; triage: TriageResult };

export type ActionTabProps = {
  rows: TriagedRow[];
  /** Pre-filtered to the action this tab represents. */
  all: TriagedRow[];
  /** Required so per-row WqaActionChip can write back to wqa_decision. */
  propertySlug: string;
  /** Click handler invoked when a URL row is clicked — opens the
   *  universal URL drawer at the parent (WqaTabs) level. */
  onOpenDrawer?: (url: string) => void;
  /** url → page_execution row. Per-tab inline editors (destination URL,
   *  target H1, recommended action override) seed their defaults from
   *  this map; absent means "no execution row yet". */
  execByUrl?: Map<string, PageExecutionRow>;
};

// P2 action semantics v2: 7-action canon. Legacy values (Evaluate / Leave
// as 404 / Non-indexable / Non-addressable) collapse to Investigate / Keep
// at read time via toAction7(); they no longer appear as standalone tabs.
export const TAB_ORDER: TriageAction[] = [
  "Optimize",
  "Restore",
  "Redirect",
  "Consolidate",
  "Remove",
  "Investigate",
];
