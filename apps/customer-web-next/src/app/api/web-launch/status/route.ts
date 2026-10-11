import { launchBlobUrl, webLaunchStore } from "@/features/pilot-launch/lib/web-launch-state";
import { WEB_LAUNCH_HEADERS } from "@/features/pilot-launch/lib/web-launch-security";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const open = !launchBlobUrl() || (await webLaunchStore.read()).state.phase !== "waiting";
    return Response.json({ open }, { headers: WEB_LAUNCH_HEADERS });
  } catch {
    return Response.json({ code: "WEB_LAUNCH_UNAVAILABLE" }, { status: 503, headers: WEB_LAUNCH_HEADERS });
  }
}
