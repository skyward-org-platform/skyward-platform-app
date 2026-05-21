// Voice & Tone — v2 screen 12. Bespoke single-page form; overrides the
// dynamic [section] route for /voice-tone.
//
// Backwards-compat read chain: the legacy phil-lasry data shape used
// tone_descriptors / dos / donts. The v2 mockup renames these to
// voice_traits / voice_dos / voice_donts plus new fields for voice_avoid /
// voice_one_sentence / writing_style. On read we fall back to the legacy
// keys so existing data renders correctly; on save we write to the v2 keys
// going forward. Legacy fields stay in the JSON for traceability.

import { supabase } from "@/lib/supabase";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";
import { VoiceToneForm } from "@/components/VoiceToneForm";
import { getSectionHistory } from "@/lib/section-history";
import { SectionHistoryPanel } from "@/components/SectionHistoryPanel";

type Section = {
  id: string;
  content: Record<string, unknown> | null;
  updated_at: string | null;
  updated_by: string | null;
  source: string | null;
};

export type VoiceToneInitial = {
  voice_one_sentence: string;
  voice_traits: string[];
  voice_avoid: string[];
  writing_style: string;
  voice_dos: string;
  voice_donts: string;
  reading_level: string;
  example_bad_sentence: string;
  example_good_sentence: string;
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

function legacyJoin(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v.filter((x) => typeof x === "string").join("\n");
  }
  return "";
}

function readInitial(content: Record<string, unknown> | null): VoiceToneInitial {
  const c = content ?? {};
  return {
    voice_one_sentence: str(c.voice_one_sentence),
    // voice_traits is the v2 key; fall back to legacy tone_descriptors.
    voice_traits:
      strArr(c.voice_traits).length > 0
        ? strArr(c.voice_traits)
        : strArr(c.tone_descriptors),
    voice_avoid: strArr(c.voice_avoid),
    writing_style: str(c.writing_style),
    // voice_dos / voice_donts are the v2 string keys; fall back to legacy
    // arrays joined with newlines so the migration is transparent on first
    // edit.
    voice_dos:
      typeof c.voice_dos === "string" ? c.voice_dos : legacyJoin(c.dos),
    voice_donts:
      typeof c.voice_donts === "string"
        ? c.voice_donts
        : legacyJoin(c.donts),
    reading_level: str(c.reading_level),
    example_bad_sentence: str(c.example_bad_sentence),
    example_good_sentence: str(c.example_good_sentence),
  };
}

async function getVoiceTone(slug: string): Promise<Section | null> {
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
    .eq("section", "voice_tone")
    .maybeSingle();
  return (data as Section | null) ?? null;
}

export default async function VoiceTonePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const history = await getSectionHistory(slug, "voice_tone");
  const section = await getVoiceTone(slug);
  const initial = readInitial(section?.content ?? null);

  async function save(fieldKey: string, value: unknown) {
    "use server";
    return upsertBrandDnaField(slug, "voice_tone", fieldKey, value);
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <VoiceToneForm
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
