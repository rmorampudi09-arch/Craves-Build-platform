import { z } from "zod";
import { id, instant, personName, VERSION, type FleetRoute } from "./fleet-common";
import { riderStatusSchema } from "./rider-contract";
import { istInstant, rupeesToPaise } from "./slot-contract";

// Rider pilot setup: rate card, dispatch policy and the test-mode allow-lists. Money is paise, distances metres.
export const DISPATCH_MODES = ["off", "shadow", "live"] as const;
export const DISPATCH_FIELDS = ["offerSeconds", "fleetStageSeconds", "radiusM", "pickupDetourPercent", "perOrderOverheadPaise", "costGuardPremiumPaise", "pidgeStageSeconds"] as const;
export const RATE_CARD_FIELDS = [
  "basePaise", "baseDropM", "dropPerKmPaise", "pickupFreeM", "pickupPerKmPaise", "waitFreeMinutes", "waitPerMinutePaise",
  "slotGuaranteePerHourPaise", "cancellationFeePaise", "returnPerKmPaise", "unreachableWaitMinutes",
] as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];
export type DispatchField = (typeof DISPATCH_FIELDS)[number];
export type RateCardField = (typeof RATE_CARD_FIELDS)[number];

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = z.string().regex(VERSION);
const range = z.tuple([count, count]);
const each = <K extends string, T extends z.ZodTypeAny>(fields: readonly K[], schema: T) =>
  Object.fromEntries(fields.map(field => [field, schema])) as { [P in K]: T };
const versionMeta = { version, status: z.enum(["DRAFT", "PUBLISHED"]), effectiveFrom: instant, publishedAt: instant.nullish() };
const note = z.string().max(200).nullish();
const lines = z.array(z.string().max(200)).max(10);

export const dispatchPolicySchema = z.object({
  ...versionMeta, mode: z.enum(DISPATCH_MODES), ...each(DISPATCH_FIELDS, count), ranges: z.object(each(DISPATCH_FIELDS, range.optional())),
});
export const rateCardSchema = z.object({
  ...versionMeta, ...each(RATE_CARD_FIELDS, count), ranges: z.object(each(RATE_CARD_FIELDS, range.optional())),
  summaryOfChanges: z.object({ en: lines, te: lines.nullish(), hi: lines.nullish() }), fullTextUrl: z.string().max(400).nullish(),
});
export const pilotRiderSchema = z.object({ riderId: id, name: personName, status: riderStatusSchema, note, addedAt: instant });
export const pilotKitchenSchema = z.object({ chefId: id, note, addedAt: instant });
export const fleetSetupSchema = z.object({
  testMode: z.boolean(),
  dispatchPolicy: dispatchPolicySchema.nullable(), dispatchPolicies: z.array(dispatchPolicySchema).max(20),
  rateCard: rateCardSchema.nullable(), rateCards: z.array(rateCardSchema).max(20),
  pilotRiders: z.array(pilotRiderSchema).max(500), pilotKitchens: z.array(pilotKitchenSchema).max(500),
});

const summaryLines = (language: string) => z.array(z.string().trim().min(1).max(200, `Keep each ${language} line to 200 characters.`))
  .min(1, `Write at least one ${language} summary line.`).max(10, `Write at most 10 ${language} summary lines.`);
export const rateCardDraftSchema = z.object({
  ...each(RATE_CARD_FIELDS, count),
  effectiveFrom: z.string().datetime({ offset: true, message: "Pick when the rate card starts." }),
  summaryOfChanges: z.object({ en: summaryLines("English"), te: summaryLines("Telugu").optional(), hi: summaryLines("Hindi").optional() }),
  fullTextUrl: z.string().max(400, "Keep the link to 400 characters.").url("Enter the full terms link as https://…").startsWith("https://", "Enter the full terms link as https://…").optional(),
  // Only while no rate card is published; later cards keep the first published ranges.
  ranges: z.object(each(RATE_CARD_FIELDS, range.refine(([min, max]) => min <= max, "A lowest value is above its highest."))).optional(),
});
export const dispatchPolicyInputSchema = z.object({ mode: z.enum(DISPATCH_MODES), ...each(DISPATCH_FIELDS, count), effectiveFrom: instant.optional() });
/** PUT pilot/... sends {note} or no body. */
export const pilotNoteSchema = z.object({ note: z.string().trim().min(1).max(200, "Keep the note to 200 characters.").optional() }).optional();

export type FleetSetup = z.infer<typeof fleetSetupSchema>;
export type DispatchPolicy = z.infer<typeof dispatchPolicySchema>;
export type RateCard = z.infer<typeof rateCardSchema>;
export type PilotRider = z.infer<typeof pilotRiderSchema>;
export type PilotKitchen = z.infer<typeof pilotKitchenSchema>;
export type RateCardDraft = z.infer<typeof rateCardDraftSchema>;
export type DispatchPolicyInput = z.infer<typeof dispatchPolicyInputSchema>;

/** How the console shows an API integer: paise as rupees, metres as km, the rest as they are. */
export type Unit = "rupees" | "km" | "minutes" | "seconds" | "percent";
export type UnitInput<F extends string> = { field: F; label: string; unit: Unit };

export const DISPATCH_INPUTS: readonly UnitInput<DispatchField>[] = [
  { field: "offerSeconds", label: "Time a rider has to accept, seconds", unit: "seconds" },
  { field: "fleetStageSeconds", label: "Time Craves riders get before Borzo, seconds", unit: "seconds" },
  { field: "radiusM", label: "Rider search radius, km", unit: "km" },
  { field: "pickupDetourPercent", label: "Pickup detour, % of the straight line", unit: "percent" },
  { field: "perOrderOverheadPaise", label: "Overhead per order, ₹", unit: "rupees" },
  { field: "costGuardPremiumPaise", label: "Cost guard premium, ₹", unit: "rupees" },
  { field: "pidgeStageSeconds", label: "Time Pidge gets before the ops queue, seconds", unit: "seconds" },
];
export const RATE_CARD_INPUTS: readonly UnitInput<RateCardField>[] = [
  { field: "basePaise", label: "Base pay, ₹", unit: "rupees" },
  { field: "baseDropM", label: "Drop distance in the base pay, km", unit: "km" },
  { field: "dropPerKmPaise", label: "Each drop km after that, ₹", unit: "rupees" },
  { field: "pickupFreeM", label: "Free pickup distance, km", unit: "km" },
  { field: "pickupPerKmPaise", label: "Each pickup km after that, ₹", unit: "rupees" },
  { field: "waitFreeMinutes", label: "Free waiting, minutes", unit: "minutes" },
  { field: "waitPerMinutePaise", label: "Each waiting minute after that, ₹", unit: "rupees" },
  { field: "slotGuaranteePerHourPaise", label: "Slot guarantee, ₹ an hour", unit: "rupees" },
  { field: "cancellationFeePaise", label: "Cancellation fee at the kitchen, ₹", unit: "rupees" },
  { field: "returnPerKmPaise", label: "Each km returning food, ₹", unit: "rupees" },
  { field: "unreachableWaitMinutes", label: "Wait for an unreachable customer, minutes", unit: "minutes" },
];

export function toUnitText(unit: Unit, value: number): string {
  if (unit === "rupees") return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
  return unit === "km" ? String(value / 1000) : String(value);
}

/** Typed text back to the API integer, without floating point; null if it isn't one. */
export function fromUnitText(unit: Unit, text: string): number | null {
  if (unit === "rupees") return rupeesToPaise(text);
  if (unit === "km") {
    const match = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(text.trim());
    return match ? Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0")) : null;
  }
  return /^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : null;
}

function readValues<F extends string>(inputs: readonly UnitInput<F>[], form: Record<F, string>): Record<F, number> | string {
  const values = {} as Record<F, number>;
  for (const { field, label, unit } of inputs) {
    const value = fromUnitText(unit, form[field]);
    if (value === null) return `Enter a number for “${label}”${unit === "rupees" ? ", like 40 or 40.50" : ""}.`;
    values[field] = value;
  }
  return values;
}

const DAY = 86_400_000;
export type DispatchForm = Record<DispatchField, string> & { mode: DispatchMode; effectiveFrom: string };

export function dispatchForm(policy: DispatchPolicy | null): DispatchForm {
  const values = Object.fromEntries(DISPATCH_INPUTS.map(({ field, unit }) => [field, policy ? toUnitText(unit, policy[field]) : ""]));
  return { ...values as Record<DispatchField, string>, mode: policy?.mode ?? "off", effectiveFrom: "" };
}

/** A new detour changes rider pay, so it needs 14 days' notice; `reference` is the policy in force (else the newest published). */
export function detourChanges(form: DispatchForm, reference: DispatchPolicy | null): boolean {
  const detour = fromUnitText("percent", form.pickupDetourPercent);
  return reference !== null && detour !== null && detour !== reference.pickupDetourPercent;
}

export function dispatchFromForm(form: DispatchForm, reference: DispatchPolicy | null, now = Date.now()): DispatchPolicyInput | string {
  const values = readValues(DISPATCH_INPUTS, form);
  if (typeof values === "string") return values;
  if (!detourChanges(form, reference)) return { mode: form.mode, ...values };
  const effectiveFrom = istInstant(form.effectiveFrom);
  if (!effectiveFrom || Date.parse(effectiveFrom) < now + 14 * DAY) return "A new detour can start 14 days from now at the earliest. Pick a later start.";
  return { mode: form.mode, ...values, effectiveFrom };
}

export type RateCardForm = Record<RateCardField, string> & {
  ranges: Record<RateCardField, [string, string]>; effectiveFrom: string; en: string; te: string; hi: string; fullTextUrl: string;
};

export function rateCardForm(card: RateCard | null): RateCardForm {
  const text = (unit: Unit, value: number | undefined) => value === undefined ? "" : toUnitText(unit, value);
  return {
    ...Object.fromEntries(RATE_CARD_INPUTS.map(({ field, unit }) => [field, text(unit, card?.[field])])) as Record<RateCardField, string>,
    ranges: Object.fromEntries(RATE_CARD_INPUTS.map(({ field, unit }) => [field, [text(unit, card?.ranges[field]?.[0]), text(unit, card?.ranges[field]?.[1])]])) as Record<RateCardField, [string, string]>,
    effectiveFrom: "", en: "", te: "", hi: "", fullTextUrl: "",
  };
}

/** The new-draft form as the API body, or the first problem. Ranges go only with the first card (`withRanges`). */
export function draftFromForm(form: RateCardForm, withRanges: boolean): RateCardDraft | string {
  const values = readValues(RATE_CARD_INPUTS, form);
  if (typeof values === "string") return values;
  const ranges = {} as Record<RateCardField, [number, number]>;
  for (const { field, label, unit } of withRanges ? RATE_CARD_INPUTS : []) {
    const [min, max] = form.ranges[field].map(value => fromUnitText(unit, value));
    if (min === null || max === null) return `Enter the lowest and highest “${label}”.`;
    if (min > max) return `The lowest “${label}” is above the highest.`;
    ranges[field] = [min, max];
  }
  const split = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean);
  const [te, hi, url] = [split(form.te), split(form.hi), form.fullTextUrl.trim()];
  const parsed = rateCardDraftSchema.safeParse({
    ...values, effectiveFrom: istInstant(form.effectiveFrom),
    summaryOfChanges: { en: split(form.en), ...te.length ? { te } : {}, ...hi.length ? { hi } : {} },
    ...url ? { fullTextUrl: url } : {}, ...withRanges ? { ranges } : {},
  });
  return parsed.success ? parsed.data : parsed.error.issues[0]?.message ?? "Check the details.";
}

/** A version's place: Draft, In force, Scheduled (published, starts later) or Replaced. */
export function versionState(row: { version: string; status: string; effectiveFrom: string }, inForce: { version: string } | null, now = Date.now()): string {
  if (row.status === "DRAFT") return "Draft";
  if (row.version === inForce?.version) return "In force";
  return Date.parse(row.effectiveFrom) > now ? "Scheduled" : "Replaced";
}

export const SETUP_ROUTES: readonly FleetRoute[] = [
  { method: "GET", path: "setup", response: fleetSetupSchema },
  { method: "POST", path: "rate-cards", body: rateCardDraftSchema, response: rateCardSchema },
  { method: "POST", path: "rate-cards/:version/publish", response: rateCardSchema },
  { method: "POST", path: "dispatch-policies", body: dispatchPolicyInputSchema, response: dispatchPolicySchema },
  // PUT upserts (re-adding updates the note); DELETE answers 204, also when the rider or kitchen was not listed.
  { method: "PUT", path: "pilot/riders/:id", body: pilotNoteSchema, response: pilotRiderSchema },
  { method: "DELETE", path: "pilot/riders/:id", response: z.null() },
  { method: "PUT", path: "pilot/kitchens/:id", body: pilotNoteSchema, response: pilotKitchenSchema },
  { method: "DELETE", path: "pilot/kitchens/:id", response: z.null() },
];
