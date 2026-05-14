// /clients/[id] — single-client detail sourced from BQ Meta via /api/clients/[id].
// Read-only in v1. Edits live in Adam's admin portal during this phase
// (see ~/skyward-platform-app/session-notes/2026-05-14-admin-merge-plan.md).

import Link from "next/link";

type BqClient = {
  client_id: number;
  client_name: string;
  abbreviation: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string | null;
};

type Domain = {
  domain_id: number;
  domain: string;
  domain_name: string | null;
  is_active: boolean;
  is_competitor: boolean;
  priority: string | null;
  notes: string | null;
};

type Project = {
  project_id: number;
  client_id: number;
  project_type: string;
  project_name: string | null;
  notes: string | null;
  status: string | null;
  created_at: string | null;
};

type Detail = {
  client: BqClient;
  owned_domains: Domain[];
  competitor_domains: Domain[];
  projects: Project[];
};

async function fetchClient(id: string): Promise<Detail | { error: string }> {
  const base =
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const res = await fetch(`${base}/api/clients/${id}`, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    return { error: body.error ?? `HTTP ${res.status}` };
  }
  return (await res.json()) as Detail;
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${color}`}
    >
      {children}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <Pill color="bg-emerald-100 text-emerald-700">Active</Pill>
  ) : (
    <Pill color="bg-slate-100 text-slate-600">Inactive</Pill>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 border rounded bg-white">
      <header className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {typeof count === "number" && (
          <div className="text-xs text-slate-500 tabular-nums">{count}</div>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchClient(id);

  if ("error" in data) {
    return (
      <div className="p-8 max-w-3xl">
        <div className="text-xs text-slate-500 mb-2">
          <Link href="/clients" className="hover:underline">
            ← Clients
          </Link>
        </div>
        <div className="p-3 border border-red-200 bg-red-50 text-red-800 text-sm rounded">
          <div className="font-semibold mb-1">Couldn&rsquo;t load client {id}.</div>
          <div className="font-mono text-xs">{data.error}</div>
        </div>
      </div>
    );
  }

  const { client, owned_domains, projects } = data;

  return (
    <div className="p-8 max-w-4xl">
      <div className="text-xs text-slate-500 mb-2">
        <Link href="/clients" className="hover:underline">
          ← Clients
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {client.client_name}
          <StatusPill active={client.is_active} />
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Sourced from BigQuery Meta. Edits live in the{" "}
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

      <Section title="Client details">
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Client ID</dt>
          <dd className="tabular-nums">{client.client_id}</dd>
          <dt className="text-slate-500">Name</dt>
          <dd>{client.client_name}</dd>
          <dt className="text-slate-500">Abbreviation</dt>
          <dd>{client.abbreviation ?? "—"}</dd>
          <dt className="text-slate-500">Notes</dt>
          <dd className="whitespace-pre-wrap">{client.notes ?? "—"}</dd>
          <dt className="text-slate-500">Created</dt>
          <dd className="text-slate-600">
            {client.created_at ? new Date(client.created_at).toLocaleDateString() : "—"}
          </dd>
        </dl>
      </Section>

      <Section title="Owned domains" count={owned_domains.length}>
        {owned_domains.length === 0 ? (
          <div className="text-sm text-slate-500">No owned domains.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">Domain</th>
                <th className="text-left py-1">Name</th>
                <th className="text-left py-1">Priority</th>
                <th className="text-left py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {owned_domains.map((d) => (
                <tr key={d.domain_id} className="border-t">
                  <td className="py-1.5">{d.domain}</td>
                  <td className="py-1.5 text-slate-600">{d.domain_name ?? "—"}</td>
                  <td className="py-1.5 text-slate-600">{d.priority ?? "—"}</td>
                  <td className="py-1.5">
                    <StatusPill active={d.is_active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Competitor domains moved to property/Brand DNA view per the
          2026-05-14 hierarchy framework — they're brand-relative, not
          client-relative. See /properties/[slug]. */}

      <Section title="Projects" count={projects.length}>
        {projects.length === 0 ? (
          <div className="text-sm text-slate-500">No projects yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left py-1">ID</th>
                <th className="text-left py-1">Type</th>
                <th className="text-left py-1">Name</th>
                <th className="text-left py-1">Status</th>
                <th className="text-left py-1">Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.project_id} className="border-t">
                  <td className="py-1.5 tabular-nums">{p.project_id}</td>
                  <td className="py-1.5 text-slate-600">{p.project_type}</td>
                  <td className="py-1.5">{p.project_name ?? "—"}</td>
                  <td className="py-1.5 text-slate-600">{p.status ?? "—"}</td>
                  <td className="py-1.5 text-slate-600">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
