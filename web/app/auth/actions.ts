"use server";

import { redirect } from "next/navigation";
import { setWriteToken, clearWriteToken } from "@/lib/auth";

const SAFE_NEXT_PREFIX = "/";

function safeRedirectPath(next: string): string {
  // Only allow internal, root-relative paths. Reject anything starting with
  // a scheme, "//" (protocol-relative), or backslash.
  if (!next || !next.startsWith(SAFE_NEXT_PREFIX) || next.startsWith("//")) {
    return "/";
  }
  return next;
}

export async function signIn(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const nextRaw = String(formData.get("next") ?? "");
  const next = safeRedirectPath(nextRaw);

  const res = await setWriteToken(token);
  if (!res.ok) {
    const params = new URLSearchParams({ error: res.error });
    if (nextRaw) params.set("next", nextRaw);
    redirect(`/auth?${params.toString()}`);
  }
  redirect(next);
}

export async function signOut(): Promise<void> {
  await clearWriteToken();
  redirect("/auth");
}
