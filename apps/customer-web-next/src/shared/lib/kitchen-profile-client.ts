import { parseKitchenProfile, type KitchenProfile } from "./kitchen-profile-contract";

// One read per kitchen per page load, shared by every card that shows it; a failed read is forgotten so the next caller retries.
const profiles = new Map<string, Promise<KitchenProfile | null>>();

async function load(kitchenId: string): Promise<KitchenProfile | null> {
  const response = await fetch(`/api/catalog/kitchens/${encodeURIComponent(kitchenId)}`, { cache: "no-store", credentials: "same-origin" });
  if (response.status === 400 || response.status === 404) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`KITCHEN_PROFILE_FAILED_${response.status}`);
  const profile = parseKitchenProfile(body);
  if (!profile) throw new Error("INVALID_KITCHEN_PROFILE_RESPONSE");
  return profile;
}

/** The public kitchen profile, or null when the id is invalid or the kitchen isn't public (missing, inactive, not selling). */
export async function getKitchenProfile(kitchenId: string): Promise<KitchenProfile | null> {
  const id = kitchenId.trim().toLowerCase();
  let profile = profiles.get(id);
  if (!profile) {
    profile = load(id);
    profiles.set(id, profile);
    profile.catch(() => profiles.delete(id));
  }
  return profile;
}
