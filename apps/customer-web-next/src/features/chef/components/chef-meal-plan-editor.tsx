"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  Coffee,
  Cookie,
  Copy,
  Lock,
  Minus,
  Moon,
  Plus,
  Sun,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import {
  isComingSoon,
  loadMealSchedule,
  saveMealPlan,
  saveMealSchedule,
  submitMealPlan,
  uploadMealPlanPhoto,
} from "@/features/chef/api/chef-meal-plans";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import {
  ChefChoiceChips,
  ChefEmpty,
  ChefNotice,
  ChefPill,
  ChefSection,
} from "@/features/chef/components/chef-ui";
import { ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import type { ChefMenuItem, FoodType } from "@/features/chef/lib/chef-menu-contract";
import {
  addMealLabel,
  addSlot,
  billingUnit,
  chefPlanMetaLine,
  chefPlanPriceLabel,
  chefPlanStatus,
  copyDayToWeekdays,
  dayName,
  dayRangeLabel,
  daysWithMeals,
  DESCRIPTION_MAX,
  editorScheduleKind,
  formatPlanPrice,
  formatServiceTime,
  freeSlotsForDay,
  groupMealDays,
  initialSlots,
  LEAD_HOUR_OPTIONS,
  leadHoursLabel,
  mealSlotLabel,
  NAME_MAX,
  NOTE_MAX,
  otherWeekdaysHaveMeals,
  removeSlot,
  repeatsLabel,
  setSlotDish,
  setSlotQuantity,
  setSlotTime,
  slotsToScheduleRequest,
  stepWithErrors,
  TIME_OPTIONS,
  validateMealPlanForm,
  WEEK_ORDER,
  WEEKDAYS_SHORT,
  type EditorSlot,
  type MealPlanFormValues,
  type MealSlot,
} from "@/features/chef/lib/chef-meal-plans";
import {
  PLAN_PHOTO_MAX_BYTES,
  PLAN_PHOTO_TYPES,
  preparePlanPhoto,
} from "@/features/chef/lib/chef-plan-photo";
import type {
  ChefMealPlan,
  ChefMealPlanPeriod,
  ChefMealSchedule,
} from "@/features/chef/lib/chef-subscription-plan-contract";
import { supportCaseNumber } from "@/shared/lib/order-number";
import { createSupportCase, SupportCaseError } from "@/shared/lib/support-cases-client";
import { SUPPORT_MESSAGE_MAX, SUPPORT_SUBJECT_MAX } from "@/shared/lib/support-cases-contract";
import { RequiredMark } from "@/shared/ui/forms/required-mark";
import {
  Dialog,
  Sheet,
  secondaryActionClass,
  useOverlayHistory,
} from "@/shared/ui/overlays/overlay";

type Step = 1 | 2 | 3;
const STEP_NAMES: Record<Step, string> = { 1: "Details", 2: "Meals", 3: "Review" };
const MONTH_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
const SLOT_ICON: Record<MealSlot, typeof Sun> = {
  BREAKFAST: Coffee,
  LUNCH: Sun,
  SNACK: Cookie,
  DINNER: Moon,
};
const FIELD =
  "mt-2 block min-h-12 w-full rounded-xl border border-[#E3E6EA] bg-white px-4 text-base text-[#1A1A1A] disabled:bg-[#F1F3F5]";
const FOOD: Record<FoodType, { label: string; color: string }> = {
  VEG: { label: "Veg", color: "#2E7D32" },
  NON_VEG: { label: "Non-veg", color: "#D92D20" },
  EGG: { label: "Egg", color: "#D99A00" },
};

/** The dish's cover photo, or its first. */
export const dishPhoto = (item: ChefMenuItem | undefined) =>
  item?.images.find((image) => image.primary)?.publicUrl ?? item?.images[0]?.publicUrl ?? null;
const isAvailable = (item: ChefMenuItem) => item.status === "ACTIVE" && item.available;

function photoProblem(error: unknown): string {
  const ref = error instanceof ChefError ? error.ref : "";
  if (ref === "PLAN_IMAGE_SIZE_INVALID") return "Photo is too large. Pick a smaller photo.";
  if (ref === "PLAN_IMAGE_TYPE_UNSUPPORTED" || ref === "INVALID_PLAN_IMAGE")
    return "Choose a JPEG or PNG photo.";
  return error instanceof Error ? error.message : "Choose another photo.";
}

export type MenuState = {
  items: ChefMenuItem[];
  /** no-kitchen: the menu needs a kitchen profile first (400 KITCHEN_PROFILE_REQUIRED). */
  status: "loading" | "ready" | "error" | "no-kitchen";
  retry(): void;
};

/**
 * New plan, or an existing one (its meals load first). Drafts and plans sent back for changes are edited in 3 steps;
 * plans waiting approval, live or inactive are read-only with "Request a change". `initialStep` 2 opens on the meals.
 */
export function ChefMealPlanEditor({
  plan,
  initialStep,
  menu,
  onClose,
}: {
  plan: ChefMealPlan | null;
  initialStep: 1 | 2;
  menu: MenuState;
  onClose(message?: string): void;
}) {
  const [schedule, setSchedule] = useState<ChefMealSchedule | null | undefined>(
    plan ? undefined : null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!plan) return;
    let live = true;
    loadMealSchedule(plan.id)
      .then((value) => live && setSchedule(value))
      .catch((cause) => live && setError(chefErrorText(cause, "This meal plan couldn’t load.")));
    return () => {
      live = false;
    };
  }, [plan, attempt]);

  if (schedule !== undefined)
    return (
      <MealPlanForm
        plan={plan}
        schedule={schedule}
        initialStep={initialStep}
        menu={menu}
        onClose={onClose}
      />
    );
  return (
    <div className="chef-dish-editor">
      <BackButton onClick={() => onClose()} />
      {error ? (
        <ChefSection>
          <ChefEmpty
            icon={AlertTriangle}
            title="Couldn’t load this meal plan"
            text={error}
            action={
              <button
                type="button"
                className="chef-btn"
                onClick={() => {
                  setError("");
                  setAttempt((value) => value + 1);
                }}
              >
                Try again
              </button>
            }
          />
        </ChefSection>
      ) : (
        <ChefLoading shape="form" head={false} label="Loading meal plan" />
      )}
    </div>
  );
}

function BackButton({ onClick, disabled }: { onClick(): void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="chef-back-link !border-0 !bg-transparent !shadow-none"
      disabled={disabled}
      onClick={onClick}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Meal plans
    </button>
  );
}

function MealPlanForm({
  plan,
  schedule,
  initialStep,
  menu,
  onClose,
}: {
  plan: ChefMealPlan | null;
  schedule: ChefMealSchedule | null;
  initialStep: Step;
  menu: MenuState;
  onClose(message?: string): void;
}) {
  const editable = !plan || plan.status === "DRAFT" || plan.status === "REJECTED";
  const kind = editorScheduleKind(editable, schedule);
  const datePlanReset = editable && schedule?.recurrenceType === "MONTHLY";

  const [step, setStep] = useState<Step>(initialStep);
  const [savedPlanId, setSavedPlanId] = useState(plan?.id ?? null);
  const [form, setForm] = useState<MealPlanFormValues>({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    amount: plan ? String(plan.amount) : "",
  });
  const [period, setPeriod] = useState<ChefMealPlanPeriod>(plan?.billingPeriod ?? "WEEKLY");
  const [leadHours, setLeadHours] = useState(schedule?.generationLeadHours ?? 24);
  const [slots, setSlots] = useState<EditorSlot[]>(() => initialSlots(editable, schedule));
  const [day, setDay] = useState(() => slots[0]?.day ?? WEEK_ORDER[0]);
  const [imageUrl, setImageUrl] = useState(plan?.imageUrl ?? null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [attempt, setAttempt] = useState<"draft" | "submit" | null>(null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [serverError, setServerError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [sheet, setSheet] = useState<{ kind: "dish"; key: string } | { kind: "add" } | null>(null);
  const [note, setNote] = useState("");
  const [hasServerSchedule, setHasServerSchedule] = useState(schedule !== null);
  const [scheduleNote, setScheduleNote] = useState(false);
  const [removing, setRemoving] = useState<EditorSlot | null>(null);
  const [copying, setCopying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const router = useRouter();
  // State lags a frame behind a tap; the lock keeps a double tap to one request.
  const saving = useRef(false);
  /** The page a link was taking the chef to when "Save as draft?" opened. */
  const leaveTo = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // Errors appear after the first Next / save attempt and then follow the chef's edits.
  const errors = attempt ? validateMealPlanForm(form, slots, attempt) : {};
  const locked = !editable || busy !== null;
  const hasDishes = slots.some((slot) => slot.menuItemId !== null);
  // Only a schedule with dishes is sent, so a draft without any keeps the server's old schedule.
  const scheduleKept = hasServerSchedule && !hasDishes;
  const mealDays = daysWithMeals(slots);
  const daySlots = slots.filter((slot) => slot.day === day);
  const freeSlots = freeSlotsForDay(slots, day);
  const missingDishDays =
    attempt === "submit"
      ? [...new Set(slots.filter((slot) => slot.menuItemId === null).map((slot) => slot.day))]
      : [];
  const availableDishes = useMemo(() => menu.items.filter(isAvailable), [menu.items]);
  const menuById = useMemo(
    () => new Map(menu.items.map((item) => [item.id, item] as const)),
    [menu.items],
  );
  const scheduledNames = useMemo(
    () =>
      new Map((schedule?.items ?? []).map((item) => [item.menuItemId, item.menuItemName] as const)),
    [schedule],
  );
  const dishName = (menuItemId: string) =>
    menuById.get(menuItemId)?.itemName ?? scheduledNames.get(menuItemId) ?? "Dish";
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const photoUrl = preview ?? imageUrl;

  /** Close, the back link and Back: ask first when a draft would be lost. */
  function requestLeave(): boolean {
    if (saving.current) return false;
    if (editable && dirty) {
      setAskLeave(true);
      return false;
    }
    onClose();
    return true;
  }
  // The editor is its own screen to the phone: Back returns to the plans instead of leaving the page.
  useOverlayHistory(true, requestLeave);
  useEffect(() => {
    if (!editable || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    // In-app links (the header, the desktop nav) would drop the draft too: ask first, then follow the link.
    const guard = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target ||
        link.hasAttribute("download") ||
        link.origin !== window.location.origin ||
        (link.pathname === window.location.pathname && link.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (saving.current) return;
      leaveTo.current = link.pathname + link.search + link.hash;
      setSheet(null);
      setAskLeave(true);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guard, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guard, true);
    };
  }, [editable, dirty]);
  /** Done with the editor: back to the plans, or on to the page of the link that asked to leave. */
  function leave(message?: string, to = leaveTo.current) {
    leaveTo.current = null;
    if (!to) return onClose(message);
    setDirty(false);
    router.push(to);
  }
  function stay() {
    leaveTo.current = null;
    setAskLeave(false);
  }
  // A new step starts at its top, and screen readers hear which step it is.
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const updateForm = (field: keyof MealPlanFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  };
  const updateSlots = (change: (current: EditorSlot[]) => EditorSlot[]) => {
    setSlots(change);
    setDirty(true);
  };

  async function pickPhoto(file: File) {
    setPhotoError("");
    if (!PLAN_PHOTO_TYPES.includes(file.type)) return setPhotoError("Choose a JPEG or PNG photo.");
    const prepared = await preparePlanPhoto(file);
    if (prepared.size > PLAN_PHOTO_MAX_BYTES)
      return setPhotoError("Photo is too large. Pick a smaller photo.");
    setPhoto(prepared);
    setDirty(true);
  }

  /** False when the chef has to deal with the photo before going on; the saved plan is kept either way. */
  async function uploadPhoto(planId: string, file: File) {
    try {
      setImageUrl((await uploadMealPlanPhoto(planId, file)).imageUrl);
      setPhoto(null);
      return true;
    } catch (cause) {
      if (isComingSoon(cause)) {
        setPhoto(null);
        setPhotoError("Plan photos aren’t available yet.");
        return true;
      }
      const rejected = cause instanceof ChefError && cause.status === 400;
      const reason = rejected ? photoProblem(cause) : "Try again.";
      if (rejected) setPhoto(null);
      else setDirty(true); // the plan is saved; only the photo still waits to upload
      setPhotoError(rejected ? reason : "Photo couldn’t be uploaded. Try again.");
      setServerError(`Plan saved, but the photo wasn’t uploaded. ${reason}`);
      return false;
    }
  }

  async function save(mode: "draft" | "submit") {
    setAttempt(mode);
    setAskLeave(false);
    if (saving.current) return;
    const to = leaveTo.current;
    leaveTo.current = null;
    const problem = stepWithErrors(validateMealPlanForm(form, slots, mode));
    if (problem) return setStep(problem);
    saving.current = true;
    setBusy(mode);
    setServerError("");
    setPhotoError("");
    setScheduleNote(false);
    try {
      const input = {
        name: form.name.trim(),
        description: form.description.trim(),
        billingPeriod: period,
        amount: Number(form.amount.trim()),
        currency: "INR" as const,
      };
      const saved = await saveMealPlan(savedPlanId, input);
      setSavedPlanId(saved.id);
      if (hasDishes) {
        await saveMealSchedule(saved.id, slotsToScheduleRequest(slots, leadHours));
        setHasServerSchedule(true);
      }
      setDirty(false);
      // Before submit: the server takes photos only while the plan is a draft.
      if (photo && !(await uploadPhoto(saved.id, photo))) return;
      if (mode === "submit") await submitMealPlan(saved.id, note);
      if (scheduleKept) {
        // A schedule can't be emptied, so the server kept the old one; stay, and show the Meals step that says so.
        setScheduleNote(true);
        setDirty(true);
        setStep(2);
        return;
      }
      leave(mode === "submit" ? "Sent to Craves for approval" : "Draft saved", to);
    } catch (cause) {
      setServerError(chefErrorText(cause, "The meal plan could not be saved. Try again."));
    } finally {
      saving.current = false;
      setBusy(null);
    }
  }

  function goToMeals() {
    setAttempt((current) => current ?? "draft");
    if (Object.keys(validateMealPlanForm(form, slots, "draft")).length === 0) setStep(2);
  }
  function goToReview() {
    setAttempt("submit");
    setStep(stepWithErrors(validateMealPlanForm(form, slots, "submit")) ?? 3);
  }
  function copyToWeekdays() {
    updateSlots((current) => copyDayToWeekdays(current, day));
    setCopying(false);
  }

  const unit = billingUnit(period);
  const dayLong = dayName(kind, day, "long");
  const status = plan ? chefPlanStatus(plan.status) : null;
  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`plan-${key}-error`} className="chef-field-error">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: string) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `plan-${key}-error` } : {};

  const details = (
    <fieldset disabled={locked} className="chef-stack min-w-0">
      {editable || photoUrl ? (
        <ChefSection
          title="Plan photo"
          note={editable ? "Customers see it on the plan card. JPEG or PNG." : undefined}
        >
          <div className="grid gap-3 sm:grid-cols-[16rem_minmax(0,1fr)] sm:items-center">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-[#F1F3F5]">
              {photoUrl ? (
                <img src={photoUrl} alt="Plan photo" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-[#6B6B6B]">
                  <UtensilsCrossed className="size-8" aria-hidden="true" />
                </span>
              )}
            </div>
            {editable ? (
              <label className="chef-btn w-fit cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[#1A1A1A]">
                <Camera className="h-4 w-4" aria-hidden="true" />
                {photoUrl ? "Change photo" : "Add plan photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  aria-describedby={photoError ? "plan-photo-error" : undefined}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void pickPhoto(file);
                  }}
                />
              </label>
            ) : null}
          </div>
          {photoError ? (
            <p id="plan-photo-error" role="alert" className="chef-field-error">
              {photoError}
            </p>
          ) : null}
        </ChefSection>
      ) : null}
      <ChefSection>
        <div className="grid gap-5">
          <div>
            <label htmlFor="plan-name" className="chef-field-label">
              Plan name
              <RequiredMark />
            </label>
            <input
              id="plan-name"
              required
              maxLength={NAME_MAX}
              autoComplete="off"
              className={FIELD}
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="e.g. Weekly home lunch"
              {...invalid("name")}
            />
            {fieldError("name")}
          </div>
          <ChefChoiceChips
            legend="How often"
            name="plan-period"
            disabled={locked}
            value={period}
            onChange={(next) => {
              // The week is the same for every bill length, so changing it keeps the meals.
              setPeriod(next);
              setDirty(true);
            }}
            options={[
              { value: "WEEKLY", label: "Weekly" },
              { value: "FORTNIGHTLY", label: "14 days" },
              { value: "MONTHLY", label: "Monthly" },
            ]}
          />
          <div>
            <label htmlFor="plan-amount" className="chef-field-label">
              Price
              <RequiredMark />
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-[#1A1A1A]"
              >
                ₹
              </span>
              <input
                id="plan-amount"
                required
                inputMode="decimal"
                autoComplete="off"
                className={`${FIELD} !mt-0 pl-8 pr-28`}
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                placeholder="1499"
                aria-label={`Price per ${unit}`}
                {...invalid("amount")}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#6B6B6B]"
              >
                per {unit}
              </span>
            </div>
            {fieldError("amount")}
          </div>
          <div>
            <label htmlFor="plan-lead" className="chef-field-label">
              Cook how early
              <RequiredMark />
            </label>
            <select
              id="plan-lead"
              className={FIELD}
              value={leadHours}
              aria-describedby="plan-lead-help"
              onChange={(event) => {
                setLeadHours(Number(event.target.value));
                setDirty(true);
              }}
            >
              {LEAD_HOUR_OPTIONS.map((hours) => (
                <option key={hours} value={hours}>
                  {leadHoursLabel(hours)}
                </option>
              ))}
            </select>
            <p id="plan-lead-help" className="chef-section-note mt-1.5">
              How long before each meal you start preparing.
            </p>
          </div>
          <div>
            <label htmlFor="plan-description" className="chef-field-label">
              Description
              <RequiredMark />
            </label>
            <textarea
              id="plan-description"
              required
              rows={3}
              maxLength={DESCRIPTION_MAX}
              className={`${FIELD} py-3 leading-6`}
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
              placeholder="What customers get, how it’s packed"
              {...invalid("description")}
              aria-describedby={`${errors.description ? "plan-description-error " : ""}plan-description-count`}
            />
            <p id="plan-description-count" className="chef-section-note mt-1.5 text-right tabular-nums">
              {form.description.length}/{DESCRIPTION_MAX}
            </p>
            <p className="sr-only" role="status">
              {form.description.length >= DESCRIPTION_MAX
                ? `Description is at the ${DESCRIPTION_MAX} character limit.`
                : ""}
            </p>
            {fieldError("description")}
          </div>
        </div>
      </ChefSection>
    </fieldset>
  );

  const dayTabs = kind === "WEEKLY" ? WEEK_ORDER : MONTH_DAYS;
  function onDayKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = dayTabs.indexOf(day);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: dayTabs.length - 1 }[
      event.key
    ];
    if (next === undefined) return;
    event.preventDefault();
    const target = dayTabs[(next + dayTabs.length) % dayTabs.length];
    setDay(target);
    document.getElementById(`plan-day-${target}`)?.focus();
  }

  const meals = (
    <div className="chef-stack">
      {datePlanReset ? (
        <ChefNotice icon={AlertTriangle}>
          This plan was set up by date. Set up one week; it repeats every week.
        </ChefNotice>
      ) : null}
      <div
        role="tablist"
        aria-label="Days"
        className={kind === "WEEKLY" ? "grid grid-cols-7 gap-1" : "chef-chips"}
      >
        {dayTabs.map((value) => {
          const selected = day === value;
          const label = kind === "WEEKLY" ? WEEKDAYS_SHORT[value - 1] : String(value);
          return (
            <button
              key={value}
              id={`plan-day-${value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="plan-day-panel"
              aria-label={`${dayName(kind, value, "long")}${mealDays.has(value) ? ", has meals" : ""}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setDay(value)}
              onKeyDown={onDayKey}
              className={`relative flex min-h-12 min-w-11 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A] ${selected ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : mealDays.has(value) ? "border-[#E3E6EA] bg-white text-[#1A1A1A]" : "border-dashed border-[#C9CDD2] bg-white text-[#6B6B6B]"}`}
            >
              {label}
              {mealDays.has(value) ? (
                <span
                  aria-hidden="true"
                  className={`mt-0.5 size-1.5 rounded-full ${selected ? "bg-white" : "bg-[#F62E18]"}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        id="plan-day-panel"
        role="tabpanel"
        aria-labelledby={`plan-day-${day}`}
        className="chef-stack"
      >
        {errors.schedule ? (
          <p role="alert" className="chef-field-error !mt-0">
            {errors.schedule}
          </p>
        ) : null}
        {scheduleNote && scheduleKept ? (
          <p role="alert" className="chef-field-error !mt-0">
            Add at least one meal to save schedule changes.
          </p>
        ) : null}
        {missingDishDays.length > 0 ? (
          <p role="alert" className="chef-field-error !mt-0">
            Select a dish for every meal:{" "}
            {missingDishDays.map((value) => dayName(kind, value)).join(", ")}.
          </p>
        ) : null}
        {daySlots.length === 0 ? (
          <p className="chef-section-note px-1">No meals on {dayName(kind, day, "long")}.</p>
        ) : null}
        {daySlots.map((slot) => (
          <SlotCard
            key={slot.key}
            slot={slot}
            dish={slot.menuItemId ? menuById.get(slot.menuItemId) : undefined}
            dishName={slot.menuItemId ? dishName(slot.menuItemId) : null}
            dishUnavailable={
              slot.menuItemId !== null &&
              menu.status === "ready" &&
              !availableDishes.some((item) => item.id === slot.menuItemId)
            }
            editable={editable}
            locked={locked}
            error={errors[`slot:${slot.key}`]}
            onDelete={() => setRemoving(slot)}
            onDish={() => setSheet({ kind: "dish", key: slot.key })}
            onQuantity={(quantity) =>
              updateSlots((current) => setSlotQuantity(current, slot.key, quantity))
            }
            onTime={(time) => updateSlots((current) => setSlotTime(current, slot.slot, time))}
          />
        ))}
        {editable && freeSlots.length > 0 ? (
          <button
            type="button"
            className="chef-btn"
            disabled={locked}
            aria-label={`${addMealLabel(freeSlots)} for ${dayName(kind, day, "long")}`}
            onClick={() => setSheet({ kind: "add" })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {addMealLabel(freeSlots)}
          </button>
        ) : null}
        {editable && kind === "WEEKLY" && daySlots.length > 0 ? (
          <button
            type="button"
            className="chef-btn is-quiet"
            disabled={locked}
            onClick={() =>
              otherWeekdaysHaveMeals(slots, day) ? setCopying(true) : copyToWeekdays()
            }
          >
            <Copy className="h-4 w-4" aria-hidden="true" /> {`Copy ${dayLong} to all weekdays`}
          </button>
        ) : null}
        {editable ? (
          <p className="chef-section-note px-1">
            You can only pick dishes that are on and available on your menu.
          </p>
        ) : null}
      </div>
    </div>
  );

  const reviewItems =
    kind === "WEEKLY" ? slotsToScheduleRequest(slots, leadHours).items : (schedule?.items ?? []);
  const review = (
    <div className="chef-stack">
      <ChefSection
        title="Details"
        action={
          <button
            type="button"
            className="chef-btn is-small is-quiet"
            aria-label="Edit details"
            onClick={() => setStep(1)}
          >
            Edit
          </button>
        }
      >
        <div className="flex gap-3">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="aspect-[4/3] w-24 shrink-0 rounded-xl object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <p className="font-bold text-[#1A1A1A] [overflow-wrap:anywhere]">{form.name.trim()}</p>
            <p className="chef-section-note">{chefPlanMetaLine(period, reviewItems)}</p>
            <p className="chef-section-note">{repeatsLabel(period)}</p>
            <p className="chef-amount mt-1 font-bold text-[#1A1A1A]">
              {chefPlanPriceLabel({
                amount: Number(form.amount.trim()),
                currency: "INR",
                billingPeriod: period,
              })}
            </p>
          </div>
        </div>
      </ChefSection>
      <ChefSection
        title="Meals"
        flush
        action={
          <button
            type="button"
            className="chef-btn is-small is-quiet"
            aria-label="Edit meals"
            onClick={() => setStep(2)}
          >
            Edit
          </button>
        }
      >
        <ul className="chef-list">
          {groupMealDays(slots, kind).flatMap((group) =>
            group.meals.map((meal) => (
              <li key={`${group.days[0]}-${meal.slot}`} className="px-4 py-3 md:px-5">
                <p className="font-semibold text-[#1A1A1A]">{`${dayRangeLabel(kind, group.days)} · ${mealSlotLabel(meal.slot)} ${formatServiceTime(meal.time)}`}</p>
                <p className="chef-section-note">
                  {meal.menuItemId ? dishName(meal.menuItemId) : ""}
                  {meal.quantity > 1 ? ` × ${meal.quantity}` : ""}
                </p>
              </li>
            )),
          )}
        </ul>
      </ChefSection>
      <div>
        <label htmlFor="plan-note" className="chef-field-label">
          Note for Craves (optional)
        </label>
        <textarea
          id="plan-note"
          rows={3}
          maxLength={NOTE_MAX}
          disabled={busy !== null}
          className={`${FIELD} py-3 leading-6`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Anything the Craves team should know"
        />
      </div>
      <ChefNotice icon={Lock}>
        You can’t edit the plan while Craves checks it. Usually takes a day.
      </ChefNotice>
    </div>
  );

  const readOnlyNote =
    editable || !plan
      ? null
      : plan.status === "PENDING_APPROVAL"
        ? "Craves is checking this plan. You can’t edit it until then."
        : plan.status === "ACTIVE"
          ? "This plan is live. To change something, send us a request."
          : "This plan isn’t live. To change something, send us a request.";
  const removingDay = removing
    ? kind === "WEEKLY"
      ? dayName(kind, removing.day, "long")
      : `day ${removing.day}`
    : "";

  return (
    <div className="chef-dish-editor">
      <header className="mb-4">
        <BackButton onClick={requestLeave} disabled={busy !== null} />
        <h1 ref={heading} tabIndex={-1} className="chef-page-title outline-none">
          {editable ? (plan ? "Edit meal plan" : "New meal plan") : plan?.name}
        </h1>
        <p className="chef-page-subtitle">
          {editable ? (
            `Step ${step} of 3 · ${STEP_NAMES[step]}`
          ) : status ? (
            <ChefPill tone={status.tone}>{status.label}</ChefPill>
          ) : null}
        </p>
        {editable ? (
          <div aria-hidden="true" className="mt-3 grid grid-cols-3 gap-1.5">
            {([1, 2, 3] as const).map((value) => (
              <span
                key={value}
                className={`h-1 rounded-full ${value <= step ? "bg-[#F62E18]" : "bg-[#E3E6EA]"}`}
              />
            ))}
          </div>
        ) : null}
      </header>

      <div className="chef-stack">
        {readOnlyNote ? (
          <ChefNotice icon={Lock} role="status">
            {readOnlyNote}
          </ChefNotice>
        ) : null}
        {plan?.status === "REJECTED" ? (
          <ChefNotice icon={AlertTriangle}>
            <strong className="block">Changes requested</strong>
            {plan.reviewReason ?? "Update the plan and submit it again."}
          </ChefNotice>
        ) : null}
        {serverError ? (
          <ChefNotice icon={AlertTriangle} tone="danger" role="alert">
            {serverError}
          </ChefNotice>
        ) : null}
        {!editable ? (
          <ChefChoiceChips
            legend="Show"
            name="plan-view"
            value={step === 2 ? "meals" : "details"}
            onChange={(value) => setStep(value === "meals" ? 2 : 1)}
            options={[
              { value: "details", label: "Details" },
              { value: "meals", label: "Meals" },
            ]}
          />
        ) : null}
        {step === 1 ? details : step === 2 ? meals : review}
      </div>

      <div className="chef-dish-actions lg:!max-w-none">
        {editable ? (
          <>
            {step > 1 ? (
              <button
                type="button"
                className="chef-btn"
                disabled={busy !== null}
                onClick={() => setStep((step - 1) as Step)}
              >
                Back
              </button>
            ) : null}
            {step === 1 ? (
              <button
                type="button"
                className="chef-btn is-primary flex-1"
                disabled={busy !== null}
                onClick={goToMeals}
              >
                Next: Meals
              </button>
            ) : null}
            {step === 2 ? (
              <button
                type="button"
                className="chef-btn is-primary flex-1"
                disabled={busy !== null}
                onClick={goToReview}
              >
                Next: Review
              </button>
            ) : null}
            {step === 3 ? (
              <button
                type="button"
                className="chef-btn is-primary flex-1"
                disabled={busy !== null}
                aria-busy={busy === "submit"}
                onClick={() => void save("submit")}
              >
                {busy === "submit" ? "Sending…" : "Submit for approval"}
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="chef-btn is-primary flex-1"
            onClick={() => setRequesting(true)}
          >
            Request a change
          </button>
        )}
      </div>
      <p className="sr-only" role="status">
        {busy === "draft" ? "Saving draft…" : busy === "submit" ? "Sending to Craves…" : ""}
      </p>

      <Sheet
        open={sheet?.kind === "dish"}
        onOpenChange={(open) => !open && setSheet(null)}
        title="Pick a dish"
      >
        {/* Sheets open outside the chef page: the theme brings the chef buttons along. */}
        <div className="chef-panel-theme chef-sheet-theme">
          <DishChoices
            menu={menu}
            dishes={availableDishes}
            selected={
              sheet?.kind === "dish"
                ? (slots.find((slot) => slot.key === sheet.key)?.menuItemId ?? null)
                : null
            }
            onPick={(id) => {
              if (sheet?.kind === "dish")
                updateSlots((current) => setSlotDish(current, sheet.key, id));
              setSheet(null);
            }}
          />
        </div>
      </Sheet>
      <Sheet
        open={sheet?.kind === "add"}
        onOpenChange={(open) => !open && setSheet(null)}
        title={`Add a meal for ${dayName(kind, day)}`}
      >
        <div className="chef-panel-theme chef-sheet-theme mt-4 grid gap-2">
          {freeSlots.map((code) => {
            const Icon = SLOT_ICON[code];
            return (
              <button
                key={code}
                type="button"
                className="chef-btn justify-start"
                onClick={() => {
                  updateSlots((current) => addSlot(current, day, code));
                  setSheet(null);
                }}
              >
                <Icon className="h-5 w-5 text-[#6B6B6B]" aria-hidden="true" /> {mealSlotLabel(code)}
              </button>
            );
          })}
        </div>
      </Sheet>
      <Dialog
        open={askLeave}
        onOpenChange={(open) => !open && stay()}
        title="Save as draft?"
        description="Your plan isn’t sent to Craves yet. A draft keeps what you’ve done so far."
        footer={
          <>
            <button type="button" className={secondaryActionClass} onClick={stay}>
              Keep editing
            </button>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => {
                setAskLeave(false);
                leave();
              }}
            >
              Discard
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => void save("draft")}
            >
              Save draft
            </button>
          </>
        }
      />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={
          removing
            ? `Remove ${mealSlotLabel(removing.slot).toLowerCase()} on ${removingDay}?`
            : "Remove this meal?"
        }
        description="The dish planned for it on this day is removed."
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => {
                if (removing) updateSlots((current) => removeSlot(current, removing.key));
                setRemoving(null);
              }}
            >
              Remove
            </button>
          </>
        }
      />
      <Dialog
        open={copying}
        onOpenChange={setCopying}
        title={`Copy ${dayLong} to all weekdays?`}
        description="This replaces any meals already planned for the other weekdays."
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => setCopying(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={copyToWeekdays}
            >
              Copy
            </button>
          </>
        }
      />
      {plan && !editable ? (
        <RequestChangeDialog open={requesting} onOpenChange={setRequesting} planName={plan.name} />
      ) : null}
    </div>
  );
}

function VegMark({ type }: { type: FoodType }) {
  const food = FOOD[type];
  return (
    <span
      role="img"
      aria-label={food.label}
      className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]"
      style={{ borderColor: food.color }}
    >
      <span className="size-2 rounded-full" style={{ background: food.color }} />
    </span>
  );
}

function DishThumb({ item, size }: { item: ChefMenuItem | undefined; size: string }) {
  const url = dishPhoto(item);
  return url ? (
    <img src={url} alt="" loading="lazy" className={`${size} shrink-0 rounded-lg object-cover`} />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-[#F1F3F5] text-[#6B6B6B]`}
    >
      <UtensilsCrossed className="size-4" aria-hidden="true" />
    </span>
  );
}

function SlotCard({
  slot,
  dish,
  dishName,
  dishUnavailable,
  editable,
  locked,
  error,
  onDelete,
  onDish,
  onQuantity,
  onTime,
}: {
  slot: EditorSlot;
  dish: ChefMenuItem | undefined;
  dishName: string | null;
  dishUnavailable: boolean;
  editable: boolean;
  /** Not editable, or a save is in flight. */
  locked: boolean;
  error?: string;
  onDelete(): void;
  onDish(): void;
  onQuantity(quantity: number): void;
  onTime(time: string): void;
}) {
  const label = mealSlotLabel(slot.slot);
  const Icon = SLOT_ICON[slot.slot];
  const problem =
    error ?? (dishUnavailable ? "This dish is not available on your menu right now." : null);
  return (
    <section aria-label={label} className="chef-section p-4 md:p-5">
      <div className="flex items-center gap-2">
        <Icon
          className={`h-5 w-5 ${slot.slot === "DINNER" ? "text-[#C4200F]" : "text-[#B26B00]"}`}
          aria-hidden="true"
        />
        <h3 className="flex-1 font-bold text-[#1A1A1A]">{label}</h3>
        {editable ? (
          <label className="flex items-center gap-1 text-sm text-[#6B6B6B]">
            <span className="sr-only">
              {label} time, for every {label.toLowerCase()} in this plan
            </span>
            <select
              value={slot.time}
              disabled={locked}
              onChange={(event) => onTime(event.target.value)}
              className="min-h-11 rounded-full border border-[#E3E6EA] bg-white px-3 text-sm font-semibold text-[#1A1A1A]"
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>
                  {formatServiceTime(time)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="rounded-full bg-[#F1F3F5] px-3 py-1 text-sm font-semibold text-[#1A1A1A]">
            {formatServiceTime(slot.time)}
          </span>
        )}
        {editable ? (
          <button
            type="button"
            className="chef-icon-button"
            disabled={locked}
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={onDelete}
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={locked}
          onClick={onDish}
          aria-label={`${label} dish, ${dishName ?? "not selected"}`}
          aria-describedby={problem ? `slot-${slot.key}-problem` : undefined}
          className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:cursor-default ${dishName ? "border-[#E3E6EA] bg-white" : "border-dashed border-[#C9CDD2] bg-[#F7F8FA] font-semibold text-[#C4200F]"} ${error ? "!border-[#C4200F]" : ""}`}
        >
          {dishName ? (
            <>
              {dish ? <DishThumb item={dish} size="size-11" /> : null}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  {dish ? <VegMark type={dish.foodType} /> : null}
                  <span className="line-clamp-2 font-semibold text-[#1A1A1A]">{dishName}</span>
                </span>
                {dish ? (
                  <span className="chef-section-note block">
                    {formatPlanPrice(dish.price, dish.currency)} on menu
                  </span>
                ) : null}
              </span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add a dish
            </>
          )}
        </button>
        {dishName ? (
          editable ? (
            <div className="flex items-center" role="group" aria-label={`${label} portions`}>
              <button
                type="button"
                className="chef-icon-button"
                disabled={locked || slot.quantity <= 1}
                aria-label={`Fewer ${label.toLowerCase()} portions`}
                onClick={() => onQuantity(slot.quantity - 1)}
              >
                <Minus className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="min-w-8 text-center font-bold tabular-nums" aria-live="polite">
                {slot.quantity}
              </span>
              <button
                type="button"
                className="chef-icon-button"
                disabled={locked || slot.quantity >= 100}
                aria-label={`More ${label.toLowerCase()} portions`}
                onClick={() => onQuantity(slot.quantity + 1)}
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <span className="font-bold tabular-nums">× {slot.quantity}</span>
          )
        ) : null}
      </div>
      {problem ? (
        <p id={`slot-${slot.key}-problem`} className="chef-field-error">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

function DishChoices({
  menu,
  dishes,
  selected,
  onPick,
}: {
  menu: MenuState;
  dishes: ChefMenuItem[];
  selected: string | null;
  onPick(id: string): void;
}) {
  if (dishes.length === 0) {
    if (menu.status === "no-kitchen")
      return (
        <div className="mt-4 grid justify-items-start gap-3">
          <p className="text-sm text-[#1A1A1A]">
            Set up your kitchen first, then add dishes to your menu.
          </p>
          <Link href="/chef/kitchen" className="chef-btn">
            Set up my kitchen
          </Link>
        </div>
      );
    return menu.status === "error" ? (
      <div className="mt-4 grid justify-items-start gap-3">
        <p className="text-sm text-[#1A1A1A]">
          Couldn’t load your menu. Check your connection and try again.
        </p>
        <button type="button" className="chef-btn" onClick={menu.retry}>
          Try again
        </button>
      </div>
    ) : (
      <p role="status" className="mt-4 text-sm text-[#6B6B6B]">
        {menu.status === "loading"
          ? "Loading your menu…"
          : "None of your dishes are on and available yet."}
      </p>
    );
  }
  return (
    <ul className="mt-4 grid gap-2">
      {dishes.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-pressed={item.id === selected}
            onClick={() => onPick(item.id)}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-[#E3E6EA] bg-white px-3 py-2 text-left aria-pressed:border-[#1A1A1A]"
          >
            <DishThumb item={item} size="size-11" />
            <VegMark type={item.foodType} />
            <span className="min-w-0 flex-1 font-semibold text-[#1A1A1A]">{item.itemName}</span>
            {item.id === selected ? (
              <Check className="h-5 w-5 text-[#1A1A1A]" aria-hidden="true" />
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Request a change" on a plan that can't be edited: a support ticket "Change meal plan: <name>". */
function RequestChangeDialog({
  open,
  onOpenChange,
  planName,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  planName: string;
}) {
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "soon" | { sent: string }>("idle");
  const [error, setError] = useState("");
  const sent = typeof state === "object";

  async function send() {
    if (!message.trim()) return setError("Tell us what you want to change.");
    setState("busy");
    setError("");
    try {
      const created = await createSupportCase({
        contextRole: "CHEF",
        subject: `Change meal plan: ${planName}`.slice(0, SUPPORT_SUBJECT_MAX),
        message: message.trim(),
      });
      setState({ sent: supportCaseNumber(created.caseNumber) });
      setMessage("");
    } catch (cause) {
      const code = cause instanceof SupportCaseError ? cause.code : "";
      if (code === "FEATURE_NOT_AVAILABLE") return setState("soon");
      setState("idle");
      setError(
        code === "SESSION_EXPIRED"
          ? "Your session expired. Sign in again to continue."
          : "Your request didn’t send. Try again.",
      );
    }
  }

  let body: ReactNode;
  if (sent) {
    body = (
      <p role="status" className="mt-4 text-sm leading-6 text-[#1A1A1A]">
        Request sent (#{state.sent}). A Craves support person will reply in{" "}
        <Link href="/chef/support" className="font-semibold underline">
          Get help
        </Link>
        .
      </p>
    );
  } else if (state === "soon") {
    body = (
      <p role="status" className="mt-4 text-sm leading-6 text-[#1A1A1A]">
        Coming soon: requests from here aren’t open yet. Use Get help to reach Craves.
      </p>
    );
  } else {
    body = (
      <div className="mt-4">
        <label htmlFor="plan-change-message" className="chef-field-label">
          What should change?
          <RequiredMark />
        </label>
        <textarea
          id="plan-change-message"
          rows={4}
          required
          maxLength={SUPPORT_MESSAGE_MAX}
          className={`${FIELD} py-3 leading-6`}
          value={message}
          disabled={state === "busy"}
          onChange={(event) => setMessage(event.target.value)}
          aria-describedby={error ? "plan-change-error" : undefined}
        />
        {error ? (
          <p id="plan-change-error" role="alert" className="chef-field-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && state !== "busy") setState("idle");
      }}
      title="Request a change"
      description={`For “${planName}”. Tell us what to change and a Craves support person will reply.`}
      busy={state === "busy"}
      unsavedChanges={!!message.trim()}
      closeOnOutsideTap={!message.trim()}
      footer={
        sent || state === "soon" ? (
          <button
            type="button"
            className="craves-primary-action w-full sm:w-auto"
            onClick={() => {
              onOpenChange(false);
              setState("idle");
            }}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              className={secondaryActionClass}
              disabled={state === "busy"}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              disabled={state === "busy"}
              aria-busy={state === "busy"}
              onClick={() => void send()}
            >
              {state === "busy" ? "Sending…" : "Send request"}
            </button>
          </>
        )
      }
    >
      {/* Dialogs open outside the chef page: the theme brings the chef field colours along. */}
      <div className="chef-panel-theme chef-sheet-theme">{body}</div>
    </Dialog>
  );
}
