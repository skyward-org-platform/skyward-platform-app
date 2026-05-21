// Audiences — bespoke form for the future_audience section. Not in the v2
// mockup file (which only covers screens 1-16), so the field set is derived
// from existing data (`why`, `shift`, `horizon_months`) plus complementary
// fields the Assistant needs to act on a "from→to" audience pivot.
//
// Schema is `brand_dna_section.section = 'future_audience'` to preserve
// continuity with the legacy phil-lasry data shape.

import { supabase } from "@/lib/supabase";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";
import { AudiencesForm } from "@/components/AudiencesForm";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";

type Section = {
  id: string;
  content: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by: string | null;
  source: string | null;
};

export type AudiencesInitial = {
  current_audience: string;
  future_shift: string;
  why_shift: string;
  horizon_months: string;
  status: string;
};

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function readInitial(content: Record<string, unknown> | null): AudiencesInitial {
  const c = content ?? {};
  return {
    current_audience: str(c.current_audience),
    future_shift: str(c.future_shift) || str(c.shift),
    why_shift: str(c.why_shift) || str(c.why),
    horizon_months: str(c.horizon_months),
    status: str(c.status),
  };
}

async function getAudiences(slug: string): Promise<Section | null> {
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
    .eq("section", "future_audience")
    .maybeSingle();
  return (data as Section | null) ?? null;
}

export default async function AudiencesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "future_audience");
  const section = await getAudiences(slug);
  const initial = readInitial(section?.content ?? null);

  async function save(fieldKey: string, value: unknown) {
    "use server";
    return upsertBrandDnaField(slug, "future_audience", fieldKey, value);
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <AudiencesForm
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
