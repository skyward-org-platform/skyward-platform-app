"use client";

// Universal entity drawer. One component, one open/close path. Anywhere a
// URL / Keyword / Cluster row is clickable this drawer slides in from the
// right and shows context for that subject.
//
// The drawer is polymorphic over `subject` — a discriminated union with
// three kinds:
//   - `url`     — the original Phase 1/2 page view (signals, triage chip,
//                  Phase 2 checks, execution, restore spec, history)
//   - `keyword` — Phase 3 keyword detail (status, source, relevance,
//                  notes, link to assigned cluster)
//   - `cluster` — Phase 3 cluster detail (metrics, priority pill,
//                  page_action chip, name override, members list, URLs,
//                  agent chat placeholder)
//
// Callers pass `subject={...}` (and an `onClose` callback). The subject
// shape determines which body component renders. Cross-navigation
// (keyword → its cluster, cluster → a member keyword, cluster → a URL)
// is supported via an optional `onNavigate(subject)` callback.
//
// Inputs are uncontrolled (defaultValue) — the server actions revalidate
// the route via cache tag, so any change re-renders with fresh data.
// Pattern lifted from BrandDnaAssistantDrawer: ESC closes, click outside
// closes, body scroll lock while open.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ACTION_TINT } from "@/lib/wqa-triage";
import { evaluateChecks, type Ctx } from "@/lib/wqa-checks";
import {
  EXECUTION_STATUSES,
  type ExecutionStatus,
  type PageExecutionRow,
} from "@/lib/page-execution";
import type { PageCheckStateRow } from "@/lib/page-check-state";
import type { WqaRow } from "@/lib/wqa";
import {
  setCheckStatus,
  setExecutionField,
  setExecutionStatus,
} from "@/app/properties/[slug]/pages/wqa-actions";
import {
  setKeywordStatus,
  setKeywordNotes,
  setClusterPriority,
  setClusterField,
} from "@/app/properties/[slug]/keywords/actions";
import type { KeywordRow, KeywordStatus } from "@/lib/keywords";
import type {
  ClusterRow,
  ClusterMemberRow,
  ClusterPriority,
  ClusterPageAction,
  ClusterState,
} from "@/lib/clusters";

// ─── Subject union ───────────────────────────────────────────────────────
export type UrlDrawerSubject = {
  kind: "url";
  row: WqaRow;
  /** Effective action after override overlay; rendered as a chip. */
  currentAction: string;
  /** URL category — passed through to evaluateChecks for T5/T7 medians. */
  category: string;
  execution: PageExecutionRow | null;
  /** Per-URL slice of check states, keyed by check_id. */
  checkStatesForUrl: Map<string, PageCheckStateRow>;
  ctx: Ctx;
};

export type KeywordDrawerSubject = {
  kind: "keyword";
  keyword: KeywordRow;
  clusterName: string | null;
  clusterId: string | null;
};

export type ClusterDrawerSubject = {
  kind: "cluster";
  cluster: ClusterRow;
  members: ClusterMemberRow[];
  urlsInCluster: string[];
};

export type DrawerSubject =
  | UrlDrawerSubject
  | KeywordDrawerSubject
  | ClusterDrawerSubject;

// ─── Common props passed to every variant ───────────────────────────────
type CommonProps = {
  onClose: () => void;
  propertySlug: string;
  propertyId: string | null;
  primaryDomain: string | null;
  /** Optional cross-subject navigation. If omitted, links render as plain text. */
  onNavigate?: (subject: DrawerSubject) => void;
};

export type UrlDrawerProps = CommonProps & {
  subject: DrawerSubject | null;
};

// ─── Dispatcher ─────────────────────────────────────────────────────────
export function UrlDrawer(props: UrlDrawerProps) {
  const { subject, onClose } = props;

  // ESC + body scroll lock. Same shape as BrandDnaAssistantDrawer so the
  // app has one drawer behavior, not two.
  useEffect(() => {
    if (!subject) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [subject, onClose]);

  if (!subject) return null;

  if (subject.kind === "keyword") {
    return <KeywordDrawer subject={subject} {...stripSubject(props)} />;
  }
  if (subject.kind === "cluster") {
    return <ClusterDrawer subject={subject} {...stripSubject(props)} />;
  }
  return <UrlDrawerView subject={subject} {...stripSubject(props)} />;
}

function stripSubject(props: UrlDrawerProps): CommonProps {
  // Pull out the props common to every drawer variant.
  return {
    onClose: props.onClose,
    propertySlug: props.propertySlug,
    propertyId: props.propertyId,
    primaryDomain: props.primaryDomain,
    onNavigate: props.onNavigate,
  };
}

// ─── Shared drawer chrome ───────────────────────────────────────────────
function DrawerShell({
  ariaLabel,
  onClose,
  children,
  footer,
}: {
  ariaLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="ml-auto h-full w-full sm:w-[480px] md:w-[560px] bg-background border-l shadow-xl relative flex flex-col">
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// URL DRAWER (original behavior)
// ═══════════════════════════════════════════════════════════════════════
function UrlDrawerView({
  subject,
  onClose,
  propertySlug,
  propertyId,
  primaryDomain,
}: { subject: UrlDrawerSubject } & CommonProps) {
  const { row, currentAction, category, execution, checkStatesForUrl, ctx } =
    subject;
  return (
    <DrawerShell
      ariaLabel="URL details"
      onClose={onClose}
      footer={<UrlFooter propertySlug={propertySlug} url={row.url} />}
    >
      <UrlHeader
        primaryDomain={primaryDomain}
        url={row.url}
        onClose={onClose}
      />
      <SignalsSection row={row} />
      <Phase1Section
        currentAction={currentAction}
        dataSources={row.data_sources}
      />
      <Phase2Section
        row={row}
        category={category}
        ctx={ctx}
        checkStatesForUrl={checkStatesForUrl}
        propertySlug={propertySlug}
        propertyId={propertyId}
      />
      <ExecutionSection
        propertySlug={propertySlug}
        url={row.url}
        execution={execution}
      />
      {currentAction.toLowerCase().startsWith("restore") && (
        <RestoreSpecSection
          propertySlug={propertySlug}
          url={row.url}
          execution={execution}
        />
      )}
      <HistorySection />
    </DrawerShell>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────
function UrlHeader({
  primaryDomain,
  url,
  onClose,
}: {
  primaryDomain: string | null;
  url: string;
  onClose: () => void;
}) {
  return (
    <header className="px-4 py-3 border-b shrink-0 sticky top-0 bg-background z-10">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {primaryDomain && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {primaryDomain}
            </div>
          )}
          <div
            className="font-mono text-[12px] truncate text-foreground mt-0.5"
            title={url}
          >
            {url}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-lg leading-none px-1 shrink-0"
          aria-label="Close drawer"
        >
          ×
        </button>
      </div>
    </header>
  );
}

// ─── Signals ─────────────────────────────────────────────────────────────
function SignalsSection({ row }: { row: WqaRow }) {
  const items: Array<[string, string | number | null | undefined]> = [
    ["Sessions", row.sessions],
    ["Conversions", row.conversions],
    ["Revenue", row.total_revenue != null ? `$${row.total_revenue}` : null],
    ["Impressions", row.average_impressions],
    ["CTR", row.average_ctr != null ? `${(row.average_ctr * 100).toFixed(1)}%` : null],
    ["Ref Domains", row.referring_domains],
    ["Backlinks", row.backlinks],
    ["Best KW", row.best_tv_keyword || row.best_sv_keyword],
    ["Best KW Rank", row.best_tv_kw_rank ?? row.best_sv_kw_rank],
    ["Best KW SV", row.best_tv_kw_sv ?? row.best_sv_kw_sv],
    ["Word Count", row.word_count],
    ["Inlinks", row.inlinks],
    ["Page Depth", row.page_depth],
    ["Status Code", row.status_code],
    ["Indexability", row.indexability],
  ];
  const visible = items.filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (visible.length === 0) {
    return (
      <Section title="Signals">
        <p className="text-[11px] text-muted-foreground italic">
          No WQA signals captured for this URL.
        </p>
      </Section>
    );
  }
  return (
    <Section title="Signals">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        {visible.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-2 border-b border-dashed border-muted/60 py-0.5"
          >
            <dt className="text-muted-foreground text-[10.5px] uppercase tracking-wider">
              {label}
            </dt>
            <dd
              className="text-foreground tabular-nums text-right truncate max-w-[60%]"
              title={String(value)}
            >
              {typeof value === "number" ? value.toLocaleString() : value}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

// ─── Phase 1 ─────────────────────────────────────────────────────────────
function Phase1Section({
  currentAction,
  dataSources,
}: {
  currentAction: string;
  dataSources: string | null;
}) {
  // Lookup tint via the action; falls back to muted styling for unknown values.
  const tint =
    (ACTION_TINT as Record<string, { band: string; dot: string } | undefined>)[
      currentAction
    ] ?? { band: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" };
  return (
    <Section title="Phase 1 — Triage">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tint.band}`}
        >
          <span className={`size-1.5 rounded-full ${tint.dot}`} aria-hidden />
          {currentAction || "—"}
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          Override from the row chip in the action tab.
        </span>
      </div>
      {dataSources && (
        <p className="text-[11px] text-muted-foreground italic mt-2">
          Sources: {dataSources}
        </p>
      )}
    </Section>
  );
}

// ─── Phase 2 Checks ──────────────────────────────────────────────────────
function Phase2Section({
  row,
  category,
  ctx,
  checkStatesForUrl,
  propertySlug,
  propertyId,
}: {
  row: WqaRow;
  category: string;
  ctx: Ctx;
  checkStatesForUrl: Map<string, PageCheckStateRow>;
  propertySlug: string;
  propertyId: string | null;
}) {
  const failing = evaluateChecks(row, category, ctx);

  return (
    <Section
      title={
        <>
          Phase 2 — Checks
          <span className="ml-2 text-[11px] text-muted-foreground tabular-nums font-normal">
            {failing.length} failing
          </span>
        </>
      }
    >
      {failing.length === 0 ? (
        <p className="text-[11.5px] text-emerald-700">
          No Phase 2 issues for this URL.
        </p>
      ) : (
        <ul className="space-y-2">
          {failing.map((c) => {
            const state = checkStatesForUrl.get(c.id);
            const initialStatus: ExecutionStatus = state?.status ?? "To Do";
            return (
              <li
                key={c.id}
                className="border rounded-md bg-muted/20 px-2.5 py-2 text-[11.5px]"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-semibold">
                    <span className="text-muted-foreground tabular-nums mr-1.5">
                      {c.id}
                    </span>
                    {c.name}
                  </div>
                  <CheckStatusSelect
                    propertySlug={propertySlug}
                    url={row.url}
                    checkId={c.id}
                    initialStatus={initialStatus}
                    disabled={!propertyId}
                  />
                </div>
                <div className="text-[10.5px] text-muted-foreground mt-1">
                  {c.detail}
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-1">
                  <span className="font-medium">Action:</span> {c.action}
                  <span className="mx-1">·</span>
                  <span className="font-medium">KW:</span> {c.kwDependency}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function CheckStatusSelect({
  propertySlug,
  url,
  checkId,
  initialStatus,
  disabled,
}: {
  propertySlug: string;
  url: string;
  checkId: string;
  initialStatus: ExecutionStatus;
  disabled?: boolean;
}) {
  return (
    <select
      defaultValue={initialStatus}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value as ExecutionStatus;
        void setCheckStatus(propertySlug, url, checkId, next);
      }}
      onClick={(e) => e.stopPropagation()}
      className="text-[10.5px] px-1.5 py-0.5 border rounded bg-background"
    >
      {EXECUTION_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

// ─── Execution ───────────────────────────────────────────────────────────
function ExecutionSection({
  propertySlug,
  url,
  execution,
}: {
  propertySlug: string;
  url: string;
  execution: PageExecutionRow | null;
}) {
  return (
    <Section title="Execution">
      <div className="grid gap-2.5">
        <Field label="Status">
          <select
            defaultValue={execution?.status ?? "To Do"}
            onChange={(e) =>
              void setExecutionStatus(
                propertySlug,
                url,
                e.target.value as ExecutionStatus,
              )
            }
            className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
          >
            {EXECUTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <input
            type="text"
            defaultValue={execution?.owner ?? ""}
            placeholder="(unassigned)"
            onBlur={(e) =>
              void setExecutionField(
                propertySlug,
                url,
                "owner",
                e.target.value || null,
              )
            }
            className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
          />
        </Field>
        <Field label="Due">
          <input
            type="date"
            defaultValue={execution?.due_date ?? ""}
            onBlur={(e) =>
              void setExecutionField(
                propertySlug,
                url,
                "due_date",
                e.target.value || null,
              )
            }
            className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
          />
        </Field>
        <Field label="Target URL">
          <input
            type="text"
            defaultValue={execution?.target_url ?? ""}
            placeholder="https://…"
            onBlur={(e) =>
              void setExecutionField(
                propertySlug,
                url,
                "target_url",
                e.target.value || null,
              )
            }
            className="text-[11.5px] font-mono px-2 py-1 border rounded bg-background w-full"
          />
        </Field>
        <Field label="Notes">
          <textarea
            defaultValue={execution?.notes ?? ""}
            rows={3}
            onBlur={(e) =>
              void setExecutionField(
                propertySlug,
                url,
                "notes",
                e.target.value || null,
              )
            }
            className="text-[11.5px] px-2 py-1 border rounded bg-background w-full resize-y"
          />
        </Field>
      </div>
    </Section>
  );
}

// ─── Restore Spec ────────────────────────────────────────────────────────
function RestoreSpecSection({
  propertySlug,
  url,
  execution,
}: {
  propertySlug: string;
  url: string;
  execution: PageExecutionRow | null;
}) {
  return (
    <Section title="Restore Spec">
      <div className="grid gap-2.5">
        <Field label="Target H1">
          <input
            type="text"
            defaultValue={execution?.target_h1 ?? ""}
            onBlur={(e) =>
              void setExecutionField(
                propertySlug,
                url,
                "target_h1",
                e.target.value || null,
              )
            }
            className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
          />
        </Field>
        <Field label="Target Title">
          <input
            type="text"
            defaultValue={execution?.target_title ?? ""}
            onBlur={(e) =>
              void setExecutionField(
                propertySlug,
                url,
                "target_title",
                e.target.value || null,
              )
            }
            className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
          />
        </Field>
        <Field label="Target Meta">
          <textarea
            defaultValue={execution?.target_meta ?? ""}
            rows={2}
            onBlur={(e) =>
              void setExecutionField(
                propertySlug,
                url,
                "target_meta",
                e.target.value || null,
              )
            }
            className="text-[11.5px] px-2 py-1 border rounded bg-background w-full resize-y"
          />
        </Field>
      </div>
    </Section>
  );
}

// ─── History (placeholder) ───────────────────────────────────────────────
function HistorySection() {
  return (
    <Section title="History">
      <p className="text-[11px] text-muted-foreground italic">
        Coming soon — last 10 changes will appear here once the history
        reader is wired up.
      </p>
    </Section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────
function UrlFooter({
  propertySlug,
  url,
}: {
  propertySlug: string;
  url: string;
}) {
  const router = useRouter();
  return (
    <footer className="border-t px-4 py-2.5 shrink-0 flex items-center justify-between gap-2 bg-muted/30">
      <a
        href={`/properties/${propertySlug}/pages/${encodeURIComponent(url)}`}
        className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
      >
        Open full page →
      </a>
      <button
        type="button"
        onClick={() => router.push(`?mode=audit&view=url-priority`)}
        className="text-[11px] px-2 py-1 border rounded bg-background hover:bg-muted"
      >
        View in Phase 2
      </button>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// KEYWORD DRAWER
// ═══════════════════════════════════════════════════════════════════════
function KeywordDrawer({
  subject,
  onClose,
  propertySlug,
  primaryDomain,
  onNavigate,
}: { subject: KeywordDrawerSubject } & CommonProps) {
  const { keyword, clusterName, clusterId } = subject;
  const STATUS_TINT: Record<KeywordStatus, { band: string; dot: string }> = {
    Retained: { band: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
    Excluded: { band: "bg-rose-50 text-rose-800", dot: "bg-rose-500" },
    Candidate: { band: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  };
  const tint = STATUS_TINT[keyword.status];

  return (
    <DrawerShell ariaLabel="Keyword details" onClose={onClose}>
      <header className="px-4 py-3 border-b shrink-0 sticky top-0 bg-background z-10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {primaryDomain && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {primaryDomain} · keyword
              </div>
            )}
            <div
              className="text-[14px] font-semibold text-foreground mt-0.5 truncate"
              title={keyword.keyword}
            >
              {keyword.keyword}
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${tint.band}`}
              >
                <span className={`size-1.5 rounded-full ${tint.dot}`} />
                {keyword.status}
              </span>
              {keyword.source && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                  {keyword.source}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none px-1 shrink-0"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>
      </header>

      <Section title="Signals">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
          <SignalRow label="Relevance" value={keyword.relevance_score} />
          <SignalRow label="Source" value={keyword.source} />
        </dl>
        <p className="text-[10.5px] text-muted-foreground italic mt-2">
          SV / KD / intent join lands when BQ kga_output is wired into the
          keyword drawer.
        </p>
      </Section>

      <Section title="Cluster">
        {clusterName && clusterId ? (
          <button
            type="button"
            className="text-[11.5px] hover:underline text-foreground"
            onClick={() => {
              // Drawer cross-link — caller decides how to load the cluster's
              // full state. If they don't wire onNavigate, this is a no-op.
              onNavigate?.({
                kind: "cluster",
                cluster: { id: clusterId } as ClusterRow,
                members: [],
                urlsInCluster: [],
              });
            }}
          >
            → {clusterName}
          </button>
        ) : (
          <span className="text-[11.5px] text-muted-foreground italic">
            Not assigned to a cluster.
          </span>
        )}
      </Section>

      <Section title="Curation">
        <div className="grid gap-2.5">
          <Field label="Status">
            <select
              defaultValue={keyword.status}
              onChange={(e) =>
                void setKeywordStatus(
                  propertySlug,
                  keyword.keyword,
                  e.target.value as KeywordStatus,
                )
              }
              className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
            >
              {(["Candidate", "Retained", "Excluded"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              defaultValue={keyword.notes ?? ""}
              rows={3}
              onBlur={(e) =>
                void setKeywordNotes(
                  propertySlug,
                  keyword.keyword,
                  e.target.value || null,
                )
              }
              className="text-[11.5px] px-2 py-1 border rounded bg-background w-full resize-y"
            />
          </Field>
        </div>
      </Section>
    </DrawerShell>
  );
}

function SignalRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-muted/60 py-0.5">
      <dt className="text-muted-foreground text-[10.5px] uppercase tracking-wider">
        {label}
      </dt>
      <dd
        className="text-foreground tabular-nums text-right truncate max-w-[60%]"
        title={String(value)}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </dd>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CLUSTER DRAWER
// ═══════════════════════════════════════════════════════════════════════
const CLUSTER_PRIORITY_TINT: Record<
  ClusterPriority,
  { band: string; dot: string }
> = {
  High: { band: "bg-indigo-50 text-indigo-800", dot: "bg-indigo-500" },
  Watch: { band: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  Low: { band: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  Unset: { band: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
};

const CLUSTER_PAGE_ACTION_LABEL: Record<ClusterPageAction, string> = {
  build_new: "Build new",
  optimize_existing: "Optimize existing",
  remove: "Remove",
  skip: "Skip",
};

function ClusterDrawer({
  subject,
  onClose,
  propertySlug,
  primaryDomain,
  onNavigate,
}: { subject: ClusterDrawerSubject } & CommonProps) {
  const { cluster, members, urlsInCluster } = subject;
  const tint = CLUSTER_PRIORITY_TINT[cluster.priority];
  const displayName = cluster.name_override || cluster.head_term;

  return (
    <DrawerShell ariaLabel="Cluster details" onClose={onClose}>
      <header className="px-4 py-3 border-b shrink-0 sticky top-0 bg-background z-10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {primaryDomain && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {primaryDomain} · cluster #{cluster.cluster_number}
              </div>
            )}
            <div
              className="text-[14px] font-semibold text-foreground mt-0.5 truncate"
              title={displayName}
            >
              {displayName}
            </div>
            {cluster.name_override && (
              <div className="text-[10.5px] text-muted-foreground truncate">
                head: {cluster.head_term}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${tint.band}`}
              >
                <span className={`size-1.5 rounded-full ${tint.dot}`} />
                {cluster.priority}
              </span>
              {cluster.page_action && (
                <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-sky-50 text-sky-800">
                  {CLUSTER_PAGE_ACTION_LABEL[cluster.page_action]}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none px-1 shrink-0"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>
      </header>

      <Section title="Metrics">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
          <SignalRow label="Members" value={cluster.member_count} />
          <SignalRow label="Total SV" value={cluster.total_sv} />
          <SignalRow label="Max SV" value={cluster.max_sv} />
          <SignalRow
            label="Avg KD"
            value={cluster.avg_kd != null ? cluster.avg_kd.toFixed(1) : null}
          />
          <SignalRow label="URLs" value={urlsInCluster.length} />
        </dl>
      </Section>

      <Section title="Edit">
        <div className="grid gap-2.5">
          <Field label="Priority">
            <select
              defaultValue={cluster.priority}
              onChange={(e) =>
                void setClusterPriority(
                  propertySlug,
                  cluster.id,
                  e.target.value as ClusterPriority,
                )
              }
              className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
            >
              {(["Unset", "High", "Watch", "Low"] as const).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Page action">
            <select
              defaultValue={cluster.page_action ?? ""}
              onChange={(e) =>
                void setClusterField(
                  propertySlug,
                  cluster.id,
                  "page_action",
                  e.target.value || null,
                )
              }
              className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
            >
              <option value="">—</option>
              <option value="build_new">Build new</option>
              <option value="optimize_existing">Optimize existing</option>
              <option value="remove">Remove</option>
              <option value="skip">Skip</option>
            </select>
          </Field>
          <Field label="State">
            <select
              defaultValue={cluster.state}
              onChange={(e) =>
                void setClusterField(
                  propertySlug,
                  cluster.id,
                  "state",
                  e.target.value as ClusterState,
                )
              }
              className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
            >
              <option value="open">open</option>
              <option value="closed">closed</option>
            </select>
          </Field>
          <Field label="Name override">
            <input
              type="text"
              defaultValue={cluster.name_override ?? ""}
              placeholder={cluster.head_term}
              onBlur={(e) =>
                void setClusterField(
                  propertySlug,
                  cluster.id,
                  "name_override",
                  e.target.value || null,
                )
              }
              className="text-[11.5px] px-2 py-1 border rounded bg-background w-full"
            />
          </Field>
          <Field label="Notes">
            <textarea
              defaultValue={cluster.notes ?? ""}
              rows={3}
              onBlur={(e) =>
                void setClusterField(
                  propertySlug,
                  cluster.id,
                  "notes",
                  e.target.value || null,
                )
              }
              className="text-[11.5px] px-2 py-1 border rounded bg-background w-full resize-y"
            />
          </Field>
        </div>
      </Section>

      <Section
        title={
          <>
            Members
            <span className="ml-2 text-[11px] text-muted-foreground tabular-nums font-normal">
              {members.length}
            </span>
          </>
        }
      >
        {members.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground italic">
            No members in this cluster.
          </p>
        ) : (
          <ul className="max-h-[200px] overflow-y-auto border rounded divide-y">
            {members.slice(0, 200).map((m) => (
              <li key={m.keyword} className="px-2 py-1 text-[11.5px]">
                {onNavigate ? (
                  <button
                    type="button"
                    className="hover:underline text-foreground text-left w-full truncate"
                    title={m.keyword}
                    onClick={() => {
                      // Cross-nav: open the keyword drawer. The caller must
                      // resolve the full KeywordRow — we pass a stub keyed by
                      // the keyword text. If onNavigate isn't wired, falls
                      // back to text.
                      onNavigate({
                        kind: "keyword",
                        keyword: { keyword: m.keyword } as KeywordRow,
                        clusterName: displayName,
                        clusterId: cluster.id,
                      });
                    }}
                  >
                    {m.keyword}
                    {m.assignment === "manual" && (
                      <span className="ml-1 text-[9px] text-muted-foreground">
                        ●
                      </span>
                    )}
                  </button>
                ) : (
                  <span className="truncate" title={m.keyword}>
                    {m.keyword}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={
          <>
            URLs
            <span className="ml-2 text-[11px] text-muted-foreground tabular-nums font-normal">
              {urlsInCluster.length}
            </span>
          </>
        }
      >
        {urlsInCluster.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground italic">
            No URLs assigned to this cluster.
          </p>
        ) : (
          <ul className="max-h-[200px] overflow-y-auto border rounded divide-y">
            {urlsInCluster.map((u) => (
              <li key={u} className="px-2 py-1 text-[11px] font-mono truncate" title={u}>
                <a
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {u}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Agent">
        <div className="text-[11.5px] text-muted-foreground italic">
          Agent chat coming in Chunk 5.
        </div>
      </Section>
    </DrawerShell>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-3 border-b">
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
      {children}
    </label>
  );
}
