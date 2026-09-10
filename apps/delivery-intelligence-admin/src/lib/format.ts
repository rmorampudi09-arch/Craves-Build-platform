export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function compactId(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function statusTone(status: string | null | undefined): "good" | "warn" | "bad" | "info" | "neutral" {
  const value = status?.toUpperCase() ?? "";
  if (["DELIVERED", "COMPLETED", "ACCEPTED", "ASSIGNED", "PROCESSED", "SELECTED"].includes(value)) return "good";
  if (["WAITING_FOR_PROVIDER", "RECONCILIATION_PENDING", "PROCESSING", "SCHEDULED", "RANKED"].includes(value)) return "warn";
  if (["FAILED", "DEAD_LETTER", "REJECTED", "DECLINED", "ATTENTION", "EXHAUSTED"].includes(value)) return "bad";
  if (["PICKED_UP", "IN_TRANSIT", "AT_DROPOFF", "TRACK", "WEBHOOK", "IN_PROGRESS"].includes(value)) return "info";
  return "neutral";
}
