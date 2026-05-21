"use client";

// Small cells + helpers reused by the per-action WQA tabs.

import React from "react";

export function fmtN(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && Number.isFinite(v)) return v.toLocaleString();
  return "—";
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "—";
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** URL + optional title cell. Caller must put `max-w-0` on the parent
 *  `<td>` for the truncate to actually clamp width (table cells need an
 *  explicit max-width constraint to honor `truncate`/`overflow-hidden`). */
export function UrlCell({
  url,
  title,
}: {
  url: string;
  title?: string | null;
}) {
  return (
    <>
      <div
        className="font-mono text-[11px] truncate text-foreground"
        title={url}
      >
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>
      </div>
      {title && (
        <div
          className="text-[10.5px] text-muted-foreground truncate mt-0.5"
          title={title}
        >
          {title}
        </div>
      )}
    </>
  );
}

export function TabHeader({
  title,
  subtitle,
  count,
  total,
  rightSlot,
}: {
  title: string;
  subtitle: React.ReactNode;
  count: number;
  total?: number;
  rightSlot?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {title}
          <span className="ml-2 text-[12px] text-muted-foreground tabular-nums font-normal">
            {count.toLocaleString()}
            {total !== undefined && ` of ${total.toLocaleString()}`}
          </span>
        </h2>
        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
          {subtitle}
        </p>
      </div>
      {rightSlot}
    </header>
  );
}

export function EmptyTab({ message }: { message: string }) {
  return (
    <div className="border border-dashed rounded-lg bg-muted/30 p-8 text-center text-[12px] text-muted-foreground">
      {message}
    </div>
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full text-[11.5px]">{children}</table>
      </div>
    </div>
  );
}

export const TH = "text-left px-2 py-2 font-medium";
export const THR = "text-right px-2 py-2 font-medium";
export const TD = "px-2 py-1.5";
export const TDR = "px-2 py-1.5 text-right tabular-nums";

export function ThinHeaderRow({ cells }: { cells: { label: string; right?: boolean; min?: string }[] }) {
  return (
    <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground z-10">
      <tr>
        {cells.map((c) => (
          <th
            key={c.label}
            className={`${c.right ? THR : TH} ${c.min ? `min-w-[${c.min}]` : ""}`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}
