import type { PublicSubscriptionSchedule } from "@/features/meal-plans/lib/subscription-schedule-contract";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const clockOf = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

export function formatSlot(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/^\w/, letter => letter.toUpperCase());
}

/** "13:00:00" in the plan's own time → "1:00 pm". */
function serviceClock(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  return clockOf.format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

/**
 * A plan's meals by day, meal and time, each dish with how many: the plan page's schedule, and "What you'll
 * receive" before subscribing, as the app shows it.
 */
export function PlanScheduleList({ schedule }: { schedule: PublicSubscriptionSchedule }) {
  const groups = new Map<string, PublicSubscriptionSchedule["items"]>();
  for (const entry of schedule.items) {
    const day = schedule.recurrenceType === "WEEKLY" ? `weekday-${entry.isoDayOfWeek}` : `monthday-${entry.dayOfMonth}`;
    const key = `${day}:${entry.mealSlotCode}:${entry.serviceTime}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return <>
    <p className="mt-1 text-sm text-[#6B6B6B]">{schedule.recurrenceType === "WEEKLY" ? "Every week" : "Every month"}</p>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{[...groups.entries()].map(([key, entries]) => {
      const first = entries[0];
      const day = schedule.recurrenceType === "WEEKLY" ? WEEKDAYS[(first.isoDayOfWeek ?? 1) - 1] : `Day ${first.dayOfMonth} of the month`;
      return <article key={key} className="rounded-xl bg-[#F1F3F5] p-4">
        <p className="text-sm font-semibold text-[#1A1A1A]">{day} · {formatSlot(first.mealSlotCode)} · {serviceClock(first.serviceTime)}</p>
        <ul className="mt-2 space-y-1">{[...entries].sort((a, b) => a.sequenceNumber - b.sequenceNumber).map(entry => <li key={`${entry.menuItemId}:${entry.sequenceNumber}`} className="text-sm text-[#1A1A1A]">{entry.itemName ?? "Meal item"} × {entry.quantity}</li>)}</ul>
      </article>;
    })}</div>
  </>;
}
