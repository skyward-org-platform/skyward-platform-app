"use client";

// Site Structure form — strategic IA intent (distinct from the empirical
// Screaming Frog crawl). Captures URL patterns, hub-spoke models, content
// strategy, and technical constraints the Assistant needs when proposing
// new URLs or templates.

import type { SiteStructureInitial } from "@/app/properties/[slug]/brand-dna/site-structure/page";
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

export function SiteStructureForm({
  initial,
  save,
  lastEditedAt,
  lastEditedBy,
  source,
}: {
  initial: SiteStructureInitial;
  save: SaveFn;
  lastEditedAt: string | null;
  lastEditedBy: string | null;
  source: string | null;
}) {
  return (
    <>
      <BrandDnaFormCard
        source={source}
        title="Site Structure"
        subcopy={
          <>
            The intended information architecture &mdash; URL patterns,
            hub-spoke models, content strategy, technical constraints. The
            empirical crawl lives in{" "}
            <strong className="text-foreground">Pages</strong>; this is the
            policy the Assistant follows when proposing new URLs.
          </>
        }
      >
        <BrandDnaTextField
          label="CMS / platform"
          initialValue={initial.cms}
          onSave={bind(save, "cms")}
          placeholder="e.g. WordPress, Webflow, Shopify, custom Next.js"
        />
        <BrandDnaChipsField
          label="Top-level navigation"
          initialValue={initial.top_level_sections}
          onSave={bind(save, "top_level_sections")}
          placeholder="+ add (Home, Services, Locations, About…)"
        />
        <BrandDnaTextareaField
          label="URL conventions"
          initialValue={initial.url_conventions}
          onSave={bind(save, "url_conventions")}
          rows={4}
          placeholder='e.g. lowercase hyphen-separated; max depth 3; locations use /locations/<state>/<city>/; services use /services/<service-name>/'
        />
        <BrandDnaTextareaField
          label="Hub-and-spoke architecture"
          initialValue={initial.hub_spoke_pattern}
          onSave={bind(save, "hub_spoke_pattern")}
          rows={5}
          placeholder="Which pages are hubs, which spoke off them. e.g. /services/ hubs each service; each service page hubs comparison + FAQ + case-study spokes."
        />
        <BrandDnaTextareaField
          label="Service area page strategy"
          initialValue={initial.service_area_strategy}
          onSave={bind(save, "service_area_strategy")}
          rows={4}
          placeholder='e.g. "One page per city for top-3 services; matrix avoided to keep content honest" — or "no location pages, single national footprint"'
        />
        <BrandDnaTextareaField
          label="Blog / content strategy"
          initialValue={initial.blog_strategy}
          onSave={bind(save, "blog_strategy")}
          rows={4}
          placeholder="Purpose of /blog: SEO ranking, thought leadership, support. Cadence, content types, who writes."
        />
        <BrandDnaTextareaField
          label="Internal linking rules"
          initialValue={initial.internal_linking_rules}
          onSave={bind(save, "internal_linking_rules")}
          rows={4}
          placeholder="Anchor text conventions, where to link from (e.g. always link service mentions in blog posts to the canonical service page)."
        />
        <BrandDnaTextField
          label="Subdomain vs subdirectory"
          initialValue={initial.subdomain_policy}
          onSave={bind(save, "subdomain_policy")}
          placeholder='e.g. "All content stays on root domain — no subdomains"'
        />
        <BrandDnaTextareaField
          label="Technical constraints"
          initialValue={initial.technical_constraints}
          onSave={bind(save, "technical_constraints")}
          rows={4}
          placeholder="What can't be changed easily — legacy URLs, redirect rules, template limitations, no-touch sections."
        />
        <BrandDnaTextareaField
          label="Crawl notes"
          initialValue={initial.crawl_notes}
          onSave={bind(save, "crawl_notes")}
          rows={3}
          placeholder="Last Screaming Frog crawl date, link to artifact, known crawl issues, sections excluded from the crawl."
        />
      </BrandDnaFormCard>
      <BrandDnaFormFooter
        lastEditedAt={lastEditedAt}
        lastEditedBy={lastEditedBy}
      />
    </>
  );
}
