export type PublicSubscriptionSchedule = {
  planId: string;
  recurrenceType: "WEEKLY" | "MONTHLY";
  timezone: string;
  serviceTime: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    isoDayOfWeek: number | null;
    dayOfMonth: number | null;
    sequenceNumber: number;
  }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/;

export function parsePublicSubscriptionSchedule(value: unknown): PublicSubscriptionSchedule | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.planId !== "string" || !UUID.test(raw.planId)) return null;
  if (raw.recurrenceType !== "WEEKLY" && raw.recurrenceType !== "MONTHLY") return null;
  if (typeof raw.timezone !== "string" || !raw.timezone.trim() || raw.timezone.length > 80) return null;
  if (typeof raw.serviceTime !== "string" || !TIME.test(raw.serviceTime)) return null;
  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 100) return null;
  const items = raw.items.map((item) => {
    if (!item || typeof item !== "object") return null;
    const entry = item as Record<string, unknown>;
    if (typeof entry.menuItemId !== "string" || !UUID.test(entry.menuItemId)) return null;
    if (!Number.isInteger(entry.quantity) || Number(entry.quantity) < 1 || Number(entry.quantity) > 100) return null;
    if (!Number.isInteger(entry.sequenceNumber) || Number(entry.sequenceNumber) < 1 || Number(entry.sequenceNumber) > 100) return null;
    const isoDayOfWeek = entry.isoDayOfWeek == null ? null : Number(entry.isoDayOfWeek);
    const dayOfMonth = entry.dayOfMonth == null ? null : Number(entry.dayOfMonth);
    if (raw.recurrenceType === "WEEKLY") {
      if (!Number.isInteger(isoDayOfWeek) || isoDayOfWeek! < 1 || isoDayOfWeek! > 7 || dayOfMonth !== null) return null;
    } else if (!Number.isInteger(dayOfMonth) || dayOfMonth! < 1 || dayOfMonth! > 28 || isoDayOfWeek !== null) {
      return null;
    }
    return {
      menuItemId: entry.menuItemId,
      quantity: Number(entry.quantity),
      isoDayOfWeek,
      dayOfMonth,
      sequenceNumber: Number(entry.sequenceNumber),
    };
  });
  if (items.some(item => item === null)) return null;
  return {
    planId: raw.planId,
    recurrenceType: raw.recurrenceType,
    timezone: raw.timezone.trim(),
    serviceTime: raw.serviceTime,
    items: items as PublicSubscriptionSchedule["items"],
  };
}
