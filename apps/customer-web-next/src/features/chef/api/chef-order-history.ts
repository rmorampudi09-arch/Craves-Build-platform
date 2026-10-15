import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { parseChefOrderHistoryPage, type ChefOrderHistoryPage, type ChefOrderStatus } from "@/features/chef/lib/chef-order-contract";

/** code is FEATURE_NOT_AVAILABLE (show Coming soon), SESSION_EXPIRED, a backend code, or CHEF_ORDER_HISTORY_FAILED. */
export class ChefOrderHistoryError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

/** One page of the chef's orders, newest first; pass the previous page's nextCursor for the next one. */
export async function fetchChefOrderHistoryPage(options: { limit?: number; cursor?: string | null; status?: ChefOrderStatus | null } = {}): Promise<ChefOrderHistoryPage> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.status) query.set("status", options.status);
  const response = await sessionFetch(`/api/chef/orders/page?${query}`, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = response.status === 401 ? "SESSION_EXPIRED" : (body as { code?: unknown } | null)?.code;
    throw new ChefOrderHistoryError(typeof code === "string" ? code : "CHEF_ORDER_HISTORY_FAILED", response.status);
  }
  const page = parseChefOrderHistoryPage(body);
  if (!page) throw new ChefOrderHistoryError("INVALID_CHEF_ORDER_HISTORY_RESPONSE", 502);
  return page;
}
