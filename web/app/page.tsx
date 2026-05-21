// V1.1 Phase 2 — Workspace Dashboard (v2 screen 1)
//
// Replaces today's "Welcome." page. Real counts from Supabase + BQ Meta.
// The signals card is mocked per the brief — real signal infrastructure
// (ranking deltas, stale audits, pending Brand DNA approvals) is V2 horizon.

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { apiBase } from "@/lib/api-base";
import { PhaseStrip } from "@/components/PhaseStrip";
import { detectSignals, type Signal } from "@/lib/signals";
import {
  getActivityFeed,
  type ActivityItem,
  type ActivityKind,
} from "@/lib/activity";

// ─── Data ──────────────────────────────────────────────────────────────

type SupabaseClient = {
  id: string;
  slug: string;
  name: string;
  status: string;
};

type SupabaseProperty = {
  id: string;
  client_id: string;
  slug: string;
  name: string;
  pipeline_phase: number;
  status: string;
};

type BqClient = {
  client_id: number;
  client_name: string;
  is_active: boolean;
};

async function getStats() {
  // Run six count queries in parallel. All are head:true so we get count
  // without payload.
  const monthStartIso = (() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  const [bqRes, propsRes, pagesRes, pagesPrevRes, editsRes, editsPrevRes] =
    await Promise.all([
      // Active BQ Meta clients (16 total in catalog; how many are is_active)
      (async () => {
        try {
          const r = await fetch(`${apiBase()}/api/clients`, {
            next: { revalidate: 60 },
          });
          if (!r.ok) return null;
          const j = (await r.json()) as { clients: BqClient[] };
          return j.clients;
        } catch {
          return null;
        }
      })(),
      // Active properties in Supabase
      supabase
        .from("property")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      // Pages triaged this month
      supabase
        .from("page")
        .select("id", { count: "exact", head: true })
        .gte("audit_decided_at", monthStartIso),
      // Pages triaged before this month (for trend) — capped to last 60d for cost
      supabase
        .from("page")
        .select("id", { count: "exact", head: true })
        .lt("audit_decided_at", monthStartIso),
      // Brand DNA edits this month
      supabase
        .from("brand_dna_section_history")
        .select("id", { count: "exact", head: true })
        .gte("snapshotted_at", monthStartIso),
      // Brand DNA edits before this month
      supabase
        .from("brand_dna_section_history")
        .select("id", { count: "exact", head: true })
        .lt("snapshotted_at", monthStartIso),
    ]);

  const bqClients = bqRes ?? [];
  const activeBqClients = bqClients.filter((c) => c.is_active).length;

  return {
    activeClients: activeBqClients,
    totalBqClients: bqClients.length,
    properties: propsRes.count ?? 0,
    pagesThisMonth: pagesRes.count ?? 0,
    pagesPrev: pagesPrevRes.count ?? 0,
    editsThisMonth: editsRes.count ?? 0,
    editsPrev: editsPrevRes.count ?? 0,
  };
}

async function getEngagements() {
  // Each row is one Supabase-tracked active client with at least one property.
  const [clientsRes, propsRes] = await Promise.all([
    supabase
      .from("client")
      .select("id, slug, name, status")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("property")
      .select("id, client_id, slug, name, pipeline_phase, status")
      .eq("status", "active"),
  ]);
  const clients = (clientsRes.data ?? []) as SupabaseClient[];
  const properties = (propsRes.data ?? []) as SupabaseProperty[];

  const byClient = new Map<string, SupabaseProperty[]>();
  for (const p of properties) {
    const arr = byClient.get(p.client_id) ?? [];
    arr.push(p);
    byClient.set(p.client_id, arr);
  }

  return clients
    .map((c) => {
      const props = byClient.get(c.id) ?? [];
      const maxPhase = props.reduce(
        (m, p) => Math.max(m, p.pipeline_phase ?? 0),
        0,
      );
      return {
        client: c,
        properties: props,
        maxPhase,
      };
    })
    .filter((e) => e.properties.length > 0);
}

// Dashboard activity = top-8 from lib/activity.ts (includes Project Brain
// events alongside Brand DNA edits + page audits).

// Signals now come from lib/signals.ts — real detection against Supabase.

// ─── View helpers ──────────────────────────────────────────────────────

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

function trendArrow(curr: number, prev: number): {
  text: string;
  cls: string;
} | null {
  if (prev === 0 || prev == null) return null;
  const delta = curr - prev;
  if (delta === 0) return null;
  return delta > 0
    ? { text: `↑ ${delta.toLocaleString()}`, cls: "text-emerald-700" }
    : { text: `↓ ${Math.abs(delta).toLocaleString()}`, cls: "text-red-600" };
}

// ─── View ──────────────────────────────────────────────────────────────

export default async function Dashboard() {
  const [stats, engagements, activity, signalSnapshot] = await Promise.all([
    getStats(),
    getEngagements(),
    getActivityFeed({ limit: 8, perSource: 8 }),
    detectSignals(),
  ]);
  // Dashboard card surfaces ACTIVE signals only — snoozed items live on
  // /signals.
  const signals = signalSnapshot.active;

  const pageTrend = trendArrow(stats.pagesThisMonth, stats.pagesPrev);
  const editTrend = trendArrow(stats.editsThisMonth, stats.editsPrev);

  // Resolve activity → client. property_id is on each ActivityItem; map it to
  // the client_id by looking it up in the engagements property list.
  const propToClient = new Map<string, string>();
  for (const e of engagements) {
    for (const p of e.properties) propToClient.set(p.id, e.client.id);
  }
  const latestByClient = new Map<string, string>();
  for (const a of activity) {
    if (!a.property_id) continue;
    const cid = propToClient.get(a.property_id);
    if (!cid) continue;
    if (!latestByClient.has(cid)) latestByClient.set(cid, a.at);
  }

  return (
    <div className="p-4 sm:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="text-sm text-slate-500 mt-1">
          {engagements.length} active engagement
          {engagements.length === 1 ? "" : "s"}
          {activity.length > 0 && (
            <>
              {" · "}last edit{" "}
              <span className="tabular-nums">{fmtRel(activity[0].at)}</span>
            </>
          )}
          .
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <StatTile
          label="Active clients"
          value={stats.activeClients}
          sub={`${stats.totalBqClients} in BQ Meta catalog`}
        />
        <StatTile
          label="Properties in pipeline"
          value={stats.properties}
          sub="active in Supabase"
        />
        <StatTile
          label="Pages triaged this month"
          value={stats.pagesThisMonth}
          trend={pageTrend}
        />
        <StatTile
          label="Brand DNA edits"
          value={stats.editsThisMonth}
          trend={editTrend}
        />
      </div>

      {/* split-2: engagements (2fr) + signals/activity (1fr) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
        <EngagementsCard engagements={engagements} latestActivityAt={latestByClient} />
        <div className="space-y-4">
          <SignalsCard signals={signals} />
          <ActivityCard items={activity} />
        </div>
      </div>
    </div>
  );
}

// ─── Components ────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: number;
  sub?: string;
  trend?: { text: string; cls: string } | null;
}) {
  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {value.toLocaleString()}
        </div>
        {trend && (
          <span className={`text-[11px] font-medium ${trend.cls}`}>
            {trend.text}
          </span>
        )}
      </div>
      {sub && (
        <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
          {sub}
        </div>
      )}
    </div>
  );
}

function EngagementsCard({
  engagements,
  latestActivityAt,
}: {
  engagements: Awaited<ReturnType<typeof getEngagements>>;
  latestActivityAt: Map<string, string>;
}) {
  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="px-5 py-3.5 border-b flex items-center">
        <h2 className="text-[13px] font-semibold">Active engagements</h2>
        <span className="ml-auto text-[10px] text-slate-400 uppercase tracking-wider">
          {engagements.length} client{engagements.length === 1 ? "" : "s"}
        </span>
      </div>
      {engagements.length === 0 ? (
        <div className="p-6 text-sm text-slate-500">
          No active engagements yet. Add a client + property to see them here.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-5 py-2 font-medium">Client</th>
              <th className="text-left px-3 py-2 font-medium">Properties</th>
              <th className="text-left px-3 py-2 font-medium">Pipeline</th>
              <th className="text-left px-3 py-2 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {engagements.map((e) => {
              const propTarget =
                e.properties.length === 1
                  ? `/properties/${e.properties[0].slug}`
                  : `/clients/${e.client.slug}`;
              const lastAt = latestActivityAt.get(e.client.id);
              return (
                <tr key={e.client.id} className="border-t hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      href={propTarget}
                      className="font-medium hover:underline"
                    >
                      {e.client.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-slate-600 tabular-nums">
                    {e.properties.length}
                  </td>
                  <td className="px-3 py-3 w-[140px]">
                    <PhaseStrip currentPhase={e.maxPhase} />
                  </td>
                  <td className="px-3 py-3 text-slate-500 text-xs tabular-nums">
                    {lastAt ? fmtRel(lastAt) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SignalsCard({ signals }: { signals: Signal[] }) {
  const top = signals.slice(0, 4);
  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="px-5 py-3.5 border-b flex items-center">
        <h2 className="text-[13px] font-semibold">Signals</h2>
        <Link
          href="/signals"
          className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider hover:text-foreground"
        >
          {signals.length} · open →
        </Link>
      </div>
      <div className="p-5 space-y-3">
        {top.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Nothing flagged. Detection runs against active properties only.
          </div>
        ) : (
          top.map((s) => (
            <Link
              key={s.id}
              href={s.action.href}
              className="flex gap-3 -mx-2 px-2 py-1 rounded hover:bg-muted/40"
            >
              <SeverityDot severity={s.severity} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium leading-snug truncate">
                  {s.title}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                  {s.detail}
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-0.5 uppercase tracking-wider">
                  {s.source}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function SeverityDot({
  severity,
}: {
  severity: "urgent" | "watch" | "info";
}) {
  const cls =
    severity === "urgent"
      ? "bg-red-500"
      : severity === "watch"
      ? "bg-amber-500"
      : "bg-slate-300";
  return (
    <span
      className={`size-1.5 rounded-full mt-2 shrink-0 ${cls}`}
      aria-label={severity}
    />
  );
}

const ACTIVITY_DOT: Record<ActivityKind, string> = {
  brand_dna_edit: "bg-indigo-500",
  page_audit: "bg-emerald-500",
  project_brain: "bg-violet-500",
};

function ActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b flex items-center">
        <h2 className="text-[13px] font-semibold">Recent activity</h2>
        <Link
          href="/activity"
          className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider hover:text-foreground"
        >
          {items.length} · open →
        </Link>
      </div>
      <div className="p-5 space-y-3">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground">No edits yet.</div>
        ) : (
          items.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              className="flex gap-3 text-xs -mx-2 px-2 py-1 rounded hover:bg-muted/40"
            >
              <span
                className={`size-1.5 rounded-full mt-1.5 shrink-0 ${ACTIVITY_DOT[it.kind]}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] leading-snug truncate">
                  <span className="font-medium">{it.title}</span>
                  {it.detail && (
                    <>
                      {" · "}
                      <span className="text-muted-foreground">{it.detail}</span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-0.5 tabular-nums">
                  {fmtRel(it.at)} · {it.actor}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

