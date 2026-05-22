"use client";

// Color-coded relevance score pill.
//   80-100 → emerald  (top relevance)
//   50-79  → amber    (mid)
//   0-49   → rose     (low)
//   null   → muted "—"
//
// Renders as a small fixed-width pill with tabular-nums so columns of
// pills align cleanly.

export function RelevancePill({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  const band =
    score >= 80
      ? "bg-emerald-100 text-emerald-900"
      : score >= 50
        ? "bg-amber-100 text-amber-900"
        : "bg-rose-100 text-rose-900";
  return (
    <span
      className={
        "inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded text-[10.5px] font-semibold tabular-nums " +
        band
      }
    >
      {score}
    </span>
  );
}
