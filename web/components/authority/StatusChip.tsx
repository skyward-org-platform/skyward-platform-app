"use client";

// Status chip mapping for referring_domain.status, disavow_entry.status,
// link_prospect.status. Visually consistent across the Authority surface.

const TINT: Record<string, string> = {
  // referring_domain.status
  active: "bg-slate-100 text-slate-700 border-slate-200",
  disavow_pending: "bg-amber-100 text-amber-900 border-amber-200",
  disavowed: "bg-rose-100 text-rose-800 border-rose-200",
  // disavow_entry.status (v2 + legacy)
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-slate-200/70 text-slate-500 border-slate-300",
  "In File": "bg-amber-100 text-amber-900 border-amber-200",
  "Confirmed by GSC": "bg-emerald-100 text-emerald-800 border-emerald-200",
  // link_prospect.status
  contacted: "bg-blue-100 text-blue-800 border-blue-200",
  placed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  declined: "bg-rose-100 text-rose-800 border-rose-200",
  abandoned: "bg-slate-200/70 text-slate-500 border-slate-300",
};

const LABEL: Record<string, string> = {
  active: "Active",
  disavow_pending: "Disavow Pending",
  disavowed: "Disavowed",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  contacted: "Contacted",
  placed: "Placed",
  declined: "Declined",
  abandoned: "Abandoned",
};

export function StatusChip({ value }: { value: string | null | undefined }) {
  if (!value) {
    return (
      <span className="text-[10px] text-muted-foreground">—</span>
    );
  }
  const tint = TINT[value] ?? "bg-slate-100 text-slate-700 border-slate-200";
  const label = LABEL[value] ?? value;
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${tint}`}
    >
      {label}
    </span>
  );
}
