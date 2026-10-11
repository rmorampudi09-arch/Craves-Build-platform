/** Public filters contain no names, phone numbers, search terms, audit reasons or credentials. */
export const DATASETS = ["users", "chefs", "orders"] as const;
export type Dataset = typeof DATASETS[number];
export type Filters = { fromDate: string; toDate: string; status: string; facet: string; search: string; sort: "newest" | "oldest"; pageSize: 25 | 50 | 100 };
export const EMPTY_FILTERS: Filters = { fromDate: "", toDate: "", status: "", facet: "", search: "", sort: "newest", pageSize: 25 };
export type ExplorerRequest = Filters & { mode: "summary" | "records"; boundary?: string; cursor?: string; reason?: string };
export type ExplorerRow = {
  id: string; identityId: string | null; label: string; status: string; createdAt: string; updatedAt: string;
  phone: string | null; email: string | null; city: string | null; roles: string[]; orderSource: string | null;
  amount: string | null; currency: string | null; customerId: string | null; chefId: string | null; kitchenId: string | null; checkoutId: string | null;
};
export type ExplorerResult = {
  dataset: Dataset; correlationId: string; generatedAt: string; boundary: string; total: number; populationTotal: number;
  statuses: { key: string; count: number }[]; trend: { fromDate: string; toDate: string; count: number }[];
  bucketUnit: "day" | "month" | "year"; rows: ExplorerRow[]; nextCursor: string | null; pageSize: number; sort: "newest" | "oldest"; mode: "summary" | "records";
};
export const META: Record<Dataset, { title: string; noun: string; description: string; facet: string; hint: string }> = {
  users: { title: "Users", noun: "identities", description: "Every registered Craves identity, including users without a customer profile. Each identity is counted once, even with multiple roles.", facet: "Role code", hint: "Name, mobile, email or identity ID" },
  chefs: { title: "Chefs", noun: "applications", description: "All chef applications, including pending and rejected applications. Approved applications are not a measure of kitchens online right now.", facet: "City (exact match)", hint: "Name, mobile, email or application ID" },
  orders: { title: "Orders", noun: "chef-specific orders", description: "Every chef-specific order, including subscription orders. One multi-chef checkout can produce multiple orders. Order value is not captured revenue.", facet: "Order source", hint: "Kitchen, order, checkout, customer or chef ID" }
};
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const STATUS = /^[A-Z][A-Z0-9_]{0,39}$/;
const clean = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const time = (v: unknown): v is string => clean(v, 40) && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) && Number.isFinite(Date.parse(v));
const nullable = (v: unknown, max: number) => v === null || clean(v, max);
const id = (v: unknown) => typeof v === "string" && UUID.test(v);
export function isDataset(v: unknown): v is Dataset { return DATASETS.some(d => d === v); }
export function calendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^(19[7-9]\d|20\d\d|2100)-\d\d-\d\d$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function parseExplorerRequest(value: unknown, dataset: Dataset): ExplorerRequest | null {
  const r = object(value); if (!r) return null;
  const allowed = new Set(["fromDate","toDate","status","facet","search","sort","pageSize","mode","boundary","cursor","reason"]);
  if (Object.keys(r).some(k => !allowed.has(k))) return null;
  for (const k of ["fromDate","toDate"]) if (r[k] !== undefined && r[k] !== "" && !calendarDate(r[k])) return null;
  const fromDate = String(r.fromDate ?? ""), toDate = String(r.toDate ?? "");
  if (fromDate && toDate && fromDate > toDate) return null;
  const status = r.status ?? "", facet = r.facet ?? "", search = r.search ?? "";
  if (!clean(status,40) || (status !== "" && !STATUS.test(status)) || !clean(facet,120) || !clean(search,160)) return null;
  if (dataset === "users" && facet !== "" && !STATUS.test(facet)) return null;
  if (dataset === "orders" && !["","ON_DEMAND","SUBSCRIPTION"].includes(facet)) return null;
  const sort = r.sort ?? "newest", pageSize = r.pageSize ?? 25;
  if ((sort !== "newest" && sort !== "oldest") || (pageSize !== 25 && pageSize !== 50 && pageSize !== 100)) return null;
  if (r.mode !== "summary" && r.mode !== "records") return null;
  if (r.boundary !== undefined && !time(r.boundary)) return null;
  if (r.cursor !== undefined && (!clean(r.cursor,600) || !/^[A-Za-z0-9_-]+$/.test(r.cursor) || !r.boundary || r.mode !== "records")) return null;
  if (r.mode === "records" && (!clean(r.reason,500) || r.reason.trim().length < 10)) return null;
  return { fromDate, toDate, status, facet: facet.trim(), search: search.trim(), sort, pageSize, mode: r.mode,
    ...(r.boundary === undefined ? {} : { boundary: r.boundary as string }),
    ...(r.cursor === undefined ? {} : { cursor: r.cursor as string }),
    ...(r.mode === "records" ? { reason: (r.reason as string).trim() } : {}) };
}
export function parseExplorerResult(value: unknown, dataset: Dataset): ExplorerResult | null {
  const r = object(value); if (!r || r.dataset !== dataset || !id(r.correlationId) || !time(r.generatedAt) || !time(r.boundary) || !count(r.total) || !count(r.populationTotal) || r.total > r.populationTotal) return null;
  if (!Array.isArray(r.statuses) || r.statuses.length > 64 || !Array.isArray(r.trend) || r.trend.length > 160 || !Array.isArray(r.rows) || r.rows.length > 100) return null;
  if (!["day","month","year"].includes(String(r.bucketUnit)) || ![25,50,100].includes(Number(r.pageSize)) || !["newest","oldest"].includes(String(r.sort)) || !["summary","records"].includes(String(r.mode))) return null;
  if (!(r.nextCursor === null || (clean(r.nextCursor,600) && /^[A-Za-z0-9_-]+$/.test(r.nextCursor)))) return null;
  const statuses: ExplorerResult["statuses"] = [];
  for (const v of r.statuses) { const a = object(v); if (!a || !clean(a.key,40) || !STATUS.test(a.key) || !count(a.count)) return null; statuses.push({key:a.key,count:a.count}); }
  if (new Set(statuses.map(s => s.key)).size !== statuses.length || statuses.reduce((s,a) => s+a.count,0) !== r.populationTotal) return null;
  const trend: ExplorerResult["trend"] = [];
  for (const v of r.trend) {
    const a = object(v); if (!a || !calendarDate(a.fromDate) || !calendarDate(a.toDate) || a.fromDate > a.toDate || !count(a.count)) return null;
    if (trend.length && trend[trend.length-1].toDate >= a.fromDate) return null;
    trend.push({fromDate:a.fromDate,toDate:a.toDate,count:a.count});
  }
  if (trend.reduce((s,a) => s+a.count,0) !== r.total) return null;
  const rows: ExplorerRow[] = [];
  for (const v of r.rows) {
    const a = object(v); if (!a || !id(a.id) || !clean(a.label,240) || !clean(a.status,40) || !STATUS.test(a.status) || !time(a.createdAt) || !time(a.updatedAt)) return null;
    for (const k of ["identityId","customerId","chefId","kitchenId","checkoutId"]) if (a[k] !== null && !id(a[k])) return null;
    if (!nullable(a.phone,40) || !nullable(a.email,320) || !nullable(a.city,120) || !Array.isArray(a.roles) || a.roles.length > 32 || !a.roles.every(v => clean(v,40) && STATUS.test(v))) return null;
    // Fail closed if an upstream accidentally returns unmasked contacts.
    if (a.phone !== null && !/^•••• .{0,4}$/.test(String(a.phone))) return null;
    if (a.email !== null && !/^.{0,1}•••(?:@•••)?$/u.test(String(a.email))) return null;
    if (a.orderSource !== null && !["ON_DEMAND","SUBSCRIPTION"].includes(String(a.orderSource))) return null;
    if (!(a.amount === null || (typeof a.amount === "string" && /^\d{1,12}\.\d{2}$/.test(a.amount)))) return null;
    if (!(a.currency === null || a.currency === "INR")) return null;
    rows.push({id:a.id as string,identityId:a.identityId as string|null,label:a.label,status:a.status,createdAt:a.createdAt,updatedAt:a.updatedAt,
      phone:a.phone as string|null,email:a.email as string|null,city:a.city as string|null,roles:[...a.roles] as string[],orderSource:a.orderSource as string|null,
      amount:a.amount as string|null,currency:a.currency as string|null,customerId:a.customerId as string|null,chefId:a.chefId as string|null,kitchenId:a.kitchenId as string|null,checkoutId:a.checkoutId as string|null});
  }
  if (new Set(rows.map(a => a.id)).size !== rows.length || rows.length > Number(r.pageSize) || rows.length > r.total || (r.mode === "summary" && (rows.length || r.nextCursor))) return null;
  return {dataset,correlationId:r.correlationId as string,generatedAt:r.generatedAt,boundary:r.boundary,total:r.total,populationTotal:r.populationTotal,statuses,trend,
    bucketUnit:r.bucketUnit as ExplorerResult["bucketUnit"],rows,nextCursor:r.nextCursor as string|null,pageSize:r.pageSize as number,sort:r.sort as "newest"|"oldest",mode:r.mode as "summary"|"records"};
}
export function publicFilters(params: Record<string,string|string[]|undefined>): Filters {
  const f = {...EMPTY_FILTERS};
  if (calendarDate(params.from)) f.fromDate=params.from;
  if (calendarDate(params.to)) f.toDate=params.to;
  if (typeof params.status === "string" && STATUS.test(params.status)) f.status=params.status;
  // Free-text city filters are not shared in URLs; role/source filter values are allowlisted text only.
  if (typeof params.facet === "string" && STATUS.test(params.facet)) f.facet=params.facet;
  if (f.fromDate && f.toDate && f.fromDate > f.toDate) { f.fromDate="";f.toDate=""; }
  return f;
}
export function explorerHref(dataset: Dataset, f: Partial<Filters> = {}): string {
  const p=new URLSearchParams(); if (f.fromDate && calendarDate(f.fromDate)) p.set("from",f.fromDate);
  if (f.toDate && calendarDate(f.toDate)) p.set("to",f.toDate);
  if (f.status && STATUS.test(f.status)) p.set("status",f.status);
  if (dataset !== "chefs" && f.facet && STATUS.test(f.facet)) p.set("facet",f.facet);
  return `/admin/explorer/${dataset}${p.size ? `?${p}` : ""}`;
}
export function presetDates(days: number, now = new Date()): Pick<Filters,"fromDate"|"toDate"> {
  const today = new Date(now.getTime()+330*60_000).toISOString().slice(0,10);
  if (days===0) return {fromDate:"",toDate:""};
  const start=new Date(`${today}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-days+1);
  return {fromDate:start.toISOString().slice(0,10),toDate:today};
}
export function aggregateCsv(r: ExplorerResult): string {
  const cell=(s:string) => `"${(/^[=+\-@\t\r]/.test(s)?"'":"")+s.replaceAll('"','""')}"`;
  const rows=[['dataset','section','key','count','snapshot_utc'],[r.dataset,'filtered','total',String(r.total),r.generatedAt],
    ...r.statuses.map(s=>[r.dataset,'status_before_status_filter',s.key,String(s.count),r.generatedAt]),
    ...r.trend.map(s=>[r.dataset,'created_period',`${s.fromDate} / ${s.toDate}`,String(s.count),r.generatedAt])];
  return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
