import { z } from "zod";
import { id, instant, personName, rupeesToPaise, VERSION, type FleetRoute } from "./fleet-common";
import { riderStatusSchema } from "./rider-contract";
import { istInstant } from "./slot-contract";

// Rider pilot setup: rate card, dispatch policy and the test-mode allow-lists. Money is paise, distances metres.
export const DISPATCH_MODES = ["off", "shadow", "live"] as const;
export const DISPATCH_FIELDS = ["offerSeconds", "fleetStageSeconds", "radiusM", "pickupDetourPercent", "perOrderOverheadPaise", "costGuardPremiumPaise", "pidgeStageSeconds"] as const;
export const RATE_CARD_FIELDS = [
  "basePaise", "baseDropM", "dropPerKmPaise", "pickupFreeM", "pickupPerKmPaise", "waitFreeMinutes", "waitPerMinutePaise",
  "slotGuaranteePerHourPaise", "cancellationFeePaise", "returnPerKmPaise", "unreachableWaitMinutes",
] as const;
// How orders are offered (Phase 4, docs/riders/DISPATCH.md): riders at once, rounds, fair band in metres.
export const RULE_FIELDS = ["offersAtOnce", "offerRounds", "fairBandM"] as const;
/** Today's rules: the three nearest at once, one round. A server without them answers as if these were set. */
export const TODAY_RULES = { offersAtOnce: 3, offerRounds: 1, fairBandM: 0 } as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];
export type DispatchField = (typeof DISPATCH_FIELDS)[number];
export type RuleField = (typeof RULE_FIELDS)[number];
export type RateCardField = (typeof RATE_CARD_FIELDS)[number];

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = z.string().regex(VERSION);
const range = z.tuple([count, count]);
const each = <K extends string, T extends z.ZodTypeAny>(fields: readonly K[], schema: T) =>
  Object.fromEntries(fields.map(field => [field, schema])) as { [P in K]: T };
const versionMeta = { version, status: z.enum(["DRAFT", "PUBLISHED"]), effectiveFrom: instant, publishedAt: instant.nullish() };
const note = z.string().max(200).nullish();
const lines = z.array(z.string().max(200)).max(10);

const atOnce = z.number().int().min(1).max(3);
const rounds = z.number().int().min(1).max(5);
const band = z.number().int().min(0).max(5000);
export const dispatchPolicySchema = z.object({
  // withdrawnAt: an immediate off withdrew this scheduled version before it started; it never comes into force.
  ...versionMeta, withdrawnAt: instant.nullish(), mode: z.enum(DISPATCH_MODES), ...each(DISPATCH_FIELDS, count), ranges: z.object(each(DISPATCH_FIELDS, range.optional())),
  offersAtOnce: atOnce.default(TODAY_RULES.offersAtOnce), offerRounds: rounds.default(TODAY_RULES.offerRounds), fairBandM: band.default(TODAY_RULES.fairBandM),
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
export const dispatchPolicyInputSchema = z.object({
  mode: z.enum(DISPATCH_MODES), ...each(DISPATCH_FIELDS, count), effectiveFrom: instant.optional(),
  // Left out: the server keeps the rules riders are shown.
  offersAtOnce: atOnce.optional(), offerRounds: rounds.optional(), fairBandM: band.optional(),
});
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
export type Unit = "rupees" | "km" | "minutes" | "seconds" | "percent" | "count";
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
export const RULE_INPUTS: readonly UnitInput<RuleField>[] = [
  { field: "offersAtOnce", label: "Riders who see an order at once, 1 to 3", unit: "count" },
  { field: "offerRounds", label: "Rounds of offers, 1 to 5", unit: "count" },
  { field: "fairBandM", label: "Fair band, km (0: nearest first)", unit: "km" },
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
// The server checks 14 days against its own clock when the request arrives, so the console asks for an hour more.
const NOTICE = 14 * DAY + 3_600_000;
/** The earliest start the console offers for a change that needs 14 days' notice, as an IST datetime-local value. */
export const noticeStart = (now = Date.now()) => new Date(now + NOTICE + 330 * 60_000).toISOString().slice(0, 16);
const tooSoon = (local: string, now: number) => !istInstant(local) || Date.parse(istInstant(local)) < now + NOTICE;

/** Published, not withdrawn, and starting later. */
export const isScheduled = (policy: DispatchPolicy, now = Date.now()) => policy.status === "PUBLISHED" && !policy.withdrawnAt && Date.parse(policy.effectiveFrom) > now;

export type DispatchForm = Record<DispatchField | RuleField, string> & { mode: DispatchMode; effectiveFrom: string };

export function dispatchForm(policy: DispatchPolicy | null, now = Date.now()): DispatchForm {
  const values = Object.fromEntries(DISPATCH_INPUTS.map(({ field, unit }) => [field, policy ? toUnitText(unit, policy[field]) : ""]));
  const rules = Object.fromEntries(RULE_INPUTS.map(({ field, unit }) => [field, toUnitText(unit, (policy ?? TODAY_RULES)[field])]));
  return { ...values as Record<DispatchField, string>, ...rules as Record<RuleField, string>, mode: policy?.mode ?? "off", effectiveFrom: noticeStart(now) };
}

/** The rules in a few words for ops: "3 at once, 1 round, nearest first". */
export function rulesText(rules: Record<RuleField, number>): string {
  const roundsText = `${rules.offerRounds} ${rules.offerRounds === 1 ? "round" : "rounds"}`;
  return `${rules.offersAtOnce} at once, ${roundsText}, ${rules.fairBandM > 0 ? `fair band ${toUnitText("km", rules.fairBandM)} km` : "nearest first"}`;
}

/**
 * What changes for riders and so needs 14 days' notice: "", "detour", "offer rules" or "detour and offer rules". `reference`
 * is what riders are shown (see detourChanges), null before any rate card is published.
 */
export function noticeFor(form: DispatchForm, reference: DispatchPolicy | null): string {
  const rules = reference !== null && RULE_INPUTS.some(({ field, unit }) => {
    const value = fromUnitText(unit, form[field]);
    return value !== null && value !== reference[field];
  });
  return [detourChanges(form, reference) ? "detour" : "", rules ? "offer rules" : ""].filter(Boolean).join(" and ");
}

/** Why the start must be 14 days away, and what to keep to change things sooner. */
export function noticeHelp(what: string, reference: DispatchPolicy): string {
  const detour = what.includes("detour"), rules = what.includes("offer rules");
  const why = [detour ? "The detour changes rider pay (pickup km = straight line × detour)" : "", rules ? `${detour ? "how" : "How"} orders are offered is part of riders' terms` : ""];
  const keep = [detour ? `the detour at ${reference.pickupDetourPercent}%` : "", rules ? `the offer rules at ${rulesText(reference)}` : ""];
  return `${why.filter(Boolean).join(" and ")}, so riders get 14 days' notice. This whole version, mode included, starts at this time, at least 14 days and 1 hour from now. To change anything sooner, keep ${keep.filter(Boolean).join(" and ")}.`;
}

/** The server's checks on the rules, so the console says them first. */
function rulesProblem(rules: Record<RuleField, number>, values: Record<DispatchField, number>): string | null {
  if (rules.offersAtOnce < 1 || rules.offersAtOnce > 3) return "Offer each order to 1, 2 or 3 riders at a time.";
  if (rules.offerRounds < 1 || rules.offerRounds > 5) return "Run 1 to 5 rounds of offers.";
  if (rules.fairBandM > 5000) return "Set the fair band from 0 (nearest first) to 5 km.";
  if (rules.offerRounds > 1 && rules.offerRounds * values.offerSeconds > values.fleetStageSeconds) {
    return "Each round needs its full time to accept: make “Time Craves riders get before Borzo” at least the rounds × “Time a rider has to accept”, or run fewer rounds.";
  }
  return null;
}

/**
 * A new detour changes rider pay, so it needs 14 days' notice. `reference` is the detour riders are shown (the policy in
 * force, else the newest draft), or null before any rate card is published, when any detour starts at once.
 */
export function detourChanges(form: DispatchForm, reference: DispatchPolicy | null): boolean {
  const detour = fromUnitText("percent", form.pickupDetourPercent);
  return reference !== null && detour !== null && detour !== reference.pickupDetourPercent;
}

export function dispatchFromForm(form: DispatchForm, reference: DispatchPolicy | null, now = Date.now()): DispatchPolicyInput | string {
  const values = readValues(DISPATCH_INPUTS, form);
  if (typeof values === "string") return values;
  const rules = readValues(RULE_INPUTS, form);
  if (typeof rules === "string") return rules;
  const problem = rulesProblem(rules, values);
  if (problem) return problem;
  const what = noticeFor(form, reference);
  if (!what) return { mode: form.mode, ...values, ...rules };
  if (tooSoon(form.effectiveFrom, now)) return `Pick a start for the new ${what} at least 14 days and 1 hour from now.`;
  return { mode: form.mode, ...values, ...rules, effectiveFrom: istInstant(form.effectiveFrom) };
}

export type RateCardForm = Record<RateCardField, string> & {
  ranges: Record<RateCardField, [string, string]>; effectiveFrom: string; en: string; te: string; hi: string; fullTextUrl: string;
};

export function rateCardForm(card: RateCard | null, effectiveFrom = ""): RateCardForm {
  const text = (unit: Unit, value: number | undefined) => value === undefined ? "" : toUnitText(unit, value);
  return {
    ...Object.fromEntries(RATE_CARD_INPUTS.map(({ field, unit }) => [field, text(unit, card?.[field])])) as Record<RateCardField, string>,
    ranges: Object.fromEntries(RATE_CARD_INPUTS.map(({ field, unit }) => [field, [text(unit, card?.ranges[field]?.[0]), text(unit, card?.ranges[field]?.[1])]])) as Record<RateCardField, [string, string]>,
    effectiveFrom, en: "", te: "", hi: "", fullTextUrl: "",
  };
}

/** The new-draft form as the API body, or the first problem. Only the first card sends ranges; later ones need 14 days' notice. */
export function draftFromForm(form: RateCardForm, firstCard: boolean, now = Date.now()): RateCardDraft | string {
  const values = readValues(RATE_CARD_INPUTS, form);
  if (typeof values === "string") return values;
  if (!firstCard && form.effectiveFrom && tooSoon(form.effectiveFrom, now)) return "Pick a start at least 14 days and 1 hour from now: riders get 14 days' notice.";
  const ranges = {} as Record<RateCardField, [number, number]>;
  for (const { field, label, unit } of firstCard ? RATE_CARD_INPUTS : []) {
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
    ...url ? { fullTextUrl: url } : {}, ...firstCard ? { ranges } : {},
  });
  return parsed.success ? parsed.data : parsed.error.issues[0]?.message ?? "Check the details.";
}

/** A version's place: Draft, Withdrawn, In force, Scheduled (published, starts later) or Replaced. */
export function versionState(row: { version: string; status: string; effectiveFrom: string; withdrawnAt?: string | null }, inForce: { version: string } | null, now = Date.now()): string {
  if (row.status === "DRAFT") return "Draft";
  if (row.withdrawnAt) return "Withdrawn";
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
