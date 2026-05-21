// /properties/[slug] — Property Overview (v2 screen 4) — full body.
//
// Composes the at-a-glance view from existing data sources:
//   - Brand snapshot          → Supabase brand_dna_section (top 3)
//   - Pages action distribution → Supabase page (count by audit_action)
//   - Active projects         → /api/properties/[slug]/projects (BQ Meta)
//   - Competitors preview     → /api/properties/[slug]/competitors (BQ Meta)
//   - Recent activity         → Supabase brand_dna_section_history + page,
//                               merged in-memory like the Dashboard's feed
//
// No new data sources. No schema changes.

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { apiBase } from "@/lib/api-base";
import {
  ActionPill,
  type ActionVariant,
  ACTION_VARIANTS,
} from "@/components/ActionPill";

const SNAPSHOT_SECTIONS = ["identity", "voice_tone", "future_audience"] as const;

const SECTION_LABEL: Record<string, string> = {
  identity: "Identity",
  voice_tone: "Voice & tone",
  future_audience: "Future audience",
};

type BrandDnaSection = {
  section: string;
  content: Record<string, unknown> | null;
  body: string | null;
};

type Property = {
  id: string;
  name: string;
  primary_domain: string;
};

type ProjectRow = {
  project_id: number;
  project_type: string;
  project_name: string | null;
  status: string | null;
  matched_domain: string;
};

type CompetitorRow = {
  domain_id: number;
  domain: string;
  domain_name: string | null;
};

type ActivityRow = {
  kind: "brand_dna_edit" | "page_audit";
  at: string;
  actor: string;
  detail: string;
};

// ─── Data ────────────────────────────────────────────────────────────────

async function getProperty(slug: string): Promise<Property | null> {
  const { data } = await supabase
    .from("property")
    .select("id, name, primary_domain")
    .eq("slug", slug)
    .single();
  return (data as Property | null) ?? null;
}

async function getSnapshot(propertyId: string): Promise<BrandDnaSection[]> {
  const { data } = await supabase
    .from("brand_dna_section")
    .select("section, content, body")
    .eq("property_id", propertyId)
    .in("section", SNAPSHOT_SECTIONS as unknown as string[]);
  return (data ?? []) as BrandDnaSection[];
}

async function getActionDistribution(
  propertyId: string,
): Promise<{ counts: Record<string, number>; total: number; latestDecidedAt: string | null }> {
  const { data } = await supabase
    .from("page")
    .select("audit_action, audit_decided_at")
    .eq("property_id", propertyId);
  const rows = (data ?? []) as {
    audit_action: string | null;
    audit_decided_at: string | null;
  }[];
  const counts: Record<string, number> = {};
  let latest: string | null = null;
  for (const row of rows) {
    const a = row.audit_action ?? "undecided";
    counts[a] = (counts[a] ?? 0) + 1;
    if (row.audit_decided_at && (!latest || row.audit_decided_at > latest)) {
      latest = row.audit_decided_at;
    }
  }
  return { counts, total: rows.length, latestDecidedAt: latest };
}

async function getProjects(slug: string): Promise<ProjectRow[]> {
  try {
    const r = await fetch(`${apiBase()}/api/properties/${slug}/projects`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { projects: ProjectRow[] };
    return j.projects ?? [];
  } catch {
    return [];
  }
}

async function getCompetitors(slug: string): Promise<CompetitorRow[]> {
  try {
    const r = await fetch(`${apiBase()}/api/properties/${slug}/competitors`, {
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { competitors: CompetitorRow[] };
    return j.competitors ?? [];
  } catch {
    return [];
  }
}

async function getRecentActivity(
  propertyId: string,
  limit = 8,
): Promise<ActivityRow[]> {
  const [editsRes, decisionsRes] = await Promise.all([
    supabase
      .from("brand_dna_section_history")
      .select(
        `snapshotted_at, updated_by,
         section:section_id ( section, property_id )`,
      )
      .order("snapshotted_at", { ascending: false })
      .limit(limit * 3),
    supabase
      .from("page")
      .select("audit_decided_at, audit_decided_by, audit_action, url")
      .eq("property_id", propertyId)
      .not("audit_decided_at", "is", null)
      .order("audit_decided_at", { ascending: false })
      .limit(limit * 2),
  ]);

  const edits: ActivityRow[] = (
    (editsRes.data ?? []) as unknown as Array<{
      snapshotted_at: string;
      updated_by: string | null;
      section: { section: string; property_id: string } | null;
    }>
  )
    .filter((e) => e.section?.property_id === propertyId)
    .map((e) => ({
      kind: "brand_dna_edit" as const,
      at: e.snapshotted_at,
      actor: e.updated_by ?? "unknown",
      detail: e.section?.section ?? "unknown",
    }));

  const decisions: ActivityRow[] = (
    (decisionsRes.data ?? []) as Array<{
      audit_decided_at: string;
      audit_decided_by: string | null;
      audit_action: string | null;
      url: string;
    }>
  ).map((d) => ({
    kind: "page_audit" as const,
    at: d.audit_decided_at,
    actor: d.audit_decided_by ?? "unknown",
    detail: `${d.audit_action ?? "?"} · ${d.url}`,
  }));

  return [...edits, ...decisions]
    .sort((a, b) => ts(b.at) - ts(a.at))
    .slice(0, limit);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function summarize(section: BrandDnaSection): string {
  if (section.body && section.body.trim()) {
    const t = section.body.trim();
    return t.length > 260 ? t.slice(0, 260) + "…" : t;
  }
  for (const [, v] of Object.entries(section.content ?? {})) {
    if (typeof v === "string" && v.trim()) {
      const s = v.trim();
      return s.length > 260 ? s.slice(0, 260) + "…" : s;
    }
    if (Array.isArray(v) && v.length > 0) {
      return v
        .filter((x): x is string => typeof x === "string")
        .slice(0, 6)
        .join(" · ");
    }
  }
  return "";
}

function fmtRel(iso: string | null | undefined): string {
  if (!iso || iso === "NaT") return "—";
  const parsed = +new Date(iso);
  if (Number.isNaN(parsed)) return "—";
  const ms = Date.now() - parsed;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

/** NaN-safe Date timestamp. Used for sorts where NaT/null entries should
 *  land at the bottom rather than ping-pong via a NaN comparator. */
function ts(iso: string | null | undefined): number {
  if (!iso || iso === "NaT") return 0;
  const n = +new Date(iso);
  return Number.isNaN(n) ? 0 : n;
}

// ─── View ────────────────────────────────────────────────────────────────

export default async function PropertyOverview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) return null;

  const [sections, dist, projects, competitors, activity] = await Promise.all([
    getSnapshot(prop.id),
    getActionDistribution(prop.id),
    getProjects(slug),
    getCompetitors(slug),
    getRecentActivity(prop.id),
  ]);

  const ordered = SNAPSHOT_SECTIONS.map((key) =>
    sections.find((s) => s.section === key),
  ).filter((s): s is BrandDnaSection => Boolean(s));

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <div className="space-y-4">
          <BrandSnapshotCard slug={slug} sections={ordered} />
          <PagesHistogramCard slug={slug} dist={dist} />
        </div>
        <div className="space-y-4">
          <ActiveProjectsCard slug={slug} projects={projects} />
          <CompetitorsCard
            competitors={competitors}
            primaryDomain={prop.primary_domain}
          />
          <RecentActivityCard activity={activity} slug={slug} />
        </div>
      </div>
    </div>
  );
}

// ─── Cards ───────────────────────────────────────────────────────────────

function CardShell({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border rounded-lg bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b flex items-center">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {meta && (
          <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">
            {meta}
          </span>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function BrandSnapshotCard({
  slug,
  sections,
}: {
  slug: string;
  sections: BrandDnaSection[];
}) {
  if (sections.length === 0) {
    return (
      <CardShell title="Brand snapshot" meta="0 of 3 sections">
        <div className="text-sm text-muted-foreground">
          No Brand DNA yet.{" "}
          <Link
            href={`/properties/${slug}/brand-dna`}
            className="text-foreground underline hover:no-underline"
          >
            Open Brand DNA
          </Link>{" "}
          to add the first sections.
        </div>
      </CardShell>
    );
  }
  return (
    <CardShell
      title="Brand snapshot"
      meta={`${sections.length} of ${SNAPSHOT_SECTIONS.length} sections`}
    >
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.section}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {SECTION_LABEL[s.section] ?? s.section}
            </div>
            <div className="text-sm text-foreground/85 leading-relaxed">
              {summarize(s) || (
                <span className="text-muted-foreground italic">empty</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <Link
        href={`/properties/${slug}/brand-dna`}
        className="inline-block mt-5 text-xs font-medium px-3 py-1.5 border rounded-md hover:bg-muted"
      >
        Open Brand DNA →
      </Link>
    </CardShell>
  );
}

const HISTOGRAM_ORDER: ActionVariant[] = [
  "optimize",
  "restore",
  "redirect",
  "consolidate",
  "remove",
  "keep",
  "undecided",
];

function PagesHistogramCard({
  slug,
  dist,
}: {
  slug: string;
  dist: {
    counts: Record<string, number>;
    total: number;
    latestDecidedAt: string | null;
  };
}) {
  if (dist.total === 0) {
    return (
      <CardShell title="Pages — action distribution">
        <div className="text-sm text-muted-foreground">
          No pages yet for this property.
        </div>
      </CardShell>
    );
  }
  const meta = dist.latestDecidedAt
    ? `Last decision ${fmtRel(dist.latestDecidedAt)}`
    : undefined;
  const undecided = dist.counts.undecided ?? 0;
  return (
    <CardShell title="Pages — action distribution" meta={meta}>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {HISTOGRAM_ORDER.map((variant) => {
          const count = dist.counts[variant] ?? 0;
          return (
            <Link
              key={variant}
              href={`/properties/${slug}/pages`}
              className="border rounded-lg p-3 bg-card hover:border-foreground/40 transition-colors"
            >
              <div className="mb-1">
                {ACTION_VARIANTS.includes(variant) ? (
                  <ActionPill variant={variant} />
                ) : (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {variant}
                  </span>
                )}
              </div>
              <div className="text-[20px] font-semibold tracking-tight tabular-nums mt-1">
                {count.toLocaleString()}
              </div>
            </Link>
          );
        })}
      </div>
      <div className="text-[11px] text-muted-foreground mt-3">
        <span className="tabular-nums">{dist.total.toLocaleString()}</span>{" "}
        pages total
        {undecided > 0 && (
          <>
            {" · "}
            <span className="tabular-nums">{undecided.toLocaleString()}</span>{" "}
            undecided
          </>
        )}
        .
      </div>
    </CardShell>
  );
}

function ActiveProjectsCard({
  slug,
  projects,
}: {
  slug: string;
  projects: ProjectRow[];
}) {
  const active = projects.filter((p) => !p.status || p.status === "active");
  return (
    <CardShell
      title="Active projects"
      meta={active.length === 0 ? undefined : `${active.length}`}
    >
      {active.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No active projects on this property.
        </div>
      ) : (
        <div className="space-y-3">
          {active.slice(0, 5).map((p) => (
            <div key={p.project_id} className="flex gap-3">
              <span className="size-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px]">
                  <span className="font-medium">{p.project_type}</span>
                  {p.project_name && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {p.project_name}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                  {p.matched_domain}
                </div>
              </div>
            </div>
          ))}
          {active.length > 5 && (
            <div className="text-[11px] text-muted-foreground">
              +{active.length - 5} more
            </div>
          )}
          <Link
            href={`/properties/${slug}/projects`}
            className="block text-xs text-foreground hover:underline pt-1"
          >
            Open Projects →
          </Link>
        </div>
      )}
    </CardShell>
  );
}

function CompetitorsCard({
  competitors,
  primaryDomain,
}: {
  competitors: CompetitorRow[];
  primaryDomain: string;
}) {
  return (
    <CardShell
      title="Competitors"
      meta={competitors.length > 0 ? `BQ Meta · ${competitors.length}` : "BQ Meta"}
    >
      {competitors.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No competitors matched for{" "}
          <code className="bg-muted px-1 rounded text-[11px]">
            {primaryDomain}
          </code>
          .
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {competitors.slice(0, 6).map((c) => (
            <span
              key={c.domain_id}
              className="text-[11px] bg-muted border rounded-full px-2.5 py-0.5"
              title={c.domain_name ?? c.domain}
            >
              {c.domain}
            </span>
          ))}
          {competitors.length > 6 && (
            <span className="text-[11px] text-muted-foreground self-center">
              +{competitors.length - 6} more
            </span>
          )}
        </div>
      )}
    </CardShell>
  );
}

function RecentActivityCard({
  activity,
  slug,
}: {
  activity: ActivityRow[];
  slug: string;
}) {
  return (
    <CardShell
      title="Recent activity"
      meta={activity.length > 0 ? `${activity.length}` : undefined}
    >
      {activity.length === 0 ? (
        <div className="text-xs text-muted-foreground">No edits yet.</div>
      ) : (
        <div className="space-y-2.5">
          {activity.map((a, i) => (
            <div key={i} className="flex gap-2.5 text-xs">
              <span
                className={`size-1.5 rounded-full mt-1.5 shrink-0 ${
                  a.kind === "brand_dna_edit"
                    ? "bg-indigo-500"
                    : "bg-emerald-500"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] leading-snug">
                  {a.kind === "brand_dna_edit" ? (
                    <>
                      <Link
                        href={`/properties/${slug}/brand-dna`}
                        className="font-medium hover:underline"
                      >
                        Brand DNA
                      </Link>{" "}
                      ·{" "}
                      <span className="text-muted-foreground">{a.detail}</span>
                    </>
                  ) : (
                    <>
                      <Link
                        href={`/properties/${slug}/pages`}
                        className="font-medium hover:underline"
                      >
                        Page
                      </Link>{" "}
                      ·{" "}
                      <span className="text-muted-foreground truncate">
                        {a.detail}
                      </span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-0.5 tabular-nums">
                  {fmtRel(a.at)} · {a.actor}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
