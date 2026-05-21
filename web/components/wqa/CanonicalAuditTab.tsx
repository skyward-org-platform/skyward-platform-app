"use client";

// Per WQA SOP Tab 8 "Canonical Audit" — every Optimize URL where the
// current canonical doesn't self-resolve to the URL itself. Two issue
// classes:
//   - Missing  : no canonical tag detected (Add self-canonical)
//   - Mismatch : canonical points elsewhere (verify intent — may be a real
//                duplicate, may be a bug)
//
// OK rows (canonical == URL) are filtered out so the audit surfaces only
// the URLs that need a fix. Each row opens the universal URL drawer for
// the deeper investigation.

import { EmptyTab, TabHeader, TableShell, UrlCell } from "@/components/wqa/helpers";
import type { ActionTabProps, TriagedRow } from "@/components/wqa/types";

type Issue = "Missing" | "Mismatch";

const ISSUE_BAND: Record<Issue, string> = {
  Missing: "bg-amber-50 text-amber-800",
  Mismatch: "bg-rose-50 text-rose-700",
};

type Audited = {
  row: TriagedRow["row"];
  triage: TriagedRow["triage"];
  canonical: string;
  issue: Issue;
};

function classify(r: TriagedRow): Audited | null {
  if (!r.triage.action.toString().startsWith("Optimize")) return null;
  const canonRaw = (r.row.canonical_link_element ?? "").trim();
  if (!canonRaw) {
    return { row: r.row, triage: r.triage, canonical: "", issue: "Missing" };
  }
  if (canonRaw === r.row.url) return null;
  return {
    row: r.row,
    triage: r.triage,
    canonical: canonRaw,
    issue: "Mismatch",
  };
}

export function CanonicalAuditTab({ all, onOpenDrawer }: ActionTabProps) {
  // Read from `all` (every triaged row) rather than `rows` so this tab
  // works regardless of how it's filtered upstream — the SOP behavior is
  // "every Optimize URL with a canonical issue".
  const audited = all
    .map((r) => classify(r))
    .filter((x): x is Audited => x !== null);

  if (audited.length === 0) {
    return (
      <EmptyTab message="No canonical issues on Optimize URLs. Every page either has a self-canonical or no Optimize tag yet." />
    );
  }

  return (
    <section>
      <TabHeader
        title="Canonical Audit"
        subtitle={
          <>
            Every Optimize URL whose canonical tag is missing or points
            elsewhere. Per WQA SOP § 7.1 Tab 8 — the correct canonical for an
            Optimize URL is itself; anything else needs a developer pass to
            either fix the tag or consolidate the URL.
          </>
        }
        count={audited.length}
      />

      <TableShell>
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
          <tr>
            <th className="text-left px-3 py-2 font-medium min-w-[260px]">URL</th>
            <th className="text-left px-2 py-2 font-medium min-w-[260px]">
              Current canonical
            </th>
            <th className="text-left px-2 py-2 font-medium min-w-[260px]">
              Correct canonical
            </th>
            <th className="text-left px-2 py-2 font-medium">Issue</th>
            <th className="text-left px-2 py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {audited.map(({ row, canonical, issue }) => (
            <tr
              key={row.url}
              className={`border-t hover:bg-muted/40 ${onOpenDrawer ? "cursor-pointer" : ""}`}
              onClick={() => onOpenDrawer?.(row.url)}
            >
              <td className="px-3 py-1.5 max-w-0">
                <UrlCell url={row.url} title={row.current_title} />
              </td>
              <td className="px-2 py-1.5 max-w-0">
                {canonical ? (
                  <div
                    className="font-mono text-[11px] truncate text-muted-foreground"
                    title={canonical}
                  >
                    {canonical}
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground italic">
                    (none)
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 max-w-0">
                <div
                  className="font-mono text-[11px] truncate text-emerald-700"
                  title={row.url}
                >
                  {row.url}
                </div>
              </td>
              <td className="px-2 py-1.5">
                <span
                  className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${ISSUE_BAND[issue]}`}
                >
                  {issue}
                </span>
              </td>
              <td className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                {issue === "Missing"
                  ? "Add self-canonical."
                  : "Current canonical does not match URL. Verify."}
              </td>
            </tr>
          ))}
        </tbody>
      </TableShell>
    </section>
  );
}
