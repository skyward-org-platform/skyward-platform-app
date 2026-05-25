"use client";

// Client-side editor for the Competitors list. Renders the row table +
// inline 'add competitor' form + per-row priority dropdown + inline
// notes editor + remove button. Server actions live in the brand-dna
// actions module so the writes are server-side + revalidate the
// hero phase strip + brand DNA layout.

import { useState, useTransition } from "react";
import {
  addCompetitor,
  importCompetitorsFromBqMeta,
  removeCompetitor,
  updateCompetitor,
} from "@/app/properties/[slug]/brand-dna/actions";
import type { Competitor, CompetitorPriority } from "@/lib/competitors";

const PRIORITIES: CompetitorPriority[] = ["high", "medium", "low"];

// Per-priority tint applied to the row's select control so the color cue
// lives on the control itself (avoids the redundant chip-next-to-dropdown
// stack the previous iteration had).
const PRIORITY_TINT: Record<CompetitorPriority, string> = {
  high: "bg-rose-50 text-rose-800 border-rose-300 font-semibold",
  medium: "bg-amber-50 text-amber-800 border-amber-300 font-medium",
  low: "bg-slate-50 text-slate-700 border-slate-300",
};

export function CompetitorsEditor({
  propertySlug,
  initialCompetitors,
  bqMetaCount,
  showImportButton,
}: {
  propertySlug: string;
  initialCompetitors: Competitor[];
  bqMetaCount: number;
  showImportButton: boolean;
}) {
  const [competitors, setCompetitors] = useState(initialCompetitors);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Add form state
  const [newDomain, setNewDomain] = useState("");
  const [newPriority, setNewPriority] = useState<CompetitorPriority>("medium");
  const [newNotes, setNewNotes] = useState("");

  function flash(msg: string, kind: "info" | "error" = "info") {
    if (kind === "error") {
      setError(msg);
      setInfo(null);
    } else {
      setInfo(msg);
      setError(null);
    }
    setTimeout(() => {
      setError(null);
      setInfo(null);
    }, 4000);
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    startTransition(async () => {
      const res = await addCompetitor(
        propertySlug,
        newDomain,
        newPriority,
        newNotes || null,
      );
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      // Optimistically refetch is unnecessary - revalidatePath fires;
      // for snappy UI we also reset the form locally. The parent
      // server component re-renders with the new list.
      setNewDomain("");
      setNewPriority("medium");
      setNewNotes("");
      flash("Competitor added.");
    });
  };

  const handleRemove = (c: Competitor) => {
    if (!confirm(`Remove ${c.domain} from competitors?`)) return;
    startTransition(async () => {
      const res = await removeCompetitor(propertySlug, c.id);
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      setCompetitors((prev) => prev.filter((x) => x.id !== c.id));
      flash(`Removed ${c.domain}.`);
    });
  };

  const handleUpdatePriority = (
    c: Competitor,
    next: CompetitorPriority,
  ) => {
    startTransition(async () => {
      const res = await updateCompetitor(propertySlug, c.id, { priority: next });
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      setCompetitors((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, priority: next } : x)),
      );
    });
  };

  const handleUpdateNotes = (c: Competitor, nextNotes: string) => {
    if ((c.notes ?? "") === nextNotes) return;
    startTransition(async () => {
      const res = await updateCompetitor(propertySlug, c.id, {
        notes: nextNotes,
      });
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      setCompetitors((prev) =>
        prev.map((x) =>
          x.id === c.id ? { ...x, notes: nextNotes.trim() || null } : x,
        ),
      );
    });
  };

  const handleImport = () => {
    startTransition(async () => {
      const res = await importCompetitorsFromBqMeta(propertySlug);
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      flash(
        `Imported ${res.imported} competitor${res.imported === 1 ? "" : "s"}${
          res.skipped > 0 ? ` (${res.skipped} already present)` : ""
        }. Reloading...`,
      );
      // Hard refresh so the server-component re-fetches with the new
      // Supabase rows. Cheaper than threading the new list back through
      // state given the import is a once-per-property action.
      setTimeout(() => window.location.reload(), 700);
    });
  };

  return (
    <div className="space-y-4">
      {/* Status toast */}
      {(error || info) && (
        <div
          className={
            "text-[11.5px] px-3 py-2 border rounded " +
            (error
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800")
          }
        >
          {error ?? info}
        </div>
      )}

      {/* Import banner */}
      {showImportButton && (
        <div className="border border-dashed border-amber-300 bg-amber-50 rounded-md px-4 py-3 flex items-center justify-between gap-4">
          <div className="text-[12px] text-amber-900 leading-snug">
            <strong>Empty list.</strong> BQ Meta has {bqMetaCount} competitor
            {bqMetaCount === 1 ? "" : "s"} for this property. Import them as
            a starting point - you can edit, add, or remove them after.
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={pending}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-[11.5px] font-medium rounded shrink-0"
          >
            {pending ? "Importing..." : `Import ${bqMetaCount} from BQ Meta`}
          </button>
        </div>
      )}

      {/* Add competitor form */}
      <form
        onSubmit={handleAdd}
        className="border rounded-lg bg-card p-3 grid grid-cols-[1fr_140px_2fr_auto] gap-2 items-end"
      >
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Domain
          </label>
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="example.com"
            className="w-full text-[12px] px-2.5 py-1.5 border rounded-md bg-card outline-none focus:border-foreground/40 font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Priority
          </label>
          <select
            value={newPriority}
            onChange={(e) =>
              setNewPriority(e.target.value as CompetitorPriority)
            }
            className="w-full text-[12px] px-2 py-1.5 border rounded-md bg-card outline-none cursor-pointer"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Notes
          </label>
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Why they compete, relationships, etc"
            className="w-full text-[12px] px-2.5 py-1.5 border rounded-md bg-card outline-none focus:border-foreground/40"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !newDomain.trim()}
          className="px-3 py-1.5 bg-foreground text-background text-[11.5px] font-medium rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </form>

      {/* Competitor table */}
      {competitors.length === 0 && !showImportButton ? (
        <div className="border rounded-lg bg-card p-6 text-center text-[12px] text-muted-foreground">
          No competitors yet. Add one above to get started.
        </div>
      ) : competitors.length > 0 ? (
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium min-w-[220px]">
                  Domain
                </th>
                <th className="text-left px-3 py-2 font-medium w-[120px]">
                  Priority
                </th>
                <th className="text-left px-3 py-2 font-medium">Notes</th>
                <th className="text-right px-3 py-2 font-medium w-[80px]">
                  Source
                </th>
                <th className="px-3 py-2 font-medium w-[60px]" />
              </tr>
            </thead>
            <tbody>
              {competitors.map((c) => (
                <CompetitorRow
                  key={c.id}
                  c={c}
                  pending={pending}
                  onRemove={() => handleRemove(c)}
                  onUpdatePriority={(p) => handleUpdatePriority(c, p)}
                  onUpdateNotes={(n) => handleUpdateNotes(c, n)}
                />
              ))}
            </tbody>
          </table>
          <footer className="px-4 py-2 border-t bg-muted/20 text-[10.5px] text-muted-foreground tabular-nums">
            {competitors.length} competitor{competitors.length === 1 ? "" : "s"}
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function CompetitorRow({
  c,
  pending,
  onRemove,
  onUpdatePriority,
  onUpdateNotes,
}: {
  c: Competitor;
  pending: boolean;
  onRemove: () => void;
  onUpdatePriority: (next: CompetitorPriority) => void;
  onUpdateNotes: (next: string) => void;
}) {
  const [notes, setNotes] = useState(c.notes ?? "");
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="px-4 py-2">
        <a
          href={`https://${c.domain}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[12px] text-foreground hover:underline"
        >
          {c.domain}
        </a>
      </td>
      <td className="px-3 py-2">
        <select
          value={c.priority}
          disabled={pending}
          onChange={(e) =>
            onUpdatePriority(e.target.value as CompetitorPriority)
          }
          className={
            "text-[11px] uppercase tracking-wider px-2 py-0.5 border rounded cursor-pointer outline-none " +
            PRIORITY_TINT[c.priority]
          }
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p} className="bg-card text-foreground">
              {p}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onUpdateNotes(notes)}
          placeholder="—"
          disabled={pending}
          className="w-full bg-transparent border-0 outline-none focus:bg-muted/30 rounded px-1 -mx-1 text-[12px] text-muted-foreground placeholder:text-muted-foreground/40"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <span
          className={
            "text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded " +
            (c.source === "operator"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-muted text-muted-foreground")
          }
        >
          {c.source === "operator" ? "operator" : "BQ"}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          className="text-[11px] text-rose-600 hover:text-rose-800 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Remove"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
