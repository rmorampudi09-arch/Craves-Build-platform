export type HistoryFilters = {
  range: "all" | "24" | "168" | "720" | "custom";
  from: string;
  through: string;
  sort: "desc" | "asc";
  limit: number;
};

export const DEFAULT_FILTERS: HistoryFilters = { range: "all", from: "", through: "", sort: "desc", limit: 25 };

function midnightIst(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose both dates.");
  const date = new Date(`${value}T00:00:00+05:30`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 19_800_000).toISOString().slice(0, 10) !== value) {
    throw new Error("Choose valid dates.");
  }
  return date;
}

export function historyQuery(filters: HistoryFilters): URLSearchParams {
  const query = new URLSearchParams({ hours: filters.range === "all" || filters.range === "custom" ? "0" : filters.range,
    limit: String(filters.limit), sort: filters.sort, offset: "0", attentionOffset: "0" });
  if (filters.range === "custom") {
    const from = midnightIst(filters.from);
    const through = midnightIst(filters.through);
    if (from > through) throw new Error("The start date must not be after the end date.");
    if (from.getTime() > Date.now()) throw new Error("The start date must not be in the future.");
    query.set("from", from.toISOString());
    query.set("to", new Date(through.getTime() + 86_400_000).toISOString());
  }
  return query;
}

export function rangeLabel(filters: HistoryFilters): string {
  if (filters.range === "all") return "All time";
  if (filters.range === "custom") return `${filters.from} – ${filters.through} IST`;
  return filters.range === "24" ? "Last 24 hours" : filters.range === "168" ? "Last 7 days" : "Last 30 days";
}
