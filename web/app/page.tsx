export default function Home() {
  return (
    <div className="p-12 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Welcome.</h1>
      <p className="text-slate-600">
        Pick a property from the sidebar to see its Brand DNA + Pages.
      </p>
      <p className="text-slate-500 text-sm mt-8">
        This is a prototype slice of the SEO Platform UI. Read-only. No auth.
        Connected to <code>seo-platform-dev</code> Supabase.
      </p>
    </div>
  );
}
