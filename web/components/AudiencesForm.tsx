"use client";

// Audiences form — primary audience + the strategic "from → to" pivot the
// brand is working toward. Renders empty fields for new properties; reads
// existing legacy keys (`shift`, `why`, `horizon_months`) on first load.

import type { AudiencesInitial } from "@/app/properties/[slug]/brand-dna/audiences/page";
import {
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

export function AudiencesForm({
  initial,
  save,
  lastEditedAt,
  lastEditedBy,
  source,
}: {
  initial: AudiencesInitial;
  save: SaveFn;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  source: string | null;
}) {
  return (
    <>
      <BrandDnaFormCard
        source={source}
        title="Audiences"
        subcopy={
          <>
            Who the brand sells to today, and the strategic pivot underway. The
            Brand DNA Assistant uses this to weight messaging when the
            audience-of-interest changes mid-funnel.
          </>
        }
      >
        <BrandDnaTextareaField
          label="Current audience"
          initialValue={initial.current_audience}
          onSave={bind(save, "current_audience")}
          rows={5}
          placeholder="Who the brand sells to right now. Buyer roles, decision context, what they care about."
        />
        <BrandDnaTextareaField
          label="Future shift (from → to)"
          initialValue={initial.future_shift}
          onSave={bind(save, "future_shift")}
          rows={4}
          placeholder='e.g. "From architects and developers to luxury lifestyle brands and high-end real estate marketers"'
        />
        <BrandDnaTextareaField
          label="Why this shift, now"
          initialValue={initial.why_shift}
          onSave={bind(save, "why_shift")}
          rows={5}
          placeholder="What makes the new audience addressable now — market dynamics, the brand's emerging strengths, competitive openings."
        />
        <BrandDnaTextField
          label="Horizon (months)"
          initialValue={initial.horizon_months}
          onSave={bind(save, "horizon_months")}
          placeholder="24"
          widthClass="w-40"
        />
        <BrandDnaTextField
          label="Status"
          initialValue={initial.status}
          onSave={bind(save, "status")}
          placeholder="e.g. exploring, validated, committed"
          widthClass="w-60"
        />
      </BrandDnaFormCard>
      <BrandDnaFormFooter
        lastEditedAt={lastEditedAt}
        lastEditedBy={lastEditedBy}
      />
    </>
  );
}
