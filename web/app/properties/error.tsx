"use client";

// Parent error boundary for /properties/*. Catches throws from the
// per-property layout.tsx — which the sibling error.tsx at
// /properties/[slug]/error.tsx cannot reach because Next.js error
// boundaries don't catch errors in their own segment's layout.
//
// Surfaces the actual error.message + digest so we can fix it next time
// instead of guessing at the digest.

import { useEffect } from "react";

export default function PropertiesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[properties]", error);
  }, [error]);

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <h1 className="text-xl font-bold text-rose-700">
        Couldn&rsquo;t load this property.
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        The property layout threw before the page could render. Sidebar
        still works — pick another property or try again.
      </p>
      <pre className="mt-4 text-xs font-mono bg-rose-50 border border-rose-200 text-rose-900 rounded p-3 overflow-x-auto whitespace-pre-wrap">
        {error.message || "(no message — production build masks details)"}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="text-xs font-medium px-3 py-1.5 bg-foreground text-background rounded-md hover:bg-foreground/85"
        >
          Try again
        </button>
        <a
          href="/clients"
          className="text-xs font-medium px-3 py-1.5 border rounded-md text-foreground hover:bg-muted"
        >
          ← Back to clients
        </a>
      </div>
    </div>
  );
}
