import { NextRequest } from "next/server";
import { decide, type RequestContext } from "@/features/admin/account-deletions/lib/admin-deletion-bff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reject a deletion request that has not started erasing. */
export const POST = (request: NextRequest, context: RequestContext) => decide(request, context, "reject");
