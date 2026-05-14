// /properties/[slug]/projects — BQ Meta projects matched to this property by domain.
// Read-only. Project metadata stays in BQ Meta until Adam migrates it to Supabase.

type ProjectRow = {
  project_id: number;
  client_id: number;
  project_type: string;
  project_name: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  matched_domain: string;
  role: string | null;
  priority: string | null;
};

type PropertyRow = {
  id: string;
  slug: string;
  name: string;
  primary_domain: string;
  additional_domains: string[] | null;
  url_prefix: string | null;
};

type Response = {
  property: PropertyRow;
  projects: ProjectRow[];
  matched_on_domains: string[];
  count: number;
};

async function fetchProjects(slug: string): Promise<Response | { error: string }> {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  const res = await fetch(`${base}/api/properties/${slug}/projects`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    return { error: body.error ?? `HTTP ${res.status}` };
  }
  return (await res.json()) as Response;
}

function StatusPill({ status }: { status: string | null }) {
  const color =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : status === "completed"
      ? "bg-blue-100 text-blue-700"
      : status === "paused"
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${color}`}>
      {status ?? "—"}
    </span>
  );
}

export default async function ProjectsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await fetchProjects(slug);

  if ("error" in data) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="p-3 border border-red-200 bg-red-50 text-red-800 text-sm rounded">
          <div className="font-semibold mb-1">Couldn&rsquo;t load projects.</div>
          <div className="font-mono text-xs">{data.error}</div>
        </div>
      </div>
    );
  }

  const { projects, matched_on_domains } = data;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-4">
        <div className="text-xs text-slate-500">
          Sourced from BigQuery Meta · matched on{" "}
          {matched_on_domains.map((d, i) => (
            <span key={d}>
              <code className="bg-slate-100 px-1 rounded text-[11px]">{d}</code>
              {i < matched_on_domains.length - 1 && ", "}
            </span>
          ))}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="text-sm text-slate-500 border rounded bg-white p-6">
          <div className="font-medium text-slate-700 mb-1">No projects yet.</div>
          <div className="text-xs">
            Projects are tracked in BigQuery Meta. When Adam (or the pipeline)
            creates a project linked to one of this property&rsquo;s domains, it
            will appear here.
          </div>
        </div>
      ) : (
        <div className="border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Matched on</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-left px-3 py-2">Priority</th>
                <th className="text-left px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={`${p.project_id}-${p.matched_domain}`} className="border-t">
                  <td className="px-3 py-2 text-slate-600">{p.project_type}</td>
                  <td className="px-3 py-2">{p.project_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    <code className="bg-slate-50 px-1 rounded">{p.matched_domain}</code>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{p.role ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{p.priority ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
