import { NextRequest, NextResponse } from "next/server";
import { isAdminDestination } from "@/features/admin/shell/lib/admin-navigation";
import { safeReturnPath } from "@/features/auth/lib/auth-contract";
import { webLaunchGate } from "@/features/pilot-launch/lib/web-launch-gate";
import { FRONT_DOOR_ID_HEADER, frontDoorCheckMisconfigured, frontDoorOriginDecision } from "@/shared/lib/front-door-origin";

let originCheckMisconfiguredLogged = false;
// The newest live rider APK (docs/riders/RELEASE.md, "One-tap install"); the Play Store listing once there is one.
const RIDER_APP_DOWNLOAD_URL = "https://github.com/rmorampudi09-arch/Craves-Build-platform/releases/download/delivery-app-latest/craves-delivery-app.apk";

// Answer only our Front Door (src/shared/lib/front-door-origin.ts). Off unless CRAVES_FRONT_DOOR_CHECK is set.
function frontDoorOriginGate(request: NextRequest): NextResponse | null {
  if (!originCheckMisconfiguredLogged && frontDoorCheckMisconfigured(process.env)) {
    originCheckMisconfiguredLogged = true;
    console.error("ORIGIN_CHECK_MISCONFIGURED CRAVES_FRONT_DOOR_CHECK is set but CRAVES_FRONT_DOOR_ID is empty; allowing every request");
  }
  const fdid = request.headers.get(FRONT_DOOR_ID_HEADER);
  const decision = frontDoorOriginDecision(fdid, process.env);
  if (decision === "deny") return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  // Path only: no address, header value or query string.
  if (decision === "report") console.warn(`ORIGIN_CHECK_MISMATCH mode=report path=${request.nextUrl.pathname} hasFdid=${fdid !== null}`);
  return null;
}

export async function proxy(request: NextRequest) {
  // First, before every other branch, so the customer site and the admin portal are both covered.
  const forbidden = frontDoorOriginGate(request);
  if (forbidden) return forbidden;
  const path = request.nextUrl.pathname;
  // Preserve the original handling of dotted paths when the gate is absent,
  // and on the separately deployed admin portal. HTML aliases must be gated.
  if (path.includes(".") && (process.env.CRAVES_ADMIN_PORTAL === "true" || !process.env.CRAVES_WEB_LAUNCH_BLOB_URL)) return NextResponse.next();
  if (process.env.CRAVES_ADMIN_PORTAL !== "true") {
    // The QR printed on the rider flyers opens craves.in/rider: keep this path. Not cached, so it can
    // point somewhere else later without a reprint.
    if (path === "/rider" && ["GET", "HEAD"].includes(request.method)) {
      const response = NextResponse.redirect(RIDER_APP_DOWNLOAD_URL, 307);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    }
    // Customer sessions cannot satisfy the dedicated administrator session policy.
    // Send old admin bookmarks to the owning portal before any OTP is requested.
    if (process.env.NODE_ENV === "production" && ["GET", "HEAD"].includes(request.method)) {
      let target: URL | null = null;
      if (isAdminDestination(path)) {
        target = new URL(`${path}${request.nextUrl.search}`, "https://admin.craves.in");
      } else if (path === "/sign-in") {
        const returnTo = safeReturnPath(request.nextUrl.searchParams.get("returnTo"));
        if (isAdminDestination(returnTo)) {
          target = new URL("https://admin.craves.in/sign-in");
          target.searchParams.set("returnTo", returnTo);
        }
      }
      if (target) {
        const response = NextResponse.redirect(target, 307);
        response.headers.set("Cache-Control", "private, no-store, max-age=0");
        response.headers.set("Pragma", "no-cache");
        return response;
      }
    }
    // Signed-in visitors skip the marketing landing. The cookie is not validated
    // here: /home already handles an expired session.
    if (path === "/" && request.method === "GET" && request.cookies.has("craves_access_token")) {
      const response = NextResponse.redirect(new URL(`/home${request.nextUrl.search}`, request.url), 307);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      return response;
    }
    return process.env.CRAVES_WEB_LAUNCH_BLOB_URL ? webLaunchGate(request) : NextResponse.next();
  }

  const allowedPage = path === "/admin" || path.startsWith("/admin/") || path === "/sign-in";
  const allowedApi = path === "/api/admin" || path.startsWith("/api/admin/") || path === "/api/auth" || path.startsWith("/api/auth/");
  if (allowedPage || allowedApi) return NextResponse.next();

  if (path.startsWith("/api/")) {
    return NextResponse.json({ code: "ADMIN_PORTAL_ROUTE_NOT_AVAILABLE" }, { status: 404 });
  }
  return NextResponse.redirect(new URL("/admin", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
