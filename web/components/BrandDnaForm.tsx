"use client";

// Bespoke form primitives for Brand DNA editors (Identity, Voice & Tone).
//
// Each field component owns its own draft + saved state and calls the parent
// save action on blur (auto-save). A per-field status dot next to the label
// surfaces in-flight / error states without yanking focus.

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";

export type SaveFn = (
  next: unknown,
) => Promise<{ ok: true } | { ok: false; error: string }>;

function useFieldSaver<T>(initial: T, onSave: SaveFn) {
  const [committed, setCommitted] = useState<T>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(next: T) {
    if (JSON.stringify(next) === JSON.stringify(committed)) return;
    const previous = committed;
    setCommitted(next);
    setError(null);
    startTransition(async () => {
      const res = await onSave(next);
      if (!res.ok) {
        setCommitted(previous);
        setError(res.error);
      }
    });
  }
  return { committed, commit, pending, error };
}

function StatusDot({
  pending,
  error,
}: {
  pending: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <span
        className="inline-block size-1.5 rounded-full bg-rose-500 ml-2 align-middle"
        title={error}
      />
    );
  }
  if (pending) {
    return (
      <span
        className="inline-block size-1.5 rounded-full bg-amber-500 ml-2 align-middle animate-pulse"
        title="Saving…"
      />
    );
  }
  return null;
}

function FieldLabel({
  children,
  pending,
  error,
}: {
  children: React.ReactNode;
  pending: boolean;
  error: string | null;
}) {
  return (
    <label className="block text-[12px] font-semibold text-foreground mb-1.5">
      {children}
      <StatusDot pending={pending} error={error} />
    </label>
  );
}

export function BrandDnaSelectField({
  label,
  initialValue,
  options,
  onSave,
  placeholder = "Choose…",
  widthClass = "w-60",
}: {
  label: string;
  initialValue: string;
  options: readonly string[];
  onSave: SaveFn;
  placeholder?: string;
  widthClass?: string;
}) {
  const { committed, commit, pending, error } = useFieldSaver(
    initialValue,
    onSave,
  );

  return (
    <div>
      <FieldLabel pending={pending} error={error}>
        {label}
      </FieldLabel>
      <select
        value={committed}
        onChange={(e) => commit(e.target.value)}
        className={`${widthClass} px-3 py-2 text-[13px] border rounded-md bg-card outline-none focus:border-foreground/40 cursor-pointer`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

export function BrandDnaTextField({
  label,
  initialValue,
  onSave,
  placeholder,
  widthClass = "w-full",
}: {
  label: string;
  initialValue: string;
  onSave: SaveFn;
  placeholder?: string;
  widthClass?: string;
}) {
  const { committed, commit, pending, error } = useFieldSaver(
    initialValue,
    onSave,
  );
  const [draft, setDraft] = useState(committed);
  useEffect(() => {
    setDraft(committed);
  }, [committed]);

  return (
    <div>
      <FieldLabel pending={pending} error={error}>
        {label}
      </FieldLabel>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        placeholder={placeholder}
        className={`${widthClass} px-3 py-2 text-[13px] border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground`}
      />
    </div>
  );
}

export function BrandDnaTextareaField({
  label,
  initialValue,
  onSave,
  rows = 5,
  placeholder,
}: {
  label: string;
  initialValue: string;
  onSave: SaveFn;
  rows?: number;
  placeholder?: string;
}) {
  const { committed, commit, pending, error } = useFieldSaver(
    initialValue,
    onSave,
  );
  const [draft, setDraft] = useState(committed);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(committed);
  }, [committed]);

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [draft]);

  return (
    <div>
      <FieldLabel pending={pending} error={error}>
        {label}
      </FieldLabel>
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 text-[13px] leading-relaxed border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground resize-none whitespace-pre-wrap"
      />
    </div>
  );
}

export function BrandDnaChipsField({
  label,
  initialValue,
  onSave,
  placeholder = "+ add",
}: {
  label: string;
  initialValue: string[];
  onSave: SaveFn;
  placeholder?: string;
}) {
  const { committed, commit, pending, error } = useFieldSaver<string[]>(
    initialValue,
    onSave,
  );
  const [adding, setAdding] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const trimmed = adding.trim();
    if (!trimmed) return;
    if (committed.includes(trimmed)) {
      setAdding("");
      return;
    }
    commit([...committed, trimmed]);
    setAdding("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function remove(idx: number) {
    commit(committed.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <FieldLabel pending={pending} error={error}>
        {label}
      </FieldLabel>
      <div
        className={`flex flex-wrap items-center gap-1.5 ${
          pending ? "opacity-60" : ""
        }`}
      >
        {committed.map((item, idx) => (
          <span
            key={`${item}-${idx}`}
            className="inline-flex items-center gap-1 text-[12px] bg-muted/60 text-foreground border rounded-md px-2 py-1"
          >
            <span>{item}</span>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-muted-foreground hover:text-rose-700 -mr-0.5 leading-none text-base"
              aria-label={`Remove ${item}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
            if (e.key === "Backspace" && adding === "" && committed.length > 0) {
              remove(committed.length - 1);
            }
          }}
          onBlur={add}
          placeholder={placeholder}
          className="text-[12px] bg-transparent border border-dashed border-muted-foreground/40 rounded-md px-2 py-1 outline-none focus:border-foreground/40 placeholder:text-muted-foreground/70"
          style={{ width: `${Math.max(adding.length + 2, 8)}ch` }}
        />
      </div>
    </div>
  );
}

export function BrandDnaFormCard({
  title,
  subcopy,
  source,
  children,
}: {
  title: string;
  subcopy: React.ReactNode;
  /** brand_dna_section.source — drives the AI-source badge in the header.
   *  Any value starting with "ai:" means a model wrote at least some of
   *  the current content; the badge prompts the user to verify. */
  source?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="border rounded-lg bg-card overflow-hidden">
      <header className="px-5 sm:px-6 py-4 border-b flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
            {subcopy}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <AiSourceBadge source={source} />
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
            title="Changes save automatically when you leave a field."
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Auto-saving
          </span>
        </div>
      </header>
      <div className="px-5 sm:px-6 py-5 space-y-5">{children}</div>
    </section>
  );
}

/** Small "✦ AI-sourced" pill that flags fields a model wrote. The user
 *  should verify before relying on AI content downstream. */
export function AiSourceBadge({ source }: { source?: string | null }) {
  if (!source || !source.startsWith("ai:")) return null;
  const label =
    source === "ai:research-and-fill"
      ? "Research & Fill"
      : source === "ai:assistant"
        ? "Assistant"
        : source.replace(/^ai:/, "");
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-violet-50 text-violet-700 border border-violet-200"
      title={`Latest write was AI (${source}). Verify before trusting downstream.`}
    >
      <span className="text-violet-500">✦</span> AI · {label}
    </span>
  );
}

export function BrandDnaFormFooter({
  lastEditedAt,
  lastEditedBy,
}: {
  lastEditedAt: string | null;
  lastEditedBy: string | null;
}) {
  if (!lastEditedAt) {
    return (
      <p className="text-center text-[11px] text-muted-foreground mt-5">
        No edits yet · changes auto-snapshot to history.
      </p>
    );
  }
  return (
    <p className="text-center text-[11px] text-muted-foreground mt-5">
      Last edited{" "}
      <strong className="text-foreground">{fmtRel(lastEditedAt)}</strong>
      {lastEditedBy && (
        <>
          {" "}
          by <strong className="text-foreground">{lastEditedBy}</strong>
        </>
      )}{" "}
      · auto-snapshot in history
    </p>
  );
}

function fmtRel(iso: string): string {
  const ms = Date.now() - +new Date(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}
