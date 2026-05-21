"use client";

// Per-property error boundary. Catches any Server Component throw inside
// /properties/[slug]/* so the rest of the app (sidebar, top nav) stays
// rendered and the user can navigate away. Surfaces the digest so we can
// match it to Vercel logs when debugging.

import { useEffect } from "react";

export default function PropertyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[property]", error);
  }, [error]);

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <h1 className="text-xl font-bold text-rose-700">
        Couldn&rsquo;t load this property.
      </h1>
      <p className="text-sm text-muted-foreground mt-2">
        Server-rendered data threw. The sidebar still works — pick another
        property or try again.
      </p>
      <pre className="mt-4 text-xs font-mono bg-rose-50 border border-rose-200 text-rose-900 rounded p-3 overflow-x-auto whitespace-pre-wrap">
        {error.message || "(no message)"}
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
