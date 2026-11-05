"use client";

import type { DeletionScope, DeletionView } from "@/features/account-deletion/domain/deletion-types";
import { sessionFetch } from "@/shared/lib/session-fetch";

export type DeletionAnswer = { ok: true; view: DeletionView | null } | { ok: false; code: string | null };

/** One call to /api/account-deletion (the route has validated the view): the view, null for { none: true }, or the refusal's code. */
export async function callAccountDeletion(method: "GET" | "POST" | "DELETE", scope?: DeletionScope): Promise<DeletionAnswer> {
  const send: RequestInit = scope ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) } : {};
  const response = await sessionFetch("/api/account-deletion", { method, cache: "no-store", ...send }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as (DeletionView & { none?: unknown; code?: unknown }) | null;
  if (response?.ok && body) return { ok: true, view: body.none === true ? null : body };
  return { ok: false, code: typeof body?.code === "string" ? body.code : null };
}
