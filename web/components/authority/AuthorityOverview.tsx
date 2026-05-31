"use client";

// Authority Overview (v2). Scorecard fed by:
//   - latest link_audit row (live RDs, spam %, toxic %)
//   - referring_domain rows (DR distribution, top 5 by DR)
//   - backlink rows (dofollow %, top target pages)
// If no link_audit row exists, surfaces a "Run audit" empty state.
//
// "Run audit" opens a confirm modal that lets the operator pick quick vs
// full mode and shows a cost estimate. Calls runLinkAudit (server action)
// then flashes a success/error chip + router.refresh() so the page renders
// the freshly-written link_audit row.

import type {
  BacklinkRow,
  LinkAuditRow,
  ReferringDomainRow,
} from "@/lib/authority";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runLinkAudit } from "@/app/properties/[slug]/authority/actions";
import { DrPill } from "./DrPill";
import { RunAuditModal } from "./RunAuditModal";

const DR_BUCKETS: { label: string; min: number; max: number; tint: string }[] = [
  { label: "0-20", min: 0, max: 20, tint: "bg-slate-300" },
  { label: "21-40", min: 21, max: 40, tint: "bg-orange-300" },
  { label: "41-60", min: 41, max: 60, tint: "bg-amber-300" },
  { label: "61-80", min: 61, max: 80, tint: "bg-lime-300" },
  { label: "81-100", min: 81, max: 100, tint: "bg-emerald-400" },
];

type Flash =
  | { kind: "ok"; message: string }
  | { kind: "err"; message: string }
  | null;

export function AuthorityOverview({
  latestAudit,
  refDomains,
  backlinks,
  propertySlug,
  primaryDomain,
}: {
  latestAudit: LinkAuditRow | null;
  refDomains: ReferringDomainRow[];
  backlinks: BacklinkRow[];
  propertySlug: string;
  primaryDomain?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);

  // Auto-clear flash after 6s.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  function handleRun(mode: "quick" | "full") {
    setModalOpen(false);
    startTransition(async () => {
      const res = await runLinkAudit(propertySlug, {
        mode,
        capUnits: mode === "full" ? 10000 : 3000,
      });
      if (!res.ok) {
        setFlash({ kind: "err", message: res.error });
        return;
      }
      const usd = (res.costUnits / 10000).toFixed(2);
      const toxicPct =
        res.liveRds > 0
          ? `${((res.spamRds / res.liveRds) * 100).toFixed(0)}%`
          : "—";
      const partialNote = res.partial ? " (partial — cap hit)" : "";
      setFlash({
        kind: "ok",
        message: `Audit complete${partialNote}: ${res.liveRds} RDs, ${toxicPct} toxic, ${res.disavowAutoFlagged} disavow flagged. Cost: ${res.costUnits.toLocaleString()} units (~$${usd}).`,
      });
      router.refresh();
    });
  }

  // Empty state — no audit row exists yet.
  if (!latestAudit) {
    return (
      <>
        <FlashChip flash={flash} />
        <div className="border border-dashed rounded-lg p-8 bg-muted/30 text-center">
          <div className="text-sm font-semibold mb-1">No link audit yet</div>
          <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
            Run an Ahrefs audit to populate live RDs, DR distribution, toxic
            %, top RDs, and the most-linked target pages. Spam-flagged RDs
            auto-create pending disavow entries.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
          >
            {pending ? "Running…" : "Run audit"}
          </button>
        </div>
        {modalOpen && (
          <RunAuditModal
            domain={primaryDomain ?? "(no primary_domain set)"}
            onCancel={() => setModalOpen(false)}
            onRun={handleRun}
            pending={pending}
          />
        )}
      </>
    );
  }

  // ─── Derived stats ────────────────────────────────────────────────────────
  const liveRds = latestAudit.live_rds ?? refDomains.length;
  const spamRds = latestAudit.spam_rds ?? 0;
  const toxicPct =
    latestAudit.toxic_pct != null
      ? `${Number(latestAudit.toxic_pct).toFixed(1)}%`
      : liveRds > 0
        ? `${((spamRds / liveRds) * 100).toFixed(1)}%`
        : "—";
  const liveBacklinks =
    latestAudit.live_backlinks ??
    backlinks.filter((b) => !b.is_lost).length;

  const dofollowCount = backlinks.filter(
    (b) => b.link_type === "followed" || b.link_type === "dofollow",
  ).length;
  const dofollowPct =
    backlinks.length > 0
      ? `${((dofollowCount / backlinks.length) * 100).toFixed(1)}%`
      : "—";

  // DR distribution histogram from referring_domain rows.
  const drBuckets = DR_BUCKETS.map((b) => ({
    ...b,
    count: refDomains.filter(
      (r) =>
        r.domain_rating != null &&
        r.domain_rating >= b.min &&
        r.domain_rating <= b.max,
    ).length,
  }));
  const maxBucketCount = Math.max(1, ...drBuckets.map((b) => b.count));

  // Top 5 RDs by DR.
  const topRds = [...refDomains]
    .filter((r) => r.domain_rating != null)
    .sort(
      (a, b) =>
        (b.domain_rating ?? 0) - (a.domain_rating ?? 0) ||
        (b.backlink_count ?? 0) - (a.backlink_count ?? 0),
    )
    .slice(0, 5);

  // Top 5 target pages by RD count (group backlinks by target_url, count
  // distinct source_domain).
  const targetMap = new Map<string, Set<string>>();
  for (const bl of backlinks) {
    if (!bl.target_url) continue;
    if (!targetMap.has(bl.target_url)) targetMap.set(bl.target_url, new Set());
    targetMap.get(bl.target_url)!.add(bl.source_domain);
  }
  const topTargets = Array.from(targetMap.entries())
    .map(([url, set]) => ({ url, rdCount: set.size }))
    .sort((a, b) => b.rdCount - a.rdCount)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <FlashChip flash={flash} />

      {/* ─── Toolbar with re-run button ───────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded border bg-foreground text-background disabled:opacity-50"
        >
          {pending ? "Running…" : "Run audit"}
        </button>
      </div>

      {/* ─── Scorecard ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Live RDs" value={liveRds.toLocaleString()} />
        <Tile label="Live backlinks" value={liveBacklinks.toLocaleString()} />
        <Tile label="Dofollow %" value={dofollowPct} />
        <Tile label="Toxic %" value={toxicPct} accent="rose" />
      </div>

      {/* ─── DR distribution histogram ──────────────────────────────────── */}
      <div className="border rounded-lg p-4 bg-card">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
          Domain Rating distribution
        </div>
        <div className="space-y-2">
          {drBuckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <div className="w-14 text-[11px] tabular-nums text-right">
                {b.label}
              </div>
              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                <div
                  className={`h-full ${b.tint}`}
                  style={{
                    width: `${(b.count / maxBucketCount) * 100}%`,
                  }}
                />
              </div>
              <div className="w-12 text-[11px] tabular-nums text-right text-muted-foreground">
                {b.count.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Top RDs + Top target pages ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted">
            Top 5 referring domains by DR
          </div>
          {topRds.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">
              No referring domains.
            </div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {topRds.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-[11.5px]">
                      {r.domain}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <DrPill value={r.domain_rating} />
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                      {r.backlink_count?.toLocaleString() ?? "—"} links
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold bg-muted">
            Top 5 target pages by RD count
          </div>
          {topTargets.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">
              No backlinks ingested yet.
            </div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {topTargets.map((t) => (
                  <tr key={t.url} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-[11px] truncate max-w-0" title={t.url}>
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {t.url}
                      </a>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {t.rdCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── Audit metadata footer ──────────────────────────────────────── */}
      <div className="text-[11px] text-muted-foreground">
        Latest audit:{" "}
        <span className="font-mono">
          {new Date(latestAudit.audited_at).toLocaleString()}
        </span>{" "}
        by {latestAudit.audited_by ?? "unknown"}.
      </div>

      {modalOpen && (
        <RunAuditModal
          domain={primaryDomain ?? "(no primary_domain set)"}
          onCancel={() => setModalOpen(false)}
          onRun={handleRun}
          pending={pending}
        />
      )}
    </div>
  );
}

function FlashChip({ flash }: { flash: Flash }) {
  if (!flash) return null;
  const cls =
    flash.kind === "ok"
      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
      : "bg-rose-50 border-rose-300 text-rose-900";
  return (
    <div
      role="status"
      className={`text-xs border rounded-md px-3 py-2 ${cls}`}
    >
      {flash.message}
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "rose";
}) {
  const accentCls =
    accent === "rose"
      ? "text-rose-600"
      : "";
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className={`text-3xl font-semibold tabular-nums mt-1 ${accentCls}`}>
        {value}
      </div>
    </div>
  );
}
