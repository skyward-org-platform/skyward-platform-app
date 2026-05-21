"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTION_VARIANTS,
  type ActionVariant,
  actionPillClasses,
  actionLabel,
} from "@/components/ActionPill";
import { updateAuditAction } from "@/app/properties/[slug]/pages/actions";

function isActionVariant(s: string | null | undefined): s is ActionVariant {
  return !!s && (ACTION_VARIANTS as readonly string[]).includes(s);
}

export function AuditActionChip({
  pageId,
  initialAction,
  propertySlug,
}: {
  pageId: string;
  initialAction: string | null;
  propertySlug: string;
}) {
  const initial: ActionVariant = isActionVariant(initialAction)
    ? initialAction
    : "undecided";
  const [current, setCurrent] = useState<ActionVariant>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(newAction: string | null) {
    if (!isActionVariant(newAction)) return;
    const previous = current;
    setCurrent(newAction); // optimistic
    setError(null);
    startTransition(async () => {
      const res = await updateAuditAction(pageId, newAction, propertySlug);
      if (!res.ok) {
        setCurrent(previous); // revert
        setError(res.error);
      }
    });
  }

  // Reuse ActionPill's color schema for the trigger so static pills (in
  // tables, on overview) and the editable trigger share one palette.
  const triggerCls = `${actionPillClasses(current)} h-[22px] border-0 shadow-none ${
    pending ? "opacity-60" : ""
  }`;

  return (
    <div className="inline-flex items-center gap-1">
      <Select value={current} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className={triggerCls}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTION_VARIANTS.map((a) => (
            <SelectItem key={a} value={a} className="text-xs">
              {actionLabel(a)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <span className="text-[10px] text-rose-700" title={error}>
          !
        </span>
      )}
    </div>
  );
}
