import { NextRequest, NextResponse } from "next/server";
import { launchBlobUrl, webLaunchStore } from "./web-launch-state";
import { launchExemptPath, WEB_LAUNCH_HEADERS } from "./web-launch-security";
import { launchHtml } from "./web-launch-view";

export async function webLaunchGate(request: NextRequest): Promise<NextResponse> {
  if (launchExemptPath(request.nextUrl.pathname)) return NextResponse.next();
  let waiting = false;
  try {
    if (!launchBlobUrl()) return NextResponse.next();
    waiting = (await webLaunchStore.read()).state.phase === "waiting";
  } catch {
    // Preserve the last observed state. A cold storage outage must not take the
    // previously working website offline; control/status never claim success.
    waiting = webLaunchStore.lastKnown()?.state.phase === "waiting";
  }
  if (!waiting) return NextResponse.next();
  const headers = { ...WEB_LAUNCH_HEADERS, "Retry-After": "1" };
  if (!["GET", "HEAD"].includes(request.method) || request.nextUrl.pathname.startsWith("/api/") || request.headers.get("rsc") === "1") {
    return NextResponse.json({ code: "WEB_OPENING_SOON", message: "Craves web is opening soon." }, { status: 503, headers });
  }
  const page = launchHtml();
  return new NextResponse(request.method === "HEAD" ? null : page.html, { status: 503, headers: { ...page.headers, ...headers } });
}
