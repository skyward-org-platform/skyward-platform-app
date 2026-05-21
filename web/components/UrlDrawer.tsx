"use client";

// Universal URL drawer. One component, one open/close path. Anywhere a URL
// row is clickable (per-action WQA tabs, "All URLs", future Audit views)
// this drawer slides in from the right and shows:
//   1. Header (domain + URL + close)
//   2. Signals (read-only WQA aggregate metrics)
//   3. Phase 1 (effective triage action + logic — chip render only)
//   4. Phase 2 checks (live evaluateChecks output × page_check_state)
//   5. Execution (page_execution status/owner/due/notes/target_url)
//   6. Restore spec (only when currentAction starts with "Restore")
//   7. History (placeholder until the history reader lands)
//   8. Footer (deep links — full page + Phase 2 view)
//
// Inputs are uncontrolled (defaultValue) — the server actions revalidate
// the Pages route via cache tag, so any change re-renders with fresh data.
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

export function UrlDrawer({
  open,
  onClose,
  propertySlug,
  propertyId,
  primaryDomain,
  row,
  currentAction,
  category,
  execution,
  checkStatesForUrl,
  ctx,
}: {
  open: boolean;
  onClose: () => void;
  propertySlug: string;
  propertyId: string | null;
  primaryDomain: string | null;
  row: WqaRow | null;
  /** Effective action after override overlay; rendered as a chip. */
  currentAction: string;
  /** URL category — passed through to evaluateChecks for T5/T7 medians. */
  category: string;
  execution: PageExecutionRow | null;
  /** Per-URL slice of check states, keyed by check_id. */
  checkStatesForUrl: Map<string, PageCheckStateRow>;
  ctx: Ctx;
}) {
  // ESC + body scroll lock. Same shape as BrandDnaAssistantDrawer so the
  // app has one drawer behavior, not two.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !row) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="URL details"
    >
      {/* Backdrop — clicks here close the drawer. */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* Slide-over panel. Width matches BrandDnaAssistantDrawer. */}
      <div className="ml-auto h-full w-full sm:w-[480px] md:w-[560px] bg-background border-l shadow-xl relative flex flex-col">
        <Header
          primaryDomain={primaryDomain}
          url={row.url}
          onClose={onClose}
        />
        <div className="flex-1 overflow-y-auto">
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
        </div>
        <Footer propertySlug={propertySlug} url={row.url} />
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────
function Header({
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
function Footer({
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
