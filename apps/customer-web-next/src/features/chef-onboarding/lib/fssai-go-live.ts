import { NextRequest, NextResponse } from "next/server";
import { authenticatedApiFetch, SessionRequiredError } from "../../../shared/lib/server-api";
import { parseOnboardingState, type OnboardingState } from "./chef-onboarding-v2-contract";

/**
 * FSSAI is not asked at signup. A chef who joined through the current application must add the
 * number before a dish goes live. Chefs with no submitted application here joined under the older
 * process, which collected the licence itself, so they are not asked again.
 */
export function fssaiNeededToGoLive(state: Pick<OnboardingState, "enabled" | "submitted" | "details">): boolean {
  return state.enabled && state.submitted && !/^[0-9]{14}$/.test(state.details?.fssaiNumber ?? "");
}

const headers = { "Cache-Control": "no-store" };

/** Null when the dish may go live; otherwise the response to send back (409 FSSAI_REQUIRED opens the popup). */
export async function requireFssaiToGoLive(request: NextRequest): Promise<NextResponse | null> {
  // Fails closed: a dish must not go live when the FSSAI number cannot be checked.
  const unavailable = NextResponse.json(
    { code: "FSSAI_CHECK_UNAVAILABLE", message: "We couldn’t check your FSSAI details right now. Please try again shortly." },
    { status: 503, headers },
  );
  try {
    const upstream = await authenticatedApiFetch(request, "/chef/onboarding");
    if (upstream.status === 401) return NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401, headers });
    const state = upstream.ok ? parseOnboardingState(await upstream.json().catch(() => null)) : null;
    if (!state) return unavailable;
    return fssaiNeededToGoLive(state)
      ? NextResponse.json(
          { code: "FSSAI_REQUIRED", message: "Add your FSSAI number before your dishes go live." },
          { status: 409, headers },
        )
      : null;
  } catch (error) {
    return error instanceof SessionRequiredError
      ? NextResponse.json({ code: "SESSION_EXPIRED" }, { status: 401, headers })
      : unavailable;
  }
}
