// /properties/[slug]/keywords — empty state.
//
// Lights up via the adaptive-tab logic when an SEO project is active on this
// property. Real keyword surface lands when the Phase 3 keyword aggregate
// pipeline writes into this app. Schema plan: per the May-8 spec, a `keyword`
// table + `cluster` table + `signal` table in Supabase; BQ retains raw
// discovery + scoring.

export default async function KeywordsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <div className="border rounded bg-white p-6">
        <div className="text-sm font-semibold text-slate-900 mb-1">
          Keywords
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          This property has an SEO project, but its keyword analysis
          hasn&rsquo;t been imported here yet. Run the Phase&nbsp;3 keyword
          pipeline against{" "}
          <code className="bg-slate-100 px-1 rounded text-[12px]">{slug}</code>{" "}
          and the cluster / opportunity / forecast tables to populate this tab.
        </p>
        <p className="text-xs text-slate-500 mt-4">
          Status tracked in{" "}
          <code className="bg-slate-100 px-1 rounded">
            session-notes/2026-05-14-hierarchy-framework-v1.md
          </code>
          .
        </p>
      </div>
    </div>
  );
}
