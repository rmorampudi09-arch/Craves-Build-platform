import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  if (process.env.CRAVES_OTP_PROVIDER !== "msg91")
    return NextResponse.json({ provider: "firebase" }, { headers });
  const widgetId = process.env.MSG91_WIDGET_ID;
  // This is the scoped public Widget token, never the server account authkey.
  const tokenAuth = process.env.MSG91_WIDGET_TOKEN;
  if (!widgetId || !tokenAuth)
    return NextResponse.json({ code: "OTP_UNAVAILABLE" }, { status: 503, headers });
  return NextResponse.json({ provider: "msg91", widgetId, tokenAuth }, { headers });
}
