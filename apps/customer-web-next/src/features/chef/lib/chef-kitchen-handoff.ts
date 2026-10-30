import { sessionFetch } from "@/shared/lib/session-fetch";
import type { ChefApplication } from "@/features/chef-onboarding/lib/chef-application-contract";
import { parseOnboardingState, type OnboardingDetails } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen, ChefKitchenInput } from "@/features/chef/lib/chef-kitchen-types";

const orNull = (value: string) => value.trim() || null;

/**
 * The kitchen an approved chef already described in the application: its name, pickup address and
 * map pin. Null when something the kitchen needs is missing; the kitchen form then asks for it.
 */
export function kitchenFromApplication(details: OnboardingDetails, phoneNumber: string): ChefKitchenInput | null {
  if (![details.kitchenName, details.addressLine1, details.city, details.state].every((value) => value.trim())) return null;
  return {
    kitchenName: details.kitchenName.trim(),
    displayName: orNull([details.firstName, details.lastName].join(" ")),
    description: orNull(details.kitchenDescription),
    phoneNumber: orNull(phoneNumber),
    email: orNull(details.email),
    addressLine1: details.addressLine1.trim(),
    addressLine2: orNull(details.addressLine2),
    landmark: orNull(details.landmark),
    // The application's "Street / area" ends with the area, which pickup partners look for.
    areaName: orNull(details.addressLine2.split(",").pop() ?? ""),
    city: details.city.trim(),
    state: details.state.trim(),
    postalCode: orNull(details.postalCode),
    latitude: details.latitude,
    longitude: details.longitude,
    // Closed to orders until the chef opens it, once there is a dish to sell.
    status: "DRAFT",
  };
}

/** Saves that kitchen for the chef, so an approved chef is never asked for it twice. Null if it can't. */
export async function createKitchenFromApplication(application: ChefApplication, phoneNumber: string): Promise<ChefKitchen | null> {
  const stateResponse = await sessionFetch("/api/chef/onboarding", { cache: "no-store" });
  if (!stateResponse.ok) return null;
  const state = parseOnboardingState(await stateResponse.json().catch(() => null));
  if (!state?.details || !application.id || state.application.id !== application.id) return null;
  const input = kitchenFromApplication(state.details, phoneNumber);
  if (!input) return null;
  const response = await sessionFetch("/api/chef/kitchen", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.ok ? parseChefKitchen(await response.json().catch(() => null)) : null;
}
