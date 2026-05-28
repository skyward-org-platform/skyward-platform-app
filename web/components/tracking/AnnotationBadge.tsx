// Color-coded chip for change_annotation.kind. Static colors per spec —
// these map to the operator categories used to overlay change markers on
// the tracking charts.

import type { AnnotationKind } from "@/lib/tracking";

const TINT: Record<AnnotationKind, { bg: string; text: string; label: string; dot: string }> = {
  publish: {
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Publish",
  },
  refresh: {
    bg: "bg-sky-50 border-sky-200",
    text: "text-sky-700",
    dot: "bg-sky-500",
    label: "Refresh",
  },
  redirect: {
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    dot: "bg-amber-500",
    label: "Redirect",
  },
  technical_fix: {
    bg: "bg-violet-50 border-violet-200",
    text: "text-violet-700",
    dot: "bg-violet-500",
    label: "Tech fix",
  },
  brand_change: {
    bg: "bg-rose-50 border-rose-200",
    text: "text-rose-700",
    dot: "bg-rose-500",
    label: "Brand",
  },
  algo_update: {
    bg: "bg-slate-100 border-slate-300",
    text: "text-slate-800",
    dot: "bg-slate-700",
    label: "Algo update",
  },
  external_event: {
    bg: "bg-slate-50 border-slate-200",
    text: "text-slate-500",
    dot: "bg-slate-400",
    label: "External",
  },
  other: {
    bg: "bg-slate-50 border-slate-200",
    text: "text-slate-600",
    dot: "bg-slate-400",
    label: "Other",
  },
};

export function AnnotationBadge({ kind, size = "md" }: { kind: AnnotationKind; size?: "sm" | "md" }) {
  const t = TINT[kind];
  const px = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const fs = size === "sm" ? "text-[10px]" : "text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded ${px} ${fs} font-medium ${t.bg} ${t.text}`}
    >
      <span className={`size-1.5 rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}

export function annotationDotClass(kind: AnnotationKind): string {
  return TINT[kind].dot;
}
