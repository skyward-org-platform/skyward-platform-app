"use client";

// Client-side annotation editor. Calls the createAnnotation server action
// then closes itself + resets fields on success. Used in the Site view's
// annotations panel.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAnnotation } from "@/app/properties/[slug]/tracking/actions";
import type { AnnotationKind } from "@/lib/tracking";

const KINDS: { value: AnnotationKind; label: string }[] = [
  { value: "publish", label: "Publish" },
  { value: "refresh", label: "Refresh" },
  { value: "redirect", label: "Redirect" },
  { value: "technical_fix", label: "Technical fix" },
  { value: "brand_change", label: "Brand change" },
  { value: "algo_update", label: "Algo update" },
  { value: "external_event", label: "External event" },
  { value: "other", label: "Other" },
];

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function AddAnnotationForm({ propertySlug }: { propertySlug: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [kind, setKind] = useState<AnnotationKind>("publish");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [appliedUrl, setAppliedUrl] = useState("");
  const [appliedKw, setAppliedKw] = useState("");
  const router = useRouter();

  function reset() {
    setOccurredAt(todayISO());
    setKind("publish");
    setTitle("");
    setBody("");
    setAppliedUrl("");
    setAppliedKw("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createAnnotation(propertySlug, {
        occurred_at: occurredAt,
        kind,
        title,
        body: body || undefined,
        applied_to_url: appliedUrl || undefined,
        applied_to_keyword: appliedKw || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium border border-foreground/80 text-foreground rounded px-3 py-1.5 hover:bg-foreground hover:text-background transition-colors"
      >
        + Add annotation
      </button>
    );
  }

  return (
    <div className="border rounded-lg bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          New annotation
        </div>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date">
          <input
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-xs bg-background"
          />
        </Field>
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AnnotationKind)}
            className="w-full border rounded px-2 py-1.5 text-xs bg-background"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Published cluster hub page"
          className="w-full border rounded px-2 py-1.5 text-xs bg-background"
        />
      </Field>

      <Field label="Body (optional)">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="What changed and why"
          className="w-full border rounded px-2 py-1.5 text-xs bg-background"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Applied to URL (optional)">
          <input
            type="text"
            value={appliedUrl}
            onChange={(e) => setAppliedUrl(e.target.value)}
            placeholder="https://example.com/page"
            className="w-full border rounded px-2 py-1.5 text-xs bg-background font-mono"
          />
        </Field>
        <Field label="Applied to keyword (optional)">
          <input
            type="text"
            value={appliedKw}
            onChange={(e) => setAppliedKw(e.target.value)}
            placeholder="best widgets near me"
            className="w-full border rounded px-2 py-1.5 text-xs bg-background"
          />
        </Field>
      </div>

      {error && (
        <div className="text-xs text-rose-600 border border-rose-200 bg-rose-50 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          disabled={pending || !title.trim()}
          onClick={submit}
          className="text-xs font-medium bg-foreground text-background rounded px-3 py-1.5 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save annotation"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
