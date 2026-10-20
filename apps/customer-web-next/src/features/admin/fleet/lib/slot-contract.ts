import { z } from "zod";
import { day, id, instant, personName, reasonBody, UUID, type FleetRoute } from "./fleet-common";

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

export const SLOT_ROUTES: readonly FleetRoute[] = [
  { method: "GET", path: "slots", response: slotsSchema, query: { from: day, to: day, riderId: id } },
  { method: "POST", path: "slots", body: slotInputSchema, response: slotSchema },
  { method: "POST", path: "slots/:id/cancel", body: reasonBody, response: slotSchema },
  // GET answers 204 when no banner is showing; DELETE always answers 204.
  { method: "GET", path: "banner", response: zoneBannerSchema.nullable() },
  { method: "PUT", path: "banner", body: zoneBannerSchema, response: zoneBannerSchema },
  { method: "DELETE", path: "banner", response: z.null() },
];
