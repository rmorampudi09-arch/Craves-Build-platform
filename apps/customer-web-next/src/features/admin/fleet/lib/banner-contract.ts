import { z } from "zod";
import { type FleetRoute } from "./fleet-common";

// The zone banner riders see on Home. Ops-assigned slots were removed from the console in 1.3.4.
export const zoneBannerSchema = z.object({
  tone: z.enum(["info", "warning"]),
  text: z.string().trim().min(1, "Write the banner text.").max(160, "Keep the banner to 160 characters."),
  until: z.string().datetime({ offset: true, message: "Pick until when the banner shows." }),
});

export type ZoneBanner = z.infer<typeof zoneBannerSchema>;

/** A datetime-local value read as IST, the zone the console shows times in, whatever the PC is set to; "" if it isn't one. */
export function istInstant(local: string): string {
  const value = new Date(`${local}:00+05:30`);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) && Number.isFinite(value.getTime()) ? value.toISOString() : "";
}

export function bannerFromForm(form: { tone: string; text: string; until: string }, now = Date.now()): ZoneBanner | string {
  const parsed = zoneBannerSchema.safeParse({ tone: form.tone, text: form.text, until: istInstant(form.until) });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the details.";
  return Date.parse(parsed.data.until) > now ? parsed.data : "Pick a time in the future.";
}

export const BANNER_ROUTES: readonly FleetRoute[] = [
  // GET answers 204 when no banner is showing; DELETE always answers 204.
  { method: "GET", path: "banner", response: zoneBannerSchema.nullable() },
  { method: "PUT", path: "banner", body: zoneBannerSchema, response: zoneBannerSchema },
  { method: "DELETE", path: "banner", response: z.null() },
];
