// V2 sidebar — per design-system.md "Sidebar" + screen 2 mockup.
//
// Server component: fetches the static structure (clients + properties +
// counts) and passes the searchable data down to the SearchModal client
// component for ⌘K interaction.

import Link from "next/link";
import { cache } from "react";
import { supabase } from "@/lib/supabase";
import { hasWriteToken } from "@/lib/auth";
import { apiBase } from "@/lib/api-base";
import { signalCount } from "@/lib/signals";
import { SearchTrigger, type SearchItem } from "@/components/SearchModal";

type Client = { id: string; slug: string; name: string };
type Property = {
  id: string;
  client_id: string;
  slug: string;
  name: string;
  pipeline_phase: number;
  status: string;
};

// Sidebar data — React.cache() dedupes within a request. Cross-request
// caching removed (see Next 16 unstable_cache deprecation notes). The
// inner /api/clients fetch still carries its own next.revalidate so the
// BQ-side hit is amortized via Next's fetch cache, not the (now removed)
// unstable_cache wrapper.
const fetchSidebar = cache(
  async () => {
    const [clientsRes, propsRes, bqRes] = await Promise.all([
      supabase
        .from("client")
        .select("id, slug, name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("property")
        .select("id, client_id, slug, name, pipeline_phase, status")
        .eq("status", "active")
        .order("name"),
      (async () => {
        try {
          const r = await fetch(`${apiBase()}/api/clients`, {
            next: { revalidate: 60 },
          });
          if (!r.ok) return 0;
          const j = (await r.json()) as { count: number };
          return j.count ?? 0;
        } catch {
          return 0;
        }
      })(),
    ]);
    return {
      clients: (clientsRes.data ?? []) as Client[],
      properties: (propsRes.data ?? []) as Property[],
      bqClientCount: bqRes,
    };
  },
);

function PhasePill({ phase }: { phase: number }) {
  return (
    <span className="text-[9px] tabular-nums text-muted-foreground bg-card border border-border rounded px-1 py-px">
      P{phase}
    </span>
  );
}

export default async function Sidebar() {
  const signedIn = await hasWriteToken();
  if (!signedIn) return null;

  const [{ clients, properties, bqClientCount }, signals] = await Promise.all([
    fetchSidebar(),
    signalCount(),
  ]);
  const propsByClient = new Map<string, Property[]>();
  for (const p of properties) {
    if (!propsByClient.has(p.client_id)) propsByClient.set(p.client_id, []);
    propsByClient.get(p.client_id)!.push(p);
  }

  // Searchable index — passed to SearchModal for ⌘K filtering.
  const searchItems: SearchItem[] = [
    ...clients.map((c) => ({
      kind: "client" as const,
      label: c.name,
      href: `/clients/${c.slug}`,
      meta: "Client",
    })),
    ...properties.map((p) => {
      const c = clients.find((x) => x.id === p.client_id);
      return {
        kind: "property" as const,
        label: p.name,
        href: `/properties/${p.slug}`,
        meta: c ? `Property · ${c.name}` : "Property",
      };
    }),
  ];

  return (
    <aside className="w-[248px] shrink-0 border-r bg-sidebar h-screen sticky top-0 flex flex-col">
      {/* Brand */}
      <div className="px-4 pt-[18px] pb-[14px] border-b border-sidebar-border flex items-center gap-2.5">
        <div className="size-7 rounded-md bg-foreground text-background flex items-center justify-center font-semibold text-[13px]">
          S
        </div>
        <div>
          <div className="font-semibold text-sm tracking-tight">
            Skyward Platform
          </div>
          <div className="text-[10px] text-muted-foreground tracking-wide">
            v2 prototype
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <SearchTrigger items={searchItems} />
      </div>

      {/* Workspace group */}
      <nav className="px-2 text-sm">
        <SbHeading>Workspace</SbHeading>
        <SbItem href="/" icon="⌂" label="Dashboard" />
        <SbItem href="/clients" icon="◉" label="Clients" count={bqClientCount} />
        <SbItem href="/activity" icon="≈" label="Activity" />
        <SbItem href="/signals" icon="⚡" label="Signals" count={signals} />
      </nav>

      {/* Properties group */}
      <div className="px-2 py-2 text-sm flex-1 overflow-y-auto">
        <SbHeading>Properties</SbHeading>
        {clients.map((c) => {
          const ps = propsByClient.get(c.id) ?? [];
          if (ps.length === 0) return null;
          const showClientHeader = ps.length > 1;
          return (
            <div key={c.id} className="mt-0.5">
              {showClientHeader && (
                <div className="text-[11px] font-medium text-muted-foreground px-2 pt-2 pb-1 flex items-center gap-1.5">
                  <span>{c.name}</span>
                  <span className="text-[9px] text-muted-foreground/60">▾</span>
                </div>
              )}
              <div className={showClientHeader ? "" : ""}>
                {ps.map((p) => (
                  <PropertyLink key={p.id} property={p} indent={showClientHeader} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-sidebar-border flex items-center gap-2.5">
        <div className="size-[26px] rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-white font-semibold text-[11px]">
          PS
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs">Paul Skirbe</div>
          <div className="text-[10px] text-muted-foreground">Managing Partner</div>
        </div>
        <Link
          href="/auth"
          className="text-[10px] text-muted-foreground/70 hover:text-foreground"
        >
          sign out
        </Link>
      </div>
    </aside>
  );
}

function SbHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 px-2 pt-3 pb-1.5">
      {children}
    </div>
  );
}

function SbItem({
  href,
  icon,
  label,
  count,
}: {
  href: string;
  icon: string;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded text-foreground hover:bg-sidebar-accent"
    >
      <span className="w-3.5 text-muted-foreground inline-flex justify-center">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </Link>
  );
}

function PropertyLink({
  property: p,
  indent,
}: {
  property: Property;
  indent: boolean;
}) {
  const dotCls =
    p.status === "active"
      ? "bg-emerald-500"
      : p.status === "prospect"
      ? "bg-sky-500"
      : "bg-slate-400";
  return (
    <Link
      href={`/properties/${p.slug}`}
      className={`flex items-center px-2 py-1 rounded hover:bg-sidebar-accent text-xs ${
        indent ? "pl-5" : ""
      }`}
    >
      <span className={`size-[5px] rounded-full ${dotCls} mr-2`} />
      <span className="flex-1 min-w-0 truncate">{p.name}</span>
      <PhasePill phase={p.pipeline_phase ?? 0} />
    </Link>
  );
}
