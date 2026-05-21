"use client";

// Generic editor for a row-array stored in a single key of
// brand_dna_section.content. Used by the bespoke Brand DNA subnav targets
// (Offerings · Brand Terms · Proof) per v2 screens 13 / 14 / 15.
//
// Persistence: the whole array is written back via the existing
// updateBrandDnaContentKey server action. Each save = one DB round-trip.
// Optimistic UI; reverts on error.

import { useState, useTransition } from "react";
import { upsertBrandDnaField } from "@/app/properties/[slug]/brand-dna/actions";

export type Column = {
  key: string;
  label: string;
  kind: "text" | "select" | "url" | "boolean";
  options?: readonly string[]; // for select
  width?: string;
  placeholder?: string;
};

export type Row = Record<string, unknown>;

export function TableSectionEditor({
  sectionKey,
  contentKey,
  initialRows,
  columns,
  propertySlug,
  addLabel = "+ Add row",
  newRowTemplate,
}: {
  /** The brand_dna_section key (e.g. "offerings", "personas"). The section
   *  row is created on first save if it doesn't exist yet. */
  sectionKey: string;
  contentKey: string;
  initialRows: Row[];
  columns: Column[];
  propertySlug: string;
  addLabel?: string;
  /** Defaults for a new row. Fields not listed default to "" or first select option. */
  newRowTemplate?: Row;
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<Row | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function persist(nextRows: Row[]): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await upsertBrandDnaField(
          propertySlug,
          sectionKey,
          contentKey,
          nextRows,
        );
        if (res.ok) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: res.error });
        }
      });
    });
  }

  function startEdit(idx: number) {
    setEditingIdx(idx);
    setDraft({ ...rows[idx] });
    setError(null);
  }

  function cancelEdit() {
    if (editingIdx === null) return;
    // If we were editing a freshly-added (and never-saved) row, drop it.
    if ((rows[editingIdx]?.__new as boolean | undefined) === true) {
      const next = rows.filter((_, i) => i !== editingIdx);
      setRows(next);
    }
    setEditingIdx(null);
    setDraft(null);
    setError(null);
  }

  async function saveEdit() {
    if (editingIdx === null || draft === null) return;
    // Strip the internal __new marker before persisting.
    const clean: Row = { ...draft };
    delete clean.__new;
    const next = rows.map((r, i) => (i === editingIdx ? clean : r));
    const prev = rows;
    setRows(next);
    setEditingIdx(null);
    setDraft(null);
    const res = await persist(next);
    if (!res.ok) {
      setRows(prev);
      setError(res.error ?? "Save failed");
    }
  }

  async function deleteRow(idx: number) {
    const ok = confirm("Delete this row?");
    if (!ok) return;
    const prev = rows;
    const next = rows.filter((_, i) => i !== idx);
    setRows(next);
    setError(null);
    const res = await persist(next);
    if (!res.ok) {
      setRows(prev);
      setError(res.error ?? "Delete failed");
    }
  }

  function addRow() {
    const blank: Row = { ...(newRowTemplate ?? {}), __new: true };
    for (const c of columns) {
      if (!(c.key in blank)) {
        if (c.kind === "boolean") blank[c.key] = true;
        else if (c.kind === "select" && c.options?.length)
          blank[c.key] = c.options[0];
        else blank[c.key] = "";
      }
    }
    setRows((curr) => {
      const next = [...curr, blank];
      setEditingIdx(next.length - 1);
      setDraft({ ...blank });
      return next;
    });
    setError(null);
  }

  return (
    <div>
      <div className="border rounded-lg bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-wider">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="text-left px-4 py-2.5 font-medium"
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.label}
                </th>
              ))}
              <th className="w-[80px]" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No rows yet. Click {addLabel.toLowerCase()} below.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const editing = idx === editingIdx;
                const source = editing && draft ? draft : row;
                return (
                  <tr key={idx} className="border-t">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 align-middle">
                        {editing ? (
                          <CellInput
                            column={c}
                            value={source[c.key]}
                            onChange={(v) =>
                              setDraft((d) => (d ? { ...d, [c.key]: v } : d))
                            }
                          />
                        ) : (
                          <CellDisplay column={c} value={row[c.key]} />
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right">
                      {editing ? (
                        <div className="flex gap-1 justify-end">
                          <IconBtn
                            onClick={saveEdit}
                            disabled={pending}
                            title="Save"
                            primary
                          >
                            ✓
                          </IconBtn>
                          <IconBtn
                            onClick={cancelEdit}
                            disabled={pending}
                            title="Cancel"
                          >
                            ✕
                          </IconBtn>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <IconBtn onClick={() => startEdit(idx)} title="Edit">
                            ✎
                          </IconBtn>
                          <IconBtn
                            onClick={() => deleteRow(idx)}
                            title="Delete"
                            danger
                          >
                            🗑
                          </IconBtn>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={pending || editingIdx !== null}
          className="text-xs font-medium px-3 py-1.5 border rounded-md text-foreground hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {addLabel}
        </button>
        {error && (
          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function CellDisplay({ column, value }: { column: Column; value: unknown }) {
  if (column.kind === "boolean") {
    return value === true ? (
      <span className="text-emerald-600">✓</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/60 italic text-xs">empty</span>;
  }
  if (column.kind === "url") {
    return (
      <a
        href={String(value)}
        target="_blank"
        rel="noreferrer"
        className="text-foreground hover:underline font-mono text-xs"
      >
        {String(value)}
      </a>
    );
  }
  return <span>{String(value)}</span>;
}

function CellInput({
  column,
  value,
  onChange,
}: {
  column: Column;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const baseInput =
    "w-full text-sm bg-card border rounded-md px-2 py-1 outline-none focus:border-foreground/40";

  if (column.kind === "select" && column.options) {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} cursor-pointer`}
      >
        {column.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (column.kind === "boolean") {
    return (
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 rounded border-border accent-foreground"
        />
      </label>
    );
  }
  return (
    <input
      type={column.kind === "url" ? "url" : "text"}
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value)}
      placeholder={column.placeholder}
      className={`${baseInput} ${column.kind === "url" ? "font-mono text-xs" : ""}`}
    />
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`size-6 rounded text-xs flex items-center justify-center ${
        disabled
          ? "text-muted-foreground/40 cursor-not-allowed"
          : primary
          ? "bg-foreground text-background hover:bg-foreground/85"
          : danger
          ? "text-rose-600 hover:bg-rose-50"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
