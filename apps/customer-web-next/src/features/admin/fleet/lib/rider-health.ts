import { readableFleetValue } from "./fleet-common";
import { formatPaise } from "./payout-contract";
import type { RiderOffer, RiderShift } from "./rider-contract";

/** An open shift's phone silent this long has probably stopped; the server then sends it "You're offline" (PILOT-HEALTH.md). */
export const SILENT_AFTER_S = 180;

const span = (seconds: number) =>
  seconds < 120 ? `${Math.round(seconds)} s` : seconds < 7200 ? `${Math.round(seconds / 60)} min` : `${(seconds / 3600).toFixed(1)} h`;

/** On an open shift, how long ago the phone last called; "—" for an ended shift or an older app. */
export function lastHeard(shift: RiderShift, now = Date.now()): string {
  if (!shift.lastSeenAt || shift.endedAt) return "—";
  const seconds = Math.max(0, (now - Date.parse(shift.lastSeenAt)) / 1000);
  return seconds > SILENT_AFTER_S ? `${span(seconds)} ago: the phone may have stopped` : `${span(seconds)} ago`;
}

/** The longest gap between two calls, and how many gaps passed 60 s (target: none on a 4-hour shift). */
export function silence(shift: RiderShift): string {
  if (shift.maxSilenceSeconds === undefined) return "—";
  return `${span(shift.maxSilenceSeconds)}${shift.silencesOver60s ? ` · ${shift.silencesOver60s} over 60 s` : ""}`;
}

/** The phone's latest report in words: only what is worth a look. */
export function phoneReport(phone: RiderShift["phone"]): string {
  if (!phone) return "No report";
  const pending = phone.queuePending ?? 0;
  const parts = [
    phone.batteryPct === null ? null : `Battery ${Math.round(phone.batteryPct)}%${phone.charging ? ", charging" : ""}`,
    phone.powerSave ? "battery saver on" : null,
    phone.canRing === false ? "offers can't ring" : null,
    phone.batteryPerHourPct === null ? null : `${phone.batteryPerHourPct}% an hour unplugged`,
    phone.lastExitReason ? `app last ended: ${readableFleetValue(phone.lastExitReason)}` : null,
    pending > 0
      ? `${pending} step${pending === 1 ? "" : "s"} waiting to sync${phone.queueOldestAgeS ? ` (oldest ${span(phone.queueOldestAgeS)})` : ""}`
      : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(" · ") : "No report";
}

/** How soon after the offer the phone had it, and by which channel. */
export function rang(offer: RiderOffer): string {
  if (!offer.rangAt) return "Didn't ring";
  const seconds = Math.max(0, (Date.parse(offer.rangAt) - Date.parse(offer.offeredAt)) / 1000);
  return `${seconds.toFixed(1)} s, by ${offer.rangChannel === "locations" ? "the location call" : "push"}`;
}

/**
 * Why the offer went to this rider (Phase 4), as the rider was told: "Nearest: 1 of 4 free riders" (or "Soonest by travel
 * time", Phase 5) or "Fair turn: 1 of 2 within 1.5 km, ₹90.00 an hour today, free 12 min". "—" on older offers and trips
 * given by hand.
 */
export function offerWhy(offer: RiderOffer): string {
  const reason = offer.reason;
  if (!reason) return "—";
  const extra = `${reason.round > 1 ? `, round ${reason.round}` : ""}${reason.atOnce > 1 ? `, ${reason.atOnce} at once` : ""}`;
  if (reason.rule === "FAIR") {
    const band = reason.bandMinutes !== undefined ? `${reason.bandMinutes} min by travel time` : `${(reason.bandM ?? 0) / 1000} km`;
    return `Fair turn: ${reason.place} of ${reason.bandRiders ?? reason.riders} within ${band}, `
      + `${formatPaise(reason.earnedPerHourPaise ?? 0)} an hour today, free ${reason.freeMinutes ?? 0} min${extra}`;
  }
  return `${reason.rule === "SOONEST" ? "Soonest by travel time" : "Nearest"}: ${reason.place} of ${reason.riders} free riders${extra}`;
}

/** An open shift's state: on shift, or on a break until a time (Phase 4). */
export function onShift(shift: RiderShift, when: (value: string) => string): string {
  return shift.onBreakUntil ? `On a break until ${when(shift.onBreakUntil)}` : "On shift";
}

/** What notification-service said to the offer's push. */
export function pushed(offer: RiderOffer): string {
  return offer.pushResult ? readableFleetValue(offer.pushResult) : "Not pushed";
}
