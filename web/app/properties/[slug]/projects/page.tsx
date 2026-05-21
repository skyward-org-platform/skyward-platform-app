// /properties/[slug]/projects — v2 screen 7. Cards instead of rows.
// BQ Meta projects matched to this property by domain. Each card carries the
// project's current phase via PhaseStrip. We approximate "project phase" as
// the property's pipeline_phase (BQ doesn't store per-project phase yet).
// Dashed "Start new project" card at the end — writes route to admin portal.

import { apiBase } from "@/lib/api-base";
import { supabase } from "@/lib/supabase";
import { StatusPill, statusVariantFrom } from "@/components/StatusPill";
import { PhaseStrip, PHASE_NAMES } from "@/components/PhaseStrip";

type ProjectRow = {
  project_id: number;
  client_id: number;
  project_type: string;
  project_name: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  matched_domain: string;
  role: string | null;
  priority: string | null;
};

type PropertyRow = {
  id: string;
  slug: string;
  name: string;
  primary_domain: string;
  additional_domains: string[] | null;
  url_prefix: string | null;
};

type ProjectsResponse = {
  property: PropertyRow;
  projects: ProjectRow[];
  matched_on_domains: string[];
  count: number;
};

async function fetchProjects(
  slug: string,
): Promise<ProjectsResponse | { error: string }> {
  const res = await fetch(`${apiBase()}/api/properties/${slug}/projects`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    return { error: body.error ?? `HTTP ${res.status}` };
  }
  return (await res.json()) as ProjectsResponse;
}

async function fetchPropertyPhase(slug: string): Promise<number> {
  const { data } = await supabase
    .from("property")
    .select("pipeline_phase")
    .eq("slug", slug)
    .single();
  return (data?.pipeline_phase as number | undefined) ?? 0;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysActive(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - +new Date(iso);
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export default async function ProjectsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [data, propertyPhase] = await Promise.all([
    fetchProjects(slug),
    fetchPropertyPhase(slug),
  ]);

  if ("error" in data) {
    return (
      <div className="p-4 sm:p-8 max-w-4xl">
        <div className="p-3 border border-rose-200 bg-rose-50 text-rose-800 text-sm rounded-lg">
          <div className="font-semibold mb-1">Couldn&rsquo;t load projects.</div>
          <div className="font-mono text-xs">{data.error}</div>
        </div>
      </div>
    );
  }

  const { projects, matched_on_domains } = data;
  const phaseName = PHASE_NAMES[propertyPhase] ?? PHASE_NAMES[0];

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="mb-5">
        <p className="text-xs text-muted-foreground">
          Sourced from BigQuery Meta · matched on{" "}
          {matched_on_domains.map((d, i) => (
            <span key={d}>
              <code className="bg-muted px-1 rounded text-[11px]">{d}</code>
              {i < matched_on_domains.length - 1 && ", "}
            </span>
          ))}
        </p>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {projects.map((p) => (
            <ProjectCard
              key={`${p.project_id}-${p.matched_domain}`}
              project={p}
              phase={propertyPhase}
              phaseName={phaseName}
            />
          ))}
          <StartNewProjectCard />
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project: p,
  phase,
  phaseName,
}: {
  project: ProjectRow;
  phase: number;
  phaseName: string;
}) {
  const days = daysActive(p.created_at);
  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <h3 className="text-[13px] font-semibold truncate">
          {p.project_type}
          {p.project_name ? ` · ${p.project_name}` : ""}
        </h3>
        <StatusPill variant={statusVariantFrom(p.status)}>
          {p.status ?? "active"}
        </StatusPill>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums uppercase tracking-wider">
          project_id {p.project_id}
        </span>
      </div>
      <div className="p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Phase {phase} · {phaseName}
        </div>
        <PhaseStrip currentPhase={phase} showLabels />
        <div className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Started {fmtDate(p.created_at)}
          {days !== null && (
            <>
              {" "}
              · <span className="tabular-nums">{days}</span> days active
            </>
          )}
          <br />
          Matched on{" "}
          <code className="bg-muted px-1 rounded text-[11px]">
            {p.matched_domain}
          </code>
          {p.role && (
            <>
              {" "}
              · role <span className="text-foreground">{p.role}</span>
            </>
          )}
          {p.priority && (
            <>
              {" "}
              · priority{" "}
              <span className="text-foreground">{p.priority}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StartNewProjectCard() {
  return (
    <div className="border border-dashed rounded-lg bg-muted/40 p-4 flex flex-col">
      <h3 className="text-[13px] font-semibold text-muted-foreground">
        + Start new project
      </h3>
      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
        Create a new SEO, paid search, or paid social project on this property.
        Projects are registered in BigQuery Meta — creation lives in the admin
        portal during this phase.
      </p>
      <a
        href="https://github.com/skyward-org-platform/skyward-platform"
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block text-xs font-medium px-3 py-1.5 border bg-card rounded-md text-foreground hover:bg-muted self-start"
      >
        ↗ Open admin portal
      </a>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground border rounded-lg bg-card p-6">
      <div className="font-medium text-foreground mb-1">No projects yet.</div>
      <div className="text-xs leading-relaxed">
        Projects are tracked in BigQuery Meta. When Adam (or the pipeline)
        creates a project linked to one of this property&rsquo;s domains, it
        will appear here as a card.
      </div>
    </div>
  );
}
