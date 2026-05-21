// V2 action pill — represents an operator DECISION about what to do with
// something (page triage outcome). NO dot prefix; that's reserved for status.
// 8 variants matching the existing audit_action enum.
//
// See handoff/design/v2-design-system.md → "Status pill vs. action pill".
//
// Visual treatment: 10px font, 600 weight, uppercase, 0.04em tracking,
// 2px/7px padding, 4px radius.

export type ActionVariant =
  | "optimize"
  | "restore"
  | "redirect"
  | "consolidate"
  | "remove"
  | "keep"
  | "no_action"
  | "undecided";

export const ACTION_VARIANTS: ActionVariant[] = [
  "optimize",
  "restore",
  "redirect",
  "consolidate",
  "remove",
  "keep",
  "no_action",
  "undecided",
];

const STYLES: Record<ActionVariant, { bg: string; fg: string }> = {
  optimize:    { bg: "bg-sky-50",     fg: "text-sky-700" },
  restore:     { bg: "bg-emerald-50", fg: "text-emerald-700" },
  redirect:    { bg: "bg-amber-50",   fg: "text-amber-700" },
  consolidate: { bg: "bg-violet-50",  fg: "text-violet-700" },
  remove:      { bg: "bg-rose-50",    fg: "text-rose-700" },
  keep:        { bg: "bg-slate-50",   fg: "text-slate-600" },
  // no_action and undecided share the neutral treatment per the v2 mockup —
  // both are "we haven't acted on this" states with no opinion.
  no_action:   { bg: "bg-zinc-100",   fg: "text-zinc-600" },
  undecided:   { bg: "bg-zinc-100",   fg: "text-zinc-600" },
};

const LABEL: Record<ActionVariant, string> = {
  optimize: "Optimize",
  restore: "Restore",
  redirect: "Redirect",
  consolidate: "Consolidate",
  remove: "Remove",
  keep: "Keep",
  no_action: "No action",
  undecided: "Review",
};

export function actionPillClasses(variant: ActionVariant): string {
  const s = STYLES[variant];
  return `inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${s.bg} ${s.fg}`;
}

export function actionLabel(variant: ActionVariant): string {
  return LABEL[variant];
}

export function ActionPill({ variant }: { variant: ActionVariant }) {
  return <span className={actionPillClasses(variant)}>{LABEL[variant]}</span>;
}
