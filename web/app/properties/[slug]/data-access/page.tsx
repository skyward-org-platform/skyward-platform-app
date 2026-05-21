// Data Access — per-property infrastructure config for the SEO pipeline's
// data sources. BQ-backed sources (GSC, GMB, GA4, Facebook) are sourced
// from skyward-common's Meta.client_datasets table — skyward-common is the
// canonical registry of which BigQuery datasets belong to which client.
// Non-BQ sources (Google Ads ID, Screaming Frog crawl, Client Keyword
// Data) live in property.data_access since they have no Meta concept.

import { supabase } from "@/lib/supabase";
import { apiBase } from "@/lib/api-base";
import { DataAccessTable } from "@/components/DataAccessTable";

type PropertyRow = {
  id: string;
  primary_domain: string | null;
  data_access: Record<string, Record<string, string>> | null;
};

export type RegisteredDataset = {
  dataset_id: string;
  hostname: string | null;
  is_active: boolean;
  notes: string | null;
  tables: {
    table_id: string;
    row_count: number;
    size_bytes: number;
    last_modified: string | null;
  }[];
};

export type CommonSourcesResponse = {
  ok: boolean;
  client: { id: number; name: string } | null;
  domain: { id: number; domain: string } | null;
  sources: {
    gsc: RegisteredDataset[];
    gmb: RegisteredDataset[];
    ga4: RegisteredDataset[];
    facebook: RegisteredDataset[];
  };
  error?: string;
};

async function getProperty(slug: string): Promise<PropertyRow | null> {
  const { data } = await supabase
    .from("property")
    .select("id, primary_domain, data_access")
    .eq("slug", slug)
    .single();
  return (data as PropertyRow | null) ?? null;
}

async function getRegisteredSources(
  domain: string,
): Promise<CommonSourcesResponse | { ok: false; error: string }> {
  const token = process.env.APP_WRITE_TOKEN;
  try {
    const res = await fetch(
      `${apiBase()}/api/data-access/sources?domain=${encodeURIComponent(
        domain,
      )}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return (await res.json()) as CommonSourcesResponse;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default async function DataAccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const prop = await getProperty(slug);
  if (!prop) return null;

  const registered = prop.primary_domain
    ? await getRegisteredSources(prop.primary_domain)
    : { ok: false as const, error: "Property has no primary_domain." };

  const sourcesOk = "sources" in registered && registered.ok;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Data Access</h1>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Infrastructure config for the SEO pipeline&rsquo;s data sources.
          BigQuery-backed sources (GSC, GMB, GA4, Facebook) are read from{" "}
          <code className="bg-muted px-1 rounded text-xs">
            skyward-common
          </code>
          &rsquo;s{" "}
          <code className="bg-muted px-1 rounded text-xs">
            Meta.client_datasets
          </code>{" "}
          — that&rsquo;s the canonical registry of which datasets belong to
          which client. Non-BQ sources (Ads, crawl, keyword data) live on the
          property record itself.
        </p>
        {sourcesOk && registered.client && (
          <p className="text-[12px] text-muted-foreground mt-2 tabular-nums">
            Matched <strong className="text-foreground">{prop.primary_domain}</strong>{" "}
            → client{" "}
            <strong className="text-foreground">
              {registered.client.name}
            </strong>{" "}
            (id {registered.client.id})
          </p>
        )}
        {sourcesOk && !registered.client && (
          <p className="text-[12px] text-amber-700 mt-2">
            <strong>No client match.</strong> The primary domain{" "}
            <code className="bg-amber-50 px-1 rounded text-[11px]">
              {prop.primary_domain}
            </code>{" "}
            wasn&rsquo;t found in{" "}
            <code className="bg-muted px-1 rounded text-[11px]">
              Meta.domains
            </code>{" "}
            — BQ source lookups are skipped until the domain is registered.
          </p>
        )}
        {!sourcesOk && (
          <p className="text-[12px] text-rose-700 mt-2">
            <strong>Couldn&rsquo;t load registered sources:</strong>{" "}
            <span className="font-mono text-[11px]">{registered.error}</span>
          </p>
        )}
      </header>

      <DataAccessTable
        propertySlug={slug}
        primaryDomain={prop.primary_domain}
        registered={
          sourcesOk
            ? registered.sources
            : { gsc: [], gmb: [], ga4: [], facebook: [] }
        }
        overrides={prop.data_access ?? {}}
        clientMatched={!!(sourcesOk && registered.client)}
      />
    </div>
  );
}
