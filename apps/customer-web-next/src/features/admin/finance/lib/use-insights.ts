"use client";

import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";

export function insightsError(status: number, missing = "Finance figures are not switched on for this portal yet."): string {
  if (status === 401) return "Your session has ended. Sign in again.";
  if (status === 403) return "Your account can't open Finance. A platform admin can give you the payments or audit admin role.";
  if (status === 404) return missing;
  if (status === 409) return "Your session was renewed. Try again.";
  if (status === 400) return "That search isn't valid. Type an order number, or at least 3 letters or digits of an ID or reference.";
  return "Finance figures couldn't be loaded. Nothing was changed. Try again.";
}

/**
 * Below 1250px (the breakpoint in admin-finance.css) a detail pane replaces its list, so focus and the view move to the pane
 * when `opened` changes. Beside the list it is already in view and focus stays on the row.
 */
export function usePaneFocus(opened: unknown) {
  const pane = useRef<HTMLElement>(null);
  useEffect(() => { if (opened !== null && window.matchMedia?.("(max-width: 1250px)").matches) pane.current?.focus(); }, [opened]);
  return pane;
}

/**
 * One read of /api/admin/finance/insights. While a new query loads, the previous answer stays (the screens dim it instead
 * of flashing empty). `query` null means "don't ask".
 */
export function useInsights<S extends z.ZodTypeAny>(query: string | null, schema: S, missing?: string) {
  const [settled, setSettled] = useState<{ query: string | null; data: z.infer<S> | null; error: string }>({ query: null, data: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    adminFetch(`/api/admin/finance/insights?${query}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(insightsError(response.status, missing));
      const body = schema.safeParse(await response.json().catch(() => null));
      if (!body.success) throw new Error("The answer couldn't be checked, so it isn't shown. Try again.");
      setSettled({ query, data: body.data, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setSettled(previous => ({ query, data: previous.data, error: error instanceof Error && error.name !== "TimeoutError" ? error.message : insightsError(503) }));
    });
    return () => controller.abort();
  }, [query, schema, missing, attempt]);
  const loading = query !== null && settled.query !== query;
  return { data: query === null ? null : settled.data, error: loading ? "" : settled.error, loading, reload: () => { setSettled(previous => ({ ...previous, query: null })); setAttempt(value => value + 1); } };
}
