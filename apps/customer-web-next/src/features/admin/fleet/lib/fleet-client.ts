import type { z } from "zod";
import { adminFetch } from "@/features/admin/shell/lib/admin-renewal";
import { fleetError } from "./fleet-common";

const UNEXPECTED = "The fleet service sent an unexpected answer. Refresh and check before trying again.";

async function read<T>(response: Response, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(fleetError(response.status, body).message);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(UNEXPECTED);
  return parsed.data;
}

export async function fleetGet<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  return read(await adminFetch(`/api/admin/fleet/${path}`, { cache: "no-store" }), schema);
}

export async function fleetSend<T>(method: "POST" | "PUT" | "DELETE", path: string, key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Idempotency-Key": key };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return read(await adminFetch(`/api/admin/fleet/${path}`, {
    method, cache: "no-store", headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), schema);
}
