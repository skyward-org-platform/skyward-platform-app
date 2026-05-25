"use client";

// Seed Keywords editor. Same Option A pattern as CompetitorsEditor:
// Supabase property_seed_keyword is the source of truth, BQ
// SEOPipeline.seed_keywords is a one-shot import seed. CRUD via the
// server actions in brand-dna/actions.

import { useMemo, useState, useTransition } from "react";
import {
  addSeedKeyword,
  importSeedKeywordsFromBq,
  removeSeedKeyword,
  updateSeedKeyword,
} from "@/app/properties/[slug]/brand-dna/actions";
import type {
  SeedKeyword,
  SeedKeywordIntent,
  SeedKeywordPriority,
} from "@/lib/seed-keywords";

const PRIORITIES: SeedKeywordPriority[] = ["high", "medium", "low"];
const INTENTS: SeedKeywordIntent[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
];

const PRIORITY_TINT: Record<SeedKeywordPriority, string> = {
  high: "bg-rose-50 text-rose-800 border-rose-300 font-semibold",
  medium: "bg-amber-50 text-amber-800 border-amber-300 font-medium",
  low: "bg-slate-50 text-slate-700 border-slate-300",
};

const INTENT_TINT: Record<SeedKeywordIntent, string> = {
  informational: "bg-sky-50 text-sky-800 border-sky-200",
  commercial: "bg-emerald-50 text-emerald-800 border-emerald-200",
  transactional: "bg-violet-50 text-violet-800 border-violet-200",
  navigational: "bg-slate-50 text-slate-700 border-slate-200",
};

export function SeedKeywordsEditor({
  propertySlug,
  initialSeedKeywords,
  bqSourceCount,
  showImportButton,
}: {
  propertySlug: string;
  initialSeedKeywords: SeedKeyword[];
  bqSourceCount: number;
  showImportButton: boolean;
}) {
  const [keywords, setKeywords] = useState(initialSeedKeywords);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [newKeyword, setNewKeyword] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newSeedCategory, setNewSeedCategory] = useState("client");
  const [newIntent, setNewIntent] = useState<SeedKeywordIntent>("commercial");
  const [newPriority, setNewPriority] =
    useState<SeedKeywordPriority>("medium");

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

  const filtered = useMemo(() => {
    if (!filter.trim()) return keywords;
    const q = filter.trim().toLowerCase();
    return keywords.filter(
      (k) =>
        k.keyword.toLowerCase().includes(q) ||
        (k.category ?? "").toLowerCase().includes(q) ||
        (k.seed_category ?? "").toLowerCase().includes(q),
    );
  }, [keywords, filter]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    startTransition(async () => {
      const res = await addSeedKeyword(propertySlug, newKeyword, {
        category: newCategory || null,
        seedCategory: newSeedCategory || null,
        intent: newIntent,
        priority: newPriority,
      });
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      setNewKeyword("");
      setNewCategory("");
      flash("Seed keyword added.");
      // Server revalidates - parent re-renders with the new list.
    });
  };

  const handleRemove = (k: SeedKeyword) => {
    if (!confirm(`Remove "${k.keyword}"?`)) return;
    startTransition(async () => {
      const res = await removeSeedKeyword(propertySlug, k.id);
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      setKeywords((prev) => prev.filter((x) => x.id !== k.id));
      flash(`Removed "${k.keyword}".`);
    });
  };

  const handleUpdate = (
    k: SeedKeyword,
    patch: Parameters<typeof updateSeedKeyword>[2],
  ) => {
    startTransition(async () => {
      const res = await updateSeedKeyword(propertySlug, k.id, patch);
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      setKeywords((prev) =>
        prev.map((x) =>
          x.id === k.id
            ? {
                ...x,
                category:
                  patch.category !== undefined
                    ? (patch.category?.trim() || null)
                    : x.category,
                seed_category:
                  patch.seedCategory !== undefined
                    ? (patch.seedCategory?.trim() || null)
                    : x.seed_category,
                intent: patch.intent !== undefined ? patch.intent : x.intent,
                priority:
                  patch.priority !== undefined ? patch.priority : x.priority,
              }
            : x,
        ),
      );
    });
  };

  const handleImport = () => {
    startTransition(async () => {
      const res = await importSeedKeywordsFromBq(propertySlug);
      if (!res.ok) {
        flash(res.error, "error");
        return;
      }
      flash(
        `Imported ${res.imported} seed keyword${res.imported === 1 ? "" : "s"}${
          res.skipped > 0 ? ` (${res.skipped} already present)` : ""
        }. Reloading...`,
      );
      setTimeout(() => window.location.reload(), 700);
    });
  };

  return (
    <div className="space-y-4">
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

      {showImportButton && (
        <div className="border border-dashed border-amber-300 bg-amber-50 rounded-md px-4 py-3 flex items-center justify-between gap-4">
          <div className="text-[12px] text-amber-900 leading-snug">
            <strong>Empty list.</strong> BigQuery has {bqSourceCount} seed
            keyword{bqSourceCount === 1 ? "" : "s"} from the Phase 0 intake.
            Import them as a starting point - you can edit, add, or remove
            them after.
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={pending}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-[11.5px] font-medium rounded shrink-0"
          >
            {pending ? "Importing..." : `Import ${bqSourceCount} from BQ`}
          </button>
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="border rounded-lg bg-card p-3 grid grid-cols-[2fr_1fr_1fr_1fr_110px_auto] gap-2 items-end"
      >
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Keyword
          </label>
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="charter bus rental"
            className="w-full text-[12px] px-2.5 py-1.5 border rounded-md bg-card outline-none focus:border-foreground/40"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Category
          </label>
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Vehicle Type"
            className="w-full text-[12px] px-2.5 py-1.5 border rounded-md bg-card outline-none focus:border-foreground/40"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Source
          </label>
          <select
            value={newSeedCategory}
            onChange={(e) => setNewSeedCategory(e.target.value)}
            className="w-full text-[12px] px-2 py-1.5 border rounded-md bg-card outline-none cursor-pointer"
          >
            <option value="client">client</option>
            <option value="persona">persona</option>
            <option value="competitor">competitor</option>
            <option value="research">research</option>
            <option value="manual">manual</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Intent
          </label>
          <select
            value={newIntent}
            onChange={(e) =>
              setNewIntent(e.target.value as SeedKeywordIntent)
            }
            className="w-full text-[12px] px-2 py-1.5 border rounded-md bg-card outline-none cursor-pointer"
          >
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Priority
          </label>
          <select
            value={newPriority}
            onChange={(e) =>
              setNewPriority(e.target.value as SeedKeywordPriority)
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
        <button
          type="submit"
          disabled={pending || !newKeyword.trim()}
          className="px-3 py-1.5 bg-foreground text-background text-[11.5px] font-medium rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </form>

      {/* Quick filter + counts */}
      <div className="flex items-center gap-3 text-[11px]">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by keyword / category / source..."
          className="flex-1 max-w-[400px] text-[12px] px-2.5 py-1 border rounded-md bg-card outline-none focus:border-foreground/40"
        />
        <span className="text-muted-foreground tabular-nums">
          {filtered.length === keywords.length
            ? `${keywords.length.toLocaleString()} total`
            : `${filtered.length.toLocaleString()} of ${keywords.length.toLocaleString()}`}
        </span>
      </div>

      {keywords.length === 0 && !showImportButton ? (
        <div className="border rounded-lg bg-card p-6 text-center text-[12px] text-muted-foreground">
          No seed keywords yet. Add some above to get started.
        </div>
      ) : keywords.length > 0 ? (
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium min-w-[260px]">
                  Keyword
                </th>
                <th className="text-left px-3 py-2 font-medium w-[160px]">
                  Category
                </th>
                <th className="text-left px-3 py-2 font-medium w-[140px]">
                  Source
                </th>
                <th className="text-left px-3 py-2 font-medium w-[140px]">
                  Intent
                </th>
                <th className="text-left px-3 py-2 font-medium w-[120px]">
                  Priority
                </th>
                <th className="text-right px-3 py-2 font-medium w-[60px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((k) => (
                <SeedKeywordRow
                  key={k.id}
                  k={k}
                  pending={pending}
                  onRemove={() => handleRemove(k)}
                  onUpdate={(patch) => handleUpdate(k, patch)}
                />
              ))}
            </tbody>
          </table>
          <footer className="px-4 py-2 border-t bg-muted/20 text-[10.5px] text-muted-foreground tabular-nums">
            {keywords.length} seed keyword{keywords.length === 1 ? "" : "s"} ·
            {" "}
            {keywords.filter((k) => k.source === "bq_import").length} imported
            from BQ ·{" "}
            {keywords.filter((k) => k.source === "operator").length} added by
            operator
          </footer>
        </div>
      ) : null}
    </div>
  );
}

function SeedKeywordRow({
  k,
  pending,
  onRemove,
  onUpdate,
}: {
  k: SeedKeyword;
  pending: boolean;
  onRemove: () => void;
  onUpdate: (patch: {
    category?: string | null;
    seedCategory?: string | null;
    intent?: SeedKeywordIntent | null;
    priority?: SeedKeywordPriority;
  }) => void;
}) {
  const [category, setCategory] = useState(k.category ?? "");
  const [seedCategory, setSeedCategory] = useState(k.seed_category ?? "");
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="px-4 py-1.5">
        <span className="text-foreground">{k.keyword}</span>
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={() => onUpdate({ category })}
          disabled={pending}
          placeholder="—"
          className="w-full bg-transparent border-0 outline-none focus:bg-muted/30 rounded px-1 -mx-1 text-[12px] text-muted-foreground placeholder:text-muted-foreground/40"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={seedCategory}
          onChange={(e) => setSeedCategory(e.target.value)}
          onBlur={() => onUpdate({ seedCategory })}
          disabled={pending}
          placeholder="—"
          className="w-full bg-transparent border-0 outline-none focus:bg-muted/30 rounded px-1 -mx-1 text-[11.5px] text-muted-foreground placeholder:text-muted-foreground/40"
        />
      </td>
      <td className="px-3 py-1.5">
        <select
          value={k.intent ?? "commercial"}
          disabled={pending}
          onChange={(e) =>
            onUpdate({ intent: e.target.value as SeedKeywordIntent })
          }
          className={
            "text-[10.5px] uppercase tracking-wider px-1.5 py-0.5 border rounded cursor-pointer outline-none " +
            INTENT_TINT[(k.intent ?? "commercial") as SeedKeywordIntent]
          }
        >
          {INTENTS.map((i) => (
            <option key={i} value={i} className="bg-card text-foreground">
              {i}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <select
          value={k.priority}
          disabled={pending}
          onChange={(e) =>
            onUpdate({ priority: e.target.value as SeedKeywordPriority })
          }
          className={
            "text-[10.5px] uppercase tracking-wider px-1.5 py-0.5 border rounded cursor-pointer outline-none " +
            PRIORITY_TINT[k.priority]
          }
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p} className="bg-card text-foreground">
              {p}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5 text-right">
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
