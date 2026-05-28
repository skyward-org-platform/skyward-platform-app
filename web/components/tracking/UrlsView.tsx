// URL-scope tracking view. Top-N URLs by recent sessions with a sparkline
// of daily sessions. Each row uses a native <details> disclosure to show
// the daily breakdown + URL-scoped annotations without needing client JS.

import type { Annotation, UrlSummary } from "@/lib/tracking";
import { Sparkline } from "./Sparkline";
import { AnnotationBadge } from "./AnnotationBadge";

export function UrlsView({
  rows,
  annotations,
}: {
  rows: UrlSummary[];
  annotations: Annotation[];
}) {
  if (rows.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center bg-card">
        <div className="text-sm font-medium">No URL-level tracking data yet.</div>
        <div className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
          When GA4 page-path sessions or GSC page-level clicks land, the
          top URLs will surface here with 30-day rollups and a per-URL
          sparkline.
        </div>
      </div>
    );
  }

  // Group annotations by URL for fast per-row lookup.
  const byUrl = new Map<string, Annotation[]>();
  for (const a of annotations) {
    if (!a.applied_to_url) continue;
    const list = byUrl.get(a.applied_to_url) ?? [];
    list.push(a);
    byUrl.set(a.applied_to_url, list);
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">URL</th>
            <th className="text-right px-3 py-2 font-semibold w-24">Sessions</th>
            <th className="text-right px-3 py-2 font-semibold w-24">Clicks</th>
            <th className="text-right px-3 py-2 font-semibold w-28">Impressions</th>
            <th className="text-right px-3 py-2 font-semibold w-24">Avg pos</th>
            <th className="text-center px-3 py-2 font-semibold w-24">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const rowAnnotations = byUrl.get(r.url) ?? [];
            return (
              <tr key={r.url} className="border-t align-top">
                <td className="px-3 py-2 font-mono break-all">
                  <details>
                    <summary className="cursor-pointer hover:text-foreground/80">
                      {r.url}
                    </summary>
                    <DailyBreakdown
                      url={r.url}
                      summary={r}
                      annotations={rowAnnotations}
                    />
                  </details>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.total_sessions.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.total_clicks.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.total_impressions.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.avg_position !== null ? r.avg_position.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex justify-center">
                    <Sparkline daily={r.daily} metric="sessions" />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DailyBreakdown({
  url,
  summary,
  annotations,
}: {
  url: string;
  summary: UrlSummary;
  annotations: Annotation[];
}) {
  void url;
  // Show last 14 days inline + annotations.
  const recent = summary.daily.slice(-14);
  return (
    <div className="mt-3 ml-2 pl-3 border-l space-y-3 text-[11px] font-sans">
      {annotations.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            URL annotations
          </div>
          <ul className="space-y-1">
            {annotations.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="tabular-nums text-muted-foreground">
                  {a.occurred_at}
                </span>
                <AnnotationBadge kind={a.kind} size="sm" />
                <span className="font-medium">{a.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
          Last {recent.length} days
        </div>
        {recent.length === 0 ? (
          <div className="text-muted-foreground italic">
            No daily rows in the window.
          </div>
        ) : (
          <table className="w-full max-w-md tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium pr-3">Date</th>
                <th className="text-right font-medium pr-3">Sessions</th>
                <th className="text-right font-medium pr-3">Clicks</th>
                <th className="text-right font-medium pr-3">Impr.</th>
                <th className="text-right font-medium">Pos</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.captured_date}>
                  <td className="pr-3 text-muted-foreground">
                    {d.captured_date}
                  </td>
                  <td className="text-right pr-3">
                    {d.sessions !== null ? d.sessions.toLocaleString() : "—"}
                  </td>
                  <td className="text-right pr-3">
                    {d.clicks !== null ? d.clicks.toLocaleString() : "—"}
                  </td>
                  <td className="text-right pr-3">
                    {d.impressions !== null
                      ? d.impressions.toLocaleString()
                      : "—"}
                  </td>
                  <td className="text-right">
                    {d.avg_position !== null ? d.avg_position.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
