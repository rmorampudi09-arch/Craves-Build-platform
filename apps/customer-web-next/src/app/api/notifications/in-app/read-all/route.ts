import { NextRequest, NextResponse } from "next/server";

import { isSameOrigin } from "@/lib/request-security";
import {
  authenticatedApiFetch,
  SessionRequiredError,
} from "@/lib/server-api";

export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "ORIGIN_REJECTED", message: "Invalid notification request origin." },
      { status: 403 },
    );
  }

  try {
    const upstream = await authenticatedApiFetch(
      request,
      "/notifications/in-app/read-all",
      { method: "PATCH" },
    );

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error:
            upstream.status === 401
              ? "SESSION_REQUIRED"
              : "NOTICE_UPDATE_FAILED",
          message:
            upstream.status === 401
              ? "Please sign in again."
              : "Notifications could not be updated.",
        },
        { status: upstream.status },
      );
    }

    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SessionRequiredError
            ? "SESSION_REQUIRED"
            : "NOTICE_UPDATE_FAILED",
        message:
          error instanceof SessionRequiredError
            ? "Please sign in again."
            : "Notifications could not be updated.",
      },
      { status: error instanceof SessionRequiredError ? 401 : 503 },
    );
  }
}
