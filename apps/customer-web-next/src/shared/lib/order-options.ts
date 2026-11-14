/**
 * M24c (order-service): a line priced with menu options carries `chosenOptions: [{group, choice, price}]`, the
 * chef's own words (up to 40 characters each); a line without options has no field. `unitPrice` already
 * includes the options, so only the words are shown, as on the invoice.
 */
export type ChosenOption = { group: string; choice: string };

// Bounds sit above the backend's own (40 characters a name, 50 choices a line: MenuOptionsDtos), so nothing paid for is cut.
function words(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

/** The line's options, [] when it has none. A choice without a name is left out, as on the invoice. */
export function parseChosenOptions(value: unknown): ChosenOption[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).flatMap((raw: unknown) => {
    const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const choice = words(entry.choice);
    return choice ? [{ group: words(entry.group), choice }] : [];
  });
}

/** "Spice: Hot · Extras: Raita, Papad": choices of one group together, groups in the order the line lists them. */
export function chosenOptionsText(options: readonly ChosenOption[] = []): string {
  const groups = new Map<string, string[]>();
  for (const { group, choice } of options)
    groups.set(group, [...(groups.get(group) ?? []), choice]);
  return [...groups]
    .map(([group, choices]) => (group ? `${group}: ` : "") + choices.join(", "))
    .join(" · ");
}

/** "Thali (Spice: Hot)" for one-line summaries; just the name when the line has no options. */
export function nameWithOptions(name: string, options?: readonly ChosenOption[]): string {
  const text = chosenOptionsText(options);
  return text ? `${name} (${text})` : name;
}
