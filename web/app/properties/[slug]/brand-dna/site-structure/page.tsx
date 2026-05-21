// Site Structure — strategic intent of the site IA, distinct from the
// empirical Screaming Frog crawl that powers Pages triage. The crawl tells
// you what URLs *exist*; Site Structure declares what they *should* be —
// URL patterns, hub-spoke models, content strategy, technical constraints —
// so the Brand DNA Assistant can propose new URLs and templates that fit.

import { supabase } from "@/lib/supabase";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";
import { SiteStructureForm } from "@/components/SiteStructureForm";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";

type Section = {
  id: string;
  content: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by: string | null;
  source: string | null;
};

export type SiteStructureInitial = {
  cms: string;
  top_level_sections: string[];
  url_conventions: string;
  hub_spoke_pattern: string;
  service_area_strategy: string;
  blog_strategy: string;
  internal_linking_rules: string;
  subdomain_policy: string;
  technical_constraints: string;
  crawl_notes: string;
};

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function readInitial(content: Record<string, unknown> | null): SiteStructureInitial {
  const c = content ?? {};
  return {
    cms: str(c.cms),
    top_level_sections: strArr(c.top_level_sections),
    url_conventions: str(c.url_conventions),
    hub_spoke_pattern: str(c.hub_spoke_pattern),
    service_area_strategy: str(c.service_area_strategy),
    blog_strategy: str(c.blog_strategy),
    internal_linking_rules: str(c.internal_linking_rules),
    subdomain_policy: str(c.subdomain_policy),
    technical_constraints: str(c.technical_constraints),
    crawl_notes: str(c.crawl_notes),
  };
}

async function getSiteStructure(slug: string): Promise<Section | null> {
  const { data: prop } = await supabase
    .from("property")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!prop) return null;
  const { data } = await supabase
    .from("brand_dna_section")
    .select("id, content, source, updated_at, updated_by")
    .eq("property_id", prop.id)
    .eq("section", "site_structure")
    .maybeSingle();
  return (data as Section | null) ?? null;
}

export default async function SiteStructurePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "site_structure");
  const section = await getSiteStructure(slug);
  const initial = readInitial(section?.content ?? null);

  async function save(fieldKey: string, value: unknown) {
    "use server";
    return upsertBrandDnaField(slug, "site_structure", fieldKey, value);
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <SiteStructureForm
        initial={initial}
        save={save}
        lastEditedAt={section?.updated_at ?? null}
        lastEditedBy={section?.updated_by ?? null}
        source={section?.source ?? null}
      />
      <SectionHistoryPanel snapshots={history} />
    </div>
  );
}
