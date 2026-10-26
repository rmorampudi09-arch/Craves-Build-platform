"use client";

import { parseLaunchAlertStatus, type LaunchAlertInput, type LaunchAlertSpot } from "@/features/home/lib/launch-alert-contract";
import { isFeatureUnavailable } from "@/shared/lib/feature-availability";
import { sessionFetch } from "@/shared/lib/session-fetch";

/** "unavailable" means the gateway has no launch-alerts route yet: the page hides Notify me. */
export type LaunchAlertState = "subscribed" | "not-subscribed" | "unavailable";

export class LaunchAlertError extends Error {
  constructor(readonly code: string) {
    super(
      code === "LAUNCH_ALERTS_LIMIT_REACHED"
        ? "You can ask to be notified for up to 50 places."
        : "We couldn't save that. Please try again.",
    );
  }
}

async function call(path: string, init?: RequestInit): Promise<LaunchAlertState> {
  const response = await sessionFetch(path, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (isFeatureUnavailable(response.status, body)) return "unavailable";
  const status = response.ok ? parseLaunchAlertStatus(body) : null;
  if (!status) {
    const code = (body as { code?: unknown } | null)?.code;
    throw new LaunchAlertError(typeof code === "string" ? code : "LAUNCH_ALERT_FAILED");
  }
  return status.subscribed ? "subscribed" : "not-subscribed";
}

export function readLaunchAlert({ latitude, longitude }: LaunchAlertSpot): Promise<LaunchAlertState> {
  return call(`/api/customer/launch-alerts?${new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) })}`);
}

export function saveLaunchAlert(input: LaunchAlertInput): Promise<LaunchAlertState> {
  return call("/api/customer/launch-alerts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
