"use client";

// Visualizes domain rating on a 0-100 scale with bucket tint:
//   81-100: emerald   61-80: lime     41-60: amber
//   21-40:  orange    0-20:  slate

export function DrPill({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const v = Math.round(value);
  let tint = "bg-slate-100 text-slate-700 border-slate-200";
  if (v >= 81) tint = "bg-emerald-100 text-emerald-800 border-emerald-200";
  else if (v >= 61) tint = "bg-lime-100 text-lime-800 border-lime-200";
  else if (v >= 41) tint = "bg-amber-100 text-amber-900 border-amber-200";
  else if (v >= 21) tint = "bg-orange-100 text-orange-800 border-orange-200";

  return (
    <span
      className={`inline-flex items-center justify-center tabular-nums text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tint} min-w-[28px]`}
      title={`Domain Rating ${v}`}
    >
      {v}
    </span>
  );
}
