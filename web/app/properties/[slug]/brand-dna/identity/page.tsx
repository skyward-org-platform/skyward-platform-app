// Identity — v2 screen 11. Bespoke single-page form; overrides the dynamic
// [section] route for /identity.
//
// Field set mirrors the v2 mockup (Company Name, Tagline, Brand Personality,
// Brand Story, Target Audience, Positioning, What we sell, Trust signals,
// Proof themes, Founded, HQ Location) and preserves existing legacy fields
// from the phil-lasry data (Legal Name, Operating Locations). Save happens
// per-field on blur; history snapshots via the brand_dna_section trigger.

import { supabase } from "@/lib/supabase";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";
import { IdentityForm } from "@/components/IdentityForm";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";

type Section = {
  id: string;
  content: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by: string | null;
  source: string | null;
};

export type IdentityInitial = {
  brand_name: string;
  tagline: string;
  legal_name: string;
  brand_personality: string;
  brand_story: string;
  target_audience: string;
  positioning: string;
  what_we_sell: string;
  trust_signals: string;
  proof_themes: string;
  founded: string;
  hq_location: string;
  operating_locations: string[];
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

function readInitial(content: Record<string, unknown> | null): IdentityInitial {
  const c = content ?? {};
  return {
    brand_name: str(c.brand_name),
    tagline: str(c.tagline),
    legal_name: str(c.legal_name),
    brand_personality: str(c.brand_personality),
    brand_story: str(c.brand_story),
    target_audience: str(c.target_audience),
    positioning: str(c.positioning),
    what_we_sell: str(c.what_we_sell),
    trust_signals: str(c.trust_signals),
    proof_themes: str(c.proof_themes),
    founded: str(c.founded),
    hq_location: str(c.hq_location),
    operating_locations: strArr(c.operating_locations),
  };
}

async function getIdentity(slug: string): Promise<Section | null> {
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
    .eq("section", "identity")
    .maybeSingle();
  return (data as Section | null) ?? null;
}

export default async function IdentityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "identity");
  const section = await getIdentity(slug);
  const initial = readInitial(section?.content ?? null);

  // Wrap the upsert action with the slug + section so the client form only
  // passes (fieldKey, value) — keeps each field component tiny.
  async function save(fieldKey: string, value: unknown) {
    "use server";
    return upsertBrandDnaField(slug, "identity", fieldKey, value);
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <IdentityForm
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
