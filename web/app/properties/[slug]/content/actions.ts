"use server";

import { revalidatePath } from "next/cache";
import { requireWriteToken } from "@/lib/auth";
import { getOperator } from "@/lib/operator";
import {
  updateContentRow,
  getContentRowById,
  getContentRowHistory,
  contentRowSupportsM1,
  type ContentStatus,
  type ContentRowHistory,
} from "@/lib/content-rows";

type Ok = { ok: true };
type Err = { ok: false; error: string };

// Read the snapshot history for one content row (drawer timeline). Mirrors the
// getVerificationHistory action shape used elsewhere in the drawer.
export async function getContentHistoryAction(
  id: string,
  limit = 20,
): Promise<{ ok: true; events: ContentRowHistory[] } | Err> {
  try {
    const events = await getContentRowHistory(id, limit);
    return { ok: true, events };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function bust(slug: string) {
  revalidatePath(`/properties/${slug}/content`);
}

export async function setRowStatus(
  slug: string, id: string, status: ContentStatus,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    // Stamp published_at when a piece goes live, so the freshness flag keys
    // off the real publish date and Published rows stay first-class (the
    // "published task disappeared" pain, call 146940114). Skipped gracefully
    // until the M1 migration adds the column, so setting status still works.
    const extra =
      status === "Published" && (await contentRowSupportsM1())
        ? { published_at: new Date().toISOString() }
        : {};
    await updateContentRow({ id, status, ...extra, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Assign a reviewer to a content row. Enforces writer ≠ reviewer — the team's
// rule that the agent/person who writes cannot be the one who reviews
// (calls 120861702, 132062339).
export async function setRowReviewer(
  slug: string, id: string, reviewer: string | null,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    if (!(await contentRowSupportsM1())) {
      return {
        ok: false,
        error:
          "Reviewer assignment needs the M1 migration (20260531_content_row_m1.sql) applied.",
      };
    }
    const trimmed = reviewer?.trim() || null;
    if (trimmed) {
      const row = await getContentRowById(id);
      if (row?.writer && row.writer.trim().toLowerCase() === trimmed.toLowerCase()) {
        return {
          ok: false,
          error: "Reviewer must differ from the writer (writer ≠ reviewer).",
        };
      }
    }
    await updateContentRow({ id, reviewer: trimmed, updated_by: getOperator() });
    bust(slug);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Review decision on a content row. Approve → Published (stamps published_at).
// Request changes → back to Draft, recording the reviewer's feedback.
export async function reviewContentRow(
  slug: string,
  id: string,
  decision: "approve" | "request-changes",
  feedback?: string,
): Promise<Ok | Err> {
  const authed = await requireWriteToken();
  if (!authed.ok) return authed;
  try {
    if (decision === "approve") {
      const extra = (await contentRowSupportsM1())
        ? { published_at: new Date().toISOString() }
        : {};
      await updateContentRow({
        id,
        status: "Published",
        ...extra,
        updated_by: getOperator(),
      });
    } else {
      await updateContentRow({
        id,
        status: "Draft",
        feedback_notes: feedback?.trim() || null,
        updated_by: getOperator(),
      });
    }
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
