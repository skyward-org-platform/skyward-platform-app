import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Project = {
  project_type: string;
  status: string | null;
};

async function getProperty(slug: string) {
  const { data } = await supabase
    .from("property")
    .select(
      "id, slug, name, primary_domain, url_prefix, pipeline_phase, client:client_id(name, slug)",
    )
    .eq("slug", slug)
    .single();
  return data;
}

async function getProjectTypes(slug: string): Promise<Set<string>> {
  // Best-effort: if the BQ Meta lookup fails we just render the always-on tabs
  // rather than 500 the whole property page. Cache for 60s to avoid hitting
  // the Python function on every nav between tabs.
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/properties/${slug}/projects`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return new Set();
    const data = (await res.json()) as { projects: Project[] };
    return new Set(data.projects.map((p) => p.project_type).filter(Boolean));
  } catch {
    return new Set();
  }
}

function buildTabs(slug: string, projectTypes: Set<string>) {
  // Always-on. Brand DNA + Pages + Projects are universal.
  const tabs: Array<{ href: string; label: string }> = [
    { href: `/properties/${slug}`, label: "Brand DNA" },
    { href: `/properties/${slug}/pages`, label: "Pages" },
  ];

  // Keywords lights up when an SEO project is active on this property.
  // Adam's pipeline labels these "seo_pipeline" today; treat both names as SEO
  // so the framework's "seo" type and the pipeline's "seo_pipeline" both count.
  const hasSeo =
    projectTypes.has("seo") || projectTypes.has("seo_pipeline");
  if (hasSeo) {
    tabs.push({ href: `/properties/${slug}/keywords`, label: "Keywords" });
  }

  // Campaigns lights up when a paid_search or paid_social project is active.
  // One combined tab for now — subdivide (landing pages, ad library, etc.)
  // once paid work actually ships.
  const hasPaid =
    projectTypes.has("paid_search") || projectTypes.has("paid_social");
  if (hasPaid) {
    tabs.push({ href: `/properties/${slug}/campaigns`, label: "Campaigns" });
  }

  tabs.push({ href: `/properties/${slug}/projects`, label: "Projects" });
  return tabs;
}

export default async function PropertyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [prop, projectTypes] = await Promise.all([
    getProperty(slug),
    getProjectTypes(slug),
  ]);
  if (!prop) notFound();

  const tabs = buildTabs(slug, projectTypes);
  const client = prop.client as unknown as { name: string; slug: string } | null;
  const domainDisplay = `${prop.primary_domain}${prop.url_prefix ?? ""}`;

  return (
    <div>
      <div className="border-b px-8 py-4 flex items-end justify-between">
        <div>
          <div className="text-xs text-slate-500">{client?.name}</div>
          <h1 className="text-xl font-bold">{prop.name}</h1>
          <div className="text-xs text-slate-500">{domainDisplay}</div>
        </div>
        <div className="text-xs">
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-semibold">
            Phase {prop.pipeline_phase}
          </span>
        </div>
      </div>
      <div className="border-b px-8 flex gap-6 text-sm">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="py-3 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-400"
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
