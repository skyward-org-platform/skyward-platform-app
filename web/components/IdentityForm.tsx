"use client";

// Bespoke Identity form layout — v2 screen 11. Stacked-label inputs +
// textareas with a chips field for operating locations. Each field
// auto-saves on blur via the parent's `save(fieldKey, value)` callback.

import type { IdentityInitial } from "@/app/properties/[slug]/brand-dna/identity/page";
import {
  BrandDnaChipsField,
  BrandDnaFormCard,
  BrandDnaFormFooter,
  BrandDnaTextField,
  BrandDnaTextareaField,
} from "@/components/BrandDnaForm";

type SaveFn = (
  fieldKey: string,
  value: unknown,
) => Promise<{ ok: true; sectionId: string } | { ok: false; error: string }>;

function bind(save: SaveFn, fieldKey: string) {
  return async (value: unknown) => {
    const res = await save(fieldKey, value);
    if (res.ok) return { ok: true as const };
    return { ok: false as const, error: res.error };
  };
}

export function IdentityForm({
  initial,
  save,
  lastEditedAt,
  lastEditedBy,
  source,
}: {
  initial: IdentityInitial;
  save: SaveFn;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  source: string | null;
}) {
  return (
    <>
      <BrandDnaFormCard
        source={source}
        title="Brand Identity"
        subcopy={
          <>
            To auto-populate these fields from your website and brand research,
            use{" "}
            <strong className="text-foreground">Research &amp; Fill</strong> on
            the Overview tab.
          </>
        }
      >
        <BrandDnaTextField
          label="Company Name"
          initialValue={initial.brand_name}
          onSave={bind(save, "brand_name")}
          placeholder="e.g. Kitchen Services of Provo"
        />
        <BrandDnaTextField
          label="Company Motto / Tagline"
          initialValue={initial.tagline}
          onSave={bind(save, "tagline")}
          placeholder="One-line positioning statement"
        />
        <BrandDnaTextField
          label="Legal Name"
          initialValue={initial.legal_name}
          onSave={bind(save, "legal_name")}
          placeholder="Registered entity name (if different)"
        />
        <BrandDnaTextareaField
          label="Brand Personality"
          initialValue={initial.brand_personality}
          onSave={bind(save, "brand_personality")}
          rows={6}
          placeholder="The character behind the brand — how it shows up in writing, on a call, in person."
        />
        <BrandDnaTextareaField
          label="Brand Story"
          initialValue={initial.brand_story}
          onSave={bind(save, "brand_story")}
          rows={7}
          placeholder="Founder context, origin, market position. What got the brand here."
        />
        <BrandDnaTextareaField
          label="Target Audience"
          initialValue={initial.target_audience}
          onSave={bind(save, "target_audience")}
          rows={6}
          placeholder="Who buys from you. Roles, decision-making context, what they care about."
        />
        <BrandDnaTextareaField
          label="Positioning"
          initialValue={initial.positioning}
          onSave={bind(save, "positioning")}
          rows={6}
          placeholder="The competitive frame. Who you beat on what, who you don't try to beat."
        />
        <BrandDnaTextareaField
          label="What we sell"
          initialValue={initial.what_we_sell}
          onSave={bind(save, "what_we_sell")}
          rows={6}
          placeholder="Product / service summary. The Offerings tab holds the row-level list."
        />
        <BrandDnaTextareaField
          label="Trust signals"
          initialValue={initial.trust_signals}
          onSave={bind(save, "trust_signals")}
          rows={6}
          placeholder="Certifications, accreditations, insurance, longevity — anything that proves capability."
        />
        <BrandDnaTextareaField
          label="Proof themes"
          initialValue={initial.proof_themes}
          onSave={bind(save, "proof_themes")}
          rows={6}
          placeholder="Strategic themes the Proof Assets list draws from (Consistency, Compliance, Responsiveness…)."
        />
        <BrandDnaTextField
          label="Founded"
          initialValue={initial.founded}
          onSave={bind(save, "founded")}
          placeholder="e.g. 2003"
          widthClass="w-60"
        />
        <BrandDnaTextField
          label="HQ Location"
          initialValue={initial.hq_location}
          onSave={bind(save, "hq_location")}
          placeholder="City, State"
        />
        <BrandDnaChipsField
          label="Operating Locations"
          initialValue={initial.operating_locations}
          onSave={bind(save, "operating_locations")}
          placeholder="+ add region"
        />
      </BrandDnaFormCard>
      <BrandDnaFormFooter
        lastEditedAt={lastEditedAt}
        lastEditedBy={lastEditedBy}
      />
    </>
  );
}
