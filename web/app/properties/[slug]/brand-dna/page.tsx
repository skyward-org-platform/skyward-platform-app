// /properties/[slug]/brand-dna — Brand DNA Overview (v2 screen 5).
//
// V1.1 scope: Completeness card with the 12-section checklist. The
// Assistant chat card and Research & Fill pipeline card are V2 horizon —
// both need backend integration that doesn't exist yet. See the rationale
// in handoff/design/v2-screens.md screen 5.

import Link from "next/link";
import {
  COMPLETENESS_SECTIONS,
  subnavSlugForSection,
} from "@/lib/brand-dna-subnav";
import { ResearchAndFill } from "@/components/ResearchAndFill";
import { RESEARCHABLE_SECTIONS } from "@/lib/research";
import { BrandDnaAssistant } from "@/components/BrandDnaAssistant";
import { getPropertyBySlug } from "@/lib/property";
import {
  getAllSections,
  getCachedChatHistory,
  getCachedUsageForProperty,
} from "@/lib/brand-dna-data";

function computeFilled(
  sections: Awaited<ReturnType<typeof getAllSections>>,
): Set<string> {
  const filled = new Set<string>();
  for (const row of sections) {
    const hasBody = !!row.body && row.body.trim().length > 0;
    const hasContent =
      !!row.content &&
      Object.values(row.content).some(
        (v) =>
          v !== null &&
          v !== undefined &&
          v !== "" &&
          !(Array.isArray(v) && v.length === 0),
      );
    if (hasBody || hasContent) filled.add(row.section);
  }
  return filled;
}

export default async function BrandDnaOverview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Property metadata, sections, chat, usage — all four fetches are
  // independently cached. Promise.all fires them in parallel; warm-cache
  // hits return in < 5ms each.
  const [prop, sections, initialChatMessages, usage] = await Promise.all([
    getPropertyBySlug(slug),
    getAllSections(slug),
    getCachedChatHistory(slug),
    getCachedUsageForProperty(slug),
  ]);
  const domain = prop?.primary_domain ?? null;
  const name = prop?.name ?? slug;
  const filled = computeFilled(sections);
  const completeCount = COMPLETENESS_SECTIONS.filter((s) =>
    filled.has(s.key),
  ).length;
  const total = COMPLETENESS_SECTIONS.length;
  const pct = Math.round((completeCount / total) * 100);
  const nextUp = COMPLETENESS_SECTIONS.find((s) => !filled.has(s.key));

  // Build the section list the Research & Fill card uses. Each entry pairs
  // a label with whether the section already has content (drives the
  // default checkbox selection).
  const researchableSections = RESEARCHABLE_SECTIONS.map((key) => {
    const completeness = COMPLETENESS_SECTIONS.find((c) => c.key === key);
    return {
      key,
      label: completeness?.label ?? key.replace(/_/g, " "),
      filled: filled.has(key),
    };
  });

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      {/* Hero: the Brand DNA Brain. Per the auto-SEO reference, talking to
          the assistant IS the primary fill mechanism — not the chips. */}
      <BrandDnaAssistant
        propertySlug={slug}
        propertyName={name}
        hasContent={completeCount > 0}
        initialMessages={initialChatMessages}
        prominent
      />

      {/* Compact status strip — completeness on the left, AI usage on the
          right. Both always rendered so placement stays consistent across
          properties (no layout shift between empty and used). Chips below. */}
      <section className="mt-5 border rounded-lg bg-card overflow-hidden">
        <header className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 border-b">
          {/* Completeness side */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[28px] font-semibold tracking-tight tabular-nums leading-none">
              {pct}
            </span>
            <span className="text-base text-muted-foreground">%</span>
            <span className="text-[12px] text-muted-foreground ml-1 tabular-nums">
              · {completeCount} of {total} sections
            </span>
            {nextUp && (
              <span className="text-[11px] text-muted-foreground tabular-nums uppercase tracking-wider ml-2">
                · Next:{" "}
                <SubnavLink
                  slug={slug}
                  section={nextUp.key}
                  label={nextUp.label}
                />
              </span>
            )}
            {!nextUp && (
              <span className="text-[12px] text-emerald-700 ml-2">
                · All sections filled
              </span>
            )}
          </div>

          {/* Usage side — separator on the left at >=sm widths. */}
          <div className="sm:border-l sm:pl-5 flex items-baseline gap-2 flex-wrap">
            <span className="text-[20px] font-semibold tracking-tight tabular-nums leading-none">
              ${usage.totalCostUsd.toFixed(4)}
            </span>
            <span className="text-[12px] text-muted-foreground tabular-nums">
              ·{" "}
              {usage.totalCalls === 0
                ? "no AI calls yet"
                : `${usage.totalCalls.toLocaleString()} call${
                    usage.totalCalls === 1 ? "" : "s"
                  } · ${usage.totalInputTokens.toLocaleString()} in / ${usage.totalOutputTokens.toLocaleString()} out`}
            </span>
            <span
              className="text-[10px] text-muted-foreground/70 uppercase tracking-wider ml-1"
              title="Cost computed via skyward.llm.costs in api/llm/calculate-cost.py"
            >
              · skyward.llm
            </span>
          </div>
        </header>

        {usage.byAgent.length > 0 && (
          <div className="px-5 py-2 border-b flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              By agent
            </span>
            {usage.byAgent.map((a) => (
              <span
                key={a.agent}
                className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded bg-muted/60 tabular-nums"
                title={`${a.calls} call${a.calls === 1 ? "" : "s"}`}
              >
                <span className="text-muted-foreground">{a.agent}</span>
                <span className="font-semibold">${a.cost.toFixed(4)}</span>
              </span>
            ))}
          </div>
        )}

        <div className="px-5 py-3 flex flex-wrap gap-1.5">
          {COMPLETENESS_SECTIONS.map((s) => (
            <CompletenessChip
              key={s.key}
              slug={slug}
              section={s.key}
              label={s.label}
              filled={filled.has(s.key)}
            />
          ))}
        </div>
      </section>

      <div className="mt-5">
        <ResearchAndFill
          propertySlug={slug}
          domain={domain}
          sections={researchableSections}
        />
      </div>
    </div>
  );
}

function CompletenessChip({
  slug,
  section,
  label,
  filled,
}: {
  slug: string;
  section: string;
  label: string;
  filled: boolean;
}) {
  const subnavSlug = subnavSlugForSection(section);
  const href = subnavSlug
    ? `/properties/${slug}/brand-dna/${subnavSlug}`
    : null;
  const base =
    "inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md font-medium";
  const filledCls = "bg-emerald-50 text-emerald-700";
  const emptyCls =
    "border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40";
  const cls = `${base} ${filled ? filledCls : emptyCls}`;
  const dot = (
    <span
      className={`size-1.5 rounded-full ${filled ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
    />
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {dot}
        {label}
      </Link>
    );
  }
  return (
    <span className={cls}>
      {dot}
      {label}
    </span>
  );
}

function SubnavLink({
  slug,
  section,
  label,
}: {
  slug: string;
  section: string;
  label: string;
}) {
  const subnavSlug = subnavSlugForSection(section);
  if (!subnavSlug) {
    return (
      <span className="text-[13px] font-medium text-muted-foreground">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/properties/${slug}/brand-dna/${subnavSlug}`}
      className="inline-block text-[13px] font-medium text-foreground hover:underline"
    >
      {label} →
    </Link>
  );
}
