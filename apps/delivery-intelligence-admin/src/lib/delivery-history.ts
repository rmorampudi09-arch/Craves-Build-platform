import type { DeliveryOverview, HourlyActivity } from "./delivery-contract.ts";

export type HistoryFilters = {
  range: "all" | "24" | "168" | "720" | "custom";
  sort: "desc" | "asc";
  limit: number;
  from: string;
  to: string;
};

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  range: "all", sort: "desc", limit: 25, from: "", to: "",
};

export type HistoryRequest = {
  filters: HistoryFilters;
  activityOffset: number;
  attentionOffset: number;
  snapshot?: { from: string; to: string };
};

export function historyQuery(request: HistoryRequest): string {
  const { filters, activityOffset, attentionOffset, snapshot } = request;
  if (!["all", "24", "168", "720", "custom"].includes(filters.range)
    || !["asc", "desc"].includes(filters.sort)
    || !Number.isInteger(filters.limit) || filters.limit < 5 || filters.limit > 100
    || ![activityOffset, attentionOffset].every(value => Number.isInteger(value) && value >= 0 && value <= 2_147_483_647)) {
    throw new Error("INVALID_DELIVERY_HISTORY_FILTER");
  }
  const query = new URLSearchParams({
    hours: snapshot || filters.range === "all" || filters.range === "custom" ? "0" : filters.range,
    limit: String(filters.limit), sort: filters.sort,
    offset: String(activityOffset), attentionOffset: String(attentionOffset),
  });
  // Custom calendar days are explicitly IST, independent of the administrator's device timezone.
  if (filters.range === "custom" && !snapshot) {
    if (!validDay(filters.from) || !validDay(filters.to) || filters.from > filters.to) {
      throw new Error("INVALID_DELIVERY_HISTORY_DATES");
    }
    query.set("from", new Date(`${filters.from}T00:00:00+05:30`).toISOString());
    query.set("to", new Date(Date.parse(`${filters.to}T00:00:00+05:30`) + 86_400_000).toISOString());
  }
  if (snapshot) {
    if (!Number.isFinite(Date.parse(snapshot.from)) || !Number.isFinite(Date.parse(snapshot.to))
      || Date.parse(snapshot.from) >= Date.parse(snapshot.to)) throw new Error("INVALID_DELIVERY_HISTORY_DATES");
    query.set("from", snapshot.from);
    query.set("to", snapshot.to);
  }
  return query.toString();
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function historyPage(
  request: HistoryRequest,
  data: DeliveryOverview,
  list: "activity" | "attention",
  direction: -1 | 1,
): HistoryRequest {
  const key = list === "activity" ? "activityOffset" : "attentionOffset";
  const more = list === "activity" ? data.activityHasMore : data.attentionHasMore;
  if (direction > 0 && !more) return request;
  return {
    ...request,
    [key]: Math.max(0, data[key] + direction * data.pageSize),
    // Keep the original time boundary while browsing, so new events cannot shift older pages.
    snapshot: request.snapshot ?? { from: data.windowStart, to: data.windowEnd },
  };
}

export type ActivityBucket = HourlyActivity & { bucketEnd: string };

export function activityBuckets(points: HourlyActivity[]): ActivityBucket[] {
  const sorted = [...points].sort((a, b) => Date.parse(a.bucketStart) - Date.parse(b.bucketStart));
  const groupSize = Math.max(1, Math.ceil(sorted.length / 48));
  const buckets: ActivityBucket[] = [];
  for (let start = 0; start < sorted.length; start += groupSize) {
    const group = sorted.slice(start, start + groupSize);
    buckets.push({
      bucketStart: group[0].bucketStart,
      bucketEnd: group[group.length - 1].bucketStart,
      commandCount: group.reduce((sum, point) => sum + point.commandCount, 0),
      deliveryEventCount: group.reduce((sum, point) => sum + point.deliveryEventCount, 0),
      deliveredCount: group.reduce((sum, point) => sum + point.deliveredCount, 0),
    });
  }
  return buckets;
}
