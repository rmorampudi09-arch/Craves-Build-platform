import type { NearbyKitchen } from "@/features/home/lib/discovery-contract";
import type { SpiceLevel } from "@/shared/lib/spice-level";

/** How the Chefs tab is sorted and narrowed; a spice level keeps chefs with at least one dish at it. */
export type KitchenView = { sort: "recommended" | "name-a-z"; spice: "any" | SpiceLevel };

export const DEFAULT_KITCHEN_VIEW: KitchenView = { sort: "recommended", spice: "any" };

export const KITCHEN_SORT_LABELS: Record<KitchenView["sort"], string> = {
  recommended: "Relevance",
  "name-a-z": "Name A–Z",
};

/** Name A–Z goes by the name on the card, as the catalog does; equal names keep the nearest first. */
export function sortKitchens(kitchens: NearbyKitchen[], sort: KitchenView["sort"]): NearbyKitchen[] {
  if (sort === "recommended") return kitchens;
  const name = (kitchen: NearbyKitchen) => kitchen.displayName || kitchen.kitchenName;
  return [...kitchens].sort((left, right) => name(left).localeCompare(name(right), "en-IN"));
}
