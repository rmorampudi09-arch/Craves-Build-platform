import { z } from "zod";
import { instant, type FleetRoute } from "./fleet-common";

/** One cell of a pilot-health table: text (times are ISO-8601, days YYYY-MM-DD), a number, a boolean or empty. */
const cell = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

/** GET /pilot-health: every named query of the server's pilot_health.sql, in file order (docs/riders/PILOT-HEALTH.md). */
export const pilotHealthSchema = z.object({
  generatedAt: instant,
  results: z.array(z.object({
    name: z.string().regex(/^[a-z0-9_]{1,60}$/),
    description: z.string().max(2000),
    columns: z.array(z.string().max(60)).max(40),
    rows: z.array(z.array(cell).max(40)).max(200),
    truncated: z.boolean(),
    error: z.string().max(500).nullable(),
  })).max(40),
});
export type PilotHealth = z.infer<typeof pilotHealthSchema>;

export const HEALTH_ROUTES: readonly FleetRoute[] = [{ method: "GET", path: "pilot-health", response: pilotHealthSchema }];
