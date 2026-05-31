"use client";

// Small static chip rendering a referring-domain / prospect tactic classification.

const TINT: Record<string, string> = {
  editorial_earned: "bg-emerald-100 text-emerald-800 border-emerald-200",
  editorial_authoritative:
    "bg-emerald-100 text-emerald-800 border-emerald-200",
  guest_post: "bg-indigo-100 text-indigo-800 border-indigo-200",
  directory_citation: "bg-sky-100 text-sky-800 border-sky-200",
  resource_page: "bg-violet-100 text-violet-800 border-violet-200",
  broken_link: "bg-amber-100 text-amber-900 border-amber-200",
  haro: "bg-blue-100 text-blue-800 border-blue-200",
  partnership: "bg-teal-100 text-teal-800 border-teal-200",
  press_release: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  spam: "bg-rose-100 text-rose-800 border-rose-200",
  unknown: "bg-slate-100 text-slate-600 border-slate-200",
  other: "bg-slate-100 text-slate-600 border-slate-200",
};

export function TacticChip({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-[10px] text-muted-foreground">—</span>;
  const tint = TINT[value] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${tint}`}
      title={value}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}
