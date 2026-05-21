// Shared types for the per-action WQA tabs. Each tab takes the already-
// triaged rows and slices to the action it cares about, then renders the
// action-specific column set per Adam's WQA SOP workbook tabs.

import type { WqaRow } from "@/lib/wqa";
import type { TriageAction, TriageResult } from "@/lib/wqa-triage";

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
};

export const TAB_ORDER: TriageAction[] = [
  "Optimize",
  "Restore",
  "Redirect",
  "Consolidate",
  "Remove",
  "Evaluate",
  "Investigate",
  "Leave as 404",
  "Non-indexable",
  "Non-addressable",
];
