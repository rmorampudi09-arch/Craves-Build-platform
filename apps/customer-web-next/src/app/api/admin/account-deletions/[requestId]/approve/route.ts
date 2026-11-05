import { NextRequest } from "next/server";
import { decide, type RequestContext } from "@/features/admin/account-deletions/lib/admin-deletion-bff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Approve a chef deletion request; open items on the chef side answer 409 with the blockers. */
export const POST = (request: NextRequest, context: RequestContext) => decide(request, context, "approve");
