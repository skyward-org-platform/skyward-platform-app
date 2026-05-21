"use client";

// Voice & Tone bespoke form — v2 screen 12. Chip lists for traits and avoid,
// prose textareas for writing style / do's / don'ts. Legacy reading-level
// and example-sentence fields surface in a collapsed "Legacy" group at the
// bottom so existing phil-lasry data stays visible without polluting the
// primary form.

import { useState } from "react";
import type { VoiceToneInitial } from "@/app/properties/[slug]/brand-dna/voice-tone/page";
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

export function VoiceToneForm({
  initial,
  save,
  lastEditedAt,
  lastEditedBy,
  source,
}: {
  initial: VoiceToneInitial;
  save: SaveFn;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  source: string | null;
}) {
  const hasLegacy =
    initial.reading_level ||
    initial.example_bad_sentence ||
    initial.example_good_sentence;
  const [legacyOpen, setLegacyOpen] = useState(false);

  return (
    <>
      <BrandDnaFormCard
        source={source}
        title="Voice & Tone"
        subcopy={
          <>
            The voice the Brand DNA Assistant uses to draft. To auto-populate
            from your existing site copy, use{" "}
            <strong className="text-foreground">Research &amp; Fill</strong> on
            the Overview tab.
          </>
        }
      >
        <BrandDnaTextField
          label="Voice in one sentence"
          initialValue={initial.voice_one_sentence}
          onSave={bind(save, "voice_one_sentence")}
          placeholder="The one-liner the Assistant should use as its north star when drafting."
        />
        <BrandDnaChipsField
          label="Voice traits"
          initialValue={initial.voice_traits}
          onSave={bind(save, "voice_traits")}
          placeholder="+ add trait"
        />
        <BrandDnaChipsField
          label="Avoid"
          initialValue={initial.voice_avoid}
          onSave={bind(save, "voice_avoid")}
          placeholder='+ add (e.g. "premium")'
        />
        <BrandDnaTextareaField
          label="Writing Style"
          initialValue={initial.writing_style}
          onSave={bind(save, "writing_style")}
          rows={6}
          placeholder="Sentence length, structure, rhythm, formality. Concrete patterns the Assistant should imitate."
        />
        <BrandDnaTextareaField
          label="Voice Do's"
          initialValue={initial.voice_dos}
          onSave={bind(save, "voice_dos")}
          rows={6}
          placeholder="Specific moves the brand makes well — lead with metrics, admit limits, name your own tiers…"
        />
        <BrandDnaTextareaField
          label="Voice Don'ts"
          initialValue={initial.voice_donts}
          onSave={bind(save, "voice_donts")}
          rows={6}
          placeholder="Specific phrases or stances to avoid — corporate jargon, unbacked superlatives, third-person voice…"
        />
      </BrandDnaFormCard>

      {hasLegacy && (
        <section className="mt-4 border rounded-lg bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setLegacyOpen((s) => !s)}
            className="w-full px-5 sm:px-6 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
          >
            <span className="text-[12px] font-semibold text-foreground">
              Legacy fields
            </span>
            <span className="text-[11px] text-muted-foreground">
              reading level &middot; example sentences
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {legacyOpen ? "Hide" : "Show"}
            </span>
          </button>
          {legacyOpen && (
            <div className="px-5 sm:px-6 py-5 space-y-5 border-t">
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                These fields predate the v2 schema. The Assistant still reads
                them; the primary form above is canonical going forward.
              </p>
              <BrandDnaTextField
                label="Reading Level"
                initialValue={initial.reading_level}
                onSave={bind(save, "reading_level")}
                placeholder="e.g. college"
                widthClass="w-60"
              />
              <BrandDnaTextareaField
                label="Example: bad sentence"
                initialValue={initial.example_bad_sentence}
                onSave={bind(save, "example_bad_sentence")}
                rows={3}
                placeholder="A sentence the brand would never write."
              />
              <BrandDnaTextareaField
                label="Example: good sentence"
                initialValue={initial.example_good_sentence}
                onSave={bind(save, "example_good_sentence")}
                rows={3}
                placeholder="A sentence the brand would actually write."
              />
            </div>
          )}
        </section>
      )}

      <BrandDnaFormFooter
        lastEditedAt={lastEditedAt}
        lastEditedBy={lastEditedBy}
      />
    </>
  );
}
