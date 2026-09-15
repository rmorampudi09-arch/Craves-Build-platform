import { NextRequest, NextResponse } from "next/server";
import { isAdminDestination } from "@/lib/admin-navigation";
import { safeReturnPath } from "@/lib/auth-contract";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (process.env.CRAVES_ADMIN_PORTAL !== "true") {
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
    return NextResponse.next();
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
