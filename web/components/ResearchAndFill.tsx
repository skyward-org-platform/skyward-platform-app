"use client";

// Research & Fill — client orchestrator for Brand DNA auto-population.
//
// Each section is researched via /api/research-fill/[slug]/[section], which
// streams Server-Sent Events back as it works:
//   fetching_homepage → fetching_about → asking_claude → saving → done|error
//
// The client shows each phase in the section's status pill so the user can
// see real progress instead of one opaque spinner.
//
// Sections run sequentially: it keeps the UI legible, keeps each function
// invocation comfortably inside the Vercel timeout, and avoids hammering
// the Anthropic API in bursts.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Phase =
  | "idle"
  | "queued"
  | "fetching_homepage"
  | "fetching_about"
  | "asking_claude"
  | "saving"
  | "done"
  | "error";

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  queued: "Queued",
  fetching_homepage: "Fetching homepage…",
  fetching_about: "Fetching /about…",
  asking_claude: "Asking Claude…",
  saving: "Saving…",
  done: "Filled",
  error: "Error",
};

type SectionRow = {
  key: string;
  label: string;
  filled: boolean;
};

type SectionState = {
  phase: Phase;
  error?: string;
  filledKeys?: string[];
};

export function ResearchAndFill({
  propertySlug,
  domain,
  sections,
}: {
  propertySlug: string;
  domain: string | null;
  sections: SectionRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(sections.filter((s) => !s.filled).map((s) => s.key)),
  );
  const [state, setState] = useState<Record<string, SectionState>>({});
  const [pending, startTransition] = useTransition();
  const running = pending;

  function toggle(key: string) {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(sections.map((s) => s.key)));
  }
  function selectEmpty() {
    setSelected(new Set(sections.filter((s) => !s.filled).map((s) => s.key)));
  }
  function clearSelection() {
    setSelected(new Set());
  }

  async function runOne(sectionKey: string): Promise<void> {
    setState((s) => ({ ...s, [sectionKey]: { phase: "fetching_homepage" } }));
    try {
      const res = await fetch(
        `/api/research-fill/${encodeURIComponent(propertySlug)}/${encodeURIComponent(sectionKey)}`,
        { method: "POST" },
      );
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        setState((s) => ({
          ...s,
          [sectionKey]: { phase: "error", error: text || `HTTP ${res.status}` },
        }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE events are double-newline separated.
        let idx = buf.indexOf("\n\n");
        while (idx >= 0) {
          const event = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = event
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (dataLine) {
            try {
              const payload = JSON.parse(dataLine.slice("data: ".length));
              applyPhase(sectionKey, payload);
            } catch {
              // ignore malformed event
            }
          }
          idx = buf.indexOf("\n\n");
        }
      }
    } catch (e) {
      setState((s) => ({
        ...s,
        [sectionKey]: {
          phase: "error",
          error: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  }

  function applyPhase(
    sectionKey: string,
    payload: { phase: string; error?: string; filledKeys?: string[] },
  ) {
    setState((s) => {
      const phase = payload.phase as Phase;
      return {
        ...s,
        [sectionKey]: {
          phase,
          error: payload.error,
          filledKeys: payload.filledKeys,
        },
      };
    });
  }

  function start() {
    const queue = sections.map((s) => s.key).filter((k) => selected.has(k));
    if (queue.length === 0) return;

    // Mark everything queued up front so the user sees the full plan.
    setState(() => {
      const next: Record<string, SectionState> = {};
      for (const k of queue) next[k] = { phase: "queued" };
      return next;
    });

    startTransition(async () => {
      for (const sectionKey of queue) {
        await runOne(sectionKey);
      }
      // Refresh the route so the Completeness card + chips update.
      router.refresh();
    });
  }

  if (!domain) {
    return (
      <div className="border border-dashed rounded-lg p-5 text-[12px] text-muted-foreground bg-muted/30">
        <strong className="text-foreground font-semibold">
          Research &amp; Fill is unavailable.
        </strong>{" "}
        This property has no primary_domain set; add one in Supabase before
        running research.
      </div>
    );
  }

  const selectedCount = selected.size;

  return (
    <section className="border rounded-lg bg-card overflow-hidden">
      <header className="px-5 py-3.5 border-b flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight inline-flex items-center gap-2">
            <span className="text-violet-600">✦</span> Research &amp; Fill
          </h2>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
            Auto-populate empty Brand DNA sections by researching{" "}
            <code className="bg-muted px-1 rounded text-[11px]">{domain}</code>{" "}
            with Claude. Existing fields are merged, not overwritten — empty
            results from research are dropped so a low-confidence pass
            can&rsquo;t blow away your edits.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={running || selectedCount === 0}
          className="text-sm font-medium px-3 py-1.5 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title={
            selectedCount === 0
              ? "Select at least one section"
              : `Run research on ${selectedCount} section${
                  selectedCount === 1 ? "" : "s"
                }`
          }
        >
          {running ? "Researching…" : `Run on ${selectedCount}`}
        </button>
      </header>

      {/* Disclaimer: scope of what gets fetched. Important context so users
          understand low-quality results (e.g. SPAs without SSR). */}
      <div className="px-5 py-2.5 border-b bg-amber-50/40 text-[11px] text-amber-900/80 leading-relaxed">
        <strong className="font-semibold">Heads up:</strong> only the homepage
        and{" "}
        <code className="bg-amber-100 text-amber-900 px-1 rounded text-[10px]">
          /about
        </code>{" "}
        are fetched. SPAs without server-side rendering, gated content, or
        deeper service / pricing pages won&rsquo;t reach Claude. Sparse
        homepages give sparse results — refine manually after a pass.
      </div>

      <div className="px-5 py-3 border-b flex items-center gap-3 flex-wrap text-[11px]">
        <span className="text-muted-foreground">Quick select:</span>
        <button
          type="button"
          onClick={selectEmpty}
          disabled={running}
          className="text-foreground hover:underline disabled:opacity-50"
        >
          Empty sections
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button
          type="button"
          onClick={selectAll}
          disabled={running}
          className="text-foreground hover:underline disabled:opacity-50"
        >
          All
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button
          type="button"
          onClick={clearSelection}
          disabled={running}
          className="text-foreground hover:underline disabled:opacity-50"
        >
          None
        </button>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {selectedCount} of {sections.length} selected
        </span>
      </div>

      <ul className="divide-y">
        {sections.map((s) => {
          const st = state[s.key];
          const isChecked = selected.has(s.key);
          return (
            <li
              key={s.key}
              className="px-5 py-2.5 flex items-center gap-3 text-[13px]"
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={running}
                onChange={() => toggle(s.key)}
                className="size-3.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                aria-label={`Include ${s.label}`}
              />
              <span className="flex-1 min-w-0 truncate">{s.label}</span>
              <SectionStatusPill filled={s.filled} state={st} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SectionStatusPill({
  filled,
  state,
}: {
  filled: boolean;
  state?: SectionState;
}) {
  // Live state (during/after a run) takes precedence over the at-load filled
  // flag — once we've researched, we know the new state for real.
  if (state) {
    const { phase } = state;
    if (phase === "idle") return null;
    if (phase === "queued") {
      return (
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {PHASE_LABEL.queued}
        </span>
      );
    }
    if (phase === "done") {
      return (
        <span
          className="text-[10px] uppercase tracking-wider text-emerald-700 inline-flex items-center gap-1.5"
          title={
            state.filledKeys && state.filledKeys.length > 0
              ? `Filled: ${state.filledKeys.join(", ")}`
              : "Filled"
          }
        >
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Filled · {state.filledKeys?.length ?? 0}
        </span>
      );
    }
    if (phase === "error") {
      return (
        <span
          className="text-[10px] uppercase tracking-wider text-rose-700 inline-flex items-center gap-1.5"
          title={state.error}
        >
          <span className="size-1.5 rounded-full bg-rose-500" />
          Error
        </span>
      );
    }
    // In-flight phases: amber pulsing dot + the specific phase label.
    return (
      <span className="text-[10px] uppercase tracking-wider text-amber-700 inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
        {PHASE_LABEL[phase]}
      </span>
    );
  }
  // At-load state
  if (filled) {
    return (
      <span className="text-[10px] uppercase tracking-wider text-emerald-700 inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Has content
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      Empty
    </span>
  );
}
