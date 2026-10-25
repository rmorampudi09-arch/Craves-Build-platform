import { z } from "zod";
import { day, id, instant, personName, reasonBody, UUID, type FleetRoute } from "./fleet-common";
import { addDays } from "./payout-contract";

const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const slotTime = z.string().datetime({ offset: true, message: "Pick the date, the start time and the end time." });

export const slotSchema = z.object({
  slotId: id, riderId: id, riderName: personName, zoneName: z.string().max(80), startsAt: instant, endsAt: instant,
  guaranteedPerHourPaise: paise, status: z.enum(["BOOKED", "CANCELLED", "COMPLETED"]),
  onlineInZoneMinutes: z.number().int().nonnegative().nullable().optional(), topUpPaise: paise.nullable().optional(),
});
export const slotsSchema = z.object({ slots: z.array(slotSchema).max(500) });
export const slotInputSchema = z.object({
  riderId: z.string().regex(UUID, "Choose the rider."),
  zoneName: z.string().trim().min(1, "Enter the zone name.").max(80, "Keep the zone name to 80 characters."),
  startsAt: slotTime, endsAt: slotTime,
  guaranteedPerHourPaise: z.number().int().positive("Enter the guarantee in rupees an hour, like 80 or 80.50.").max(Number.MAX_SAFE_INTEGER),
}).refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt), { message: "The slot must end after it starts.", path: ["endsAt"] });

export const zoneBannerSchema = z.object({
  tone: z.enum(["info", "warning"]),
  text: z.string().trim().min(1, "Write the banner text.").max(160, "Keep the banner to 160 characters."),
  until: z.string().datetime({ offset: true, message: "Pick until when the banner shows." }),
});

export type Slot = z.infer<typeof slotSchema>;
export type SlotInput = z.infer<typeof slotInputSchema>;
export type ZoneBanner = z.infer<typeof zoneBannerSchema>;
export type SlotForm = { riderId: string; zoneName: string; date: string; startTime: string; endTime: string; rupeesPerHour: string };

/** A datetime-local value read as IST, the zone the console shows times in, whatever the PC is set to; "" if it isn't one. */
export function istInstant(local: string): string {
  const value = new Date(`${local}:00+05:30`);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) && Number.isFinite(value.getTime()) ? value.toISOString() : "";
}

/** Rupees as typed ("80", "80.5", "80.50") to integer paise, without floating point; null if it isn't an amount. */
export function rupeesToPaise(text: string): number | null {
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim());
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : null;
}

/** An end time before the start time is on the next IST day, so a slot can run past or up to midnight (18:00 to 00:00). */
export const endsNextDay = (form: Pick<SlotForm, "startTime" | "endTime">) => form.endTime !== "" && form.endTime < form.startTime;

/** The create-slot form (an IST day, start and end times, rupees an hour) as the API body, or the first problem. */
export function slotFromForm(form: SlotForm): SlotInput | string {
  const endsAt = istInstant(`${form.date}T${form.endTime}`);
  const parsed = slotInputSchema.safeParse({
    riderId: form.riderId, zoneName: form.zoneName, startsAt: istInstant(`${form.date}T${form.startTime}`),
    // IST has no daylight saving, so the same time on the next day is exactly 24 hours later.
    endsAt: endsAt && endsNextDay(form) ? new Date(Date.parse(endsAt) + 86_400_000).toISOString() : endsAt,
    guaranteedPerHourPaise: rupeesToPaise(form.rupeesPerHour) ?? 0,
  });
  return parsed.success ? parsed.data : parsed.error.issues[0]?.message ?? "Check the details.";
}

/** The list covers at most 31 IST days. */
export function slotRangeProblem(from: string, to: string): string | null {
  if (!day.safeParse(from).success || !day.safeParse(to).success) return "Pick both dates.";
  if (to < from) return "The last day must be on or after the first day.";
  return to > addDays(from, 30) ? "Show at most 31 days at a time." : null;
}

export function bannerFromForm(form: { tone: string; text: string; until: string }, now = Date.now()): ZoneBanner | string {
  const parsed = zoneBannerSchema.safeParse({ tone: form.tone, text: form.text, until: istInstant(form.until) });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the details.";
  return Date.parse(parsed.data.until) > now ? parsed.data : "Pick a time in the future.";
}

export const SLOT_ROUTES: readonly FleetRoute[] = [
  { method: "GET", path: "slots", response: slotsSchema, query: { from: day, to: day, riderId: id } },
  { method: "POST", path: "slots", body: slotInputSchema, response: slotSchema },
  { method: "POST", path: "slots/:id/cancel", body: reasonBody, response: slotSchema },
  // GET answers 204 when no banner is showing; DELETE always answers 204.
  { method: "GET", path: "banner", response: zoneBannerSchema.nullable() },
  { method: "PUT", path: "banner", body: zoneBannerSchema, response: zoneBannerSchema },
  { method: "DELETE", path: "banner", response: z.null() },
];
