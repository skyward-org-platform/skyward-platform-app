// /clients — list view sourced from BQ Meta via the /api/clients Python function.
// Disconnected from Supabase. The "no duplication" rule (2026-05-14): clients live in
// BQ Meta until Adam migrates them; this page renders that data, doesn't copy it.

import Link from "next/link";

type BqClient = {
  client_id: number;
  client_name: string;
  abbreviation: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string | null;
  domain_count?: number;
  competitor_count?: number;
  project_count?: number;
};

async function fetchClients(): Promise<BqClient[]> {
  // Same-host fetch from the Python function. cache: no-store so we always see fresh
  // BQ Meta state (Adam's admin portal is the write surface for now).
  const base =
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${base}/api/clients?include_counts=true`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { clients: BqClient[] };
  return data.clients;
}

export default async function ClientsPage() {
  let clients: BqClient[] = [];
  let error: string | null = null;
  try {
    clients = await fetchClients();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Clients</h1>
        <p className="text-sm text-slate-500 mt-1">
          Sourced from BigQuery Meta via{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">skyward-common</code>. Write
          operations (add, edit, deactivate) live in the{" "}
          <a
            href="https://github.com/skyward-org-platform/skyward-platform"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            admin portal
          </a>{" "}
          during this phase.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 text-red-800 text-sm rounded">
          <div className="font-semibold mb-1">Couldn&rsquo;t load clients.</div>
          <div className="font-mono text-xs">{error}</div>
          <div className="text-xs mt-2 text-red-700">
            Check that <code>GCP_DATAHUB_PROJECT_ID</code> and{" "}
            <code>GCP_SERVICE_ACCOUNT_JSON</code> are set in Vercel env (and that the
            service account has BigQuery Job User + Data Viewer on{" "}
            <code>data-hub-468216.Meta</code>).
          </div>
        </div>
      )}

      {!error && clients.length === 0 && (
        <div className="text-slate-500 text-sm">No clients returned.</div>
      )}

      {clients.length > 0 && (
        <div className="border rounded bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Client</th>
                <th className="text-left px-3 py-2">Abbr.</th>
                <th className="text-right px-3 py-2">Domains</th>
                <th className="text-right px-3 py-2">Competitors</th>
                <th className="text-right px-3 py-2">Projects</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.client_id} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${c.client_id}`}
                      className="text-slate-900 hover:underline"
                    >
                      {c.client_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{c.abbreviation ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.domain_count ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.competitor_count ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {c.project_count ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        c.is_active
                          ? "text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"
                          : "text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                      }
                    >
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
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
