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

import { useEffect, useState, useTransition } from "react";
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
  LOGIC_CODE_LABELS,
  type Action7,
  type LogicCode,
  type WqaStatus,
} from "@/lib/wqa-decisions";
import {
  clearDrift,
  getVerificationHistory,
  setCheckStatus,
  setExecutionField,
  setExecutionStatus,
  setLogicNotes,
  setTargetUrl,
  type VerificationEventRow,
} from "@/app/properties/[slug]/pages/wqa-actions";
import { VerifyButton } from "@/components/wqa/VerifyButton";
import {
  setKeywordStatus,
  setKeywordNotes,
  setClusterPriority,
  setClusterField,
} from "@/app/properties/[slug]/keywords/actions";
import {
  setRowField,
  getContentHistoryAction,
} from "@/app/properties/[slug]/content/actions";
import type { ContentRowHistory } from "@/lib/content-rows";
import type { KeywordRow, KeywordStatus } from "@/lib/keywords";
import type {
  ClusterRow,
  ClusterMemberRow,
  ClusterPriority,
  ClusterPageAction,
  ClusterState,
} from "@/lib/clusters";
import type { ContentRow } from "@/lib/content-rows";
import type { ReferringDomainRow, DisavowEntryRow } from "@/lib/authority";
import { ClusterChatPanel } from "@/components/keywords/ClusterChatPanel";
import { StatusChip } from "@/components/content/StatusChip";
import { ActionTypeChip } from "@/components/content/ActionTypeChip";
import { WriterCell } from "@/components/content/WriterCell";
import { SprintCell } from "@/components/content/SprintCell";
import { QualityChip } from "@/components/authority/QualityChip";
import {
  setDomainNotes,
  addToDisavow,
  setDisavowStatus,
  setDisavowReason,
} from "@/app/properties/[slug]/authority/actions";

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

  // ─── P2 action semantics v2 fields ───────────────────────────────────
  // All optional/nullable so existing callers compile until the parent
  // surfaces the wqa_decision row alongside the WqaRow.
  /** Pipeline-derived action (BQ wqa_output), coerced to Action7. */
  pipelineAction?: Action7 | null;
  /** Operator override action (wqa_decision), null if no override. */
  overrideAction?: Action7 | null;
  /** Effective displayed action (override ?? pipeline) for gating sections. */
  displayedAction?: Action7 | null;
  /** Closed-set logic code from the pipeline (BQ wqa_output). Null until
   *  Chunk 5 ships pipeline emission. */
  logicCode?: LogicCode | null;
  /** Operator notes about the triage decision (wqa_decision.logic_notes). */
  logicNotes?: string | null;
  /** Operator-set target URL for Redirect / Consolidate. */
  targetUrl?: string | null;
  /** Pipeline-suggested target URL — null until pipeline emits it. */
  pipelineTargetUrl?: string | null;
  /** Last time the verify button was run against this row's target. */
  lastImplementationCheckAt?: string | null;
  /** Status workflow (Open/In Progress/Done/Drifted). Default Open. */
  status?: WqaStatus;
  /** Why the drift detector flagged this row; surfaces in the rose banner. */
  driftReason?: string | null;
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

export type ContentDrawerSubject = {
  kind: "content";
  row: ContentRow;
  cluster: ClusterRow | null;
};

export type RefDomainDrawerSubject = {
  kind: "refdomain";
  row: ReferringDomainRow;
  /** The matching disavow_entry, or null if the domain is not in the disavow list. */
  disavow: DisavowEntryRow | null;
};

export type DrawerSubject =
  | UrlDrawerSubject
  | KeywordDrawerSubject
  | ClusterDrawerSubject
  | ContentDrawerSubject
  | RefDomainDrawerSubject;

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
  if (subject.kind === "content") {
    return <ContentDrawer subject={subject} {...stripSubject(props)} />;
  }
  if (subject.kind === "refdomain") {
    return <RefDomainDrawer subject={subject} {...stripSubject(props)} />;
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
  const {
    row,
    currentAction,
    category,
    execution,
    checkStatesForUrl,
    ctx,
    pipelineAction = null,
    overrideAction = null,
    displayedAction = null,
    logicCode = null,
    logicNotes = null,
    targetUrl = null,
    pipelineTargetUrl = null,
    lastImplementationCheckAt = null,
    status = "Open",
    driftReason = null,
  } = subject;
  const showTargetSection =
    displayedAction === "Redirect" || displayedAction === "Consolidate";
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
      {status === "Drifted" && (
        <DriftBanner
          propertySlug={propertySlug}
          url={row.url}
          driftReason={driftReason}
        />
      )}
      <SignalsSection row={row} />
      <Phase1Section
        currentAction={currentAction}
        dataSources={row.data_sources}
      />
      <TriageLogicSection
        propertySlug={propertySlug}
        url={row.url}
        logicCode={logicCode}
        logicNotes={logicNotes}
        pipelineAction={pipelineAction}
        overrideAction={overrideAction}
      />
      {showTargetSection && (
        <>
          <TargetUrlSection
            propertySlug={propertySlug}
            url={row.url}
            displayedAction={displayedAction}
            targetUrl={targetUrl}
            pipelineTargetUrl={pipelineTargetUrl}
            lastImplementationCheckAt={lastImplementationCheckAt}
          />
          <VerificationHistorySection
            propertySlug={propertySlug}
            url={row.url}
            targetUrl={targetUrl}
          />
        </>
      )}
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

// ─── Drift banner ────────────────────────────────────────────────────────
// Shown only when status='Drifted'. The Acknowledge button calls clearDrift
// (Drifted → Open + nulls drift_reason). The banner sits above all other
// sections so the operator sees it immediately on drawer open.
function DriftBanner({
  propertySlug,
  url,
  driftReason,
}: {
  propertySlug: string;
  url: string;
  driftReason: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-4 mt-3 mb-1 bg-rose-50 border border-rose-200 rounded p-3 text-xs">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <strong className="text-rose-900">Drift detected</strong>
          {driftReason && (
            <span className="text-rose-800 ml-2">{driftReason}</span>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await clearDrift(propertySlug, url);
              if (!res.ok) setError(res.error);
            });
          }}
          className={`text-[11px] px-2 py-1 rounded border border-rose-300 text-rose-900 hover:bg-rose-100 ${pending ? "opacity-60" : ""}`}
        >
          {pending ? "Acknowledging…" : "Acknowledge"}
        </button>
      </div>
      {error && (
        <div className="mt-1.5 text-[10.5px] text-rose-800 font-mono" title={error}>
          ! {error}
        </div>
      )}
    </div>
  );
}

// ─── Triage logic section ────────────────────────────────────────────────
// Read-only logic_code (with hover tooltip for the human-readable label),
// "Pipeline said" indicator when the operator overrode the pipeline, and an
// editable Notes textarea (wqa_decision.logic_notes).
function TriageLogicSection({
  propertySlug,
  url,
  logicCode,
  logicNotes,
  pipelineAction,
  overrideAction,
}: {
  propertySlug: string;
  url: string;
  logicCode: LogicCode | null;
  logicNotes: string | null;
  pipelineAction: Action7 | null;
  overrideAction: Action7 | null;
}) {
  const label = logicCode ? LOGIC_CODE_LABELS[logicCode] ?? logicCode : null;
  const showPipelineSaid =
    pipelineAction !== null &&
    overrideAction !== null &&
    pipelineAction !== overrideAction;
  return (
    <Section title="Triage logic">
      <div className="grid gap-2.5">
        <Field label="Logic code">
          {logicCode ? (
            <span
              className="font-mono text-[11px] inline-block px-1.5 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-700 w-fit"
              title={label ?? logicCode}
            >
              {logicCode}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">
              — (pipeline will emit once Chunk 5 ships)
            </span>
          )}
        </Field>
        {showPipelineSaid && (
          <Field label="Pipeline said">
            <span
              className="text-[11.5px] text-muted-foreground"
              title="Operator overrode the pipeline's decision"
            >
              {pipelineAction}
            </span>
          </Field>
        )}
        <Field label="Notes">
          <LogicNotesEditor slug={propertySlug} url={url} value={logicNotes} />
        </Field>
      </div>
    </Section>
  );
}

function LogicNotesEditor({
  slug,
  url,
  value,
}: {
  slug: string;
  url: string;
  value: string | null;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function commit() {
    const next = local.trim() === "" ? null : local;
    if (next === (value ?? null)) return;
    setError(null);
    start(async () => {
      const res = await setLogicNotes(slug, url, next);
      if (!res.ok) {
        setLocal(value ?? "");
        setError(res.error);
      }
    });
  }
  return (
    <span className="inline-flex items-start gap-1 w-full">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        disabled={pending}
        rows={3}
        placeholder="Why this action? Add context that helps another operator understand the decision."
        className={`text-[11.5px] px-2 py-1 border rounded bg-background w-full resize-y ${pending ? "opacity-60" : ""}`}
      />
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}

// ─── Target URL section (Redirect + Consolidate only) ────────────────────
// Editable target URL input with the pipeline-suggested destination shown
// muted below, plus a Verify button that hits /api/verify-url and (on
// success) flips status → Done.
function TargetUrlSection({
  propertySlug,
  url,
  displayedAction,
  targetUrl,
  pipelineTargetUrl,
}: {
  propertySlug: string;
  url: string;
  displayedAction: Action7 | null;
  targetUrl: string | null;
  pipelineTargetUrl: string | null;
  lastImplementationCheckAt: string | null;
}) {
  const sectionTitle =
    displayedAction === "Redirect" ? "Redirect target" : "Canonical primary";
  return (
    <Section title={sectionTitle}>
      <div className="grid gap-2.5">
        <Field label="Target">
          <TargetUrlEditor
            slug={propertySlug}
            url={url}
            value={targetUrl}
            pipelineTarget={pipelineTargetUrl}
          />
        </Field>
      </div>
    </Section>
  );
}

// ─── VerificationHistorySection ──────────────────────────────────────────
// Fetches the last 5 verification_event rows for the open URL on drawer
// open. Renders newest-first with kind chip + relative date + final status
// + actual destination. Verify button lives underneath so the operator can
// re-run a check without leaving the drawer.

function VerificationHistorySection({
  propertySlug,
  url,
  targetUrl,
}: {
  propertySlug: string;
  url: string;
  targetUrl: string | null;
}) {
  const [events, setEvents] = useState<VerificationEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    (async () => {
      const res = await getVerificationHistory(propertySlug, url, 5);
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else setEvents(res.events);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertySlug, url]);

  return (
    <Section title="Verification history">
      {error && (
        <div className="text-[11px] text-rose-700" title={error}>
          ! {error}
        </div>
      )}
      {events === null && !error && (
        <div className="text-[11px] text-muted-foreground italic">Loading…</div>
      )}
      {events !== null && events.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic">
          No verification runs yet.
        </div>
      )}
      {events !== null && events.length > 0 && (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <VerificationHistoryRow key={e.id} event={e} />
          ))}
        </ul>
      )}
      <div className="pt-2.5">
        <VerifyButton
          propertySlug={propertySlug}
          url={url}
          disabled={!targetUrl}
        />
      </div>
    </Section>
  );
}

const KIND_CHIP_TINT: Record<
  VerificationEventRow["kind"],
  string
> = {
  matched: "bg-emerald-50 text-emerald-800 border-emerald-200",
  mismatch: "bg-amber-50 text-amber-800 border-amber-200",
  failed: "bg-rose-50 text-rose-800 border-rose-200",
};

const KIND_LABEL: Record<VerificationEventRow["kind"], string> = {
  matched: "✓ matched",
  mismatch: "≠ mismatch",
  failed: "✗ failed",
};

function drawerRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function VerificationHistoryRow({ event }: { event: VerificationEventRow }) {
  const dt = new Date(event.verified_at);
  const isoLabel = Number.isNaN(dt.getTime()) ? event.verified_at : dt.toLocaleString();
  return (
    <li className="text-[11px] border rounded-md bg-muted/20 px-2 py-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono tabular-nums text-muted-foreground text-[10.5px]">
          {isoLabel}
        </span>
        <span className="text-muted-foreground text-[10.5px]">·</span>
        <span className="text-muted-foreground text-[10.5px]">
          {drawerRelativeTime(event.verified_at)}
        </span>
        <span className="text-muted-foreground text-[10.5px]">·</span>
        <span
          className={
            "inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border " +
            KIND_CHIP_TINT[event.kind]
          }
        >
          {KIND_LABEL[event.kind]}
        </span>
        {event.final_status !== null && (
          <>
            <span className="text-muted-foreground text-[10.5px]">·</span>
            <span className="text-muted-foreground text-[10.5px] tabular-nums">
              final {event.final_status}
            </span>
          </>
        )}
      </div>
      {event.actual_destination && (
        <div className="mt-1 break-all">
          <span className="text-muted-foreground text-[10px]">actual: </span>
          <a
            href={event.actual_destination}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10.5px] hover:underline text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {event.actual_destination}
          </a>
        </div>
      )}
      {event.error_message && (
        <div className="mt-1 text-[10.5px] text-rose-800 font-mono break-all">
          {event.error_message}
        </div>
      )}
    </li>
  );
}

function TargetUrlEditor({
  slug,
  url,
  value,
  pipelineTarget,
}: {
  slug: string;
  url: string;
  value: string | null;
  pipelineTarget: string | null;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // TODO(Chunk 5): pipelineTarget is null today — the pipeline doesn't emit
  // a suggested target_url field yet. Once it does, this "Pipeline suggested"
  // hint + the override ring will start surfacing useful info.
  const isOverride =
    value !== null && pipelineTarget !== null && value !== pipelineTarget;
  function commit() {
    const next = local.trim() === "" ? null : local.trim();
    if (next === (value ?? null)) return;
    setError(null);
    start(async () => {
      const res = await setTargetUrl(slug, url, next);
      if (!res.ok) {
        setLocal(value ?? "");
        setError(res.error);
      }
    });
  }
  return (
    <div className="flex flex-col gap-1 w-full">
      <span className="inline-flex items-center gap-1 w-full">
        <input
          type="url"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          disabled={pending}
          placeholder="https://…"
          className={`text-[11.5px] font-mono px-2 py-1 border rounded bg-background w-full ${pending ? "opacity-60" : ""}`}
        />
        {error && (
          <span className="text-[10px] text-rose-700" title={error}>
            !
          </span>
        )}
      </span>
      {pipelineTarget && pipelineTarget !== local && (
        <span className="text-[10px] text-muted-foreground">
          Pipeline suggested:{" "}
          <span className="font-mono">{pipelineTarget}</span>
          {isOverride && " · operator override"}
        </span>
      )}
    </div>
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
        <ClusterChatPanel
          propertySlug={propertySlug}
          clusterId={cluster.id}
          clusterName={displayName}
        />
      </Section>
    </DrawerShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CONTENT DRAWER (Phase 4)
// ═══════════════════════════════════════════════════════════════════════
function ContentDrawer({
  subject,
  onClose,
  propertySlug,
  primaryDomain,
}: { subject: ContentDrawerSubject } & CommonProps) {
  const r = subject.row;
  const cluster = subject.cluster;
  const action = r.action_type_override ?? r.action_type;
  const clusterName = cluster
    ? cluster.name_override || cluster.head_term
    : null;

  return (
    <DrawerShell ariaLabel="Content row details" onClose={onClose}>
      <header className="px-4 py-3 border-b shrink-0 sticky top-0 bg-background z-10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {primaryDomain && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {primaryDomain} · content row
              </div>
            )}
            <div
              className="font-mono text-[12px] truncate text-foreground mt-0.5"
              title={r.url}
            >
              {r.url}
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <span>Sprint {r.sprint ?? "—"}</span>
              <span>·</span>
              <span>{action}</span>
              <span>·</span>
              <span>{r.status}</span>
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

      <Section title="Identity & Strategy">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
          <SignalRow label="Vertical" value={r.vertical} />
          <SignalRow label="Page Type" value={r.page_type} />
          <SignalRow label="Parent Page" value={r.parent_page} />
          <SignalRow label="Priority" value={r.priority_tier} />
          <SignalRow label="Target Keyword" value={r.target_keyword} />
          <SignalRow label="Source" value={r.source} />
          {cluster && (
            <SignalRow
              label="Cluster"
              value={`${clusterName} (${cluster.member_count.toLocaleString()} kw / SV ${cluster.total_sv.toLocaleString()})`}
            />
          )}
        </dl>
      </Section>

      <Section title="Calendar">
        <div className="grid gap-2.5">
          <Field label="Sprint">
            <SprintCell slug={propertySlug} rowId={r.id} value={r.sprint} />
          </Field>
          <Field label="Brief Due">
            <span className="text-[11.5px] font-mono">{r.brief_due ?? "—"}</span>
          </Field>
          <Field label="Draft Due">
            <span className="text-[11.5px] font-mono">{r.draft_due ?? "—"}</span>
          </Field>
          <Field label="Target Publish">
            <span className="text-[11.5px] font-mono">
              {r.target_publish ?? "—"}
            </span>
          </Field>
          <Field label="Owners">
            <TextDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="owners"
              value={r.owners}
            />
          </Field>
          <Field label="Calendar Status">
            <SelectDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="calendar_status"
              value={r.calendar_status}
              options={["Scheduled", "Slipped", "Done"]}
            />
          </Field>
        </div>
      </Section>

      <Section title="Brief Spec">
        <div className="grid gap-2.5">
          <Field label="Action Type">
            <ActionTypeChip
              slug={propertySlug}
              rowId={r.id}
              value={r.action_type}
              override={r.action_type_override}
            />
          </Field>
          <Field label="Title (auto)">
            <span className="text-[11.5px]">{r.title_formatted ?? "—"}</span>
          </Field>
          <Field label="Title override">
            <TextDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="title_override"
              value={r.title_override}
            />
          </Field>
          <Field label="H1 (auto)">
            <span className="text-[11.5px]">{r.h1_target ?? "—"}</span>
          </Field>
          <Field label="H1 override">
            <TextDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="h1_override"
              value={r.h1_override}
            />
          </Field>
          <Field label="Meta description (auto)">
            <span className="text-[11.5px]">
              {r.meta_description_spec ?? "—"}
            </span>
          </Field>
          <Field label="Meta description override">
            <TextDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="meta_description_override"
              value={r.meta_description_override}
              multiline
            />
          </Field>
          <Field label="Word count target">
            <span className="text-[11.5px]">{r.word_count_target ?? "—"}</span>
          </Field>
          <Field label="Phase 2 yellow resolution">
            <pre className="whitespace-pre-wrap text-[11.5px] font-sans">
              {r.phase2_yellow_resolution ?? "—"}
            </pre>
          </Field>
          <Field label="Brief Status">
            <SelectDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="brief_status"
              value={r.brief_status}
              options={["Not Started", "In Progress", "Approved"]}
            />
          </Field>
        </div>
      </Section>

      <Section title="Content Inputs">
        <p className="text-[11px] text-muted-foreground italic">
          {r.entities_blocked}
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          {r.faqs_blocked}
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          {r.fanout_blocked}
        </p>
        <button
          type="button"
          disabled
          className="mt-2 text-[11px] px-2 py-1 rounded border bg-card opacity-50 cursor-not-allowed"
          title="Brief generation lands in a follow-up chunk"
        >
          Generate Brief — Tier 2
        </button>
      </Section>

      <Section title="Draft & Production">
        <div className="grid gap-2.5">
          <Field label="Status">
            <StatusChip slug={propertySlug} rowId={r.id} value={r.status} />
          </Field>
          <Field label="Writer">
            <WriterCell slug={propertySlug} rowId={r.id} value={r.writer} />
          </Field>
          <Field label="Word count actual">
            <NumericDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="word_count_actual"
              value={r.word_count_actual}
            />
          </Field>
          <Field label="Draft link">
            <TextDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="draft_link"
              value={r.draft_link}
            />
          </Field>
          <Field label="Published URL">
            <TextDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="published_url"
              value={r.published_url}
            />
          </Field>
          <Field label="Feedback notes">
            <TextDrawerEditor
              slug={propertySlug}
              rowId={r.id}
              field="feedback_notes"
              value={r.feedback_notes}
              multiline
            />
          </Field>
        </div>
      </Section>

      <Section title="Dependencies + Linking">
        <Field label="Dependencies">
          <span className="text-[11.5px]">{r.dependencies ?? "—"}</span>
        </Field>
        <Field label="Internal links out">
          <pre className="whitespace-pre-wrap text-[11px] font-mono">
            {r.internal_links_out ?? "(none)"}
          </pre>
        </Field>
        <Field label="Internal links in">
          <pre className="whitespace-pre-wrap text-[11px] font-mono">
            {r.internal_links_in ?? "(none)"}
          </pre>
        </Field>
      </Section>

      <Section title="Schema">
        <Field label="Current">
          <span className="text-[11.5px]">{r.current_schema ?? "—"}</span>
        </Field>
        <Field label="Required">
          <span className="text-[11.5px]">{r.required_schema ?? "—"}</span>
        </Field>
        <Field label="JSON-LD notes">
          <span className="text-[11.5px]">{r.jsonld_notes ?? "—"}</span>
        </Field>
      </Section>

      <Section title="Post-Publish Tasks">
        <pre className="whitespace-pre-wrap text-[11.5px] font-sans">
          {r.post_publish_tasks ?? "—"}
        </pre>
      </Section>

      <ContentHistorySection contentRowId={r.id} />
    </DrawerShell>
  );
}

// ─── ContentHistorySection ───────────────────────────────────────────────
// Fetches content_row_history (snapshot trigger output) on drawer open and
// renders newest-first. Each snapshot is the row state *before* a tracked
// change, so the timeline reads as the lifecycle progression — what moved,
// who moved it, when (the "what's held up / published-then-disappeared" pain,
// call 146940114).

function ContentHistorySection({ contentRowId }: { contentRowId: string }) {
  const [events, setEvents] = useState<ContentRowHistory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    (async () => {
      const res = await getContentHistoryAction(contentRowId, 20);
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else setEvents(res.events);
    })();
    return () => {
      cancelled = true;
    };
  }, [contentRowId]);

  return (
    <Section title="History">
      {error && (
        <div className="text-[11px] text-rose-700" title={error}>
          ! {error}
        </div>
      )}
      {events === null && !error && (
        <div className="text-[11px] text-muted-foreground italic">Loading…</div>
      )}
      {events !== null && events.length === 0 && (
        <div className="text-[11px] text-muted-foreground italic">
          No changes recorded yet.
        </div>
      )}
      {events !== null && events.length > 0 && (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <ContentHistoryRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function ContentHistoryRow({ event }: { event: ContentRowHistory }) {
  const dt = new Date(event.snapshotted_at);
  const isoLabel = Number.isNaN(dt.getTime())
    ? event.snapshotted_at
    : dt.toLocaleString();
  // Compact summary of the snapshotted state.
  const bits: string[] = [];
  if (event.status) bits.push(event.status);
  if (event.brief_status && event.brief_status !== "Not Started")
    bits.push(`brief: ${event.brief_status}`);
  if (event.writer) bits.push(`writer: ${event.writer}`);
  if (event.sprint != null) bits.push(`sprint ${event.sprint}`);
  return (
    <li className="text-[11px] border rounded-md bg-muted/20 px-2 py-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono tabular-nums text-muted-foreground text-[10.5px]">
          {isoLabel}
        </span>
        <span className="text-muted-foreground text-[10.5px]">·</span>
        <span className="text-muted-foreground text-[10.5px]">
          {drawerRelativeTime(event.snapshotted_at)}
        </span>
        {event.updated_by && (
          <>
            <span className="text-muted-foreground text-[10.5px]">·</span>
            <span className="text-muted-foreground text-[10.5px]">
              {event.updated_by}
            </span>
          </>
        )}
      </div>
      {bits.length > 0 && (
        <div className="mt-0.5 text-[11px] text-foreground">{bits.join("  ·  ")}</div>
      )}
      {event.feedback_notes && (
        <div className="mt-0.5 text-[10.5px] text-muted-foreground italic truncate" title={event.feedback_notes}>
          {event.feedback_notes}
        </div>
      )}
    </li>
  );
}

// ─── Drawer editors for content_row field updates ────────────────────────
// Thin wrappers around setRowField for use inside ContentDrawer. Each
// commits on blur (text/number) or change (select), with optimistic local
// state and a one-character error indicator on failure.

type ContentEditableField =
  | "action_type_override"
  | "title_override"
  | "h1_override"
  | "meta_description_override"
  | "brief_status"
  | "calendar_status"
  | "owners"
  | "word_count_actual"
  | "draft_link"
  | "published_url"
  | "feedback_notes"
  | "rank_30d"
  | "rank_60d"
  | "rank_90d";

export function TextDrawerEditor({
  slug,
  rowId,
  field,
  value,
  multiline,
}: {
  slug: string;
  rowId: string;
  field: ContentEditableField;
  value: string | null;
  multiline?: boolean;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const next = local.trim() || null;
    if (next === (value ?? null)) return;
    setError(null);
    start(async () => {
      const res = await setRowField(slug, rowId, field, next);
      if (!res.ok) {
        setLocal(value ?? "");
        setError(res.error);
      }
    });
  }

  const common = {
    value: local,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setLocal(e.target.value),
    onBlur: commit,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    disabled: pending,
    className: `text-[11.5px] px-2 py-1 border rounded bg-background w-full ${pending ? "opacity-60" : ""}`,
  };

  return (
    <span className="inline-flex items-center gap-1 w-full">
      {multiline ? (
        <textarea {...common} rows={3} className={`${common.className} resize-y`} />
      ) : (
        <input type="text" {...common} />
      )}
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}

export function NumericDrawerEditor({
  slug,
  rowId,
  field,
  value,
}: {
  slug: string;
  rowId: string;
  field: ContentEditableField;
  value: number | null;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const trimmed = local.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && Number.isNaN(next)) {
      setLocal(value?.toString() ?? "");
      return;
    }
    if (next === (value ?? null)) return;
    setError(null);
    start(async () => {
      const res = await setRowField(slug, rowId, field, next);
      if (!res.ok) {
        setLocal(value?.toString() ?? "");
        setError(res.error);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        disabled={pending}
        className={`text-[11.5px] px-2 py-1 border rounded bg-background w-24 tabular-nums ${pending ? "opacity-60" : ""}`}
      />
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}

function SelectDrawerEditor({
  slug,
  rowId,
  field,
  value,
  options,
}: {
  slug: string;
  rowId: string;
  field: ContentEditableField;
  value: string;
  options: string[];
}) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string) {
    const previous = current;
    setCurrent(next);
    setError(null);
    start(async () => {
      const res = await setRowField(slug, rowId, field, next);
      if (!res.ok) {
        setCurrent(previous);
        setError(res.error);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className={`text-[11.5px] px-2 py-1 border rounded bg-background ${pending ? "opacity-60" : ""}`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// REFERRING DOMAIN DRAWER (Phase 5)
// ═══════════════════════════════════════════════════════════════════════
function RefDomainDrawer({
  subject,
  onClose,
  propertySlug,
  primaryDomain,
}: { subject: RefDomainDrawerSubject } & CommonProps) {
  const r = subject.row;
  const disavow = subject.disavow;
  const router = useRouter();
  const [adding, startAdd] = useTransition();

  return (
    <DrawerShell ariaLabel="Referring domain details" onClose={onClose}>
      <header className="px-4 py-3 border-b shrink-0 sticky top-0 bg-background z-10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {primaryDomain && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {primaryDomain} · referring domain
              </div>
            )}
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <a
                href={`https://${r.domain}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[13px] text-foreground hover:underline truncate"
                title={r.domain}
                onClick={(e) => e.stopPropagation()}
              >
                {r.domain} ↗
              </a>
              <QualityChip
                slug={propertySlug}
                domain={r.domain}
                value={r.quality}
              />
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
          {/*
            DFS Rank: stored in `domain_rating` but sourced from DataForSEO's
            `rank` field on a 0–1000 scale. Labeled "DFS Rank" (matching
            Chunk 3) so it's not mistaken for Ahrefs DR.
          */}
          <SignalRow
            label="DFS Rank"
            value={r.domain_rating != null ? r.domain_rating.toFixed(0) : null}
          />
          <SignalRow label="Traffic" value={r.traffic_domain} />
          <SignalRow label="Dofollow links" value={r.dofollow_links} />
          <SignalRow label="Links to target" value={r.links_to_target} />
          <SignalRow
            label="First seen"
            value={
              r.first_seen ? new Date(r.first_seen).toLocaleDateString() : null
            }
          />
          <SignalRow
            label="Last seen"
            value={
              r.last_seen ? new Date(r.last_seen).toLocaleDateString() : null
            }
          />
          <SignalRow
            label="Detected spam"
            value={r.detected_spam ? "Yes" : "No"}
          />
        </dl>
      </Section>

      <Section title="Editors">
        <Field label="Notes">
          <RefDomainNotesEditor
            slug={propertySlug}
            domain={r.domain}
            value={r.notes}
          />
        </Field>
      </Section>

      <Section title="Disavow">
        {disavow ? (
          <div className="grid gap-2.5">
            <Field label="Status">
              <DisavowStatusEditor
                slug={propertySlug}
                domain={r.domain}
                value={
                  (DISAVOW_STATUSES as readonly string[]).includes(
                    disavow.status,
                  )
                    ? (disavow.status as "Pending" | "In File" | "Confirmed by GSC")
                    : "Pending"
                }
              />
            </Field>
            <Field label="Reason">
              <DisavowReasonEditor
                slug={propertySlug}
                domain={r.domain}
                value={disavow.reason}
              />
            </Field>
          </div>
        ) : (
          <button
            type="button"
            disabled={adding}
            onClick={() =>
              startAdd(async () => {
                const res = await addToDisavow(propertySlug, r.domain, null);
                if (!res.ok) {
                  alert(`Mark for disavow failed: ${res.error}`);
                  return;
                }
                // Refresh server-rendered data so disavow + quality reflect
                // the new state; then close so the row reopens with the
                // updated subject on next click.
                router.refresh();
                onClose();
              })
            }
            className={`text-[11.5px] px-3 py-1.5 rounded border bg-card hover:bg-muted ${adding ? "opacity-60" : ""}`}
          >
            {adding ? "Adding…" : "Mark for disavow"}
          </button>
        )}
      </Section>
    </DrawerShell>
  );
}

function RefDomainNotesEditor({
  slug,
  domain,
  value,
}: {
  slug: string;
  domain: string;
  value: string | null;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const next = local.trim() === "" ? null : local;
    if (next === (value ?? null)) return;
    setError(null);
    start(async () => {
      const res = await setDomainNotes(slug, domain, next);
      if (!res.ok) {
        setLocal(value ?? "");
        setError(res.error);
      }
    });
  }

  return (
    <span className="inline-flex items-start gap-1 w-full">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        disabled={pending}
        rows={3}
        placeholder="(no notes)"
        className={`text-[11.5px] px-2 py-1 border rounded bg-background w-full resize-y ${pending ? "opacity-60" : ""}`}
      />
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}

const DISAVOW_STATUSES = ["Pending", "In File", "Confirmed by GSC"] as const;
type DisavowStatusValue = (typeof DISAVOW_STATUSES)[number];

function DisavowStatusEditor({
  slug,
  domain,
  value,
}: {
  slug: string;
  domain: string;
  value: DisavowStatusValue;
}) {
  const [current, setCurrent] = useState<DisavowStatusValue>(value);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: DisavowStatusValue) {
    const previous = current;
    setCurrent(next);
    setError(null);
    start(async () => {
      const res = await setDisavowStatus(slug, domain, next);
      if (!res.ok) {
        setCurrent(previous);
        setError(res.error);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as DisavowStatusValue)}
        onClick={(e) => e.stopPropagation()}
        className={`text-[11.5px] px-2 py-1 border rounded bg-background ${pending ? "opacity-60" : ""}`}
      >
        {DISAVOW_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
  );
}

function DisavowReasonEditor({
  slug,
  domain,
  value,
}: {
  slug: string;
  domain: string;
  value: string | null;
}) {
  const [local, setLocal] = useState(value ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const next = local.trim() === "" ? null : local.trim();
    if (next === (value ?? null)) return;
    setError(null);
    start(async () => {
      const res = await setDisavowReason(slug, domain, next);
      if (!res.ok) {
        setLocal(value ?? "");
        setError(res.error);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1 w-full">
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        disabled={pending}
        placeholder="e.g. spam_network, pbn, manipulative_anchor"
        className={`text-[11.5px] px-2 py-1 border rounded bg-background w-full ${pending ? "opacity-60" : ""}`}
      />
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </span>
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
