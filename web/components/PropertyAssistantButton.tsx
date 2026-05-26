"use client";

import { useState } from "react";
import { PropertyAssistantDrawer } from "./PropertyAssistantDrawer";

export function PropertyAssistantButton({ propertySlug }: { propertySlug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 size-12 rounded-full bg-foreground text-background shadow-lg hover:opacity-90 inline-flex items-center justify-center text-[20px] font-semibold"
        title="Property Assistant"
        aria-label="Open Property Assistant"
      >
        ✦
      </button>
      <PropertyAssistantDrawer
        open={open}
        onClose={() => setOpen(false)}
        propertySlug={propertySlug}
      />
    </>
  );
}
