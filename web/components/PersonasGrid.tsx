"use client";

// Personas — card-based editor. Schema mirrors the SEO keyword research
// intake template (operations/process-library/.../keyword_research_intake_
// template.xlsx, Personas sheet): persona_name · role_title · company_type
// · company_size · icp_fit · bio · jtbd · pain_points · awareness_kw ·
// consideration_kw · decision_kw.
//
// One card per persona; each field auto-saves on blur (text/textarea) or on
// change (select). The full array is persisted to brand_dna_section.content
// via upsertBrandDnaField on every mutation. Optimistic UI; revert on error.

import { useEffect, useState, useTransition } from "react";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";

export type Persona = {
  persona_name: string;
  role_title: string;
  company_type: string;
  company_size: string;
  icp_fit: string;
  bio: string;
  jtbd: string;
  pain_points: string;
  awareness_kw: string;
  consideration_kw: string;
  decision_kw: string;
};

const EMPTY_PERSONA: Persona = {
  persona_name: "",
  role_title: "",
  company_type: "",
  company_size: "11-50",
  icp_fit: "high",
  bio: "",
  jtbd: "",
  pain_points: "",
  awareness_kw: "",
  consideration_kw: "",
  decision_kw: "",
};

const COMPANY_SIZE_OPTIONS = ["1-10", "11-50", "51-200", "201-500", "500+"];
const ICP_FIT_OPTIONS = ["high", "medium", "low"];

export function PersonasGrid({
  propertySlug,
  initialPersonas,
}: {
  propertySlug: string;
  initialPersonas: Persona[];
}) {
  const [personas, setPersonas] = useState<Persona[]>(initialPersonas);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function persist(next: Persona[]) {
    const prev = personas;
    setPersonas(next);
    setError(null);
    startTransition(async () => {
      const res = await upsertBrandDnaField(
        propertySlug,
        "personas",
        "items",
        next,
      );
      if (!res.ok) {
        setPersonas(prev);
        setError(res.error);
      }
    });
  }

  function updatePersona(idx: number, patch: Partial<Persona>) {
    const next = personas.map((p, i) =>
      i === idx ? { ...p, ...patch } : p,
    );
    persist(next);
  }

  function addPersona() {
    persist([...personas, { ...EMPTY_PERSONA }]);
  }

  function deletePersona(idx: number) {
    if (!confirm("Delete this persona?")) return;
    persist(personas.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      {personas.length === 0 ? (
        <EmptyState onAdd={addPersona} />
      ) : (
        personas.map((p, idx) => (
          <PersonaCard
            key={idx}
            persona={p}
            onUpdate={(patch) => updatePersona(idx, patch)}
            onDelete={() => deletePersona(idx)}
          />
        ))
      )}
      {personas.length > 0 && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={addPersona}
            disabled={pending}
            className="text-xs font-medium px-3 py-1.5 border rounded-md text-foreground hover:bg-muted disabled:opacity-60"
          >
            + Add persona
          </button>
          {pending && (
            <span className="text-[11px] text-muted-foreground">Saving…</span>
          )}
          {error && (
            <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PersonaCard({
  persona,
  onUpdate,
  onDelete,
}: {
  persona: Persona;
  onUpdate: (patch: Partial<Persona>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <article className="border rounded-lg bg-card overflow-hidden">
      <header className="px-4 py-3 border-b flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="text-muted-foreground hover:text-foreground text-xs leading-none w-4 shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">
            {persona.persona_name || (
              <span className="text-muted-foreground italic font-normal">
                (unnamed persona)
              </span>
            )}
          </div>
          {(persona.role_title || persona.company_type) && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {persona.role_title}
              {persona.role_title && persona.company_type && " · "}
              {persona.company_type}
            </div>
          )}
        </div>
        <IcpBadge value={persona.icp_fit} />
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-rose-700 text-lg leading-none px-1 shrink-0"
          aria-label="Delete persona"
          title="Delete"
        >
          ×
        </button>
      </header>

      {expanded && (
        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldText
              label="Persona name"
              value={persona.persona_name}
              onSave={(v) => onUpdate({ persona_name: v })}
              placeholder="e.g. Event Planner Emma"
            />
            <FieldText
              label="Role / title"
              value={persona.role_title}
              onSave={(v) => onUpdate({ role_title: v })}
              placeholder="Event Coordinator"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldText
              label="Company type"
              value={persona.company_type}
              onSave={(v) => onUpdate({ company_type: v })}
              placeholder="Fortune 500, boutique, indie…"
            />
            <FieldSelect
              label="Company size"
              value={persona.company_size}
              options={COMPANY_SIZE_OPTIONS}
              onSave={(v) => onUpdate({ company_size: v })}
            />
            <FieldSelect
              label="ICP fit"
              value={persona.icp_fit}
              options={ICP_FIT_OPTIONS}
              onSave={(v) => onUpdate({ icp_fit: v })}
            />
          </div>

          <FieldTextarea
            label="Bio"
            value={persona.bio}
            onSave={(v) => onUpdate({ bio: v })}
            rows={3}
            placeholder="2–3 sentence description. Who they are, where they sit in the org, what they care about."
          />
          <FieldTextarea
            label="Jobs to be done"
            value={persona.jtbd}
            onSave={(v) => onUpdate({ jtbd: v })}
            rows={3}
            placeholder="Comma-separated. What success looks like in their role."
          />
          <FieldTextarea
            label="Pain points"
            value={persona.pain_points}
            onSave={(v) => onUpdate({ pain_points: v })}
            rows={3}
            placeholder="Comma-separated. Where the brand can save them work."
          />

          <details className="border-t pt-3 group">
            <summary className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold cursor-pointer hover:text-foreground list-none flex items-center gap-2">
              <span className="text-[10px] transition-transform group-open:rotate-90">
                ▸
              </span>
              Journey keywords
            </summary>
            <div className="mt-3 space-y-3">
              <FieldTextarea
                label="Awareness · problem-aware"
                value={persona.awareness_kw}
                onSave={(v) => onUpdate({ awareness_kw: v })}
                rows={2}
                placeholder="Comma-separated keywords searched when the problem first surfaces."
              />
              <FieldTextarea
                label="Consideration · comparison"
                value={persona.consideration_kw}
                onSave={(v) => onUpdate({ consideration_kw: v })}
                rows={2}
                placeholder="Comma-separated keywords during comparison shopping."
              />
              <FieldTextarea
                label="Decision · purchase intent"
                value={persona.decision_kw}
                onSave={(v) => onUpdate({ decision_kw: v })}
                rows={2}
                placeholder="Comma-separated keywords when ready to buy."
              />
            </div>
          </details>
        </div>
      )}
    </article>
  );
}

function FieldText({
  label,
  value,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </label>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft);
        }}
        placeholder={placeholder}
        className="w-full text-[13px] px-3 py-2 border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground"
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string;
  options: string[];
  onSave: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        className="w-full text-[13px] px-3 py-2 border rounded-md bg-card outline-none focus:border-foreground/40 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onSave,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  rows: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onSave(draft);
        }}
        rows={rows}
        placeholder={placeholder}
        className="w-full text-[13px] leading-relaxed px-3 py-2 border rounded-md bg-card outline-none focus:border-foreground/40 placeholder:text-muted-foreground resize-none whitespace-pre-wrap"
      />
    </div>
  );
}

function IcpBadge({ value }: { value: string }) {
  const styles =
    value === "high"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : value === "medium"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : value === "low"
          ? "bg-muted text-muted-foreground border"
          : "bg-muted text-muted-foreground border";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${styles} shrink-0`}
    >
      <span className="size-1 rounded-full bg-current" aria-hidden />
      {value || "fit?"}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center">
      <p className="text-sm font-medium text-foreground">No personas yet.</p>
      <p className="text-[12px] text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
        Personas drive intent classification and journey-keyword grouping in
        the SEO research pipeline. Schema mirrors the team&rsquo;s keyword
        research intake template.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="text-sm font-medium px-4 py-2 bg-foreground text-background rounded-md hover:bg-foreground/85"
      >
        + Add first persona
      </button>
    </div>
  );
}
