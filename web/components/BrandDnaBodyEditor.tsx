"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateBrandDnaBody } from "@/app/properties/[slug]/actions";

export function BrandDnaBodyEditor({
  sectionId,
  initialBody,
  propertySlug,
}: {
  sectionId: string;
  initialBody: string;
  propertySlug: string;
}) {
  const [committed, setCommitted] = useState(initialBody);
  const [draft, setDraft] = useState(initialBody);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      autosize(textareaRef.current);
    }
  }, [editing]);

  function autosize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleBlur() {
    const trimmed = draft;
    if (trimmed === committed) {
      setEditing(false);
      return;
    }
    const previous = committed;
    setCommitted(trimmed); // optimistic
    setEditing(false);
    setError(null);
    startTransition(async () => {
      const res = await updateBrandDnaBody(sectionId, trimmed, propertySlug);
      if (!res.ok) {
        setCommitted(previous);
        setDraft(previous);
        setError(res.error);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      setDraft(committed);
      setEditing(false);
      setError(null);
    }
  }

  if (!editing) {
    return (
      <div
        className={`prose prose-sm whitespace-pre-wrap text-slate-700 text-sm cursor-text rounded px-2 py-1 -mx-2 -my-1 hover:bg-slate-50 transition-colors ${pending ? "opacity-60" : ""}`}
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {committed || (
          <span className="italic text-slate-400">Click to add a body…</span>
        )}
        {error && (
          <span className="ml-2 text-[10px] text-red-600" title={error}>
            ! save failed
          </span>
        )}
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        autosize(e.currentTarget);
      }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full text-sm text-slate-700 bg-white border border-blue-300 rounded px-2 py-1 -mx-2 -my-1 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none whitespace-pre-wrap"
      rows={3}
    />
  );
}
