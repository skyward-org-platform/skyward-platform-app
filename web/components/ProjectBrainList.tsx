"use client";

// Filterable, searchable Project Brain list with inline "New entry" form.
// Owns local state for the list (so optimistic delete removes a card without
// a full reload). Parent server component supplies the initial entries.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ProjectBrainCard,
  type BrainEntry,
} from "@/components/ProjectBrainCard";
import { createBrainEntry } from "@/app/properties/[slug]/project-brain/actions";

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "issue", label: "Known issue" },
  { value: "working", label: "Working" },
  { value: "research", label: "Research" },
  { value: "strategy", label: "Decision" },
  { value: "preference", label: "Preference" },
  { value: "insight", label: "Insight" },
];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Locked" },
];

const NEW_TYPES = TYPE_FILTERS.filter((t) => t.value !== "all");

export function ProjectBrainList({
  entries: initialEntries,
  propertySlug,
}: {
  entries: BrainEntry[];
  propertySlug: string;
}) {
  const [entries, setEntries] = useState<BrainEntry[]>(initialEntries);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [composerOpen, setComposerOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = entries.filter((e) => {
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) || e.body.toLowerCase().includes(q)
    );
  });

  function removeLocal(id: string) {
    setEntries((curr) => curr.filter((e) => e.id !== id));
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            ✤ Project Brain
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shared working memory across agents — known issues, research,
            decisions, preferences. Every Brand DNA / Pages / Projects surface
            reads from this when generating outputs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen((s) => !s)}
          className="text-sm font-medium px-3 py-1.5 bg-foreground text-background rounded-md hover:bg-foreground/85 shrink-0"
        >
          {composerOpen ? "Cancel" : "+ New entry"}
        </button>
      </div>

      {composerOpen && (
        <NewEntryForm
          propertySlug={propertySlug}
          onCreated={(e) => {
            setEntries((curr) => [e, ...curr]);
            setComposerOpen(false);
          }}
          onCancel={() => setComposerOpen(false)}
        />
      )}

      {/* Search + filter row */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries…"
          className="flex-1 min-w-[200px] bg-card border rounded-md px-3 py-1.5 text-sm outline-none focus:border-foreground/40 placeholder:text-muted-foreground"
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          options={TYPE_FILTERS}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS}
        />
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState hasEntries={entries.length > 0} />
        ) : (
          filtered.map((e) => (
            <ProjectBrainCard
              key={e.id}
              entry={e}
              propertySlug={propertySlug}
              onLocalDelete={removeLocal}
            />
          ))
        )}
      </div>

      <p className="text-[11px] text-muted-foreground mt-6">
        {filtered.length} of {entries.length} entr
        {entries.length === 1 ? "y" : "ies"} shown
      </p>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-card border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-foreground/40 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function EmptyState({ hasEntries }: { hasEntries: boolean }) {
  if (hasEntries) {
    return (
      <div className="border rounded-lg bg-card p-6 text-sm text-muted-foreground text-center">
        No entries match the current filters.
      </div>
    );
  }
  return (
    <div className="border rounded-lg bg-card p-6 text-sm text-muted-foreground">
      <div className="font-medium text-foreground mb-1">No entries yet.</div>
      <p className="text-xs leading-relaxed">
        Project Brain entries are written by agents (known issues, research)
        and by strategists (decisions, preferences). Add your first entry with
        &ldquo;+ New entry&rdquo; above, or wait for an agent to surface one.
      </p>
    </div>
  );
}

function NewEntryForm({
  propertySlug,
  onCreated,
  onCancel,
}: {
  propertySlug: string;
  onCreated: (e: BrainEntry) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState("issue");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createBrainEntry(propertySlug, {
        type,
        title: title.trim(),
        body: body.trim(),
        source: "ui:project-brain",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistic local insert with a placeholder timestamp; revalidatePath in
      // the action will refresh authoritative data on the next nav.
      const now = new Date().toISOString();
      onCreated({
        id: `local-${now}`,
        type,
        title: title.trim(),
        body: body.trim(),
        source: "ui:project-brain",
        confidence: null,
        status: "active",
        created_at: now,
        updated_at: now,
      });
      router.refresh();
    });
  }

  return (
    <div className="border rounded-lg bg-card p-4 mb-5">
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Category
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="bg-card border rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-foreground/40 cursor-pointer"
          >
            {NEW_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short heading — one line"
            className="w-full bg-card border rounded-md px-3 py-1.5 text-sm outline-none focus:border-foreground/40"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What the brain should remember about this property…"
            rows={4}
            className="w-full bg-card border rounded-md px-3 py-2 text-sm outline-none focus:border-foreground/40 resize-none whitespace-pre-wrap"
          />
        </div>
        {error && (
          <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {error}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="text-sm font-medium px-3 py-1.5 bg-foreground text-background rounded-md hover:bg-foreground/85 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save entry"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="text-sm font-medium px-3 py-1.5 border rounded-md text-foreground hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
