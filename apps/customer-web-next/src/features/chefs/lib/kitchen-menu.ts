export type KitchenMenuSection<T> = { category: string; label: string; dishes: T[] };
type FoodTyped = { foodType?: "VEG" | "NON_VEG" | "EGG"; veg: boolean };

// The server stores snacks as "Snakes"; people read "Snacks".
const CATEGORY_LABELS: Record<string, string> = { Snakes: "Snacks" };

/** The menu by category in first-seen order (case-insensitive), as the server sorted it: never a popularity ranking. */
export function groupKitchenMenu<T extends { category: string }>(dishes: readonly T[]): KitchenMenuSection<T>[] {
  const sections = new Map<string, KitchenMenuSection<T>>();
  for (const dish of dishes) {
    const category = dish.category.trim() || "Other";
    const key = category.toLocaleLowerCase();
    const section = sections.get(key) ?? { category, label: CATEGORY_LABELS[category] ?? category, dishes: [] };
    section.dishes.push(dish);
    sections.set(key, section);
  }
  return [...sections.values()];
}

export function kitchenFoodMixLabel(dishes: readonly FoodTyped[]): string | null {
  const types = new Set(dishes.map((dish) => dish.foodType ?? (dish.veg ? "VEG" : "NON_VEG")));
  const veg = types.has("VEG");
  if (veg && (types.has("NON_VEG") || types.has("EGG"))) return "Veg & non-veg";
  if (veg) return "Pure veg";
  if (types.has("NON_VEG")) return "Non-veg";
  return types.has("EGG") ? "Egg" : null;
}

/** Area, city and state once each ("Kukatpally, Hyderabad, Telangana"); null when none is known. */
export function kitchenLocation(parts: readonly (string | null | undefined)[]): string | null {
  const unique: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (value && !unique.some((seen) => seen.toLocaleLowerCase() === value.toLocaleLowerCase())) unique.push(value);
  }
  return unique.length ? unique.join(", ") : null;
}

export function kitchenJoinedLabel(createdAt: string | null | undefined): string | null {
  const timestamp = createdAt ? Date.parse(createdAt) : Number.NaN;
  return Number.isFinite(timestamp) ? `On Craves since ${new Date(timestamp).getUTCFullYear()}` : null;
}

/** Index of the last section whose top has reached the line (0 before any has). */
export function activeMenuSectionIndex(sectionTops: readonly number[], line: number): number {
  let active = 0;
  sectionTops.forEach((top, index) => { if (top <= line) active = index; });
  return active;
}
