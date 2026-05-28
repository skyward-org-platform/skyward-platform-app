"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAnnotation } from "@/app/properties/[slug]/tracking/actions";

export function DeleteAnnotationButton({
  propertySlug,
  annotationId,
}: {
  propertySlug: string;
  annotationId: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!confirm("Delete this annotation?")) return;
    start(async () => {
      const res = await deleteAnnotation(propertySlug, annotationId);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-[11px] text-muted-foreground hover:text-rose-600 transition-colors disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
