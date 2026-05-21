"use client";

// Responsive layout shell:
//   - Desktop (≥lg): sidebar sits inline at 248px, main fills the rest
//   - Mobile (<lg): sidebar collapses behind a hamburger; tapping it slides
//     the sidebar in from the left over a dimmed backdrop. Route change
//     auto-closes.
//
// The Sidebar itself stays a server component — it's passed as `sidebar`
// JSX. This shell only owns the drawer state.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close drawer on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Fire-and-forget prewarm on app boot. Wakes the Python serverless
  // functions (WQA + clients) so subsequent navigation isn't blocked on
  // 3-8s cold starts. Cron would be cleaner but the Hobby plan caps
  // crons at daily.
  useEffect(() => {
    fetch("/api/prewarm", { cache: "no-store" }).catch(() => {});
  }, []);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — visible at lg and up. */}
      <div className="hidden lg:flex">{sidebar}</div>

      {/* Mobile drawer — hidden by default, slides in on open. */}
      <div
        className={`lg:hidden fixed inset-0 z-50 ${
          open ? "" : "pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        {/* Drawer */}
        <div
          className={`absolute inset-y-0 left-0 max-w-[85vw] transform transition-transform duration-200 ease-out shadow-2xl ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebar}
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <MobileTopBar onMenu={() => setOpen(true)} />
        {children}
      </main>
    </div>
  );
}

function MobileTopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="lg:hidden sticky top-0 z-30 bg-card border-b flex items-center gap-3 px-4 h-12">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className="size-8 rounded-md flex items-center justify-center -ml-1 hover:bg-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div className="size-6 rounded-md bg-foreground text-background flex items-center justify-center font-semibold text-[11px]">
        S
      </div>
      <span className="font-semibold text-sm tracking-tight">
        Skyward Platform
      </span>
    </div>
  );
}
