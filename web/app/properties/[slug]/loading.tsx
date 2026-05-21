// Shown instantly during navigation to any /properties/[slug]/* route
// while the server fetches data. Renders the property layout's tabstrip
// area as a muted skeleton so the header chrome (sidebar + top nav)
// stays interactive immediately.

export default function PropertyLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <div className="animate-pulse space-y-4">
        <div className="h-7 w-48 bg-muted/60 rounded" />
        <div className="h-4 w-3/5 bg-muted/40 rounded" />
        <div className="h-4 w-2/5 bg-muted/40 rounded" />
        <div className="border-b mt-6 mb-4 flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-24 bg-muted/40 rounded-t"
            />
          ))}
        </div>
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-5 py-3 border-b h-9 bg-muted/30" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="border-t px-5 py-2.5 flex items-center gap-3"
            >
              <div className="h-3 w-3/12 bg-muted/40 rounded" />
              <div className="h-3 w-1/12 bg-muted/40 rounded" />
              <div className="h-3 w-1/12 bg-muted/40 rounded" />
              <div className="h-3 w-4/12 bg-muted/40 rounded" />
              <div className="h-3 w-2/12 bg-muted/40 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
