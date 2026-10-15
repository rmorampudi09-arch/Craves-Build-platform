const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Same words as the app: `Just now`, `2 min ago`, `3 hr ago`, `Yesterday`, then `13 Oct`. Empty for an unreadable time. */
export function formatRelativeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const daysApart = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (daysApart <= 0) return `${Math.floor(minutes / 60)} hr ago`;
  if (daysApart === 1) return "Yesterday";
  return `${then.getDate()} ${MONTHS[then.getMonth()]}`;
}
