"use client";

// 6-tab nav shell for the Phase 5 v2 authority surface.
//
// Tabs (in order): Overview · Backlinks · Referring Domains · Prospects ·
//                  Disavow · Audits
//
// URL state via `?view=<tab>`. Mirrors the pattern used by WqaTabs /
// KeywordsView / ContentView.

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type {
  SiteSnapshot,
  ReferringDomainRow,
  DisavowEntryRow,
  AuditDocRow,
  Alert,
  BacklinkRow,
  LinkProspectRow,
  LinkAuditRow,
} from "@/lib/authority";
import { UrlDrawer, type DrawerSubject } from "@/components/UrlDrawer";
import { AuthorityOverview } from "./AuthorityOverview";
import { BacklinksTab } from "./BacklinksTab";
import { ReferringDomainsV2Tab } from "./ReferringDomainsV2Tab";
import { ProspectsTab } from "./ProspectsTab";
import { DisavowTab } from "./DisavowTab";
import { AuditsHistoryTab } from "./AuditsHistoryTab";

const TABS = [
  ["overview", "Overview"],
  ["backlinks", "Backlinks"],
  ["refdomains", "Referring Domains"],
  ["prospects", "Prospects"],
  ["disavow", "Disavow"],
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
  backlinks: BacklinkRow[];
  prospects: LinkProspectRow[];
  latestAudit: LinkAuditRow | null;
  auditHistory: LinkAuditRow[];
};

export function AuthorityView(props: AuthorityViewProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const rawView = sp.get("view") || "overview";
  const view: TabKey = (TABS.find(([k]) => k === rawView)?.[0] ?? "overview") as TabKey;

  // Drawer state (lifted from ReferringDomainsTab) so any tab can open
  // the universal UrlDrawer for a referring-domain subject.
  const [drawerSubject, setDrawerSubject] = useState<DrawerSubject | null>(null);

  function setView(next: TabKey) {
    const params = new URLSearchParams(sp.toString());
    params.set("view", next);
    router.push(`?${params.toString()}`);
  }

  // Per-tab counts for the strip badges.
  const counts: Record<TabKey, number> = {
    overview: 0,
    backlinks: props.backlinks.length,
    refdomains: props.refDomains.length,
    prospects: props.prospects.length,
    disavow: props.disavow.length,
    audits: props.auditHistory.length,
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Authority</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Link-building monitoring for{" "}
            <span className="font-mono">{props.primaryDomain}</span>.{" "}
            {props.refDomains.length.toLocaleString()} referring domains,{" "}
            {props.backlinks.length.toLocaleString()} backlinks tracked.
          </p>
        </div>
      </header>

      <nav className="flex gap-1 border-b mb-5 overflow-x-auto">
        {TABS.map(([k, label]) => {
          const active = view === k;
          const count = counts[k as TabKey];
          return (
            <button
              key={k}
              onClick={() => setView(k as TabKey)}
              className={
                "px-3 py-1.5 text-sm border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 " +
                (active
                  ? "border-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <span>{label}</span>
              {count > 0 && (
                <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded tabular-nums">
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {view === "overview" && (
        <AuthorityOverview
          latestAudit={props.latestAudit}
          refDomains={props.refDomains}
          backlinks={props.backlinks}
          propertySlug={props.propertySlug}
        />
      )}
      {view === "backlinks" && <BacklinksTab backlinks={props.backlinks} />}
      {view === "refdomains" && (
        <ReferringDomainsV2Tab
          refDomains={props.refDomains}
          propertySlug={props.propertySlug}
        />
      )}
      {view === "prospects" && (
        <ProspectsTab
          prospects={props.prospects}
          propertySlug={props.propertySlug}
        />
      )}
      {view === "disavow" && (
        <DisavowTab
          disavow={props.disavow}
          refDomains={props.refDomains}
          propertySlug={props.propertySlug}
        />
      )}
      {view === "audits" && (
        <AuditsHistoryTab
          audits={props.auditHistory}
          propertySlug={props.propertySlug}
        />
      )}

      <UrlDrawer
        subject={drawerSubject}
        onClose={() => setDrawerSubject(null)}
        propertySlug={props.propertySlug}
        propertyId={props.propertyId}
        primaryDomain={props.primaryDomain}
      />
    </div>
  );
}
