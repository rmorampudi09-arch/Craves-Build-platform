import { z } from "zod";
import { id, instant, personName, reasonBody, reasonText, type FleetRoute } from "./fleet-common";

const provider = z.enum(["CRAVES_FLEET", "BORZO", "PIDGE", "OPS_QUEUE"]);
const orderCode = z.string().regex(/^#[0-9A-F]{8}$/);

export const tripSchema = z.object({
  tripId: id, orderCode, kitchenName: z.string().max(160), dropArea: z.string().max(160),
  state: z.enum(["SEARCHING", "ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROP", "DELIVERED", "FAILED", "CANCELLED"]),
  provider, riderId: id.nullable(), riderName: personName.nullable(), createdAt: instant, updatedAt: instant,
});
export const dispatchQueueItemSchema = z.object({
  tripId: id, orderCode, kitchenName: z.string().max(160), dropArea: z.string().max(160), queuedAt: instant,
  alertLevel: z.enum(["INFO", "WARNING", "CRITICAL"]), alertMessage: z.string().max(300),
  attempts: z.array(z.object({ provider, outcome: z.string().max(60), at: instant })).max(10),
});
export const riderPositionSchema = z.object({
  riderId: id, riderName: personName, lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
  recordedAt: instant, ageSeconds: z.number().int().nonnegative(), onShift: z.boolean(), onTrip: z.boolean(),
  tripId: id.nullable(), mock: z.boolean(),
});
export const tripsSchema = z.object({ trips: z.array(tripSchema).max(500) });
export const dispatchQueueSchema = z.object({ items: z.array(dispatchQueueItemSchema).max(500) });
export const positionsSchema = z.object({ positions: z.array(riderPositionSchema).max(1000) });

/** Exactly one new courier: a fleet rider, Borzo or Pidge. */
export const reassignSchema = z.object({ riderId: id.optional(), provider: z.enum(["BORZO", "PIDGE"]).optional(), reason: reasonText })
  .refine(value => (value.riderId === undefined) !== (value.provider === undefined), { message: "Choose one new courier: a rider, Borzo or Pidge." });

export type Trip = z.infer<typeof tripSchema>;
export type DispatchQueueItem = z.infer<typeof dispatchQueueItemSchema>;
export type RiderPosition = z.infer<typeof riderPositionSchema>;

export function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min ago`;
}

export const TRIP_ROUTES: readonly FleetRoute[] = [
  { method: "GET", path: "trips", response: tripsSchema },
  { method: "POST", path: "trips/:id/reassign", body: reassignSchema, response: tripSchema },
  { method: "POST", path: "trips/:id/cancel", body: reasonBody, response: tripSchema },
  { method: "GET", path: "dispatch-queue", response: dispatchQueueSchema },
  { method: "GET", path: "positions", response: positionsSchema },
];
