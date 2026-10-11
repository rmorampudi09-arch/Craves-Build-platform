import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { hasLaunchKey, isLaunchMutationOrigin, WEB_LAUNCH_HEADERS } from "@/features/pilot-launch/lib/web-launch-security";
import { launchBlobUrl, webLaunchStore } from "@/features/pilot-launch/lib/web-launch-state";
export const dynamic = "force-dynamic";
function response(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: WEB_LAUNCH_HEADERS }); }
function authorized(request: NextRequest) { return process.env.CRAVES_ADMIN_PORTAL !== "true" && hasLaunchKey(request) && Boolean(launchBlobUrl()); }
export async function GET(request: NextRequest) {
  try {
    if (!authorized(request)) return response({ code: "NOT_FOUND" }, 404);
    return response((await webLaunchStore.read(true)).state);
  } catch { return response({ code: "WEB_LAUNCH_UNAVAILABLE" }, 503); }
}
export async function POST(request: NextRequest) {
  try {
    if (!authorized(request)) return response({ code: "NOT_FOUND" }, 404);
    if (!isLaunchMutationOrigin(request)) return response({ code: "ORIGIN_REJECTED" }, 403);
    const bounded = await boundBffRequest(request, { maxBytes: 256, timeoutMs: 2000 });
    if (bounded instanceof NextResponse) return bounded;
    const input = await bounded.json().catch(() => null);
    if (!input || input.action !== "launch" || Object.keys(input).length !== 1) return response({ code: "INVALID_LAUNCH_ACTION" }, 400);
    return response((await webLaunchStore.launch()).state);
  } catch { return response({ code: "WEB_LAUNCH_UNAVAILABLE" }, 503); }
}
