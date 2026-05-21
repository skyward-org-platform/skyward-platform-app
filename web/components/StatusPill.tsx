// V2 status pill — represents the STATE of a thing that exists.
// 5 variants. Always paired with a leading 5px colored dot.
// Distinct from ActionPill (which has no dot and represents a decision).
//
// See handoff/design/v2-design-system.md → "Status pill vs. action pill".
//
// Visual treatment: 10px font, 600 weight, uppercase, 0.04em tracking,
// 2px/8px padding, 4px radius. Background is the tint; foreground is the
// named color.

export type StatusVariant =
  | "active"
  | "prospect"
  | "paused"
  | "inactive"
  | "completed";

const STYLES: Record<StatusVariant, { bg: string; fg: string; dot: string }> = {
  active:    { bg: "bg-emerald-50", fg: "text-emerald-700", dot: "bg-emerald-600" },
  prospect:  { bg: "bg-sky-50",     fg: "text-sky-700",     dot: "bg-sky-600" },
  paused:    { bg: "bg-amber-50",   fg: "text-amber-700",   dot: "bg-amber-600" },
  inactive:  { bg: "bg-slate-50",   fg: "text-slate-600",   dot: "bg-slate-400" },
  completed: { bg: "bg-indigo-50",  fg: "text-indigo-700",  dot: "bg-indigo-600" },
};

const DEFAULT_LABEL: Record<StatusVariant, string> = {
  active: "Active",
  prospect: "Prospect",
  paused: "Paused",
  inactive: "Inactive",
  completed: "Completed",
};

export function StatusPill({
  variant,
  children,
}: {
  variant: StatusVariant;
  children?: React.ReactNode;
}) {
  const s = STYLES[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${s.bg} ${s.fg}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden />
      {children ?? DEFAULT_LABEL[variant]}
    </span>
  );
}

/** Resolve a free-form status string to a StatusVariant.
 *  Used when reading status fields from the DB (Supabase property.status,
 *  BQ Meta project.status, etc.). */
export function statusVariantFrom(raw: string | null | undefined): StatusVariant {
  if (!raw) return "inactive";
  const s = raw.toLowerCase().trim();
  if (s === "active") return "active";
  if (s === "prospect") return "prospect";
  if (s === "paused") return "paused";
  if (s === "offboarded" || s === "inactive") return "inactive";
  if (s === "completed" || s === "complete" || s === "done") return "completed";
  return "inactive";
}
