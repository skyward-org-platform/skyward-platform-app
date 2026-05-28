// Phase 6 Tracking surface — sitewide / URL / keyword views + change
// annotations. v1 reads from metric_snapshot + change_annotation; both
// tables are empty today so every sub-view ships with an empty state.

import { supabase } from "@/lib/supabase";
import {
  getSiteSnapshots,
  getUrlSummaries,
  getKeywordSummaries,
  getAnnotations,
} from "@/lib/tracking";
import { TrackingTabs } from "@/components/tracking/TrackingTabs";
import { SitewideView } from "@/components/tracking/SitewideView";
import { UrlsView } from "@/components/tracking/UrlsView";
import { KeywordsView } from "@/components/tracking/KeywordsView";

const DAYS = 90;
const TOP_N = 25;

async function getProperty(slug: string) {
  const { data } = await supabase
    .from("property")
    .select("id, primary_domain, name")
    .eq("slug", slug)
    .single();
  return data ?? null;
}

export default async function TrackingTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Property not found.</div>
    );
  }

  const [snapshots, urlSummaries, keywordSummaries, annotations] =
    await Promise.all([
      getSiteSnapshots(prop.id, DAYS),
      getUrlSummaries(prop.id, DAYS, TOP_N),
      getKeywordSummaries(prop.id, DAYS, TOP_N),
      getAnnotations(prop.id, DAYS),
    ]);

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <header className="mb-5">
        <h1 className="text-lg font-semibold">Tracking</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Daily metrics by site / URL / keyword with operator annotations
          overlaid. Last {DAYS} days · top {TOP_N} URLs &amp; keywords.
        </p>
      </header>

      <TrackingTabs
        site={
          <SitewideView
            propertySlug={slug}
            snapshots={snapshots}
            annotations={annotations}
          />
        }
        urls={<UrlsView rows={urlSummaries} annotations={annotations} />}
        keywords={
          <KeywordsView rows={keywordSummaries} annotations={annotations} />
        }
      />
    </div>
  );
}
