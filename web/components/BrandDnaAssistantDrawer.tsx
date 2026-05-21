"use client";

// Section-scoped Brand DNA Assistant drawer. Renders a fixed floating
// trigger button on every /brand-dna/<section> page (skipped on Overview,
// where the chat is embedded as the hero). Click → backdrop + slide-over
// panel from the right; the same BrandDnaAssistant component is mounted
// inside, scoped to whichever section the user is currently editing.
//
// The chat history is per-property (one thread), not per-section — the
// scope is just a system-prompt bias so the model knows what the user is
// looking at. Same fetch/save path as the Overview chat.

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandDnaAssistant } from "@/components/BrandDnaAssistant";
import {
  BRAND_DNA_SUBNAV,
  findSubnav,
} from "@/lib/brand-dna-subnav";
import type { ChatMessage as PersistedMessage } from "@/app/properties/[slug]/brand-dna/chat-actions";

export function BrandDnaAssistantDrawer({
  propertySlug,
  propertyName,
  hasContent,
  initialMessages,
}: {
  propertySlug: string;
  propertyName: string;
  hasContent: boolean;
  initialMessages: PersistedMessage[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Detect the section currently being edited from the URL.
  const sectionInfo = useMemo(() => {
    const base = `/properties/${propertySlug}/brand-dna`;
    if (!pathname.startsWith(base)) return null;
    const rest = pathname.slice(base.length).replace(/^\/+/, "");
    // Overview route — no scope.
    if (rest === "" || rest === "/") return null;
    const urlSlug = rest.split("/")[0];
    const item = findSubnav(urlSlug) ?? BRAND_DNA_SUBNAV.find((i) => i.slug === urlSlug);
    if (!item) return null;
    return {
      sectionKey: item.section,
      label: item.label,
    };
  }, [pathname, propertySlug]);

  // Auto-close on route change (e.g. user navigates to a different section
  // via the subnav while the drawer is open).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Body scroll lock + ESC to close.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Don't render on the Brand DNA Overview page — it has the chat embedded
  // as the hero, no need for the drawer.
  if (!sectionInfo) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 px-3.5 py-2.5 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 text-[12px] font-medium"
        title={`Ask the Brand DNA Brain about ${sectionInfo.label}`}
      >
        <span aria-hidden>◈</span>
        <span className="hidden sm:inline">Ask about {sectionInfo.label}</span>
        <span className="sm:hidden">Brain</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Brand DNA Assistant"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          {/* Slide-over panel */}
          <div className="ml-auto h-full w-full sm:w-[480px] md:w-[560px] bg-background border-l shadow-xl relative flex flex-col">
            <header className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Editing
              </span>
              <span className="text-[12px] font-semibold">
                {sectionInfo.label}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto text-muted-foreground hover:text-foreground text-lg leading-none px-1"
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="flex-1 overflow-hidden p-3">
              <BrandDnaAssistant
                propertySlug={propertySlug}
                propertyName={propertyName}
                hasContent={hasContent}
                initialMessages={initialMessages}
                scopedSection={sectionInfo.sectionKey ?? undefined}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
