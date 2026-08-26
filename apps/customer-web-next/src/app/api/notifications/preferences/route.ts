import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "@/lib/server-api";
import { parseNotificationPreferences } from "@/lib/notification-preference-contract";

export async function GET(request: NextRequest) {
  try {
    const upstream = await authenticatedApiFetch(request, "/notifications/preferences");
    const body = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: upstream.status === 401 ? "SESSION_REQUIRED" : "NOTIFICATION_PREFERENCES_UNAVAILABLE",
          message: upstream.status === 401 ? "Please sign in again." : "Notification preferences could not be loaded.",
        },
        { status: upstream.status },
      );
    }
    const preferences = parseNotificationPreferences(body);
    return preferences
      ? NextResponse.json(preferences, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json(
          { error: "INVALID_UPSTREAM_RESPONSE", message: "Notification preferences response validation failed." },
          { status: 502 },
        );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof SessionRequiredError ? "SESSION_REQUIRED" : "NOTIFICATION_PREFERENCES_UNAVAILABLE",
        message: error instanceof SessionRequiredError ? "Please sign in again." : "Notification preferences could not be loaded.",
      },
      { status: error instanceof SessionRequiredError ? 401 : 503 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const upstream = await authenticatedApiFetch(request, "/notifications/preferences", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const upstreamBody = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: upstream.status === 401 ? "SESSION_REQUIRED" : "NOTIFICATION_PREFERENCES_UPDATE_FAILED",
          message: upstreamBody?.message ?? (upstream.status === 401 ? "Please sign in again." : "Notification preferences could not be updated."),
        },
        { status: upstream.status },
      );
    }
    const preferences = parseNotificationPreferences(upstreamBody);
    return preferences
      ? NextResponse.json(preferences, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json(
          { error: "INVALID_UPSTREAM_RESPONSE", message: "Notification preferences response validation failed." },
          { status: 502 },
        );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof SessionRequiredError ? "SESSION_REQUIRED" : "NOTIFICATION_PREFERENCES_UPDATE_FAILED",
        message: error instanceof SessionRequiredError ? "Please sign in again." : "Notification preferences could not be updated.",
      },
      { status: error instanceof SessionRequiredError ? 401 : 503 },
    );
  }
}
