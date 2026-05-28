// Tracking skeleton — tab strip + 4 tiles + chart + table placeholders.

export default function TrackingLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-6xl animate-pulse">
      <div className="h-5 w-32 bg-muted/40 rounded mb-1" />
      <div className="h-3 w-72 bg-muted/30 rounded mb-6" />

      <div className="border-b mb-6 flex gap-2 pb-2">
        <div className="h-7 w-24 bg-muted/40 rounded" />
        <div className="h-7 w-24 bg-muted/30 rounded" />
        <div className="h-7 w-24 bg-muted/30 rounded" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 bg-card">
            <div className="h-3 w-20 bg-muted/40 rounded" />
            <div className="h-7 w-24 bg-muted/30 rounded mt-2" />
            <div className="h-3 w-16 bg-muted/20 rounded mt-2" />
          </div>
        ))}
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="px-4 py-2 h-9 bg-muted/30" />
        <div className="h-56 bg-muted/10" />
      </div>

      <div className="mt-6 border rounded-lg overflow-hidden bg-card">
        <div className="h-9 bg-muted/30" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-3 py-2 border-t flex items-center gap-3">
            <div className="h-3 w-16 bg-muted/40 rounded" />
            <div className="h-4 w-16 bg-muted/30 rounded" />
            <div className="h-3 flex-1 bg-muted/30 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
