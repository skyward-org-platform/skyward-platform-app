"use client";
import type { ContentViewProps } from "./ContentView";

const STATUS_COLORS: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-700",
  "Brief": "bg-indigo-100 text-indigo-800",
  "Draft": "bg-sky-100 text-sky-800",
  "Review": "bg-amber-100 text-amber-800",
  "Published": "bg-emerald-100 text-emerald-800",
};

export function OverviewTab({ rows }: ContentViewProps) {
  const total = rows.length;
  const eligibleSprints = rows
    .filter((r) => r.status === "Not Started" && r.sprint != null)
    .map((r) => r.sprint as number);
  // Guard against empty rows: Math.min(...[]) === Infinity. Default to sprint 1.
  const currentSprint = eligibleSprints.length > 0 ? Math.min(...eligibleSprints) : 1;
  const thisSprintCount = rows.filter((r) => r.sprint === currentSprint).length;
  const inProduction = rows.filter(
    (r) => r.status === "Brief" || r.status === "Draft" || r.status === "Review",
  ).length;
  const published = rows.filter((r) => r.status === "Published").length;

  const statusCounts = ["Not Started", "Brief", "Draft", "Review", "Published"].map((s) => ({
    s,
    n: rows.filter((r) => r.status === s).length,
  }));

  const upcoming = [...rows]
    .filter((r) => r.sprint != null)
    .sort((a, b) => (a.sprint as number) - (b.sprint as number))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Total rows", total.toLocaleString()],
          ["This sprint", String(thisSprintCount)],
          ["In production", String(inProduction)],
          ["Published", String(published)],
        ].map(([label, value]) => (
          <div key={label} className="border rounded-lg p-4 bg-card">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {label}
            </div>
            <div className="text-3xl font-semibold tabular-nums mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="border rounded-lg p-4 bg-card">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Status distribution
        </div>
        <div className="space-y-1.5">
          {statusCounts.map(({ s, n }) => {
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <div key={s} className="flex items-center gap-3 text-xs">
                <div className="w-24">{s}</div>
                <div className="flex-1 bg-muted rounded overflow-hidden h-3">
                  <div className={`h-full ${STATUS_COLORS[s]}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="tabular-nums w-16 text-right">
                  {n.toLocaleString()} ({pct}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted">
          Upcoming sprint
        </div>
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-1.5 font-semibold">Sprint</th>
              <th className="text-left px-3 py-1.5 font-semibold">URL</th>
              <th className="text-left px-3 py-1.5 font-semibold">Action</th>
              <th className="text-left px-3 py-1.5 font-semibold">Cluster</th>
              <th className="text-left px-3 py-1.5 font-semibold">Writer</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-1.5 tabular-nums">{r.sprint}</td>
                <td
                  className="px-3 py-1.5 font-mono text-[11px] truncate max-w-md"
                  title={r.url}
                >
                  {r.url}
                </td>
                <td className="px-3 py-1.5">{r.action_type_override || r.action_type}</td>
                <td className="px-3 py-1.5 truncate max-w-xs">{r.target_keyword || "—"}</td>
                <td className="px-3 py-1.5">{r.writer || "TBD"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
