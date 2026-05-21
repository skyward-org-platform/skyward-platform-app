"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <h1 className="text-xl font-bold text-red-700">Something broke.</h1>
      <p className="text-sm text-slate-600 mt-2">
        The page failed to render. The error has been logged to the browser
        console. If this is reproducible, paste the message below into a session
        note.
      </p>
      <pre className="mt-4 text-xs font-mono bg-red-50 border border-red-200 text-red-900 rounded p-3 overflow-x-auto whitespace-pre-wrap">
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 text-sm font-semibold bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-700"
      >
        Try again
      </button>
    </div>
  );
}
