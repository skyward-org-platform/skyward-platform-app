import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Client = { id: string; slug: string; name: string };
type Property = {
  id: string;
  client_id: string;
  slug: string;
  name: string;
  pipeline_phase: number;
};

async function fetchSidebar() {
  const { data: clients } = await supabase
    .from("client")
    .select("id, slug, name")
    .eq("status", "active")
    .order("name");
  const { data: properties } = await supabase
    .from("property")
    .select("id, client_id, slug, name, pipeline_phase")
    .eq("status", "active")
    .order("name");
  return { clients: (clients ?? []) as Client[], properties: (properties ?? []) as Property[] };
}

function PhaseBadge({ phase }: { phase: number }) {
  const color =
    phase >= 4
      ? "bg-emerald-100 text-emerald-700"
      : phase >= 2
      ? "bg-blue-100 text-blue-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${color}`}>
      P{phase}
    </span>
  );
}

export default async function Sidebar() {
  const { clients, properties } = await fetchSidebar();
  const propsByClient = new Map<string, Property[]>();
  for (const p of properties) {
    if (!propsByClient.has(p.client_id)) propsByClient.set(p.client_id, []);
    propsByClient.get(p.client_id)!.push(p);
  }

  return (
    <aside className="w-64 shrink-0 border-r bg-slate-50/50 h-screen sticky top-0 flex flex-col">
      <div className="p-4 border-b">
        <div className="font-bold text-sm tracking-tight">Skyward SEO</div>
        <div className="text-[10px] text-slate-500">v0.1 prototype</div>
      </div>

      <nav className="px-2 py-3 text-sm">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1">
          Workspace
        </div>
        <Link href="/" className="block px-2 py-1.5 rounded hover:bg-slate-100">
          🏠 Home
        </Link>
        <div className="block px-2 py-1.5 text-slate-400">⚡ Signals</div>
        <div className="block px-2 py-1.5 text-slate-400">▶ Runs</div>
      </nav>

      <div className="px-2 py-3 text-sm flex-1 overflow-y-auto">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1">
          Properties
        </div>
        {clients.map((c) => {
          const ps = propsByClient.get(c.id) ?? [];
          if (ps.length === 0) return null;
          if (ps.length === 1) {
            const p = ps[0];
            return (
              <Link
                key={p.id}
                href={`/properties/${p.slug}`}
                className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-100"
              >
                <span>{p.name}</span>
                <PhaseBadge phase={p.pipeline_phase} />
              </Link>
            );
          }
          return (
            <div key={c.id} className="mt-1">
              <div className="px-2 py-1 text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>{c.name}</span>
                <span className="text-[10px] text-slate-400">{ps.length}</span>
              </div>
              <div className="ml-2">
                {ps.map((p) => (
                  <Link
                    key={p.id}
                    href={`/properties/${p.slug}`}
                    className="flex items-center justify-between px-2 py-1 rounded hover:bg-slate-100"
                  >
                    <span className="text-slate-700">{p.name}</span>
                    <PhaseBadge phase={p.pipeline_phase} />
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t text-xs text-slate-500">Paul Skirbe</div>
    </aside>
  );
}
