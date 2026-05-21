import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { apiBase } from "@/lib/api-base";
import { PhaseStrip, PHASE_NAMES } from "@/components/PhaseStrip";
import { StatusPill, statusVariantFrom } from "@/components/StatusPill";

type Project = {
  project_type: string;
  status: string | null;
};

// ── Data ─────────────────────────────────────────────────────────────────

// React.cache dedupes within a single request — multiple components calling
// getProperty(slug) on the same page only hit Supabase once.
const getProperty = cache(async (slug: string) => {
  const { data } = await supabase
    .from("property")
    .select(
      "id, slug, name, primary_domain, url_prefix, pipeline_phase, status, client:client_id(name, legal_name, slug)",
    )
    .eq("slug", slug)
    .single();
  return data;
});

async function getHeroMetrics(_slug: string, propertyId: string) {
  // Pages count + optimize count + BrandDNA filled count.
  // Three small reads in parallel; service-role client bypasses RLS.
  const [pagesRes, optimizeRes, dnaRes] = await Promise.all([
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
  ]);
  // Brand DNA: count non-empty sections (have body OR have content keys).
  // The denominator is 12 (the strategist-facing section count from screen 5).
  const sections = (dnaRes.data ?? []) as { section: string }[];
  // Drop the legacy 'competitors' section — BQ Meta is canonical for that.
  const filled = sections.filter((s) => s.section !== "competitors").length;
  return {
    pages: pagesRes.count ?? 0,
    optimize: optimizeRes.count ?? 0,
    brandDnaFilled: filled,
    brandDnaTotal: 12,
  };
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
  metrics: { pages: number; brandDnaFilled: number; brandDnaTotal: number },
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

  const [{ types: projectTypes, count: projectCount }, metrics] =
    await Promise.all([getProjectTypes(slug), getHeroMetrics(slug, prop.id)]);

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
            <PhaseStrip currentPhase={phase} showLabels />
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
