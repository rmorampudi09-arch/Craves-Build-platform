/** The catalog's spice levels with the labels the app's filter sheet uses. */
export const SPICE_LEVEL_LABELS = { MILD: "Mild", MEDIUM: "Medium", SPICY: "Spicy" } as const;

export type SpiceLevel = keyof typeof SPICE_LEVEL_LABELS;

export const SPICE_LEVELS = Object.keys(SPICE_LEVEL_LABELS) as SpiceLevel[];
