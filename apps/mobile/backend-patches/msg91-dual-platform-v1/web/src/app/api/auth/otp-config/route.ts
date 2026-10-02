import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export function GET(request?: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  // No platform preserves the installed mobile application's existing contract.
  const platform = request ? new URL(request.url).searchParams.get("platform") : null;
  if (platform !== null && platform !== "web" && platform !== "mobile")
    return NextResponse.json({ code: "OTP_PLATFORM_INVALID" }, { status: 400, headers });
  if (process.env.CRAVES_OTP_PROVIDER !== "msg91")
    return NextResponse.json({ provider: "firebase" }, { headers });
  const isWeb = platform === "web";
  const widgetId = isWeb ? process.env.MSG91_WEB_WIDGET_ID : process.env.MSG91_WIDGET_ID;
  // This is the scoped public Widget token, never the server account authkey.
  const tokenAuth = isWeb ? process.env.MSG91_WEB_WIDGET_TOKEN : process.env.MSG91_WIDGET_TOKEN;
  // A missing web configuration must not fall back to a mobile-only widget.
  if (!widgetId || !tokenAuth || (isWeb && widgetId === process.env.MSG91_WIDGET_ID))
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 503, headers });
  return NextResponse.json({ provider: "msg91", widgetId, tokenAuth }, { headers });
}
