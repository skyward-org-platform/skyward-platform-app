"use client";

// 3-tab nav shell for the Phase 5 authority surface.
//
// Tabs (in order): Overview · Referring Domains · Audits
//
// URL state via `?view=<tab>`. Mirrors the pattern used by KeywordsView /
// ContentView. This chunk is read-only — Chunk 4 will wire row-click →
// RefDomain drawer through this shell.

import { useSearchParams, useRouter } from "next/navigation";
import type {
  SiteSnapshot,
  ReferringDomainRow,
  DisavowEntryRow,
  AuditDocRow,
  Alert,
} from "@/lib/authority";
import { OverviewTab } from "./OverviewTab";
import { ReferringDomainsTab } from "./ReferringDomainsTab";
import { AuditsTab } from "./AuditsTab";

const TABS = [
  ["overview", "Overview"],
  ["refdomains", "Referring Domains"],
  ["audits", "Audits"],
] as const;

type TabKey = (typeof TABS)[number][0];

export type AuthorityViewProps = {
  propertySlug: string;
  propertyId: string;
  propertyName: string;
  primaryDomain: string | null;
  snapshots: SiteSnapshot[];
  refDomains: ReferringDomainRow[];
  disavow: DisavowEntryRow[];
  audits: AuditDocRow[];
  alerts: Alert[];
};

export function AuthorityView(props: AuthorityViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const rawView = sp.get("view") || "overview";
  const view: TabKey = (TABS.find(([k]) => k === rawView)?.[0] ?? "overview") as TabKey;

  function setView(next: TabKey) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", next);
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Authority</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Link-building monitoring for{" "}
          <span className="font-mono">{props.primaryDomain}</span>.{" "}
          {props.refDomains.length.toLocaleString()} referring domains tracked.
        </p>
      </header>

      <nav className="flex gap-1 border-b mb-5 overflow-x-auto">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k as TabKey)}
            className={
              "px-3 py-1.5 text-sm border-b-2 -mb-px whitespace-nowrap " +
              (view === k
                ? "border-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {label}
          </button>
        ))}
      </nav>

      {view === "overview" && <OverviewTab {...props} />}
      {view === "refdomains" && <ReferringDomainsTab {...props} />}
      {view === "audits" && <AuditsTab {...props} />}
    </div>
  );
}
