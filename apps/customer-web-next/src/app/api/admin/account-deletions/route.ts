import { NextRequest } from "next/server";
import { ADMIN_STATUS_FILTERS, parseAdminPage } from "@/features/account-deletion/domain/deletion-contract";
import { failure, forward, replyParsed } from "@/features/admin/account-deletions/lib/admin-deletion-bff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

/** Deletion requests for staff, 25 a page. Status and cursor are checked here, so the backend only sees clean values. */
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "";
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (!(ADMIN_STATUS_FILTERS as readonly string[]).includes(status) || (cursor !== null && !CURSOR.test(cursor))) {
    return failure(400, "INVALID_DELETION_QUERY");
  }
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  query.set("limit", "25");
  return forward(request, `/admin/account-deletions?${query}`, {}, 15_000, body => replyParsed(parseAdminPage(body)));
}
