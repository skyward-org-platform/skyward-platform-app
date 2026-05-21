"use client";

// Commercial Policy form — how the brand sells. Fields chosen for what the
// Brand DNA Assistant needs when drafting commercial pages (pricing /
// service area / CTA / qualification), not for legal commercial terms.

import type { CommercialPolicyInitial } from "@/app/properties/[slug]/brand-dna/commercial-policy/page";
import {
  BrandDnaChipsField,
  BrandDnaFormCard,
  BrandDnaFormFooter,
  BrandDnaSelectField,
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

const BUSINESS_MODELS = [
  "service",
  "leadgen",
  "ecommerce",
  "marketplace",
  "saas",
  "hybrid",
] as const;
const GEO_FOCUS = [
  "local",
  "regional",
  "multi_location",
  "national",
  "international",
] as const;
const PRICING_VISIBILITY = ["public", "tiered", "gated", "quote_only"] as const;
const SALES_MOTION = [
  "self_serve",
  "sales_assisted",
  "sales_led",
  "hybrid",
] as const;

export function CommercialPolicyForm({
  initial,
  save,
  lastEditedAt,
  lastEditedBy,
  source,
}: {
  initial: CommercialPolicyInitial;
  save: SaveFn;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  source: string | null;
}) {
  return (
    <>
      <BrandDnaFormCard
        source={source}
        title="Commercial Policy"
        subcopy={
          <>
            How the brand sells. The Brand DNA Assistant uses this to pick the
            right CTAs, decide whether to show pricing, set geographic scope,
            and steer leads it can&rsquo;t serve.
          </>
        }
      >
        <BrandDnaSelectField
          label="Business model"
          initialValue={initial.business_model}
          options={BUSINESS_MODELS}
          onSave={bind(save, "business_model")}
        />
        <BrandDnaSelectField
          label="Geographic focus"
          initialValue={initial.geographic_focus}
          options={GEO_FOCUS}
          onSave={bind(save, "geographic_focus")}
        />
        <BrandDnaTextareaField
          label="Service area"
          initialValue={initial.service_area}
          onSave={bind(save, "service_area")}
          rows={3}
          placeholder='Specifics: cities, counties, states, regions. e.g. "Utah County + surrounding (Orem, Springville, American Fork)"'
        />
        <BrandDnaSelectField
          label="Pricing visibility"
          initialValue={initial.pricing_visibility}
          options={PRICING_VISIBILITY}
          onSave={bind(save, "pricing_visibility")}
        />
        <BrandDnaTextField
          label="Typical price range"
          initialValue={initial.price_range}
          onSave={bind(save, "price_range")}
          placeholder='e.g. "$240–$480 per visit" or "starts at $7,500"'
        />
        <BrandDnaSelectField
          label="Sales motion"
          initialValue={initial.sales_motion}
          options={SALES_MOTION}
          onSave={bind(save, "sales_motion")}
        />
        <BrandDnaTextField
          label="Primary CTA"
          initialValue={initial.primary_cta}
          onSave={bind(save, "primary_cta")}
          placeholder='e.g. "Request a quote", "Book a consultation", "Start free trial"'
        />
        <BrandDnaTextField
          label="Hours of operation"
          initialValue={initial.hours_of_operation}
          onSave={bind(save, "hours_of_operation")}
          placeholder='e.g. "M-F 7am-7pm MT · emergency 24/7"'
        />
        <BrandDnaTextareaField
          label="Qualification criteria"
          initialValue={initial.qualification_criteria}
          onSave={bind(save, "qualification_criteria")}
          rows={5}
          placeholder="Who counts as a qualified lead — industry, size, geography, budget, deal stage."
        />
        <BrandDnaTextareaField
          label="Disqualifiers"
          initialValue={initial.disqualifiers}
          onSave={bind(save, "disqualifiers")}
          rows={5}
          placeholder="Leads we don't pursue — wrong industry, too small/large, out of area, low-budget tire-kickers. Drafting copy should mention these upfront."
        />
        <BrandDnaChipsField
          label="Contract types"
          initialValue={initial.contract_types}
          onSave={bind(save, "contract_types")}
          placeholder="+ add (one-off, retainer, project, subscription, custom)"
        />
        <BrandDnaTextField
          label="Payment terms"
          initialValue={initial.payment_terms}
          onSave={bind(save, "payment_terms")}
          placeholder='e.g. "Net 30" or "50% upfront, 50% on completion"'
        />
        <BrandDnaTextareaField
          label="What we don't do"
          initialValue={initial.what_we_dont_do}
          onSave={bind(save, "what_we_dont_do")}
          rows={5}
          placeholder="Explicitly out-of-scope services and where to refer those leads. Keeps draft copy honest about boundaries."
        />
      </BrandDnaFormCard>
      <BrandDnaFormFooter
        lastEditedAt={lastEditedAt}
        lastEditedBy={lastEditedBy}
      />
    </>
  );
}
