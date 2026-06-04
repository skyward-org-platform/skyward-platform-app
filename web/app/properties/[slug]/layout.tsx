import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { apiBase } from "@/lib/api-base";
import {
  PhaseStrip,
  PHASE_NAMES,
  type PhaseGate,
} from "@/components/PhaseStrip";
import { StatusPill, statusVariantFrom } from "@/components/StatusPill";
import { getWqaForDomain } from "@/lib/wqa";
import { hasCompetitors } from "@/lib/competitors";
import { hasSeedKeywords } from "@/lib/seed-keywords";
import { PropertyAssistantButton } from "@/components/PropertyAssistantButton";
import { approvePhase } from "./actions";

type Project = {
  project_type: string;
  status: string | null;
};

// ── Data ─────────────────────────────────────────────────────────────────

// React.cache dedupes within a single request — multiple components calling
// getProperty(slug) on the same page only hit Supabase once.
type PropertyRow = {
  id: string;
  slug: string;
  name: string;
  primary_domain: string | null;
  url_prefix: string | null;
  pipeline_phase: number | null;
  status: string | null;
  phase_0_approved_at: string | null;
  phase_0_approved_by: string | null;
  phase_1_approved_at: string | null;
  phase_1_approved_by: string | null;
  phase_2_approved_at: string | null;
  phase_2_approved_by: string | null;
  phase_3_approved_at: string | null;
  phase_3_approved_by: string | null;
  phase_4_approved_at: string | null;
  phase_4_approved_by: string | null;
  phase_5_approved_at: string | null;
  phase_5_approved_by: string | null;
  phase_6_approved_at: string | null;
  phase_6_approved_by: string | null;
  client: { name: string; legal_name: string | null; slug: string } | null;
};

const getProperty = cache(async (slug: string): Promise<PropertyRow | null> => {
  const { data } = await supabase
    .from("property")
    .select(
      "id, slug, name, primary_domain, url_prefix, pipeline_phase, status, " +
        "phase_0_approved_at, phase_0_approved_by, " +
        "phase_1_approved_at, phase_1_approved_by, " +
        "phase_2_approved_at, phase_2_approved_by, " +
        "phase_3_approved_at, phase_3_approved_by, " +
        "phase_4_approved_at, phase_4_approved_by, " +
        "phase_5_approved_at, phase_5_approved_by, " +
        "phase_6_approved_at, phase_6_approved_by, " +
        "client:client_id(name, legal_name, slug)",
    )
    .eq("slug", slug)
    .single();
  return data as unknown as PropertyRow | null;
});

async function getHeroMetrics(_slug: string, propertyId: string) {
  // Pages count + optimize count + BrandDNA filled count.
  // Five reads in parallel; service-role client bypasses RLS. Competitor
  // and seed-keyword presence read from dedicated Supabase tables -
  // brand_dna_section.body/content is no longer the only source.
  const [
    pagesRes,
    optimizeRes,
    dnaRes,
    competitorsFilled,
    seedKeywordsFilled,
    latestLinkAuditRes,
  ] = await Promise.all([
    supabase
      .from("page")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId),
    supabase
      .from("page")
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("audit_action", "optimize"),
    supabase
      .from("brand_dna_section")
      .select("section")
      .eq("property_id", propertyId),
    hasCompetitors(propertyId),
    hasSeedKeywords(propertyId),
    supabase
      .from("link_audit")
      .select("live_rds")
      .eq("property_id", propertyId)
      .order("audited_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // Brand DNA: count rows in brand_dna_section EXCEPT competitors and
  // seed_keywords (which live in their own tables now). Then add 1 each
  // if those Supabase tables have rows. Denominator aligns with
  // COMPLETENESS_SECTIONS (11 entries, the actual UI tabs).
  const sections = (dnaRes.data ?? []) as { section: string }[];
  const supabaseFilled = sections.filter(
    (s) => s.section !== "competitors" && s.section !== "seed_keywords",
  ).length;
  const filled =
    supabaseFilled +
    (competitorsFilled ? 1 : 0) +
    (seedKeywordsFilled ? 1 : 0);
  const liveRds =
    (latestLinkAuditRes.data as { live_rds: number | null } | null)
      ?.live_rds ?? null;
  return {
    pages: pagesRes.count ?? 0,
    optimize: optimizeRes.count ?? 0,
    brandDnaFilled: filled,
    brandDnaTotal: 11,
    hasCompetitors: competitorsFilled,
    hasSeedKeywords: seedKeywordsFilled,
    authorityLiveRds: liveRds,
  };
}

// Per-phase gate states for the property hero strip. Each phase resolves
// to one of three states per Paul's "commit + push" model:
//   - gray  : no underlying data exists yet
//   - black : data is populated and ready for review, but the phase has
//             not been approved yet (downstream phases see nothing)
//   - green : phase approved at least once (downstream phases consume
//             current live state from this phase from now on)
//
// Only phases 0 (Brand DNA content present) and 1 (BQ pipeline output
// exists) have wired data signals today. Phases 2-6 only resolve to
// gray (no data) or green (approved with no data signal yet); their
// black state will light up when each upstream data source is wired
// in Chunk 3.
type PhaseApprovalRow = {
  phase_0_approved_at: string | null;
  phase_0_approved_by: string | null;
  phase_1_approved_at: string | null;
  phase_1_approved_by: string | null;
  phase_2_approved_at: string | null;
  phase_2_approved_by: string | null;
  phase_3_approved_at: string | null;
  phase_3_approved_by: string | null;
  phase_4_approved_at: string | null;
  phase_4_approved_by: string | null;
  phase_5_approved_at: string | null;
  phase_5_approved_by: string | null;
  phase_6_approved_at: string | null;
  phase_6_approved_by: string | null;
};

async function getPhaseGates(
  slug: string,
  propertyId: string,
  primaryDomain: string | null,
  propertyStatus: string | null,
  approvals: PhaseApprovalRow,
): Promise<PhaseGate[]> {
  // Phase 0 data signal: any brand_dna_section row exists with non-empty
  // content. Content lives in JSONB, not the legacy body column, so we
  // check both.
  let phase0HasData = false;
  let phase0Detail = "Brand DNA sections not started.";

  // Phase 1 data signal: BQ wqa_pipeline_output has rows for this
  // domain. Any rows means the pipeline ran successfully.
  let phase1HasData = false;
  let phase1Detail = "WQA pipeline has not run for this domain.";

  // Phase 2 data signal: reuses Phase 1's BQ check. The wqa_output
  // carries status_code / indexability / schema / performance signals
  // that ARE the source data for the Tech SEO audit. Black here means
  // "source data is there to audit against" not "checks have been
  // recorded" (page_check_state is the analysis-output table for
  // Phase 2 work, but doesn't gate readiness for analysis).
  let phase2HasData = false;
  let phase2Detail = "Tech SEO source data not available.";

  // Phase 3 data signal: keyword_cluster count for the property.
  let phase3HasData = false;
  let phase3Detail = "No keyword clusters yet.";

  // Phase 4 data signal: content_row count for the property.
  let phase4HasData = false;
  let phase4Detail = "No content rows yet.";

  // Phase 5 data signal: audit_doc count for the property (initial
  // backlink audit + link diffs live here).
  let phase5HasData = false;
  let phase5Detail = "No authority / link audit data yet.";

  // Phase 6 data signal: property has a primary_domain set AND is
  // active. Rank tracking + dashboard build require both. When we
  // wire a tracking_setup_complete flag this will become more strict.
  let phase6HasData = false;
  let phase6Detail = "Property must be active with a primary domain to set up tracking.";

  // Pull all of the Supabase counts in parallel + BQ wqa fetch.
  try {
    const [
      brandDnaRes,
      keywordClusterRes,
      contentRowRes,
      auditDocRes,
      wqaRes,
      hasCompetitorsFlag,
      hasSeedKeywordsFlag,
    ] = await Promise.all([
      supabase
        .from("brand_dna_section")
        .select("section, body, content, property!inner(slug)")
        .eq("property.slug", slug),
      supabase
        .from("keyword_cluster")
        .select("id, property!inner(slug)", { count: "exact", head: true })
        .eq("property.slug", slug),
      supabase
        .from("content_row")
        .select("id, property!inner(slug)", { count: "exact", head: true })
        .eq("property.slug", slug),
      supabase
        .from("audit_doc")
        .select("id, property!inner(slug)", { count: "exact", head: true })
        .eq("property.slug", slug),
      primaryDomain
        ? getWqaForDomain(primaryDomain, "dev")
        : Promise.resolve(null),
      hasCompetitors(propertyId),
      hasSeedKeywords(propertyId),
    ]);

    // Phase 0 — count brand_dna_section rows (excluding competitors +
    // seed_keywords which live in their own tables) + 1 each for the
    // Supabase tables when populated. Matches the hero badge math + the
    // 11-entry COMPLETENESS_SECTIONS denominator.
    const dnaRows = (brandDnaRes.data ?? []) as {
      section: string;
      body: string | null;
      content: unknown;
    }[];
    const supabaseFilled = dnaRows.filter((r) => {
      if (r.section === "competitors" || r.section === "seed_keywords") {
        return false;
      }
      if (r.body && r.body.length > 0) return true;
      if (r.content && typeof r.content === "object") {
        return Object.keys(r.content as Record<string, unknown>).length > 0;
      }
      return false;
    }).length;
    const filled =
      supabaseFilled +
      (hasCompetitorsFlag ? 1 : 0) +
      (hasSeedKeywordsFlag ? 1 : 0);
    if (filled > 0) {
      phase0HasData = true;
      const parts: string[] = [];
      if (supabaseFilled > 0) {
        parts.push(`${supabaseFilled} section${supabaseFilled === 1 ? "" : "s"}`);
      }
      if (hasCompetitorsFlag) parts.push("competitors");
      if (hasSeedKeywordsFlag) parts.push("seed keywords");
      phase0Detail = `${filled} of 11 populated (${parts.join(" + ")}).`;
    }

    // Phase 1 + Phase 2 (share the WQA BQ output signal)
    if (wqaRes && "ok" in wqaRes && wqaRes.ok && wqaRes.rows.length > 0) {
      phase1HasData = true;
      phase1Detail = `${wqaRes.rows.length.toLocaleString()} URLs in WQA pipeline output.`;
      phase2HasData = true;
      phase2Detail = `${wqaRes.rows.length.toLocaleString()} URLs ready for Tech SEO audit (status, indexability, schema, CWV from WQA pipeline).`;
    }

    // Phase 3
    const clusterCount = keywordClusterRes.count ?? 0;
    if (clusterCount > 0) {
      phase3HasData = true;
      phase3Detail = `${clusterCount.toLocaleString()} keyword cluster${clusterCount === 1 ? "" : "s"} in workspace.`;
    }

    // Phase 4
    const contentCount = contentRowRes.count ?? 0;
    if (contentCount > 0) {
      phase4HasData = true;
      phase4Detail = `${contentCount.toLocaleString()} content row${contentCount === 1 ? "" : "s"} in pipeline.`;
    }

    // Phase 5
    const auditCount = auditDocRes.count ?? 0;
    if (auditCount > 0) {
      phase5HasData = true;
      phase5Detail = `${auditCount} link / authority audit doc${auditCount === 1 ? "" : "s"} captured.`;
    }

    // Phase 6 — proxy until a dedicated tracking_setup field lands
    if (primaryDomain && (propertyStatus ?? "").toLowerCase() === "active") {
      phase6HasData = true;
      phase6Detail = `Property active with primary domain set. Rank tracker + dashboard setup can begin.`;
    }
  } catch {
    // ignore - keep defaults so the strip still renders
  }

  const make = (
    approvedAt: string | null,
    approvedBy: string | null,
    hasData: boolean,
    detail: string,
  ): PhaseGate => {
    if (approvedAt) {
      return {
        state: "green",
        approvedAt,
        approvedBy,
        detail,
      };
    }
    return {
      state: hasData ? "black" : "gray",
      approvedAt: null,
      approvedBy: null,
      detail,
    };
  };

  return [
    make(approvals.phase_0_approved_at, approvals.phase_0_approved_by, phase0HasData, phase0Detail),
    make(approvals.phase_1_approved_at, approvals.phase_1_approved_by, phase1HasData, phase1Detail),
    make(approvals.phase_2_approved_at, approvals.phase_2_approved_by, phase2HasData, phase2Detail),
    make(approvals.phase_3_approved_at, approvals.phase_3_approved_by, phase3HasData, phase3Detail),
    make(approvals.phase_4_approved_at, approvals.phase_4_approved_by, phase4HasData, phase4Detail),
    make(approvals.phase_5_approved_at, approvals.phase_5_approved_by, phase5HasData, phase5Detail),
    make(approvals.phase_6_approved_at, approvals.phase_6_approved_by, phase6HasData, phase6Detail),
  ];
}

// Plain async — Next 16 unstable_cache factory pattern caused layout
// throws on newly-created properties. The inner /api/clients fetch keeps
// its next.revalidate so the Python BQ call is still amortized via
// Next's fetch-cache layer.
async function getProjectTypes(
  slug: string,
): Promise<{ types: Set<string>; count: number }> {
  try {
    const res = await fetch(`${apiBase()}/api/properties/${slug}/projects`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { types: new Set(), count: 0 };
    const data = (await res.json()) as {
      projects: Project[];
      count: number;
    };
    return {
      types: new Set(data.projects.map((p) => p.project_type).filter(Boolean)),
      count: data.count,
    };
  } catch {
    return { types: new Set(), count: 0 };
  }
}

// ── Tabs ─────────────────────────────────────────────────────────────────

type Tab =
  | { kind: "tab"; href: string; label: string; badge?: number | string }
  | { kind: "sep" };

function buildTabs(
  slug: string,
  projectTypes: Set<string>,
  metrics: {
    pages: number;
    brandDnaFilled: number;
    brandDnaTotal: number;
    authorityLiveRds: number | null;
  },
  projectCount: number,
): Tab[] {
  const tabs: Tab[] = [
    // Always-on
    { kind: "tab", href: `/properties/${slug}`, label: "Overview" },
    {
      kind: "tab",
      href: `/properties/${slug}/brand-dna`,
      label: "Brand DNA",
      badge: `${metrics.brandDnaFilled}/${metrics.brandDnaTotal}`,
    },
    {
      kind: "tab",
      href: `/properties/${slug}/pages`,
      label: "Pages",
      badge: metrics.pages || undefined,
    },
  ];

  // Cluster: project-driven tabs
  const hasSeo =
    projectTypes.has("seo") || projectTypes.has("seo_pipeline");
  if (hasSeo) {
    tabs.push({ kind: "sep" });
    tabs.push({ kind: "tab", href: `/properties/${slug}/keywords`, label: "Keywords" });
    tabs.push({ kind: "tab", href: `/properties/${slug}/content`, label: "Content" });
    tabs.push({
      kind: "tab",
      href: `/properties/${slug}/authority`,
      label: "Authority",
      badge: metrics.authorityLiveRds ?? undefined,
    });
    tabs.push({ kind: "tab", href: `/properties/${slug}/tracking`, label: "Tracking" });
    tabs.push({ kind: "tab", href: `/properties/${slug}/local-seo`, label: "Local SEO" });
  }

  // Cluster: meta tabs
  tabs.push({ kind: "sep" });
  tabs.push({
    kind: "tab",
    href: `/properties/${slug}/projects`,
    label: "Projects",
    badge: projectCount || undefined,
  });
  tabs.push({
    kind: "tab",
    href: `/properties/${slug}/data-access`,
    label: "Data Access",
  });
  tabs.push({
    kind: "tab",
    href: `/properties/${slug}/project-brain`,
    label: "Project Brain",
  });

  return tabs;
}

// ── View ─────────────────────────────────────────────────────────────────

export default async function PropertyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) notFound();

  const [{ types: projectTypes, count: projectCount }, metrics, phaseGates] =
    await Promise.all([
      getProjectTypes(slug),
      getHeroMetrics(slug, prop.id),
      getPhaseGates(slug, prop.id, prop.primary_domain, prop.status, prop as PhaseApprovalRow),
    ]);

  const tabs = buildTabs(slug, projectTypes, metrics, projectCount);
  const client = prop.client as unknown as {
    name: string;
    legal_name: string | null;
    slug: string;
  } | null;
  const domainDisplay = `${prop.primary_domain}${prop.url_prefix ?? ""}`;
  const phase = prop.pipeline_phase ?? 0;
  const phaseName = PHASE_NAMES[phase] ?? PHASE_NAMES[0];
  const statusVariant = statusVariantFrom(prop.status);

  return (
    <div>
      {/* ── Property hero ─────────────────────────────────────────── */}
      <div className="border-b bg-gradient-to-b from-slate-50 to-white px-8 py-8">
        {/* Client breadcrumb */}
        <div className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
          <Link href="/clients" className="hover:text-slate-700">
            Clients
          </Link>
          <span className="text-slate-300">/</span>
          {client && (
            <>
              <Link
                href={`/clients/${client.slug}`}
                className="hover:text-slate-700"
              >
                {client.name}
              </Link>
              {client.legal_name && (
                <span className="text-slate-400">· {client.legal_name}</span>
              )}
            </>
          )}
        </div>

        {/* Name + status */}
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
          {prop.name}
          <StatusPill variant={statusVariant} />
        </h1>

        {/* Domain */}
        <div className="font-mono text-xs text-slate-500 mt-1">
          {domainDisplay}
        </div>

        {/* Phase strip + 4 metrics */}
        <div className="flex gap-12 items-end mt-6 flex-wrap">
          <div className="flex-1 min-w-[280px] max-w-[480px]">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Pipeline · phase {phase} ({phaseName})
            </div>
            <PhaseStrip
              currentPhase={phase}
              phases={phaseGates}
              showLabels
              onApprove={async (phaseIndex: number) => {
                "use server";
                await approvePhase(prop.id, phaseIndex, slug);
              }}
            />
          </div>
          <div className="flex gap-8">
            <HeroMetric label="Pages" value={metrics.pages.toLocaleString()} />
            <HeroMetric label="Optimize" value={metrics.optimize.toLocaleString()} />
            <HeroMetric
              label="Brand DNA"
              value={`${metrics.brandDnaFilled}/${metrics.brandDnaTotal}`}
            />
            <HeroMetric label="Projects" value={projectCount.toString()} />
          </div>
        </div>
      </div>

      {/* ── Tab strip ─────────────────────────────────────────────── */}
      <div className="border-b bg-white px-8 flex items-stretch gap-0 text-sm">
        {tabs.map((t, i) =>
          t.kind === "sep" ? (
            <div
              key={`sep-${i}`}
              className="w-px h-5 bg-slate-200 my-auto mx-2"
              aria-hidden
            />
          ) : (
            <Link
              key={t.href}
              href={t.href}
              className="py-3 px-3 text-slate-500 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300 -mb-px flex items-center gap-1.5"
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded tabular-nums">
                  {t.badge}
                </span>
              )}
            </Link>
          ),
        )}
      </div>

      {children}

      <PropertyAssistantButton propertySlug={slug} />
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-[22px] font-semibold tracking-tight mt-0.5 tabular-nums">
        {value}
      </div>
    </div>
  );
}
