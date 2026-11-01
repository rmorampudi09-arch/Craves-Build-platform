import { NextRequest, NextResponse } from "next/server";
import { boundBffRequest } from "@/shared/lib/bff-request-limits";
import { isSameOrigin } from "@/shared/lib/request-security";
import { upstreamFailure } from "@/shared/lib/feature-availability";
import { authenticatedApiFetch, SessionRequiredError } from "@/shared/lib/server-api";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
// Catalog takes photos of up to 8 MB; the web sends a JPEG or PNG.
const TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 8 * 1024 * 1024;
const failure = (status: number, code: string) => NextResponse.json({ code }, { status, headers });

/** POST multipart "file": fills the next empty kitchen photo slot (a chef never replaces one); answers with the kitchen. */
export async function POST(request: NextRequest) {
  const bounded = await boundBffRequest(request);
  if (bounded instanceof NextResponse) return bounded;
  if (!isSameOrigin(bounded)) return failure(403, "ORIGIN_REJECTED");
  const file = (await bounded.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || !TYPES.has(file.type) || file.size < 1 || file.size > MAX_BYTES) return failure(400, "INVALID_KITCHEN_PHOTO");
  const form = new FormData();
  form.set("file", file, file.name);
  try {
    const upstream = await authenticatedApiFetch(bounded, "/kitchens/me/photos?kind=KITCHEN", { method: "POST", body: form }, 30_000);
    const body: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      // 409 KITCHEN_PHOTOS_LOCKED: both slots are already filled.
      const mapped = upstreamFailure(upstream.status, body, "KITCHEN_PHOTO_FAILED");
      return failure(mapped.status, mapped.code);
    }
    const kitchen = parseChefKitchen(body);
    return kitchen ? NextResponse.json(kitchen, { headers }) : failure(502, "INVALID_KITCHEN_RESPONSE");
  } catch (error) {
    return error instanceof SessionRequiredError ? failure(401, "SESSION_EXPIRED") : failure(503, "KITCHEN_PHOTO_UNAVAILABLE");
  }
}
