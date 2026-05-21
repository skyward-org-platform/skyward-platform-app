"use client";

// Cross-property activity timeline with filter chips and three info
// densities (Today / Yesterday / This week / Older), per v2 screen 10.
//
// Owns local filter state (event-type chips). Items are pre-fetched + sorted
// by the server; this component buckets them by recency and renders each
// bucket at its appropriate density.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ActivityItem, ActivityKind } from "@/lib/activity";

const KINDS: { value: ActivityKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "brand_dna_edit", label: "Brand DNA" },
  { value: "page_audit", label: "Pages" },
  { value: "project_brain", label: "Project Brain" },
];

const KIND_DOT: Record<ActivityKind, string> = {
  brand_dna_edit: "bg-indigo-500",
  page_audit: "bg-emerald-500",
  project_brain: "bg-violet-500",
};

const KIND_LABEL: Record<ActivityKind, string> = {
  brand_dna_edit: "Brand DNA",
  page_audit: "Page audit",
  project_brain: "Project Brain",
};

const DAY = 24 * 60 * 60 * 1000;

function bucketOf(iso: string): "today" | "yesterday" | "week" | "older" {
  const ms = Date.now() - +new Date(iso);
  if (ms < DAY) return "today";
  if (ms < 2 * DAY) return "yesterday";
  if (ms < 7 * DAY) return "week";
  return "older";
}

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

function actorInitials(actor: string): string {
  // Best-effort 2-char initial. "ui:prototype" → "UI". "agent:voice_tone_v1" → "AG".
  // Real user names like "Paul Skirbe" → "PS".
  const cleaned = actor.replace(/[:_-].*$/, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const [filter, setFilter] = useState<ActivityKind | "all">("all");

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const buckets = useMemo(() => {
    const out: Record<
      "today" | "yesterday" | "week" | "older",
      ActivityItem[]
    > = { today: [], yesterday: [], week: [], older: [] };
    for (const i of filtered) out[bucketOf(i.at)].push(i);
    return out;
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const k of ["brand_dna_edit", "page_audit", "project_brain"] as const) {
      c[k] = items.filter((i) => i.kind === k).length;
    }
    return c;
  }, [items]);

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground mt-1 tabular-nums">
          {items.length} event{items.length === 1 ? "" : "s"} across all
          properties.{" "}
          <span className="text-muted-foreground/70">
            BQ project + AI / system events come with V2 logging infra.
          </span>
        </p>
      </header>

      {/* Filter chip bar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setFilter(k.value)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
              filter === k.value
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground hover:bg-muted"
            }`}
          >
            {k.label}
            <span
              className={`ml-1.5 tabular-nums ${
                filter === k.value
                  ? "text-background/70"
                  : "text-muted-foreground"
              }`}
            >
              {counts[k.value] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Buckets */}
      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <Bucket label="Today" items={buckets.today} density="full" />
          <Bucket label="Yesterday" items={buckets.yesterday} density="dense" />
          <Bucket label="Earlier this week" items={buckets.week} density="thin" />
          <Bucket label="Older" items={buckets.older} density="thin" />
        </div>
      )}
    </div>
  );
}

function Bucket({
  label,
  items,
  density,
}: {
  label: string;
  items: ActivityItem[];
  density: "full" | "dense" | "thin";
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <header className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        {label} <span className="text-muted-foreground/60">· {items.length}</span>
      </header>
      <div
        className={
          density === "thin"
            ? "border rounded-lg bg-card overflow-hidden"
            : "space-y-1.5"
        }
      >
        {items.map((it, i) =>
          density === "full" ? (
            <ItemFull key={it.id} item={it} />
          ) : density === "dense" ? (
            <ItemDense key={it.id} item={it} />
          ) : (
            <ItemThin key={it.id} item={it} first={i === 0} />
          ),
        )}
      </div>
    </section>
  );
}

function ItemFull({ item: it }: { item: ActivityItem }) {
  return (
    <Link
      href={it.href}
      className="block border rounded-lg bg-card p-4 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span
          className={`size-2 rounded-full ${KIND_DOT[it.kind]} mt-1.5 shrink-0`}
          aria-hidden
        />
        <div
          className="size-7 rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-white flex items-center justify-center text-[10px] font-semibold shrink-0"
          title={it.actor}
        >
          {actorInitials(it.actor)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] leading-snug">
            <span className="font-medium">{it.title}</span>
            {it.property_name && (
              <>
                {" "}
                <span className="text-muted-foreground">·</span>{" "}
                <span className="text-muted-foreground">
                  {it.property_name}
                </span>
              </>
            )}
          </div>
          {it.detail && (
            <div className="text-[12px] text-muted-foreground mt-0.5 truncate">
              {it.detail}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground/80 mt-1 tabular-nums uppercase tracking-wider">
            {fmtRel(it.at)} · {it.actor}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ItemDense({ item: it }: { item: ActivityItem }) {
  return (
    <Link
      href={it.href}
      className="flex items-start gap-3 border rounded-lg bg-card px-3 py-2 hover:bg-muted/30"
    >
      <span
        className={`size-1.5 rounded-full ${KIND_DOT[it.kind]} mt-2 shrink-0`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] leading-snug">
          <span className="font-medium">{it.title}</span>
          {it.property_name && (
            <>
              {" "}
              <span className="text-muted-foreground">·</span>{" "}
              <span className="text-muted-foreground">{it.property_name}</span>
            </>
          )}
        </div>
        {it.detail && (
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {it.detail}
          </div>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground/80 tabular-nums shrink-0 ml-2 mt-0.5">
        {fmtRel(it.at)}
      </div>
    </Link>
  );
}

function ItemThin({ item: it, first }: { item: ActivityItem; first: boolean }) {
  return (
    <Link
      href={it.href}
      className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/30 ${
        first ? "" : "border-t"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${KIND_DOT[it.kind]} shrink-0`}
        aria-hidden
      />
      <div className="flex-1 min-w-0 text-[12px] leading-snug truncate">
        <span className="text-foreground">{KIND_LABEL[it.kind]}</span>
        {it.property_name && (
          <span className="text-muted-foreground"> · {it.property_name}</span>
        )}
        <span className="text-muted-foreground"> · </span>
        <span className="text-muted-foreground truncate">{it.detail || it.title}</span>
      </div>
      <div className="text-[10px] text-muted-foreground/80 tabular-nums shrink-0">
        {fmtRel(it.at)}
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border rounded-lg bg-card p-8 text-center">
      <p className="text-sm text-foreground font-medium">Nothing matches.</p>
      <p className="text-xs text-muted-foreground mt-2">
        Try a different filter, or wait for new edits to show up.
      </p>
    </div>
  );
}
