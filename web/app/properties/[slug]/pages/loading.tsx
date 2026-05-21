// Pages-tab specific skeleton. Renders the unified Pages header + sub-tab
// strip + a placeholder table immediately so the BigQuery + Supabase
// fetches don't blank the screen during navigation.

export default function PagesLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-7xl animate-pulse">
      <div className="h-7 w-32 bg-muted/60 rounded" />
      <div className="h-4 w-2/3 bg-muted/40 rounded mt-2" />

      <div className="h-4 w-1/3 bg-muted/30 rounded mt-4" />

      <div className="border-b mt-5 mb-5 flex gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-9 w-24 bg-muted/30 rounded-t" />
        ))}
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="px-5 py-3 border-b h-10 bg-muted/30" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="border-t px-5 py-2.5 flex items-center gap-3">
            <div className="h-3 w-4/12 bg-muted/40 rounded" />
            <div className="h-3 w-1/12 bg-muted/40 rounded" />
            <div className="h-3 w-1/12 bg-muted/40 rounded" />
            <div className="h-3 w-2/12 bg-muted/40 rounded" />
            <div className="h-3 w-1/12 bg-muted/40 rounded" />
            <div className="h-3 w-2/12 bg-muted/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
