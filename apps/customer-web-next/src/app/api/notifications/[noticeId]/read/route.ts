import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, isUuid, SessionRequiredError } from "@/lib/server-api";

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    const current = new URL(request.url);
    return supplied.protocol === current.protocol && supplied.host === current.host;
  } catch {
    return false;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ noticeId: string }> }
) {
  if (!sameOrigin(request)) return NextResponse.json({ code: "ORIGIN_REJECTED" }, { status: 403 });
  const { noticeId } = await params;
  if (!isUuid(noticeId)) return NextResponse.json({ code: "INVALID_NOTICE_ID" }, { status: 400 });
  try {
    const upstream = await authenticatedApiFetch(request, `/notifications/in-app/${noticeId}/read`, { method: "PATCH" });
    if (!upstream.ok) {
      const code = upstream.status === 401 ? "SESSION_EXPIRED" : upstream.status === 404 ? "NOTICE_NOT_FOUND" : "NOTICE_UPDATE_FAILED";
      return NextResponse.json({ code }, { status: upstream.status });
    }
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionRequiredError) return NextResponse.json({ code: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    return NextResponse.json({ code: "NOTICE_UPDATE_FAILED" }, { status: 503 });
  }
}
