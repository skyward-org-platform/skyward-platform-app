export default function Loading() {
  return (
    <div className="p-8 text-sm text-slate-400">
      <div className="inline-flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-slate-300 animate-pulse" />
        Loading…
      </div>
    </div>
  );
}
