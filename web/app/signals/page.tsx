// /signals — v2 screen 9. Real signal surface with snooze support.
//
// Detection logic in lib/signals.ts. Snoozed signals live in their own
// "Snoozed" section at the bottom with an Unsnooze affordance. Active
// signals also each carry a per-row Snooze button.

import Link from "next/link";
import { detectSignals, type Signal, type SignalSeverity } from "@/lib/signals";
import { SnoozeButton } from "@/components/SignalSnoozeButton";

const SEVERITY_META: Record<
  SignalSeverity,
  { label: string; dot: string; band: string; description: string }
> = {
  urgent: {
    label: "Urgent",
    dot: "bg-rose-500",
    band: "border-rose-200 bg-rose-50/50",
    description: "Active engagement blocked or at risk. Address now.",
  },
  watch: {
    label: "Watch",
    dot: "bg-amber-500",
    band: "border-amber-200 bg-amber-50/50",
    description: "Drift or backlog. Resolve before the next phase.",
  },
  info: {
    label: "Info",
    dot: "bg-slate-400",
    band: "border-slate-200 bg-card",
    description: "Heads-up. Review when convenient.",
  },
};

function fmtRel(iso: string): string {
  const ms = Date.now() - +new Date(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default async function SignalsPage() {
  const { active, snoozed, snoozedAt } = await detectSignals();

  const urgent = active.filter((s) => s.severity === "urgent");
  const watch = active.filter((s) => s.severity === "watch");
  const info = active.filter((s) => s.severity === "info");

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
        <p className="text-sm text-muted-foreground mt-1 tabular-nums">
          {active.length} active · {snoozed.length} snoozed · derived from
          Supabase.{" "}
          <span className="text-muted-foreground/70">
            Ranking deltas (GSC) come with V2 infra.
          </span>
        </p>
      </div>

      {active.length === 0 && snoozed.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <SignalGroup severity="urgent" signals={urgent} />
          <SignalGroup severity="watch" signals={watch} />
          <SignalGroup severity="info" signals={info} />
          {snoozed.length > 0 && (
            <SnoozedGroup signals={snoozed} snoozedAt={snoozedAt} />
          )}
        </div>
      )}
    </div>
  );
}

function SignalGroup({
  severity,
  signals,
}: {
  severity: SignalSeverity;
  signals: Signal[];
}) {
  if (signals.length === 0) return null;
  const meta = SEVERITY_META[severity];
  return (
    <section>
      <header className="flex items-center gap-2 mb-2">
        <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden />
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {meta.label} · {signals.length}
        </h2>
        <span className="text-[11px] text-muted-foreground/70 ml-2">
          {meta.description}
        </span>
      </header>
      <div className="space-y-2">
        {signals.map((s) =>
          severity === "info" ? (
            <SignalRowInfo key={s.id} signal={s} />
          ) : severity === "watch" ? (
            <SignalRowWatch key={s.id} signal={s} />
          ) : (
            <SignalRowUrgent key={s.id} signal={s} />
          ),
        )}
      </div>
    </section>
  );
}

function SnoozedGroup({
  signals,
  snoozedAt,
}: {
  signals: Signal[];
  snoozedAt: Map<string, string>;
}) {
  return (
    <section>
      <header className="flex items-center gap-2 mb-2 pt-2 border-t">
        <span className="size-1.5 rounded-full bg-slate-400" aria-hidden />
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          Snoozed · {signals.length}
        </h2>
        <span className="text-[11px] text-muted-foreground/70 ml-2">
          Deferred. Unsnooze to bring back into the active list.
        </span>
      </header>
      <div className="space-y-2">
        {signals.map((s) => {
          const at = snoozedAt.get(s.id);
          return (
            <div
              key={s.id}
              className="border rounded-lg bg-card px-3 py-2 flex items-center gap-3 opacity-70 hover:opacity-100 transition-opacity"
            >
              <span
                className={`size-1.5 rounded-full ${SEVERITY_META[s.severity].dot} shrink-0`}
                aria-hidden
              />
              <div className="flex-1 min-w-0 text-[12px] leading-snug">
                <span className="text-foreground">{s.title}</span>
                <span className="text-muted-foreground"> · {s.property.name}</span>
                <span className="text-muted-foreground/70 ml-2 text-[10px] uppercase tracking-wider">
                  snoozed {at ? fmtRel(at) : "—"}
                </span>
              </div>
              <SnoozeButton signalId={s.id} variant="unsnooze" compact />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SignalRowUrgent({ signal: s }: { signal: Signal }) {
  const meta = SEVERITY_META[s.severity];
  return (
    <div className={`border rounded-lg p-4 ${meta.band}`}>
      <div className="flex items-start gap-3">
        <span className={`size-2 rounded-full ${meta.dot} mt-1.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold leading-snug">
            {s.title}
          </div>
          <PropertyTag signal={s} />
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {s.detail}
          </p>
          <SourceLine signal={s} />
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <ActionLink signal={s} />
          <SnoozeButton signalId={s.id} compact />
        </div>
      </div>
    </div>
  );
}

function SignalRowWatch({ signal: s }: { signal: Signal }) {
  const meta = SEVERITY_META[s.severity];
  return (
    <div className={`border rounded-lg p-3 ${meta.band}`}>
      <div className="flex items-start gap-3">
        <span className={`size-1.5 rounded-full ${meta.dot} mt-2 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium leading-snug">{s.title}</div>
          <PropertyTag signal={s} />
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {s.detail}
          </p>
          <SourceLine signal={s} />
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <ActionLink signal={s} compact />
          <SnoozeButton signalId={s.id} compact />
        </div>
      </div>
    </div>
  );
}

function SignalRowInfo({ signal: s }: { signal: Signal }) {
  return (
    <div className="border rounded-lg px-3 py-2 bg-card flex items-center gap-3">
      <span className="size-1.5 rounded-full bg-slate-400 shrink-0" />
      <div className="flex-1 min-w-0 text-[12px] leading-snug">
        <span className="text-foreground">{s.title}</span>
        {s.property && (
          <span className="text-muted-foreground"> · {s.property.name}</span>
        )}
        <span className="text-muted-foreground/70 ml-2 text-[10px] uppercase tracking-wider">
          {s.source}
        </span>
      </div>
      <ActionLink signal={s} compact />
      <SnoozeButton signalId={s.id} compact />
    </div>
  );
}

function PropertyTag({ signal: s }: { signal: Signal }) {
  return (
    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
      <Link
        href={`/properties/${s.property.slug}`}
        className="bg-muted px-1.5 py-px rounded hover:bg-card hover:text-foreground"
      >
        {s.property.name}
      </Link>
      {s.property.client && <span>· {s.property.client}</span>}
    </div>
  );
}

function SourceLine({ signal: s }: { signal: Signal }) {
  return (
    <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-2">
      {s.source}
    </div>
  );
}

function ActionLink({
  signal: s,
  compact,
}: {
  signal: Signal;
  compact?: boolean;
}) {
  const cls = compact
    ? "text-xs font-medium px-2.5 py-1 border rounded-md text-foreground hover:bg-muted whitespace-nowrap shrink-0"
    : "text-sm font-medium px-3 py-1.5 bg-foreground text-background rounded-md hover:bg-foreground/85 whitespace-nowrap shrink-0";
  return (
    <Link href={s.action.href} className={cls}>
      {s.action.label}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="border rounded-lg bg-card p-8 text-center">
      <p className="text-sm text-foreground font-medium">Nothing flagged.</p>
      <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-sm mx-auto">
        Every active property has Brand DNA populated, audit decisions are
        fresh, and triage backlogs are clear. When that drifts, signals will
        appear here.
      </p>
    </div>
  );
}
