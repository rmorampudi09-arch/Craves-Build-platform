import { NextRequest, NextResponse } from "next/server";
import { parseAdminChefDocuments } from "@/lib/admin-chef-document-contract";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  if (!isUuid(applicationId)) return NextResponse.json({ code: "INVALID_APPLICATION_ID" }, { status: 400 });

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/backoffice/chef-reviews/${applicationId}/documents`,
    );
    if (!upstream.ok) {
      return NextResponse.json(
        { code: upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 403 ? "ADMIN_ACCESS_REQUIRED" : "EVIDENCE_STATUS_UNAVAILABLE" },
        { status: upstream.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    const documents = parseAdminChefDocuments(await upstream.json().catch(() => null));
    if (!documents) return NextResponse.json({ code: "INVALID_EVIDENCE_STATUS_RESPONSE" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(documents, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: "EVIDENCE_STATUS_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
