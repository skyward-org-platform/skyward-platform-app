"use client";

// Brand DNA subnav strip — client component because the active item depends
// on the current pathname (server layouts don't receive pathname in Next 16).
//
// Receives a precomputed counts map from the server-side layout so we don't
// re-query Supabase here.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND_DNA_SUBNAV } from "@/lib/brand-dna-subnav";

export function BrandDnaSubnav({
  baseRoute,
  counts,
}: {
  baseRoute: string;
  counts: Record<string, number | null>;
}) {
  const pathname = usePathname();
  const activeSlug = (() => {
    if (!pathname) return "";
    if (pathname === baseRoute) return "";
    if (pathname.startsWith(baseRoute + "/")) {
      return pathname.slice(baseRoute.length + 1).split("/")[0];
    }
    return "";
  })();

  return (
    <div className="bg-muted/40 border-b">
      <div className="flex items-center gap-1 px-8 py-2 overflow-x-auto text-[12.5px]">
        {BRAND_DNA_SUBNAV.map((item) => {
          const href =
            item.slug === "" ? baseRoute : `${baseRoute}/${item.slug}`;
          const active = item.slug === activeSlug;
          const count = item.countable ? counts[item.slug] : null;

          return (
            <Link
              key={item.slug || "overview"}
              href={href}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                active
                  ? "bg-card text-foreground font-semibold shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-card"
              }`}
            >
              {item.label}
              {item.countable && count !== null && count > 0 && (
                <span
                  className={`text-[10px] tabular-nums px-1.5 py-px rounded ${
                    active
                      ? "bg-muted text-muted-foreground"
                      : "bg-card text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
