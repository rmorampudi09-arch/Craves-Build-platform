// Mirrors subscription-service ChefPlanModels and PlanScheduleModels. Browser-safe.
export type ChefMealPlanPeriod = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
export type ChefMealPlanStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "REJECTED" | "INACTIVE";

export type ChefMealPlan = {
  id: string;
  planCode: string;
  name: string;
  description: string | null;
  billingPeriod: ChefMealPlanPeriod;
  amount: number;
  currency: string;
  status: ChefMealPlanStatus;
  reviewReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Our own image route or an https URL; null without a photo. */
  imageUrl: string | null;
  /** null from an older backend that has no such switch. */
  acceptingSubscribers: boolean | null;
  /** null from an older backend that doesn't count subscribers. */
  activeSubscriberCount: number | null;
};

export type ChefMealPlanInput = {
  name: string;
  description: string | null;
  billingPeriod: ChefMealPlanPeriod;
  amount: number;
  currency: "INR";
};

export type ChefMealScheduleItem = {
  id: string;
  menuItemId: string;
  /** Schedules saved before the backend kept dish names have none. */
  menuItemName: string | null;
  quantity: number;
  isoDayOfWeek: number | null;
  dayOfMonth: number | null;
  mealSlotCode: string;
  serviceTime: string;
  sequenceNumber: number;
};

export type ChefMealSchedule = {
  planId: string;
  /** New schedules are WEEKLY; MONTHLY ones (by date) only remain on older live plans. */
  recurrenceType: "WEEKLY" | "MONTHLY";
  timezone: string;
  generationLeadHours: number;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  version: number;
  items: ChefMealScheduleItem[];
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
};

export type ChefMealScheduleInput = {
  recurrenceType: "WEEKLY";
  timezone: "Asia/Kolkata";
  generationLeadHours: number;
  items: Array<
    Omit<ChefMealScheduleItem, "id" | "menuItemName" | "dayOfMonth"> & {
      isoDayOfWeek: number;
      dayOfMonth: null;
    }
  >;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERIODS = new Set(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]);
const PLAN_STATUSES = new Set(["DRAFT", "PENDING_APPROVAL", "ACTIVE", "REJECTED", "INACTIVE"]);
const SCHEDULE_STATUSES = new Set(["DRAFT", "ACTIVE", "INACTIVE"]);
const SLOT = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/;
const INPUT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// The backend sends its public photo path; the browser loads it through our own route instead.
const UPSTREAM_IMAGE = /^\/api\/v1\/subscriptions\/plans\/([0-9a-f-]{36})\/image\?v=(\d{1,15})$/i;
const OWN_IMAGE = /^\/api\/chef\/subscription-plans\/([0-9a-f-]{36})\/image\?v=\d{1,15}$/i;
const MAX_AMOUNT = 1_000_000;

const record = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}
function optionalText(value: unknown, max: number): string | null {
  return value == null || value === "" ? null : text(value, max);
}
function instant(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}
const int = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;

/** Our image route for the backend's photo path, an https URL as is, anything else dropped. */
export function planImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const upstream = UPSTREAM_IMAGE.exec(value);
  if (upstream)
    return UUID.test(upstream[1])
      ? `/api/chef/subscription-plans/${upstream[1].toLowerCase()}/image?v=${upstream[2]}`
      : null;
  const own = OWN_IMAGE.exec(value);
  if (own) return UUID.test(own[1]) ? value : null;
  return /^https:\/\/[^\s"'<>]+$/.test(value) && value.length <= 2000 ? value : null;
}

export function parseChefMealPlan(value: unknown): ChefMealPlan | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id, 64),
    planCode = text(raw.planCode, 80),
    name = text(raw.name, 160);
  const billingPeriod = text(raw.billingPeriod, 20),
    currency = text(raw.currency, 3)?.toUpperCase() ?? null;
  const status = text(raw.status, 40),
    amount = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
  const createdAt = instant(raw.createdAt),
    updatedAt = instant(raw.updatedAt);
  const submittedAt = raw.submittedAt == null ? null : instant(raw.submittedAt);
  const reviewedAt = raw.reviewedAt == null ? null : instant(raw.reviewedAt);
  const activeSubscriberCount =
    raw.activeSubscriberCount == null ? null : int(raw.activeSubscriberCount, 0, 10_000_000);
  if (
    !id ||
    !UUID.test(id) ||
    !planCode ||
    !name ||
    !billingPeriod ||
    !PERIODS.has(billingPeriod) ||
    !currency ||
    !/^[A-Z]{3}$/.test(currency) ||
    !status ||
    !PLAN_STATUSES.has(status) ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !createdAt ||
    !updatedAt ||
    (raw.submittedAt != null && !submittedAt) ||
    (raw.reviewedAt != null && !reviewedAt)
  )
    return null;
  if (
    (raw.acceptingSubscribers != null && typeof raw.acceptingSubscribers !== "boolean") ||
    (raw.activeSubscriberCount != null && activeSubscriberCount === null)
  )
    return null;
  return {
    id,
    planCode,
    name,
    description: optionalText(raw.description, 2000),
    billingPeriod: billingPeriod as ChefMealPlanPeriod,
    amount,
    currency,
    status: status as ChefMealPlanStatus,
    reviewReason: optionalText(raw.reviewReason, 1000),
    submittedAt,
    reviewedAt,
    createdAt,
    updatedAt,
    imageUrl: planImageUrl(raw.imageUrl),
    acceptingSubscribers:
      typeof raw.acceptingSubscribers === "boolean" ? raw.acceptingSubscribers : null,
    activeSubscriberCount,
  };
}

export function parseChefMealPlans(value: unknown): ChefMealPlan[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const plans = value.map(parseChefMealPlan);
  return plans.some((plan) => plan === null) ? null : (plans as ChefMealPlan[]);
}

export function parseChefMealPlanInput(value: unknown): ChefMealPlanInput | null {
  const raw = record(value);
  if (!raw) return null;
  const name = text(raw.name, 160),
    billingPeriod = text(raw.billingPeriod, 20),
    description = optionalText(raw.description, 2000);
  const amount = raw.amount;
  if (
    !name ||
    !billingPeriod ||
    !PERIODS.has(billingPeriod) ||
    raw.currency !== "INR" ||
    (raw.description != null && raw.description !== "" && !description)
  )
    return null;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > MAX_AMOUNT ||
    Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6
  )
    return null;
  return {
    name,
    description,
    billingPeriod: billingPeriod as ChefMealPlanPeriod,
    amount,
    currency: "INR",
  };
}

function scheduleItem(value: unknown, recurrence: string): ChefMealScheduleItem | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id, 64),
    menuItemId = text(raw.menuItemId, 64),
    mealSlotCode = text(raw.mealSlotCode, 40)?.toUpperCase() ?? null,
    serviceTime = text(raw.serviceTime, 32);
  const quantity = int(raw.quantity, 1, 100),
    sequenceNumber = int(raw.sequenceNumber, 1, 100);
  const isoDayOfWeek = raw.isoDayOfWeek == null ? null : int(raw.isoDayOfWeek, 1, 7);
  const dayOfMonth = raw.dayOfMonth == null ? null : int(raw.dayOfMonth, 1, 28);
  if (
    !id ||
    !UUID.test(id) ||
    !menuItemId ||
    !UUID.test(menuItemId) ||
    !mealSlotCode ||
    !SLOT.test(mealSlotCode) ||
    !serviceTime ||
    !TIME.test(serviceTime) ||
    quantity === null ||
    sequenceNumber === null
  )
    return null;
  if (
    recurrence === "WEEKLY"
      ? isoDayOfWeek === null || raw.dayOfMonth != null
      : dayOfMonth === null || raw.isoDayOfWeek != null
  )
    return null;
  return {
    id,
    menuItemId,
    menuItemName: optionalText(raw.menuItemName, 200),
    quantity,
    isoDayOfWeek,
    dayOfMonth,
    mealSlotCode,
    serviceTime,
    sequenceNumber,
  };
}

export function parseChefMealSchedule(value: unknown): ChefMealSchedule | null {
  const raw = record(value);
  if (!raw) return null;
  const planId = text(raw.planId, 64),
    recurrenceType = text(raw.recurrenceType, 20),
    timezone = text(raw.timezone, 80),
    status = text(raw.status, 20);
  const generationLeadHours = int(raw.generationLeadHours, 1, 168),
    version = int(raw.version, 1, Number.MAX_SAFE_INTEGER);
  const createdAt = instant(raw.createdAt),
    updatedAt = instant(raw.updatedAt),
    activatedAt = raw.activatedAt == null ? null : instant(raw.activatedAt);
  if (
    !planId ||
    !UUID.test(planId) ||
    (recurrenceType !== "WEEKLY" && recurrenceType !== "MONTHLY") ||
    !timezone ||
    !status ||
    !SCHEDULE_STATUSES.has(status) ||
    generationLeadHours === null ||
    version === null ||
    !createdAt ||
    !updatedAt ||
    (raw.activatedAt != null && !activatedAt) ||
    !Array.isArray(raw.items) ||
    raw.items.length > 100
  )
    return null;
  const items = raw.items.map((item) => scheduleItem(item, recurrenceType));
  if (items.some((item) => item === null)) return null;
  return {
    planId,
    recurrenceType,
    timezone,
    generationLeadHours,
    status: status as ChefMealSchedule["status"],
    version,
    items: items as ChefMealScheduleItem[],
    createdAt,
    updatedAt,
    activatedAt,
  };
}

/** The editor's one week of meals; the backend no longer takes schedules by date. */
export function parseChefMealScheduleInput(value: unknown): ChefMealScheduleInput | null {
  const raw = record(value);
  if (
    !raw ||
    raw.recurrenceType !== "WEEKLY" ||
    raw.timezone !== "Asia/Kolkata" ||
    !Array.isArray(raw.items) ||
    raw.items.length < 1 ||
    raw.items.length > 100
  )
    return null;
  const generationLeadHours = int(raw.generationLeadHours, 1, 168);
  if (generationLeadHours === null) return null;
  const items: ChefMealScheduleInput["items"] = [];
  for (const value of raw.items) {
    const item = record(value);
    const menuItemId =
      typeof item?.menuItemId === "string" && UUID.test(item.menuItemId) ? item.menuItemId : null;
    const mealSlotCode =
      typeof item?.mealSlotCode === "string" && SLOT.test(item.mealSlotCode)
        ? item.mealSlotCode
        : null;
    const serviceTime =
      typeof item?.serviceTime === "string" && INPUT_TIME.test(item.serviceTime)
        ? item.serviceTime
        : null;
    const quantity = int(item?.quantity, 1, 100),
      isoDayOfWeek = int(item?.isoDayOfWeek, 1, 7),
      sequenceNumber = int(item?.sequenceNumber, 1, 100);
    if (
      !menuItemId ||
      !mealSlotCode ||
      !serviceTime ||
      quantity === null ||
      isoDayOfWeek === null ||
      sequenceNumber === null ||
      item?.dayOfMonth != null
    )
      return null;
    items.push({
      menuItemId,
      quantity,
      isoDayOfWeek,
      dayOfMonth: null,
      mealSlotCode,
      serviceTime,
      sequenceNumber,
    });
  }
  return { recurrenceType: "WEEKLY", timezone: "Asia/Kolkata", generationLeadHours, items };
}

/** The optional note sent with "Submit for approval"; undefined when the body is not acceptable. */
export function parseSubmitNote(value: unknown): string | null | undefined {
  const raw = value == null ? {} : record(value);
  if (!raw || Object.keys(raw).some((key) => key !== "note")) return undefined;
  if (raw.note == null) return null;
  if (typeof raw.note !== "string") return undefined;
  const note = raw.note.trim();
  return note.length > 1000 ? undefined : note || null;
}
