import { z } from "zod";
import { id, instant, personName, rupeesToPaise, VERSION, type FleetRoute } from "./fleet-common";
import { formatPaise } from "./payout-contract";
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
/**
 * The dispatch values every new version gets (owner's decision, 1 Nov 2026): one rider at a time, nearest first, then the next
 * rider, the way food delivery apps hand out orders. Ops can't choose them. The setup sends them as builtInDispatch; these stand
 * in for an older server that doesn't.
 */
export const BUILT_IN_DISPATCH = {
  offerSeconds: 30, fleetStageSeconds: 120, radiusM: 5000, pickupDetourPercent: 130, perOrderOverheadPaise: 500, costGuardPremiumPaise: 1000,
  pidgeStageSeconds: 600, offersAtOnce: 1, offerRounds: 3, fairBandM: 1500, rankByTravelTime: false,
} as const;
export type DispatchMode = (typeof DISPATCH_MODES)[number];
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
  // A version from a server before Phase 4 has no offer rules: it ran the three nearest at once, one round.
  offersAtOnce: atOnce.default(3), offerRounds: rounds.default(1), fairBandM: band.default(0),
  // Phase 5: soonest at the kitchen by the travel-time model, not nearest by straight line.
  rankByTravelTime: z.boolean().default(false),
});
export const builtInDispatchSchema = z.object({ ...each(DISPATCH_FIELDS, count), offersAtOnce: atOnce, offerRounds: rounds, fairBandM: band, rankByTravelTime: z.boolean() });
export const rateCardSchema = z.object({
  ...versionMeta, ...each(RATE_CARD_FIELDS, count), ranges: z.object(each(RATE_CARD_FIELDS, range.optional())),
  summaryOfChanges: z.object({ en: lines, te: lines.nullish(), hi: lines.nullish() }), fullTextUrl: z.string().max(400).nullish(),
});
export const pilotRiderSchema = z.object({ riderId: id, name: personName, status: riderStatusSchema, note, addedAt: instant });
export const pilotKitchenSchema = z.object({ chefId: id, note, addedAt: instant });
export const fleetSetupSchema = z.object({
  testMode: z.boolean(),
  dispatchPolicy: dispatchPolicySchema.nullable(), dispatchPolicies: z.array(dispatchPolicySchema).max(20),
  builtInDispatch: builtInDispatchSchema.default(BUILT_IN_DISPATCH),
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
/** {mode} or {mode, effectiveFrom}: the server gives a new version the built-in values; an off starting now keeps those riders are shown. */
export const dispatchPolicyInputSchema = z.object({ mode: z.enum(DISPATCH_MODES), effectiveFrom: instant.optional() });
/** PUT pilot/... sends {note} or no body. */
export const pilotNoteSchema = z.object({ note: z.string().trim().min(1).max(200, "Keep the note to 200 characters.").optional() }).optional();

export type FleetSetup = z.infer<typeof fleetSetupSchema>;
export type DispatchPolicy = z.infer<typeof dispatchPolicySchema>;
export type BuiltInDispatch = z.infer<typeof builtInDispatchSchema>;
export type RateCard = z.infer<typeof rateCardSchema>;
export type PilotRider = z.infer<typeof pilotRiderSchema>;
export type PilotKitchen = z.infer<typeof pilotKitchenSchema>;
export type RateCardDraft = z.infer<typeof rateCardDraftSchema>;
export type DispatchPolicyInput = z.infer<typeof dispatchPolicyInputSchema>;

/** How the console shows an API integer: paise as rupees, metres as km, the rest as they are. */
export type Unit = "rupees" | "km" | "minutes" | "seconds" | "percent" | "count";
export type UnitInput<F extends string> = { field: F; label: string; unit: Unit };

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

export type DispatchForm = { mode: DispatchMode; effectiveFrom: string };

export const dispatchForm = (policy: DispatchPolicy | null, now = Date.now()): DispatchForm => ({ mode: policy?.mode ?? "off", effectiveFrom: noticeStart(now) });

/** A fair band in minutes when ranked by travel time: its metres at 20 km/h, to a tenth, as riders are told (DispatchRules.bandMinutes). */
export const bandMinutes = (bandM: number) => Math.max(0.1, Math.round(bandM * 3 / 100) / 10);

/** Who hears first: "nearest first", "fair band 1.5 km", or the same by travel time. */
const firstText = (rules: { fairBandM: number; rankByTravelTime?: boolean }) => rules.rankByTravelTime
  ? rules.fairBandM > 0 ? `fair band ${bandMinutes(rules.fairBandM)} min by travel time` : "soonest first by travel time"
  : rules.fairBandM > 0 ? `fair band ${toUnitText("km", rules.fairBandM)} km` : "nearest first";

/** The rules in a few words for ops: "3 at once, 1 round, nearest first". */
export function rulesText(rules: Record<RuleField, number> & { rankByTravelTime?: boolean }): string {
  return `${rules.offersAtOnce} at once, ${rules.offerRounds} ${rules.offerRounds === 1 ? "round" : "rounds"}, ${firstText(rules)}`;
}

/** The built-in values in one line for ops: "1 rider at a time · 30 s to accept · up to 3 rounds · fair band 1.5 km · …". */
export function builtInText(values: BuiltInDispatch): string {
  const rupees = (paise: number) => formatPaise(paise).replace(/\.00$/, "");
  return [
    `${values.offersAtOnce} ${values.offersAtOnce === 1 ? "rider" : "riders"} at a time`, `${values.offerSeconds} s to accept`,
    `up to ${values.offerRounds} ${values.offerRounds === 1 ? "round" : "rounds"}`, firstText(values), `within ${toUnitText("km", values.radiusM)} km`,
    `${values.fleetStageSeconds} s before Borzo`, `Pidge ${values.pidgeStageSeconds} s`, `pickup detour ${values.pickupDetourPercent}%`,
    `cost guard ${rupees(values.perOrderOverheadPaise)} overhead, ${rupees(values.costGuardPremiumPaise)} premium`,
  ].join(" · ");
}

/**
 * What the built-in values change for riders and so needs 14 days' notice: "", "detour", "offer rules" or "detour and offer
 * rules". `reference` is what riders are shown (the policy in force, else the newest draft), null before any rate card is published.
 */
export function noticeFor(values: BuiltInDispatch, reference: DispatchPolicy | null): string {
  if (!reference) return "";
  const rules = values.rankByTravelTime !== reference.rankByTravelTime || RULE_FIELDS.some(field => values[field] !== reference[field]);
  return [values.pickupDetourPercent !== reference.pickupDetourPercent ? "detour" : "", rules ? "offer rules" : ""].filter(Boolean).join(" and ");
}

/** Why the start must be 14 days away, and what riders keep until then. */
export function noticeHelp(what: string, reference: DispatchPolicy): string {
  const detour = what.includes("detour"), rules = what.includes("offer rules");
  const why = [detour ? "The detour changes rider pay (pickup km = straight line × detour)" : "", rules ? `${detour ? "how" : "How"} orders are offered is part of riders' terms` : ""];
  const keep = [detour ? `the detour at ${reference.pickupDetourPercent}%` : "", rules ? `the offer rules at ${rulesText(reference)}` : ""];
  return `${why.filter(Boolean).join(" and ")}, so riders get 14 days' notice. This whole version, mode included, starts at this time, at least 14 days and 1 hour from now. Until then riders keep ${keep.filter(Boolean).join(" and ")}.`;
}

/** The body: {mode}, with effectiveFrom when the built-in values need notice (see noticeFor). The server fills in the values. */
export function dispatchFromForm(form: DispatchForm, notice: string, now = Date.now()): DispatchPolicyInput | string {
  if (!notice) return { mode: form.mode };
  if (tooSoon(form.effectiveFrom, now)) return `Pick a start for the new ${notice} at least 14 days and 1 hour from now.`;
  return { mode: form.mode, effectiveFrom: istInstant(form.effectiveFrom) };
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
