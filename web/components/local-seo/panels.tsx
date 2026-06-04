import type { GmbLocation } from "@/lib/local-seo";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<section className="rounded-lg border p-4"><h2 className="font-medium mb-3">{title}</h2>{children}</section>);
}
export function ProfilePanel({ loc }: { loc: GmbLocation }) {
  const rows: [string, string | null][] = [
    ["Primary category", loc.primary_category], ["Phone", loc.phone], ["Address", loc.address],
    ["Website", loc.website], ["Hours", loc.hours],
    ["Photos", loc.photo_count != null ? String(loc.photo_count) : null],
  ];
  return (<Section title="Profile"><dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
    {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v ?? "not set"}</dd></div>))}
  </dl></Section>);
}
export function PerformancePanel({ loc }: { loc: GmbLocation }) {
  const p = loc.performance;
  if (!p) return (<Section title="Performance (90d)"><p className="text-sm text-muted-foreground">No performance data (Jepto-connected locations only).</p></Section>);
  const stat = (label: string, v: number | null) => (<div><div className="text-2xl font-semibold">{v ?? 0}</div><div className="text-xs text-muted-foreground">{label}</div></div>);
  return (<Section title="Performance (90d)"><div className="grid grid-cols-3 gap-4">
    {stat("Search impr.", p.search_impressions)}{stat("Maps impr.", p.maps_impressions)}{stat("Calls", p.calls)}
    {stat("Web clicks", p.web_clicks)}{stat("Directions", p.directions)}{stat("Bookings", p.bookings)}
  </div></Section>);
}
export function ReviewsPanel({ loc }: { loc: GmbLocation }) {
  return (<Section title={`Reviews (${loc.review_count ?? 0}, avg ${loc.rating ?? "n/a"})`}>
    {loc.reviews.length === 0 ? (<p className="text-sm text-muted-foreground">No review detail (Jepto-connected locations only).</p>) : (
      <ul className="space-y-3">{loc.reviews.map((r, i) => (<li key={i} className="text-sm border-b pb-2"><div className="font-medium">{r.rating ?? "n/a"} stars {r.reviewer ?? ""}</div>{r.comment && <p className="text-muted-foreground">{r.comment}</p>}</li>))}</ul>
    )}</Section>);
}
export function QnAPanel({ loc }: { loc: GmbLocation }) {
  return (<Section title="Q&A">{loc.qna.length === 0 ? <p className="text-sm text-muted-foreground">No Q&A.</p> : (
    <ul className="space-y-2 text-sm">{loc.qna.map((q, i) => (<li key={i}><strong>Q:</strong> {q.question}<br /><strong>A:</strong> {q.answer}</li>))}</ul>)}</Section>);
}
export function PostsPanel({ loc }: { loc: GmbLocation }) {
  return (<Section title="Posts">{loc.posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts.</p> : (
    <ul className="space-y-2 text-sm">{loc.posts.map((p, i) => (<li key={i}>{p.summary} {p.cta ? `(${p.cta})` : ""}</li>))}</ul>)}</Section>);
}
