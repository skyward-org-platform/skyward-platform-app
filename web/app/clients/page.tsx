// /clients — v2 screen 2. List sourced from BQ Meta via /api/clients;
// pipeline coverage overlaid from Supabase property data (where engaged).
//
// The two-store rule (2026-05-14): BQ Meta is the source of truth for the
// client roster; Supabase has phase data only for properties we've actively
// onboarded. For BQ clients without Supabase property matches, the pipeline
// coverage cell renders "Not yet engaged."

import Link from "next/link";
import { apiBase } from "@/lib/api-base";
import { supabase } from "@/lib/supabase";
import { StatusPill } from "@/components/StatusPill";
import { PhaseStrip } from "@/components/PhaseStrip";

type ChannelRow = { project_type: string; count: number };

type BqClient = {
  client_id: number;
  client_name: string;
  abbreviation: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string | null;
  domain_count?: number;
  competitor_count?: number;
  project_count?: number;
  channels?: ChannelRow[];
};

type SupabaseProperty = {
  client_id: string;
  name: string;
  pipeline_phase: number;
  client: { name: string; slug: string } | null;
};

// Map raw project_type → canonical channel label. Unknown values fall back to
// a humanized version of the raw string.
const CHANNEL_LABEL: Record<string, string> = {
  seo: "SEO",
  seo_pipeline: "SEO",
  paid_search: "Paid Search",
  paid_social: "Paid Social",
  aeo: "AEO",
  abm: "ABM",
};

function channelLabel(projectType: string): string {
  return CHANNEL_LABEL[projectType] ?? projectType.replace(/_/g, " ");
}

/** Collapse the raw (project_type, count) rows into one chip per CHANNEL
 *  (since seo + seo_pipeline both surface as "SEO", they merge). */
function collapseChannels(
  rows: ChannelRow[],
): { label: string; count: number }[] {
  const merged = new Map<string, number>();
  for (const r of rows) {
    const lbl = channelLabel(r.project_type);
    merged.set(lbl, (merged.get(lbl) ?? 0) + r.count);
  }
  return Array.from(merged.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

async function fetchClients(): Promise<BqClient[]> {
  const res = await fetch(
    `${apiBase()}/api/clients?include_counts=true&include_channels=true`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { clients: BqClient[] };
  return data.clients;
}

async function fetchPhasesByClientName(): Promise<Map<string, number[]>> {
  const { data } = await supabase
    .from("property")
    .select("client_id, name, pipeline_phase, client:client_id(name, slug)")
    .eq("status", "active");
  const rows = (data ?? []) as unknown as SupabaseProperty[];
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const key = (r.client?.name ?? "").trim().toLowerCase();
    if (!key) continue;
    const arr = out.get(key) ?? [];
    arr.push(r.pipeline_phase ?? 0);
    out.set(key, arr);
  }
  return out;
}

function PipelineCoverage({ phases }: { phases: number[] }) {
  if (phases.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">Not yet engaged</div>
    );
  }
  const min = Math.min(...phases);
  const max = Math.max(...phases);
  const avg = Math.round(phases.reduce((s, p) => s + p, 0) / phases.length);
  const note =
    min === max ? `P${max} active` : `avg P${avg} · range P${min}–P${max}`;
  return (
    <div className="w-[140px]">
      <PhaseStrip currentPhase={avg} />
      <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
        {note}
      </div>
    </div>
  );
}

function ActiveChannels({ channels }: { channels: ChannelRow[] | undefined }) {
  const collapsed = channels ? collapseChannels(channels) : [];
  if (collapsed.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {collapsed.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700"
        >
          <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden />
          {c.label}
          {c.count > 1 && (
            <span className="text-emerald-700/70 tabular-nums">
              ×{c.count}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export default async function ClientsPage() {
  let clients: BqClient[] = [];
  let error: string | null = null;
  let phasesByName = new Map<string, number[]>();
  try {
    const [c, p] = await Promise.all([
      fetchClients(),
      fetchPhasesByClientName(),
    ]);
    clients = c;
    phasesByName = p;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {clients.length} client{clients.length === 1 ? "" : "s"} · sourced from{" "}
          <code className="text-xs bg-muted px-1 rounded">BigQuery Meta</code>{" "}
          via{" "}
          <code className="text-xs bg-muted px-1 rounded">skyward-common</code>
          . Edits live in the{" "}
          <a
            href="https://github.com/skyward-org-platform/skyward-platform"
            className="underline hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            admin portal
          </a>{" "}
          during this phase.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-rose-200 bg-rose-50 text-rose-800 text-sm rounded-lg">
          <div className="font-semibold mb-1">Couldn&rsquo;t load clients.</div>
          <div className="font-mono text-xs">{error}</div>
        </div>
      )}

      {!error && clients.length === 0 && (
        <div className="text-muted-foreground text-sm">No clients returned.</div>
      )}

      {clients.length > 0 && (
        <div className="border rounded-lg bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Client</th>
                <th className="text-left px-3 py-2.5 font-medium">Abbr</th>
                <th className="text-right px-3 py-2.5 font-medium">Domains</th>
                <th className="text-right px-3 py-2.5 font-medium">Projects</th>
                <th className="text-left px-3 py-2.5 font-medium">
                  Active channels
                </th>
                <th className="text-left px-3 py-2.5 font-medium">
                  Pipeline coverage
                </th>
                <th className="text-left px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const phases =
                  phasesByName.get(c.client_name.trim().toLowerCase()) ?? [];
                return (
                  <tr key={c.client_id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${c.client_id}`}
                        className="font-medium hover:underline"
                      >
                        {c.client_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground tabular-nums">
                      {c.abbreviation ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {c.domain_count ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {c.project_count ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <ActiveChannels channels={c.channels} />
                    </td>
                    <td className="px-3 py-3">
                      <PipelineCoverage phases={phases} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill variant={c.is_active ? "active" : "inactive"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
