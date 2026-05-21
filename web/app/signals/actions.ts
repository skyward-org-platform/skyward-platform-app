"use server";

// Snooze / unsnooze a detected signal. Keyed on the deterministic
// signal.id produced by lib/signals.ts (e.g. "no_brand_dna:phil-lasry").
//
// Schema: db/supabase/migrations/20260518221842_snoozed_signal.sql.

import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";

type Ok = { ok: true };
type Err = { ok: false; error: string };

export async function snoozeSignal(signalId: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { error } = await supabase.from("snoozed_signal").upsert({
    signal_id: signalId,
    snoozed_by: getOperator(),
    snoozed_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/signals");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function unsnoozeSignal(signalId: string): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  const { error } = await supabase
    .from("snoozed_signal")
    .delete()
    .eq("signal_id", signalId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/signals");
  revalidatePath("/", "layout");
  return { ok: true };
}
