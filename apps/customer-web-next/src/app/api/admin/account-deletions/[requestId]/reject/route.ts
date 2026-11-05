import { NextRequest } from "next/server";
import { decide, DEFAULT_TIMEOUT_MS, type RequestContext } from "@/features/admin/account-deletions/lib/admin-deletion-bff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reject a deletion request that has not started erasing. It calls no service, so the default wait is enough. */
export const POST = (request: NextRequest, context: RequestContext) => decide(request, context, "reject", DEFAULT_TIMEOUT_MS);
