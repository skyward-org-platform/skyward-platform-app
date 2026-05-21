// Commercial Policy — how the brand sells. Not in the v2 mockup; field set
// drawn from what the Brand DNA Assistant needs to draft commercial pages
// correctly: pricing visibility, sales motion, CTAs, qualification rules,
// service-area + hours. Stored under brand_dna_section.section = 'goals'
// per the existing subnav mapping in lib/brand-dna-subnav.ts.

import { supabase } from "@/lib/supabase";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";
import { CommercialPolicyForm } from "@/components/CommercialPolicyForm";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";

type Section = {
  id: string;
  content: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by: string | null;
  source: string | null;
};

export type CommercialPolicyInitial = {
  business_model: string;
  geographic_focus: string;
  service_area: string;
  pricing_visibility: string;
  price_range: string;
  sales_motion: string;
  primary_cta: string;
  hours_of_operation: string;
  qualification_criteria: string;
  disqualifiers: string;
  contract_types: string[];
  payment_terms: string;
  what_we_dont_do: string;
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

function readInitial(content: Record<string, unknown> | null): CommercialPolicyInitial {
  const c = content ?? {};
  return {
    business_model: str(c.business_model),
    geographic_focus: str(c.geographic_focus),
    service_area: str(c.service_area),
    pricing_visibility: str(c.pricing_visibility),
    price_range: str(c.price_range),
    sales_motion: str(c.sales_motion),
    primary_cta: str(c.primary_cta),
    hours_of_operation: str(c.hours_of_operation),
    qualification_criteria: str(c.qualification_criteria),
    disqualifiers: str(c.disqualifiers),
    contract_types: strArr(c.contract_types),
    payment_terms: str(c.payment_terms),
    what_we_dont_do: str(c.what_we_dont_do),
  };
}

async function getCommercialPolicy(slug: string): Promise<Section | null> {
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
    .eq("section", "goals")
    .maybeSingle();
  return (data as Section | null) ?? null;
}

export default async function CommercialPolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "goals");
  const section = await getCommercialPolicy(slug);
  const initial = readInitial(section?.content ?? null);

  async function save(fieldKey: string, value: unknown) {
    "use server";
    return upsertBrandDnaField(slug, "goals", fieldKey, value);
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <CommercialPolicyForm
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
