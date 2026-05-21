"use client";

// Data Access table. Two flavors of source:
//
//   - BQ-backed (gsc, gmb, ga4, facebook): rendered from skyward-common's
//     Meta.client_datasets registry. Read-only here; edits go through the
//     admin portal (Meta.client_datasets CRUD). Each registered dataset
//     shows its tables with row counts + last-modified dates, pulled from
//     INFORMATION_SCHEMA — no scan cost, no Check button needed since the
//     metadata IS the check.
//
//   - Non-BQ (ads, crawl, keywords): editable rows backed by the
//     property.data_access jsonb column. Inline auto-save on blur.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  registerClientDataset,
  updateDataAccessField,
} from "@/app/properties/[slug]/data-access/actions";
import type { RegisteredDataset } from "@/app/properties/[slug]/data-access/page";

type BqSourceKey = "gsc" | "gmb" | "ga4" | "facebook";
type LocalSourceKey = "ads" | "crawl" | "keywords";

type BqMeta = {
  label: string;
  description: string;
};
const BQ_META: Record<BqSourceKey, BqMeta> = {
  gsc: {
    label: "Google Search Console",
    description:
      "Organic queries, clicks, impressions. Jepto export lands datasets named jepto_gsc_<client>.",
  },
  gmb: {
    label: "Google My Business",
    description:
      "Calls, directions, reviews. Jepto / Pleper exports land datasets named jepto_gmb_<client>.",
  },
  ga4: {
    label: "Google Analytics 4",
    description:
      "GA4 events + behavior. BQ export datasets named analytics_<property-id> show up here when configured.",
  },
  facebook: {
    label: "Facebook / Meta Ads",
    description:
      "Facebook ad spend + delivery. Jepto export lands datasets named jepto_facebook_<client>.",
  },
};

type LocalMeta = {
  label: string;
  description: string;
  property_id_label: string;
  property_id_placeholder: string;
  notes_placeholder: string;
};
const LOCAL_META: Record<LocalSourceKey, LocalMeta> = {
  ads: {
    label: "Google Ads",
    description:
      "Spend + conversions. Tracked here by Customer ID; not in Meta.client_datasets.",
    property_id_label: "Customer ID",
    property_id_placeholder: "123-456-7890",
    notes_placeholder: "Customer ID format: xxx-xxx-xxxx",
  },
  crawl: {
    label: "Screaming Frog Crawl",
    description:
      "On-page audit artifact. Local file or shared drive; not BQ-backed.",
    property_id_label: "Crawl date",
    property_id_placeholder: "YYYY-MM-DD",
    notes_placeholder: "Crawl date when complete; link to artifact.",
  },
  keywords: {
    label: "Client Keyword Data",
    description:
      "Client-supplied keyword list (CSV / sheet). Tracked here; not BQ-backed.",
    property_id_label: "Upload location",
    property_id_placeholder: "drive://… or supabase-bucket://…",
    notes_placeholder: "Upload location if provided by the client.",
  },
};

const STATUS_OPTIONS = [
  "granted",
  "pending",
  "not_available",
  "completed",
  "blocked",
] as const;

export function DataAccessTable({
  propertySlug,
  primaryDomain,
  registered,
  overrides,
  clientMatched,
}: {
  propertySlug: string;
  primaryDomain: string | null;
  registered: Record<BqSourceKey, RegisteredDataset[]>;
  overrides: Record<string, Record<string, string>>;
  clientMatched: boolean;
}) {
  return (
    <div className="space-y-6">
      <section>
        <SectionHeader
          title="BigQuery-backed sources"
          subtitle="From skyward-common · Meta.client_datasets"
        />
        <div className="space-y-2.5">
          {(Object.keys(BQ_META) as BqSourceKey[]).map((key) => (
            <BqSourceRow
              key={key}
              sourceKey={key}
              meta={BQ_META[key]}
              datasets={registered[key] ?? []}
              primaryDomain={primaryDomain}
              propertySlug={propertySlug}
              canRegister={clientMatched}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Non-BigQuery sources"
          subtitle="Tracked on the property record (property.data_access)"
        />
        <div className="space-y-2.5">
          {(Object.keys(LOCAL_META) as LocalSourceKey[]).map((key) => (
            <LocalSourceRow
              key={key}
              sourceKey={key}
              meta={LOCAL_META[key]}
              initial={readOverride(overrides[key])}
              propertySlug={propertySlug}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="mb-2 flex items-baseline justify-between gap-3 flex-wrap">
      <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        {title}
      </h2>
      <span className="text-[10px] text-muted-foreground/80">{subtitle}</span>
    </header>
  );
}

// ─── BQ-backed source ────────────────────────────────────────────────────

function BqSourceRow({
  sourceKey,
  meta,
  datasets,
  primaryDomain,
  propertySlug,
  canRegister,
}: {
  sourceKey: BqSourceKey;
  meta: BqMeta;
  datasets: RegisteredDataset[];
  primaryDomain: string | null;
  propertySlug: string;
  canRegister: boolean;
}) {
  const [expanded, setExpanded] = useState(datasets.length > 0);
  const status = deriveBqStatus(datasets, primaryDomain);

  return (
    <article className="border rounded-lg bg-card overflow-hidden">
      <header
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((s) => !s)}
      >
        <span className="text-muted-foreground text-xs leading-none w-4 shrink-0">
          {expanded ? "▾" : "▸"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">{meta.label}</div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {datasets.length === 0 ? (
              <span className="italic">Not registered in Meta.client_datasets</span>
            ) : (
              <>
                {datasets.length} dataset{datasets.length === 1 ? "" : "s"} ·{" "}
                <code className="font-mono text-[10px]">
                  {datasets.map((d) => d.dataset_id).join(", ")}
                </code>
              </>
            )}
          </div>
        </div>
        <StatusPill status={status} />
      </header>

      {expanded && (
        <div className="px-4 py-4 space-y-4 border-t bg-muted/10">
          <p className="text-[11.5px] text-muted-foreground leading-relaxed -mt-1">
            {meta.description}
          </p>
          {datasets.length === 0 ? (
            <EmptyDatasetsState sourceKey={sourceKey} />
          ) : (
            <ul className="space-y-3">
              {datasets.map((d) => (
                <DatasetCard
                  key={d.dataset_id}
                  dataset={d}
                  primaryDomain={primaryDomain}
                />
              ))}
            </ul>
          )}
          {canRegister && (
            <RegisterDatasetForm
              propertySlug={propertySlug}
              datasetType={sourceKey}
              primaryDomain={primaryDomain}
            />
          )}
          {!canRegister && (
            <p className="text-[11px] text-muted-foreground italic">
              Register a dataset requires a client match in{" "}
              <code className="bg-muted px-1 rounded text-[10px]">
                Meta.client_domains
              </code>{" "}
              — add the domain there first.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function RegisterDatasetForm({
  propertySlug,
  datasetType,
  primaryDomain,
}: {
  propertySlug: string;
  datasetType: BqSourceKey;
  primaryDomain: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [datasetId, setDatasetId] = useState("");
  const [hostname, setHostname] = useState(primaryDomain ?? "");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function reset() {
    setDatasetId("");
    setHostname(primaryDomain ?? "");
    setNotes("");
    setError(null);
    setWarning(null);
  }

  function submit() {
    if (!datasetId.trim()) {
      setError("Dataset ID is required.");
      return;
    }
    setError(null);
    setWarning(null);
    startTransition(async () => {
      const res = await registerClientDataset(propertySlug, {
        dataset_type: datasetType,
        dataset_id: datasetId.trim(),
        hostname: hostname.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.warning) setWarning(res.warning);
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium px-2.5 py-1 border border-dashed rounded-md text-foreground hover:bg-muted"
      >
        + Register dataset
      </button>
    );
  }

  const prefixes = PREFIX_HINTS[datasetType];

  return (
    <div className="border rounded-md bg-card p-3 space-y-3">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
        Register {BQ_META[datasetType].label} dataset
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <RegField
          label="Dataset ID"
          value={datasetId}
          onChange={setDatasetId}
          placeholder={prefixes[0] + "<client>"}
          autoFocus
        />
        <RegField
          label="Hostname"
          value={hostname}
          onChange={setHostname}
          placeholder={primaryDomain ?? "example.com"}
        />
      </div>
      <RegField
        label="Notes"
        value={notes}
        onChange={setNotes}
        placeholder="Optional — context for future-you."
      />
      <div className="text-[10.5px] text-muted-foreground">
        Conventional prefixes:{" "}
        {prefixes.map((p) => (
          <code key={p} className="bg-muted px-1 rounded text-[10px] mr-1">
            {p}*
          </code>
        ))}
      </div>
      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}
      {warning && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {warning}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-[12px] font-medium px-3 py-1.5 bg-foreground text-background rounded-md hover:bg-foreground/85 disabled:opacity-60"
        >
          {pending ? "Registering…" : "Register"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
          className="text-[12px] font-medium px-3 py-1.5 border rounded-md text-foreground hover:bg-muted disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RegField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </label>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[12px] px-2.5 py-1.5 border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground font-mono"
      />
    </div>
  );
}

const PREFIX_HINTS: Record<BqSourceKey, string[]> = {
  gsc: ["jepto_gsc_", "searchconsole_"],
  gmb: ["jepto_gmb_"],
  ga4: ["analytics_"],
  facebook: ["jepto_facebook_"],
};

function DatasetCard({
  dataset,
  primaryDomain,
}: {
  dataset: RegisteredDataset;
  primaryDomain: string | null;
}) {
  const hostnameMatchesDomain = !!(
    dataset.hostname &&
    primaryDomain &&
    dataset.hostname.toLowerCase() === primaryDomain.toLowerCase()
  );

  return (
    <li className="border rounded-md bg-card p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <code className="font-mono text-[12px] font-semibold">
          {dataset.dataset_id}
        </code>
        {!dataset.is_active && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
            inactive
          </span>
        )}
        {dataset.hostname && (
          <span
            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              hostnameMatchesDomain
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
            title={
              hostnameMatchesDomain
                ? "Hostname matches the property's primary_domain"
                : `Hostname ${dataset.hostname} differs from primary_domain ${primaryDomain ?? "?"}`
            }
          >
            host: {dataset.hostname}
          </span>
        )}
      </div>
      {dataset.notes && (
        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
          {dataset.notes}
        </p>
      )}
      <div className="mt-3">
        {dataset.tables.length === 0 ? (
          <p className="text-[11px] text-amber-700">
            Dataset registered but no tables visible — service account may
            lack BigQuery Data Viewer on this dataset, or it&rsquo;s empty.
          </p>
        ) : (
          <table className="w-full text-[11.5px] tabular-nums">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-1 pr-3 font-medium">Table</th>
                <th className="text-right py-1 px-3 font-medium">Rows</th>
                <th className="text-right py-1 px-3 font-medium">Size</th>
                <th className="text-right py-1 pl-3 font-medium">Last modified</th>
              </tr>
            </thead>
            <tbody>
              {dataset.tables.map((t) => (
                <tr key={t.table_id} className="border-b last:border-b-0">
                  <td className="py-1.5 pr-3 font-mono">{t.table_id}</td>
                  <td className="py-1.5 px-3 text-right">
                    {t.row_count.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-3 text-right text-muted-foreground">
                    {formatBytes(t.size_bytes)}
                  </td>
                  <td className="py-1.5 pl-3 text-right text-muted-foreground">
                    {t.last_modified ? fmtRel(t.last_modified) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </li>
  );
}

function EmptyDatasetsState({ sourceKey: _ }: { sourceKey: BqSourceKey }) {
  return (
    <p className="text-[11.5px] text-muted-foreground leading-relaxed italic">
      No datasets registered for this client yet.
    </p>
  );
}

function deriveBqStatus(
  datasets: RegisteredDataset[],
  primaryDomain: string | null,
):
  | "no_match"
  | "no_tables"
  | "tables_empty"
  | "ok"
  | "hostname_mismatch"
  | "inactive" {
  if (datasets.length === 0) return "no_match";
  const active = datasets.filter((d) => d.is_active);
  if (active.length === 0) return "inactive";
  if (active.every((d) => d.tables.length === 0)) return "no_tables";
  if (active.every((d) => d.tables.every((t) => t.row_count === 0)))
    return "tables_empty";
  const mismatch =
    primaryDomain &&
    active.some(
      (d) =>
        d.hostname && d.hostname.toLowerCase() !== primaryDomain.toLowerCase(),
    );
  if (mismatch) return "hostname_mismatch";
  return "ok";
}

// ─── Non-BQ source ───────────────────────────────────────────────────────

type LocalConfig = {
  status: string;
  property_id: string;
  notes: string;
};

function readOverride(o: Record<string, string> | undefined): LocalConfig {
  return {
    status: o?.status ?? "",
    property_id: o?.property_id ?? "",
    notes: o?.notes ?? "",
  };
}

function LocalSourceRow({
  sourceKey,
  meta,
  initial,
  propertySlug,
}: {
  sourceKey: LocalSourceKey;
  meta: LocalMeta;
  initial: LocalConfig;
  propertySlug: string;
}) {
  const [config, setConfig] = useState<LocalConfig>(initial);
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setConfig(initial);
  }, [initial]);

  function persistField(fieldKey: keyof LocalConfig, value: string) {
    setConfig((c) => ({ ...c, [fieldKey]: value }));
    startTransition(async () => {
      const res = await updateDataAccessField(
        propertySlug,
        sourceKey,
        fieldKey,
        value,
      );
      if (!res.ok) {
        console.error(`Save failed for ${sourceKey}.${fieldKey}:`, res.error);
      }
    });
  }

  const status = deriveLocalStatus(config);

  return (
    <article className="border rounded-lg bg-card overflow-hidden">
      <header
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((s) => !s)}
      >
        <span className="text-muted-foreground text-xs leading-none w-4 shrink-0">
          {expanded ? "▾" : "▸"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">{meta.label}</div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {config.property_id || (
              <span className="italic">No identifier configured</span>
            )}
          </div>
        </div>
        <StatusPill status={status} />
      </header>

      {expanded && (
        <div className="px-4 py-4 space-y-4 border-t bg-muted/10">
          <p className="text-[11.5px] text-muted-foreground leading-relaxed -mt-1">
            {meta.description}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldSelect
              label="Status"
              value={config.status}
              options={STATUS_OPTIONS}
              onSave={(v) => persistField("status", v)}
              placeholder="Set status…"
            />
            <FieldText
              label={meta.property_id_label}
              value={config.property_id}
              onSave={(v) => persistField("property_id", v)}
              placeholder={meta.property_id_placeholder}
            />
          </div>
          <FieldText
            label="Notes"
            value={config.notes}
            onSave={(v) => persistField("notes", v)}
            placeholder={meta.notes_placeholder}
          />
        </div>
      )}
    </article>
  );
}

type LocalStatus =
  | "ok"
  | "configured"
  | "partial"
  | "missing"
  | "not_available"
  | "pending";

function deriveLocalStatus(c: LocalConfig): LocalStatus {
  if (c.status === "not_available") return "not_available";
  if (c.status === "pending") return "pending";
  if (c.status === "completed" || c.status === "granted") {
    if (c.property_id) return "ok";
    return "partial";
  }
  if (c.property_id) return "configured";
  return "missing";
}

// ─── Status pill ─────────────────────────────────────────────────────────

type PillStatus =
  | ReturnType<typeof deriveBqStatus>
  | LocalStatus;

const PILL: Record<PillStatus, { label: string; band: string; dot: string }> = {
  ok: {
    label: "Connected",
    band: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  configured: {
    label: "Configured",
    band: "bg-slate-50 text-slate-700 border-slate-200",
    dot: "bg-slate-500",
  },
  partial: {
    label: "Partial",
    band: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  missing: {
    label: "Not set up",
    band: "bg-muted text-muted-foreground border",
    dot: "bg-muted-foreground/40",
  },
  not_available: {
    label: "Not available",
    band: "bg-muted text-muted-foreground border",
    dot: "bg-muted-foreground/40",
  },
  pending: {
    label: "Pending",
    band: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  // BQ-specific
  no_match: {
    label: "Not registered",
    band: "bg-muted text-muted-foreground border",
    dot: "bg-muted-foreground/40",
  },
  no_tables: {
    label: "No table access",
    band: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  tables_empty: {
    label: "Tables empty",
    band: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  hostname_mismatch: {
    label: "Host mismatch",
    band: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  inactive: {
    label: "Inactive",
    band: "bg-muted text-muted-foreground border",
    dot: "bg-muted-foreground/40",
  },
};

function StatusPill({ status }: { status: PillStatus }) {
  const m = PILL[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border shrink-0 ${m.band}`}
    >
      <span className={`size-1.5 rounded-full ${m.dot}`} aria-hidden />
      {m.label}
    </span>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────

function fmtRel(iso: string): string {
  const ms = Date.now() - +new Date(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ─── Field primitives ────────────────────────────────────────────────────

function FieldText({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft);
        }}
        placeholder={placeholder}
        className="w-full text-[13px] px-3 py-2 border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground font-mono"
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        className="w-full text-[13px] px-3 py-2 border rounded-md bg-card outline-none focus:border-foreground/40 cursor-pointer"
      >
        <option value="">{placeholder ?? "—"}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}
