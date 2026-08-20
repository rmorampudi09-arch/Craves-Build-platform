import { NextRequest, NextResponse } from "next/server";
import { parseAdminChefDocument } from "@/lib/admin-chef-document-contract";
import { isSameOrigin } from "@/lib/request-security";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

function rejectionReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  return normalized.length >= 3 && normalized.length <= 1000 ? normalized : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string; documentId: string }> },
) {
  if (!isSameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  const { applicationId, documentId } = await context.params;
  if (!isUuid(applicationId) || !isUuid(documentId)) {
    return NextResponse.json({ code: "INVALID_DOCUMENT_REVIEW_ID" }, { status: 400 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const reason = rejectionReason(body?.reason);
  if (!reason) return NextResponse.json({ code: "DOCUMENT_REJECTION_REASON_REQUIRED" }, { status: 400 });

  try {
    const upstream = await authenticatedApiFetch(
      request,
      `/backoffice/chef-reviews/${applicationId}/documents/${documentId}/reject`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) },
      12_000,
    );
    const upstreamBody = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        { code: upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 403 ? "ADMIN_ACCESS_REQUIRED" : upstream.status === 409 ? "DOCUMENT_NOT_AWAITING_REVIEW" : "DOCUMENT_REJECTION_FAILED" },
        { status: upstream.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    const document = parseAdminChefDocument(upstreamBody);
    return document
      ? NextResponse.json(document, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ code: "INVALID_DOCUMENT_REVIEW_RESPONSE" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: "DOCUMENT_REJECTION_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
