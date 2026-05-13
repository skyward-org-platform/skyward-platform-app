"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { updateBrandDnaContentKey } from "@/app/properties/[slug]/actions";

type FieldKind = "short-string" | "long-string" | "number" | "string-array" | "json";

function detectKind(value: unknown): FieldKind {
  if (typeof value === "number") return "number";
  if (typeof value === "string") {
    return value.length > 80 || value.includes("\n") ? "long-string" : "short-string";
  }
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return "string-array";
  }
  return "json";
}

function humanLabel(key: string) {
  return key.replace(/_/g, " ");
}

export function BrandDnaContentEditor({
  sectionId,
  initialContent,
  propertySlug,
}: {
  sectionId: string;
  initialContent: Record<string, unknown> | null;
  propertySlug: string;
}) {
  const entries = Object.entries(initialContent ?? {});
  if (entries.length === 0) return null;

  return (
    <div className="grid gap-3">
      {entries.map(([key, value]) => (
        <ContentField
          key={key}
          sectionId={sectionId}
          propertySlug={propertySlug}
          fieldKey={key}
          initialValue={value}
        />
      ))}
    </div>
  );
}

function ContentField({
  sectionId,
  propertySlug,
  fieldKey,
  initialValue,
}: {
  sectionId: string;
  propertySlug: string;
  fieldKey: string;
  initialValue: unknown;
}) {
  const kind = detectKind(initialValue);
  const label = (
    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
      {humanLabel(fieldKey)}
    </div>
  );

  const commonProps = {
    onSave: (next: unknown) =>
      updateBrandDnaContentKey(sectionId, fieldKey, next, propertySlug),
  };

  return (
    <div className="grid gap-1">
      {label}
      {kind === "short-string" && (
        <ShortStringField initialValue={initialValue as string} {...commonProps} />
      )}
      {kind === "long-string" && (
        <LongStringField initialValue={initialValue as string} {...commonProps} />
      )}
      {kind === "number" && (
        <NumberField initialValue={initialValue as number} {...commonProps} />
      )}
      {kind === "string-array" && (
        <StringArrayField initialValue={initialValue as string[]} {...commonProps} />
      )}
      {kind === "json" && (
        <JsonField initialValue={initialValue} {...commonProps} />
      )}
    </div>
  );
}

type SaveFn = (next: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;

function useSaver<T>(initial: T, onSave: SaveFn) {
  const [committed, setCommitted] = useState<T>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(next: T) {
    if (Object.is(next, committed) || JSON.stringify(next) === JSON.stringify(committed)) {
      return;
    }
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

  return { committed, setCommitted, commit, pending, error };
}

function ShortStringField({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: SaveFn;
}) {
  const { committed, commit, pending, error } = useSaver(initialValue, onSave);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(committed);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <Display pending={pending} error={error} onClick={() => { setDraft(committed); setEditing(true); }}>
        {committed || <Placeholder />}
      </Display>
    );
  }

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { commit(draft); setEditing(false); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setDraft(committed); setEditing(false); }
        if (e.key === "Enter") { e.currentTarget.blur(); }
      }}
      className="w-full text-sm text-slate-800 bg-white border border-blue-300 rounded px-2 py-1 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    />
  );
}

function LongStringField({
  initialValue,
  onSave,
}: {
  initialValue: string;
  onSave: SaveFn;
}) {
  const { committed, commit, pending, error } = useSaver(initialValue, onSave);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(committed);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      autosize(ref.current);
    }
  }, [editing]);

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  if (!editing) {
    return (
      <Display pending={pending} error={error} onClick={() => { setDraft(committed); setEditing(true); }} className="whitespace-pre-wrap">
        {committed || <Placeholder />}
      </Display>
    );
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(e) => { setDraft(e.target.value); autosize(e.currentTarget); }}
      onBlur={() => { commit(draft); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === "Escape") { setDraft(committed); setEditing(false); } }}
      className="w-full text-sm text-slate-800 bg-white border border-blue-300 rounded px-2 py-1 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none whitespace-pre-wrap"
      rows={3}
    />
  );
}

function NumberField({
  initialValue,
  onSave,
}: {
  initialValue: number;
  onSave: SaveFn;
}) {
  const { committed, commit, pending, error } = useSaver(initialValue, onSave);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(committed));
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <Display pending={pending} error={error} onClick={() => { setDraft(String(committed)); setEditing(true); }}>
        {committed}
      </Display>
    );
  }

  return (
    <input
      ref={ref}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = Number(draft);
        if (Number.isFinite(parsed)) commit(parsed);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setDraft(String(committed)); setEditing(false); }
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-32 text-sm text-slate-800 bg-white border border-blue-300 rounded px-2 py-1 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    />
  );
}

function StringArrayField({
  initialValue,
  onSave,
}: {
  initialValue: string[];
  onSave: SaveFn;
}) {
  const { committed, commit, pending, error } = useSaver(initialValue, onSave);
  const [adding, setAdding] = useState<string>("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<string>("");
  const addRef = useRef<HTMLInputElement | null>(null);

  function add() {
    const trimmed = adding.trim();
    if (!trimmed) return;
    commit([...committed, trimmed]);
    setAdding("");
    addRef.current?.focus();
  }

  function remove(idx: number) {
    commit(committed.filter((_, i) => i !== idx));
  }

  function editAt(idx: number) {
    setEditingIdx(idx);
    setDraft(committed[idx]);
  }

  function commitEdit() {
    if (editingIdx === null) return;
    const trimmed = draft.trim();
    if (trimmed && trimmed !== committed[editingIdx]) {
      commit(committed.map((v, i) => (i === editingIdx ? trimmed : v)));
    }
    setEditingIdx(null);
  }

  return (
    <div className={`flex flex-wrap gap-1 items-center ${pending ? "opacity-60" : ""}`}>
      {committed.map((item, idx) =>
        editingIdx === idx ? (
          <input
            key={idx}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setEditingIdx(null); }
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="text-xs bg-white border border-blue-300 rounded px-2 py-0.5 outline-none focus:border-blue-500"
            style={{ width: `${Math.max(draft.length, 6)}ch` }}
          />
        ) : (
          <span
            key={idx}
            className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded px-2 py-0.5 hover:bg-slate-200 cursor-text"
            onClick={() => editAt(idx)}
            title="Click to edit"
          >
            {item}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(idx); }}
              className="text-slate-400 hover:text-red-600 -mr-1"
              aria-label="Remove"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        )
      )}
      <input
        ref={addRef}
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        onBlur={add}
        placeholder={committed.length === 0 ? "Add item…" : "+ add"}
        className="text-xs bg-transparent border border-dashed border-slate-300 rounded px-2 py-0.5 outline-none focus:border-blue-500 placeholder-slate-400"
        style={{ width: `${Math.max(adding.length, 8)}ch` }}
      />
      {error && (
        <span className="text-[10px] text-red-600" title={error}>! save failed</span>
      )}
    </div>
  );
}

function JsonField({
  initialValue,
  onSave,
}: {
  initialValue: unknown;
  onSave: SaveFn;
}) {
  const { committed, setCommitted, commit, pending, error } = useSaver(initialValue, onSave);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(JSON.stringify(committed, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      autosize(ref.current);
    }
  }, [editing]);

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function tryCommit() {
    try {
      const parsed = JSON.parse(draft);
      setParseError(null);
      commit(parsed);
      setCommitted(parsed);
      setEditing(false);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!editing) {
    return (
      <Display pending={pending} error={error} onClick={() => { setDraft(JSON.stringify(committed, null, 2)); setParseError(null); setEditing(true); }}>
        <pre className="text-xs bg-slate-50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(committed, null, 2)}
        </pre>
      </Display>
    );
  }

  return (
    <div className="grid gap-1">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); autosize(e.currentTarget); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setEditing(false); setParseError(null); }
        }}
        className={`w-full text-xs font-mono text-slate-800 bg-white border ${parseError ? "border-red-400" : "border-blue-300"} rounded px-2 py-1 outline-none resize-none`}
        rows={5}
      />
      <div className="flex items-center gap-2 text-[10px]">
        <button
          type="button"
          onClick={tryCommit}
          className="px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Save JSON
        </button>
        <button
          type="button"
          onClick={() => { setDraft(JSON.stringify(committed, null, 2)); setParseError(null); setEditing(false); }}
          className="px-2 py-0.5 rounded text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        {parseError && <span className="text-red-600">{parseError}</span>}
      </div>
    </div>
  );
}

function Display({
  children,
  onClick,
  pending,
  error,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pending: boolean;
  error: string | null;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      title="Click to edit"
      className={`text-sm text-slate-800 cursor-text rounded px-2 py-1 hover:bg-slate-50 transition-colors ${pending ? "opacity-60" : ""} ${className ?? ""}`}
    >
      {children}
      {error && (
        <span className="ml-2 text-[10px] text-red-600" title={error}>! save failed</span>
      )}
    </div>
  );
}

function Placeholder() {
  return <span className="italic text-slate-400">Click to add…</span>;
}
