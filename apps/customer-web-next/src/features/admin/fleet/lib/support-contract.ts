import { z } from "zod";
import { id, instant, personName, reasonText, type FleetRoute } from "./fleet-common";

// Riders' problem reports and SOS presses (admin-fleet-v1 /support-issues, /sos-events).
export const ISSUE_STATES = ["OPEN", "ACKNOWLEDGED", "FIXED"] as const;
export const ISSUE_CATEGORIES: Readonly<Record<string, string>> = {
  MISSING_PAY: "Missing pay", WRONG_DISTANCE: "Wrong distance", PAYOUT_NOT_RECEIVED: "Payout not received",
  WRONG_DEDUCTION: "Wrong deduction", APP_PROBLEM: "App problem", OTHER: "Something else",
};

export const supportIssueSchema = z.object({
  issueId: id, riderId: id, riderName: personName, tripId: id.nullable(), category: z.string().max(40), text: z.string().max(2000),
  state: z.enum(ISSUE_STATES), createdAt: instant, acknowledgeBy: instant, fixBy: instant,
  acknowledgedAt: instant.nullable().optional(), acknowledgedBy: personName.nullable().optional(), fixedAt: instant.nullable().optional(),
  fixedBy: personName.nullable().optional(), resolution: z.string().max(1000).nullable().optional(),
});
export const issuesSchema = z.object({ issues: z.array(supportIssueSchema).max(500) });
export const sosEventSchema = z.object({
  sosId: id, riderId: id, riderName: personName, phoneMasked: z.string().max(20), at: instant,
  lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable(), tripId: id.nullable(),
  alertedAt: instant.nullable().optional(),
});
export const sosEventsSchema = z.object({ events: z.array(sosEventSchema).max(500) });
export const fixSchema = z.object({ resolution: reasonText });

export type SupportIssue = z.infer<typeof supportIssueSchema>;
export type SosEvent = z.infer<typeof sosEventSchema>;

/** Late against its promise: an open issue past acknowledge-by, or any unfixed issue past fix-by. */
export function overdue(issue: SupportIssue, now = new Date()): "ACKNOWLEDGE" | "FIX" | null {
  if (issue.state === "FIXED") return null;
  if (new Date(issue.fixBy) < now) return "FIX";
  return issue.state === "OPEN" && new Date(issue.acknowledgeBy) < now ? "ACKNOWLEDGE" : null;
}

export const mapLink = (event: Pick<SosEvent, "lat" | "lng">) =>
  event.lat === null || event.lng === null ? null : `https://maps.google.com/?q=${event.lat.toFixed(6)},${event.lng.toFixed(6)}`;

export const SUPPORT_ROUTES: readonly FleetRoute[] = [
  { method: "GET", path: "support-issues", response: issuesSchema, query: { state: z.enum(ISSUE_STATES) } },
  { method: "POST", path: "support-issues/:id/acknowledge", response: supportIssueSchema },
  { method: "POST", path: "support-issues/:id/fix", body: fixSchema, response: supportIssueSchema },
  { method: "GET", path: "sos-events", response: sosEventsSchema },
];
