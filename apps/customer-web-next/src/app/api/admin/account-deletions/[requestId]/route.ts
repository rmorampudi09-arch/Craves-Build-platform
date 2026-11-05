import { NextRequest } from "next/server";
import { parseAdminDetail } from "@/features/account-deletion/domain/deletion-contract";
import { forward, replyParsed, requestIdOf, type RequestContext } from "@/features/admin/account-deletions/lib/admin-deletion-bff";
import { authenticatedApiFetch } from "@/shared/lib/server-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DECIDERS = ["PLATFORM_ADMIN", "COMPLIANCE_ADMIN"];
const field = (value: unknown, name: string): unknown =>
  value && typeof value === "object" ? (value as Record<string, unknown>)[name] : undefined;

/** Whether the signed-in staff member may approve or reject. Only a hint for the page's buttons (the backend decides); the roles stay here. */
async function staffCanDecide(request: NextRequest): Promise<boolean> {
  try {
    const me = await authenticatedApiFetch(request, "/auth/me", {}, 5_000, 64 * 1024);
    const body: unknown = me.ok ? await me.json().catch(() => null) : null;
    const roles = field(field(body, "identity") ?? body, "roles");
    return Array.isArray(roles) && roles.some(role => typeof role === "string" && DECIDERS.includes(role.trim().toUpperCase()));
  } catch {
    return false;
  }
}

/** One request with its open items and erasure steps. The backend asks eight services (up to about 21 s), so this waits 25 s. */
export async function GET(request: NextRequest, context: RequestContext) {
  const requestId = await requestIdOf(context);
  if (typeof requestId !== "string") return requestId;
  return forward(request, `/admin/account-deletions/${requestId}`, {}, 25_000,
    async body => replyParsed(parseAdminDetail(body, await staffCanDecide(request))));
}
