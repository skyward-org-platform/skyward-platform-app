"use client";

// Per-column filter primitives + a small hook for table filtering.
//
// Three input atoms:
//   <TextFilter>    — substring match, case-insensitive
//   <NumericFilter> — parses leading ≥ / ≤ / = (default ≥) → operator + n
//   <SelectFilter>  — enum dropdown with "(all)" default
//
// Plus a `useTableFilters<T>` hook: holds a record of column → filter
// state and returns the filtered rows. Accessors are passed in so the
// hook stays generic across UniverseTab / ClusterMapTab / UrlMapTab.

import { useMemo, useState } from "react";

const INPUT_CLS =
  "w-full text-[11px] px-1.5 py-1 border rounded bg-card focus:outline-none focus:ring-1 focus:ring-foreground/30 placeholder:text-muted-foreground/60";

export function TextFilter({
  value,
  onChange,
  placeholder = "filter…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_CLS}
    />
  );
}

export type NumericFilterValue = {
  op: ">=" | "<=" | "=";
  n: number;
} | null;

/** Parse a string like "≥500", ">=500", "<=20", "=10", or bare "500"
 *  (bare → ">=") into a {op, n}. Returns null when the input is empty
 *  or unparseable. */
export function parseNumeric(raw: string): NumericFilterValue {
  const s = raw.trim();
  if (!s) return null;
  let op: ">=" | "<=" | "=" = ">=";
  let rest = s;
  if (s.startsWith("≥") || s.startsWith(">=")) {
    op = ">=";
    rest = s.replace(/^(≥|>=)/, "");
  } else if (s.startsWith("≤") || s.startsWith("<=")) {
    op = "<=";
    rest = s.replace(/^(≤|<=)/, "");
  } else if (s.startsWith("=")) {
    op = "=";
    rest = s.slice(1);
  } else if (s.startsWith(">")) {
    op = ">=";
    rest = s.slice(1);
  } else if (s.startsWith("<")) {
    op = "<=";
    rest = s.slice(1);
  }
  const n = Number(rest.replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return { op, n };
}

export function NumericFilter({
  value,
  onChange,
  placeholder = "≥",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_CLS + " text-right tabular-nums"}
    />
  );
}

export function SelectFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={INPUT_CLS + " pr-1"}
    >
      <option value="">(all)</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────

type ColFilter =
  | { kind: "text"; get: (row: unknown) => string }
  | { kind: "numeric"; get: (row: unknown) => number | null }
  | { kind: "select"; get: (row: unknown) => string | null };

export type ColumnFilterSpec<T> =
  | { kind: "text"; get: (row: T) => string }
  | { kind: "numeric"; get: (row: T) => number | null }
  | { kind: "select"; get: (row: T) => string | null };

export function useTableFilters<T>(
  rows: T[],
  spec: Record<string, ColumnFilterSpec<T>>,
) {
  const [values, setValues] = useState<Record<string, string>>({});

  const setFilter = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  };

  const filtered = useMemo(() => {
    const activeKeys = Object.keys(values).filter((k) => values[k] !== "" && values[k] != null);
    if (activeKeys.length === 0) return rows;

    return rows.filter((row) => {
      for (const key of activeKeys) {
        const col = spec[key] as ColFilter | undefined;
        if (!col) continue;
        const v = values[key].trim();
        if (!v) continue;
        if (col.kind === "text") {
          const hay = String(col.get(row as unknown) ?? "").toLowerCase();
          if (!hay.includes(v.toLowerCase())) return false;
        } else if (col.kind === "select") {
          const got = col.get(row as unknown);
          if ((got ?? "") !== v) return false;
        } else if (col.kind === "numeric") {
          const parsed = parseNumeric(v);
          if (!parsed) continue;
          const got = col.get(row as unknown);
          if (got == null) return false;
          if (parsed.op === ">=" && !(got >= parsed.n)) return false;
          if (parsed.op === "<=" && !(got <= parsed.n)) return false;
          if (parsed.op === "=" && got !== parsed.n) return false;
        }
      }
      return true;
    });
    // spec is stable per render; values changes drive recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, values]);

  const hasAnyFilter = Object.values(values).some((v) => v !== "" && v != null);

  return { filtered, values, setFilter, hasAnyFilter };
}
