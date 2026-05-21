// Brand DNA Overview skeleton — chat hero + status strip + research card
// placeholders. Critical because the chat hero blocks on getChatHistory +
// getUsageForProperty in addition to the WQA / Brand DNA queries.

export default function BrandDnaLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-4xl animate-pulse">
      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b h-12 bg-muted/30" />
        <div className="px-5 py-4 space-y-3">
          <div className="h-4 w-full bg-muted/30 rounded" />
          <div className="h-4 w-5/6 bg-muted/30 rounded" />
          <div className="h-4 w-4/6 bg-muted/30 rounded" />
          <div className="h-48 bg-muted/10 rounded mt-3" />
        </div>
        <div className="border-t px-5 py-3 h-12 bg-muted/20" />
      </div>

      <div className="border rounded-lg bg-card overflow-hidden mt-5">
        <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-b">
          <div className="h-7 w-48 bg-muted/40 rounded" />
          <div className="h-7 w-40 bg-muted/40 rounded" />
        </div>
        <div className="px-5 py-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-6 w-24 bg-muted/30 rounded-md" />
          ))}
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden mt-5">
        <div className="px-5 py-3.5 border-b h-12 bg-muted/30" />
        <div className="px-5 py-2.5 border-b h-8 bg-muted/20" />
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-5 py-2.5 flex items-center gap-3">
              <div className="size-3.5 bg-muted/40 rounded" />
              <div className="h-3 w-32 bg-muted/40 rounded" />
              <div className="ml-auto h-3 w-20 bg-muted/30 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
