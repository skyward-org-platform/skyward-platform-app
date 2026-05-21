"use client";

// Per WQA SOP Tab 12 "Restore URLs" — pages that 404 but should exist.
// Each row needs the spec for rebuilding: target keyword + SV + H1 +
// Title Tag + Meta Description + Schema Types. We pre-populate what we
// can from WQA data; the spec scaffolding (Title/Meta/Schema) is the
// follow-up enrichment pass.

import { useState, useTransition } from "react";
import { EmptyTab, TabHeader, TableShell, UrlCell, fmtN } from "@/components/wqa/helpers";
import { WqaActionChip } from "@/components/wqa/WqaActionChip";
import type { ActionTabProps } from "@/components/wqa/types";
import type { ExecutionField } from "@/app/properties/[slug]/pages/wqa-actions";
import { setExecutionField } from "@/app/properties/[slug]/pages/wqa-actions";

export function RestoreTab({ rows, propertySlug, onOpenDrawer, execByUrl }: ActionTabProps) {
  if (rows.length === 0) {
    return (
      <EmptyTab message="No URLs are tagged Restore. Pages 404 with rank ≤ 20 or sessions > 20 would land here." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Restore"
        subtitle={
          <>
            Broken (404) pages that should be recreated. Per SOP § 5.2 rule 5
            — rank ≤ 20 or sessions &gt; 20 triggers a Restore. Each row is
            the spec brief: target keyword, SV, and the page-rebuild fields
            from the industry template.
          </>
        }
        count={rows.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
            <th className="text-left px-2 py-2 font-medium">Action</th>
            <th className="text-right px-2 py-2 font-medium">Status</th>
            <th className="text-left px-2 py-2 font-medium min-w-[180px]">Target keyword</th>
            <th className="text-right px-2 py-2 font-medium">SV</th>
            <th className="text-right px-2 py-2 font-medium">Rank</th>
            <th className="text-right px-2 py-2 font-medium">Sessions</th>
            <th className="text-right px-2 py-2 font-medium">Refs</th>
            <th className="text-left px-2 py-2 font-medium min-w-[220px]">Target H1</th>
            <th className="text-left px-2 py-2 font-medium min-w-[260px]">Target Title</th>
            <th className="text-left px-2 py-2 font-medium min-w-[320px]">Target Meta</th>
            <th className="text-left px-2 py-2 font-medium min-w-[240px]">Why restore (triage logic)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const kw = r.row.best_tv_keyword || r.row.best_sv_keyword;
            const sv = r.row.best_tv_kw_sv ?? r.row.best_sv_kw_sv;
            const rank = r.row.best_tv_kw_rank ?? r.row.best_sv_kw_rank;
            const exec = execByUrl?.get(r.row.url);
            return (
              <tr
                key={r.row.url}
                className={`border-t hover:bg-muted/40 ${onOpenDrawer ? "cursor-pointer" : ""}`}
                onClick={() => onOpenDrawer?.(r.row.url)}
              >
                <td className="px-3 py-1.5 max-w-0">
                  <UrlCell url={r.row.url} title={r.row.current_title} />
                </td>
                <td
                  className="px-2 py-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <WqaActionChip
                    propertySlug={propertySlug}
                    url={r.row.url}
                    sopAction={r.triage.sopAction ?? r.triage.action}
                    initialAction={r.triage.action}
                    isOverridden={!!r.triage.isOverridden}
                  />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-rose-700">
                  {r.row.status_code ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-[11px]">
                  {kw ? <span title={kw}>{kw}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(sv)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(rank)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.sessions)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.row.referring_domains)}</td>
                <td className="px-2 py-1.5">
                  <SpecField
                    propertySlug={propertySlug}
                    url={r.row.url}
                    field="target_h1"
                    defaultValue={exec?.target_h1 ?? ""}
                    placeholder="H1…"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <SpecField
                    propertySlug={propertySlug}
                    url={r.row.url}
                    field="target_title"
                    defaultValue={exec?.target_title ?? ""}
                    placeholder="Title tag…"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <SpecField
                    propertySlug={propertySlug}
                    url={r.row.url}
                    field="target_meta"
                    defaultValue={exec?.target_meta ?? ""}
                    placeholder="Meta description…"
                    multiline
                  />
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                  {r.triage.logic}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </section>
  );
}

/** Inline editor for one of the page_execution target_* fields. On blur,
 *  diffs against the seed; writes via setExecutionField when different.
 *  stopPropagation on the wrapper keeps the row click from opening the
 *  drawer while typing. Multiline = textarea (Target Meta is multi-line). */
function SpecField({
  propertySlug,
  url,
  field,
  defaultValue,
  placeholder,
  multiline,
}: {
  propertySlug: string;
  url: string;
  field: Extract<ExecutionField, "target_h1" | "target_title" | "target_meta">;
  defaultValue: string;
  placeholder: string;
  multiline?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const baseCls = `text-[11px] w-full px-2 py-1 rounded border border-input bg-background ${pending ? "opacity-60" : ""}`;
  const wrap = (
    <div
      className="inline-flex items-center gap-1 w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {multiline ? (
        <textarea
          defaultValue={defaultValue}
          placeholder={placeholder}
          rows={2}
          className={`${baseCls} resize-y leading-snug`}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
      ) : (
        <input
          type="text"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={baseCls}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
      )}
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </div>
  );
  return wrap;

  function commit(raw: string) {
    const next = raw.trim() || null;
    if ((next ?? "") === (defaultValue ?? "")) return;
    setError(null);
    startTransition(async () => {
      const res = await setExecutionField(propertySlug, url, field, next);
      if (!res.ok) setError(res.error);
    });
  }
}
