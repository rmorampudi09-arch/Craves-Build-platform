import { launchHtml } from "@/lib/web-launch-view";
export const dynamic = "force-dynamic";
export function GET() {
  const page = launchHtml(true);
  return new Response(page.html, { headers: page.headers });
}
