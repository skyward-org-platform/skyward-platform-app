// Competitors — Brand DNA Phase 0 Tab 4 (per SOP § "Tab 4: Competitors").
// Source of truth is BigQuery Meta.client_domains (is_competitor=TRUE)
// joined to Meta.domains, surfaced via the /api/properties/[slug]/competitors
// Vercel Python function. This page is read-only for V1 — editing requires
// the BQ data workflow (cd.priority + d.notes are owned upstream).
//
// Columns mirror the P0 intake Excel exactly:
//   domain   - competitor's website (host only, no scheme/www)
//   priority - high / medium / low
//   notes    - free-text context (sister brand, sub-vertical fit, etc)

import { apiBase } from "@/lib/api-base";

type CompetitorRow = {
  domain_id: number;
  domain: string;
  domain_name: string | null;
  is_active: boolean | null;
  priority: "high" | "medium" | "low" | string | null;
  notes: string | null;
};

type ApiResponse = {
  property: { slug: string; primary_domain: string | null };
  bq_client_name: string | null;
  matched_on_domain: string | null;
  competitors: CompetitorRow[];
  count: number;
};

async function getCompetitors(slug: string): Promise<ApiResponse | null> {
  try {
    const r = await fetch(`${apiBase()}/api/properties/${slug}/competitors`, {
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as ApiResponse;
  } catch {
    return null;
  }
}

const PRIORITY_TINT: Record<string, string> = {
  high: "bg-rose-50 text-rose-700 border-rose-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

function PriorityChip({ value }: { value: string | null }) {
  const v = (value ?? "").toLowerCase();
  const cls = PRIORITY_TINT[v] ?? "bg-muted text-muted-foreground border";
  return (
    <span
      className={
        "inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border " +
        cls
      }
    >
      {value ?? "—"}
    </span>
  );
}

export default async function CompetitorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getCompetitors(slug);
  const rows = data?.competitors ?? [];
  const clientName = data?.bq_client_name ?? null;
  const matched = data?.matched_on_domain ?? null;

  return (
    <div className="px-8 py-6 max-w-5xl">
      <header className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight">Competitors</h2>
        <p className="text-[12px] text-muted-foreground mt-1 leading-snug">
          SEO competitors per the Phase 0 intake. Source of truth is
          BigQuery <span className="font-mono text-[11px]">Meta.client_domains</span>
          {clientName ? (
            <>
              {" "}
              — owned by client <span className="text-foreground">{clientName}</span>
            </>
          ) : null}
          {matched ? (
            <>
              , matched on <span className="font-mono text-[11px]">{matched}</span>
            </>
          ) : null}
          .
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="border rounded-lg bg-card p-8 text-center text-[12px] text-muted-foreground">
          No competitors in BQ Meta for this property yet. Add rows to{" "}
          <span className="font-mono text-[11px]">Meta.client_domains</span>{" "}
          with <span className="font-mono text-[11px]">is_competitor = TRUE</span>{" "}
          for this client, then refresh.
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium min-w-[220px]">
                  Domain
                </th>
                <th className="text-left px-3 py-2 font-medium w-[110px]">
                  Priority
                </th>
                <th className="text-left px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.domain_id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <a
                      href={`https://${c.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[12px] text-foreground hover:underline"
                    >
                      {c.domain}
                    </a>
                    {c.domain_name && (
                      <div className="text-[10.5px] text-muted-foreground mt-0.5">
                        {c.domain_name}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <PriorityChip value={c.priority} />
                  </td>
                  <td className="px-3 py-2 text-muted-foreground leading-snug">
                    {c.notes || (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="px-4 py-2 border-t bg-muted/20 text-[10.5px] text-muted-foreground tabular-nums">
            {rows.length} competitor{rows.length === 1 ? "" : "s"} from BQ Meta
          </footer>
        </div>
      )}

      <aside className="mt-5 text-[11px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Editing:</strong> competitor rows
        live in BigQuery <span className="font-mono">Meta.client_domains</span>
        + <span className="font-mono">Meta.domains</span>, owned by Adam&apos;s
        pipeline. Brand DNA edits in the Skyward app do not write to BQ. If a
        competitor needs adding, removing, or re-prioritizing, update BQ Meta
        upstream and this list will reflect on next load (cache:{" "}
        <span className="font-mono">no-store</span>).
      </aside>
    </div>
  );
}
