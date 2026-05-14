// /properties/[slug]/keywords — placeholder.
//
// Lit up by the adaptive-tab logic when an SEO project is active on this
// property. The real keyword surface lands when Adam's keyword aggregate
// pipeline (Phase 3) is ready to write into this app. Schema plan: per the
// May 8 spec, a `keyword` table + `cluster` table + `signal` table in
// Supabase, but BQ Meta retains the raw discovery and scoring layer.

export default async function KeywordsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="p-8 max-w-3xl">
      <div className="border rounded bg-white p-6">
        <div className="text-sm font-semibold text-slate-900 mb-1">
          Keywords — coming soon
        </div>
        <div className="text-xs text-slate-500 mb-3">
          This tab appeared because an SEO project is active on{" "}
          <code className="bg-slate-100 px-1 rounded">{slug}</code> (per BQ
          Meta).
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Adam&rsquo;s Phase 3 keyword aggregate pipeline produces the intake +
          persona keyword universe, plus competitive gap analysis. When that
          lands here, this tab will render the keyword list, cluster
          assignments, and per-keyword opportunity scoring for this property.
        </p>
        <p className="text-xs text-slate-500 mt-4">
          Tracking in{" "}
          <code className="bg-slate-100 px-1 rounded">
            session-notes/2026-05-14-hierarchy-framework-v1.md
          </code>
          .
        </p>
      </div>
    </div>
  );
}
