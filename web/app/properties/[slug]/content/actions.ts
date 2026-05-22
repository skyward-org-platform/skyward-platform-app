"use server";

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import {
  updateContentRow,
  type ContentStatus,
} from "@/lib/content-rows";

type Ok = { ok: true };
type Err = { ok: false; error: string };

function bust(slug: string) {
  revalidatePath(`/properties/${slug}/content`);
}

export async function setRowStatus(
  slug: string, id: string, status: ContentStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateContentRow({ id, status, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setRowWriter(
  slug: string, id: string, writer: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateContentRow({ id, writer, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setRowSprint(
  slug: string, id: string, sprint: number | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateContentRow({ id, sprint, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type FieldName =
  | "action_type_override" | "title_override" | "h1_override"
  | "meta_description_override" | "brief_status" | "calendar_status"
  | "owners" | "word_count_actual" | "draft_link" | "published_url"
  | "feedback_notes" | "rank_30d" | "rank_60d" | "rank_90d";

export async function setRowField(
  slug: string, id: string, field: FieldName, value: unknown,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    await updateContentRow({ id, [field]: value, updated_by: getOperator() } as never);
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
