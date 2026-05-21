"use client";

// Per-check drill view. Rendered when ?mode=audit&view=checklist&check=T6.
// Shows every URL in the audit scope (Optimize+Restore) that fails the
// requested check, with inline editable Status + Owner. Mirrors the
// Python `write_issue_tab` per-check sheet from build_phase2_technical.py.
//
// Row click opens the universal URL drawer; status/owner edits go
// straight to page_check_state via the server actions. The Pages route
// revalidates on each write so re-rendering picks up the new values.

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TabHeader,
  TableShell,
  ThinHeaderRow,
  UrlCell,
  TD,
} from "@/components/wqa/helpers";
import {
  CHECKS_BY_ID,
  evaluateChecks,
  type CheckResult,
  type Ctx,
} from "@/lib/wqa-checks";
import {
  EXECUTION_STATUSES,
  type ExecutionStatus,
} from "@/lib/page-execution";
import {
  checkStateKey,
  type PageCheckStateRow,
} from "@/lib/page-check-state";
import {
  setCheckOwner,
  setCheckStatus,
} from "@/app/properties/[slug]/pages/wqa-actions";
import type { TriagedRow } from "@/components/wqa/types";

type RowVm = {
  triaged: TriagedRow;
  result: CheckResult;
  /** Existing page_check_state for this (url, check_id) — undefined if
   *  the operator hasn't touched it yet. */
  state: PageCheckStateRow | undefined;
};

export function AuditCheckDetailView({
  checkId,
  propertySlug,
  scopeTriaged,
  ctx,
  checkStatesByKey,
  onOpenDrawer,
}: {
  checkId: string;
  propertySlug: string;
  scopeTriaged: TriagedRow[];
  ctx: Ctx;
  checkStatesByKey: Map<string, PageCheckStateRow>;
  onOpenDrawer: (url: string) => void;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const def = CHECKS_BY_ID.get(checkId);
  // Cheap to compute when def is missing / blocked / sitewide because
  // those branches don't touch the result, but we keep the hook order
  // stable per Rules of Hooks.
  const canEvaluate =
    def !== undefined && def.kind === "active" && def.category !== "S";
  const vms: RowVm[] = useMemo(() => {
    if (!canEvaluate) return [];
    const out: RowVm[] = [];
    for (const t of scopeTriaged) {
      const results = evaluateChecks(t.row, t.row.type ?? "Other", ctx);
      const hit = results.find((r) => r.id === checkId);
      if (!hit) continue;
      const state = checkStatesByKey.get(checkStateKey(t.row.url, checkId));
      out.push({ triaged: t, result: hit, state });
    }
    return out;
  }, [canEvaluate, scopeTriaged, ctx, checkId, checkStatesByKey]);

  function backToChecklist() {
    const params = new URLSearchParams(sp.toString());
    params.set("mode", "audit");
    params.set("view", "checklist");
    params.delete("check");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  if (!def) {
    return (
      <div>
        <BackLink onClick={backToChecklist} />
        <div className="border border-dashed border-rose-200 rounded-lg bg-rose-50 p-8 text-center text-rose-800">
          <p className="text-sm font-semibold">Unknown check id: {checkId}</p>
          <p className="text-[12px] mt-1 text-rose-700/80">
            Valid ids are T1–T20, C1–C20, S1–S12.
          </p>
        </div>
      </div>
    );
  }

  if (def.kind === "blocked") {
    return (
      <div>
        <BackLink onClick={backToChecklist} />
        <TabHeader
          title={`${def.id} · ${def.name}`}
          count={0}
          subtitle={
            <>
              <span className="font-medium text-foreground">Action:</span>{" "}
              {def.action} ·{" "}
              <span className="font-medium text-foreground">
                KW dependency:
              </span>{" "}
              {def.kwDependency}
            </>
          }
        />
        <div className="border border-dashed rounded-lg bg-indigo-50/40 p-10 text-center">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">
            BLOCKED
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            This check can&rsquo;t run against the current data.
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground max-w-md mx-auto">
            {def.blockedReason}
          </p>
        </div>
      </div>
    );
  }

  if (def.category === "S") {
    return (
      <div>
        <BackLink onClick={backToChecklist} />
        <TabHeader
          title={`${def.id} · ${def.name}`}
          count={0}
          subtitle={
            <>
              Sitewide check ·{" "}
              <span className="font-medium text-foreground">Action:</span>{" "}
              {def.action}
            </>
          }
        />
        <div className="border border-dashed rounded-lg bg-muted/30 p-10 text-center text-[12px] text-muted-foreground">
          Sitewide checks run against the property as a whole, not
          per-URL. The live sitewide runner (robots.txt / sitemap.xml /
          HTTPS / hreflang) ships in a later chunk; for now, verify
          manually per SOP §7.
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackLink onClick={backToChecklist} />
      <TabHeader
        title={`${def.id} · ${def.name}`}
        count={vms.length}
        subtitle={
          <>
            <span className="font-medium text-foreground">Action:</span>{" "}
            {def.action} ·{" "}
            <span className="font-medium text-foreground">
              KW dependency:
            </span>{" "}
            {def.kwDependency} · scope: Optimize + Restore
          </>
        }
      />

      {vms.length === 0 ? (
        <div className="border border-dashed rounded-lg bg-emerald-50/40 p-10 text-center">
          <p className="text-sm font-medium text-emerald-800">
            No scope URLs fail this check.
          </p>
          <p className="text-[12px] text-emerald-700/80 mt-1">
            Nothing to do here.
          </p>
        </div>
      ) : (
        <TableShell>
          <ThinHeaderRow
            cells={[
              { label: "URL" },
              { label: "Category" },
              { label: "Service" },
              { label: "Detail" },
              { label: "Status" },
              { label: "Owner" },
            ]}
          />
          <tbody>
            {vms.map((v) => (
              <CheckDetailRow
                key={v.triaged.row.url}
                propertySlug={propertySlug}
                checkId={def.id}
                vm={v}
                onOpenDrawer={onOpenDrawer}
              />
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function CheckDetailRow({
  propertySlug,
  checkId,
  vm,
  onOpenDrawer,
}: {
  propertySlug: string;
  checkId: string;
  vm: RowVm;
  onOpenDrawer: (url: string) => void;
}) {
  const r = vm.triaged.row;
  const initialStatus: ExecutionStatus = vm.state?.status ?? "To Do";
  const initialOwner = vm.state?.owner ?? "";

  const [status, setStatus] = useState<ExecutionStatus>(initialStatus);
  const [owner, setOwner] = useState<string>(initialOwner);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStatusChange(next: ExecutionStatus) {
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const res = await setCheckStatus(propertySlug, r.url, checkId, next);
      if (!res.ok) setError(res.error);
    });
  }

  function commitOwner() {
    if (owner === initialOwner) return;
    setError(null);
    const value = owner.trim() || null;
    startTransition(async () => {
      const res = await setCheckOwner(propertySlug, r.url, checkId, value);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <tr
      onClick={() => onOpenDrawer(r.url)}
      className="border-t hover:bg-muted/40 cursor-pointer align-top"
    >
      <td className={`${TD} max-w-0`}>
        <UrlCell url={r.url} title={r.current_title} />
      </td>
      <td className={`${TD} text-[11px] text-muted-foreground whitespace-nowrap`}>
        {r.type ?? "—"}
      </td>
      <td className={`${TD} text-[11px] text-muted-foreground whitespace-nowrap`}>
        {/* No Service column on WqaRow today — placeholder until page
            category lands. Keeps the column for layout parity with the
            workbook. */}
        —
      </td>
      <td className={`${TD} text-[11px]`}>{vm.result.detail}</td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <select
          value={status}
          disabled={pending}
          onChange={(e) => handleStatusChange(e.target.value as ExecutionStatus)}
          className="text-[11px] border rounded px-1.5 py-0.5 bg-card"
        >
          {EXECUTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {error && (
          <div className="text-[10px] text-rose-600 mt-1 max-w-[120px]">
            {error}
          </div>
        )}
      </td>
      <td className={TD} onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={owner}
          disabled={pending}
          placeholder="—"
          onChange={(e) => setOwner(e.target.value)}
          onBlur={commitOwner}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="text-[11px] border rounded px-1.5 py-0.5 bg-card w-[100px]"
        />
      </td>
    </tr>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1"
    >
      <span aria-hidden>←</span> Audit Checklist
    </button>
  );
}
