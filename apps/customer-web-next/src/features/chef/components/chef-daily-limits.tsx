"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Lock,
  Minus,
  Plus,
  UtensilsCrossed,
} from "lucide-react";
import {
  isComingSoon,
  loadCapacity,
  loadChefMenu,
  loadMealPlans,
  loadMealSchedule,
  saveCapacity,
} from "@/features/chef/api/chef-meal-plans";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import {
  ChefChoiceChips,
  ChefEmpty,
  ChefFlash,
  ChefNotice,
  ChefSection,
} from "@/features/chef/components/chef-ui";
import {
  capacityBar,
  capacityCaption,
  clampPlates,
  dateChangeLines,
  dayLabel,
  DEFAULT_DISH_MAX,
  dishLimits,
  dishLimitSummary,
  firstServedSlot,
  limitDays,
  limitHeading,
  setSubscriberPlates,
  setTotalPlates,
  slotLimits,
} from "@/features/chef/lib/chef-daily-limits";
import { chefErrorText } from "@/features/chef/lib/chef-errors";
import { MEAL_SLOTS, mealSlotLabel, type MealSlot } from "@/features/chef/lib/chef-meal-plans";
import type { ChefMenuItem } from "@/features/chef/lib/chef-menu-contract";
import type { ChefCapacitySummary } from "@/features/chef/lib/chef-subscription-capacity-contract";
import type { ChefMealSchedule } from "@/features/chef/lib/chef-subscription-plan-contract";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";
import { Sheet } from "@/shared/ui/overlays/overlay";

type PlateValues = { total: number; subscriber: number; salesEnabled: boolean };

const REASON = "Updated by Chef in Craves web";
const SAVE_PROBLEM = "We couldn’t save your limits. Try again.";
const FIELD =
  "block min-h-12 w-full rounded-xl border border-[#E3E6EA] bg-white px-4 text-base text-[#1A1A1A] disabled:bg-[#F1F3F5]";
// Today in India: the UTC date is still yesterday until 5:30 am.
const indiaToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function PlateStepper({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange(value: number): void;
}) {
  const lower = name.toLowerCase();
  return (
    <div className="flex items-center" role="group" aria-label={name}>
      <button
        type="button"
        className="chef-icon-button"
        aria-label={`Fewer ${lower}`}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="h-5 w-5" aria-hidden="true" />
      </button>
      <input
        aria-label={name}
        inputMode="numeric"
        maxLength={6}
        className="h-11 w-16 rounded-lg border border-[#E3E6EA] bg-white text-center text-lg font-bold tabular-nums text-[#1A1A1A] disabled:bg-[#F1F3F5]"
        value={String(value)}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(Number(event.target.value.replace(/\D/g, "")) || 0)}
      />
      <button
        type="button"
        className="chef-icon-button"
        aria-label={`More ${lower}`}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="font-semibold text-[#1A1A1A]">{title}</p>
        {hint ? <p className="chef-section-note">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SwitchRow({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint?: string;
  value: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <Row title={title} hint={hint}>
      <AppleSwitch
        tone="go"
        size="md"
        aria-label={title}
        checked={value}
        onCheckedChange={onChange}
      />
    </Row>
  );
}

const Problem = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="text-sm font-semibold text-[#C4200F]">
      {text}
    </p>
  ) : null;
const Warning = ({ children }: { children: string }) => (
  <p className="text-sm font-semibold text-[#C4200F]">{children}</p>
);

/**
 * How many plates a meal can take, how many are kept for subscribers, and the one-day changes, like the app's Daily
 * limits. `planId` (from a plan card) limits the days to that plan's week; otherwise every plan's days count.
 */
export function ChefDailyLimits({ planId }: { planId: string | null }) {
  const [data, setData] = useState<ChefCapacitySummary | null>(null);
  const [schedules, setSchedules] = useState<ChefMealSchedule[]>([]);
  const [menuItems, setMenuItems] = useState<ChefMenuItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [unpublished, setUnpublished] = useState(false);
  const [today] = useState(indiaToday);
  const [slotChoice, setSlotChoice] = useState<MealSlot | null>(null);
  const [edits, setEdits] = useState<Partial<Record<MealSlot, PlateValues>>>({});
  // Meals whose numbers were changed and not saved yet, in the order they were changed. Save writes all of them.
  const [unsaved, setUnsaved] = useState<MealSlot[]>([]);
  const [sheet, setSheet] = useState<"dish" | "date" | null>(null);
  const [busy, setBusy] = useState(false);
  const [mainProblem, setMainProblem] = useState("");
  const [sheetProblem, setSheetProblem] = useState("");
  const [notice, setNotice] = useState("");
  const saving = useRef(false);
  // One dish's daily limit.
  const [dishId, setDishId] = useState<string | null>(null);
  const [dishMax, setDishMax] = useState(DEFAULT_DISH_MAX);
  const [dishOn, setDishOn] = useState(true);
  // One date.
  const [date, setDate] = useState("");
  const [dateKind, setDateKind] = useState<"meal" | "dish">("meal");
  const [dateValues, setDateValues] = useState<PlateValues>({
    total: 0,
    subscriber: 0,
    salesEnabled: true,
  });
  const [dateClosed, setDateClosed] = useState(false);
  const [dateDishId, setDateDishId] = useState<string | null>(null);
  const [dateDishMax, setDateDishMax] = useState(DEFAULT_DISH_MAX);
  const [dateDishClosed, setDateDishClosed] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const planIds = planId ? [planId] : (await loadMealPlans()).map((plan) => plan.id);
      const [summary, loaded, menu] = await Promise.all([
        loadCapacity(),
        Promise.all(planIds.map(loadMealSchedule)),
        // Without the menu, dishes show as "Dish" and can't be limited; the plates still can.
        loadChefMenu().catch(() => []),
      ]);
      setSchedules(loaded.filter((schedule): schedule is ChefMealSchedule => schedule !== null));
      setMenuItems(menu);
      setData(summary);
    } catch (error) {
      if (isComingSoon(error)) setUnpublished(true);
      else setLoadError(chefErrorText(error, "Your daily limits couldn’t load."));
    }
  }, [planId]);
  useEffect(() => {
    void load();
  }, [load]);

  const slot = slotChoice ?? firstServedSlot(schedules);
  const daysFor = (code: MealSlot) => limitDays(schedules, code);
  const days = daysFor(slot);
  const rules = data?.slotRules ?? [];
  const server = slotLimits(rules, slot, days);
  const valuesFor = (code: MealSlot): PlateValues => {
    const saved = slotLimits(rules, code, daysFor(code));
    return (
      edits[code] ?? {
        total: saved.total,
        subscriber: saved.subscriber,
        salesEnabled: saved.salesEnabled,
      }
    );
  };
  const values = valuesFor(slot);
  const frozen = data?.adminSalesFrozen === true;
  const dishes = menuItems.filter((item) => item.status === "ACTIVE" && item.available);
  const dishName = (id: string) => menuItems.find((item) => item.id === id)?.itemName ?? "Dish";
  const dishLimitsFor = (id: string | null) =>
    id && data ? dishLimits(data.menuItemRules, id, slot, days) : null;
  const firstDish = () =>
    dishes.find((item) => dishLimitsFor(item.id))?.id ?? dishes[0]?.id ?? null;
  const slotChange = (iso: string) =>
    data?.dateOverrides.find(
      (change) => change.serviceDate === iso && change.mealSlotCode === slot,
    );
  const dishChange = (iso: string, id: string | null) =>
    id
      ? data?.menuItemDateOverrides.find(
          (change) =>
            change.serviceDate === iso && change.mealSlotCode === slot && change.menuItemId === id,
        )
      : undefined;
  const bar = capacityBar(values, server.booked);
  const slotName = mealSlotLabel(slot).toLowerCase();

  /** Runs one save: ignores a second tap, says "coming soon" when the server has no such route, otherwise a plain problem. */
  async function run(job: () => Promise<unknown>, done: string, onProblem: (text: string) => void) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    onProblem("");
    try {
      await job();
      setNotice(done);
      setData(await loadCapacity().catch(() => data));
      return true;
    } catch (error) {
      if (isComingSoon(error)) {
        // Close any sheet so the "coming soon" card behind it is what the chef sees.
        setUnpublished(true);
        setSheet(null);
      } else onProblem(SAVE_PROBLEM);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const saveLimits = () =>
    run(
      async () => {
        for (const code of unsaved.includes(slot) ? unsaved : [...unsaved, slot]) {
          const { total, subscriber, salesEnabled } = valuesFor(code);
          for (const isoDayOfWeek of daysFor(code)) {
            await saveCapacity("rules/slots", {
              isoDayOfWeek,
              mealSlotCode: code,
              totalCapacityUnits: total,
              subscriptionCapacityUnits: subscriber,
              salesEnabled,
              reason: REASON,
            });
          }
          // A saved meal is not sent again; a meal that fails stays here for the next try.
          setUnsaved((current) => current.filter((meal) => meal !== code));
        }
      },
      "Limits saved",
      setMainProblem,
    );

  function pickDish(id: string | null) {
    const limits = dishLimitsFor(id);
    setDishId(id);
    setDishMax(limits?.max ?? DEFAULT_DISH_MAX);
    setDishOn(limits?.salesEnabled ?? true);
  }
  function openDishSheet() {
    pickDish(firstDish());
    setSheetProblem("");
    setSheet("dish");
  }
  async function saveDish() {
    const id = dishId;
    if (!id) return;
    const saved = await run(
      async () => {
        for (const isoDayOfWeek of days) {
          await saveCapacity("rules/menu-items", {
            menuItemId: id,
            isoDayOfWeek,
            mealSlotCode: slot,
            maxSubscriptionUnits: dishMax,
            salesEnabled: dishOn,
            reason: REASON,
          });
        }
      },
      "Dish limit saved",
      setSheetProblem,
    );
    if (saved) setSheet(null);
  }

  function pickDateDish(id: string | null, iso = date) {
    const change = iso ? dishChange(iso, id) : undefined;
    setDateDishId(id);
    setDateDishMax(change?.maxSubscriptionUnits ?? dishLimitsFor(id)?.max ?? DEFAULT_DISH_MAX);
    setDateDishClosed(change?.closed ?? false);
  }
  function openDateSheet() {
    setDate("");
    setDateKind("meal");
    setDateValues(values);
    setDateClosed(false);
    pickDateDish(firstDish(), "");
    setSheetProblem("");
    setSheet("date");
  }
  /** A date that already has a change starts from it; any other date starts from the weekly numbers. */
  function chooseDate(iso: string) {
    const change = slotChange(iso);
    setDate(iso);
    setDateValues(
      change
        ? {
            total: change.totalCapacityUnits,
            subscriber: change.subscriptionCapacityUnits,
            salesEnabled: true,
          }
        : values,
    );
    setDateClosed(change?.closed ?? false);
    pickDateDish(dateDishId, iso);
  }
  async function saveDate() {
    if (!date || date < today || (dateKind === "dish" && !dateDishId)) return;
    const saved = await run(
      () =>
        dateKind === "meal"
          ? saveCapacity("overrides/slots", {
              serviceDate: date,
              mealSlotCode: slot,
              totalCapacityUnits: dateValues.total,
              subscriptionCapacityUnits: dateValues.subscriber,
              closed: dateClosed,
              reason: "Date override updated by Chef in Craves web",
            })
          : saveCapacity("overrides/menu-items", {
              menuItemId: dateDishId,
              serviceDate: date,
              mealSlotCode: slot,
              maxSubscriptionUnits: dateDishMax,
              closed: dateDishClosed,
              reason: "Dish date override updated by Chef in Craves web",
            }),
      "Date saved",
      setSheetProblem,
    );
    if (saved) setSheet(null);
  }

  if (unpublished)
    return (
      <ComingSoon
        title="Daily limits are on their way"
        message="You’ll be able to set how many plates you cook each day in a coming update."
      />
    );
  if (loadError) {
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title="Couldn’t load your daily limits"
          text={loadError}
          action={
            <button type="button" className="chef-btn" onClick={() => void load()}>
              Try again
            </button>
          }
        />
      </ChefSection>
    );
  }
  if (!data) return <ChefLoading shape="form" head={false} label="Loading your daily limits" />;

  const setValues = (next: PlateValues) => {
    setEdits((current) => ({ ...current, [slot]: next }));
    setUnsaved((current) => (current.includes(slot) ? current : [...current, slot]));
  };
  const changes = dateChangeLines(
    data.dateOverrides,
    data.menuItemDateOverrides,
    slot,
    today,
    dishName,
  );
  const dishOptions = dishes.map((item) => ({ value: item.id, label: item.itemName }));

  return (
    <div className="chef-stack">
      {frozen ? (
        <ChefNotice icon={Lock} tone="danger" role="alert">
          Craves has paused new subscriptions for now.
          {data.freezeReason ? ` ${data.freezeReason}` : ""}
        </ChefNotice>
      ) : null}
      <p className="chef-section-note px-1">
        These limits cover your whole kitchen, across all your meal plans.
      </p>
      <ChefChoiceChips
        legend="Meal"
        name="limits-meal"
        value={slot}
        onChange={setSlotChoice}
        options={MEAL_SLOTS.map((code) => ({ value: code, label: mealSlotLabel(code) }))}
      />
      <ChefSection title={limitHeading(slot, days)}>
        <fieldset disabled={frozen} className="min-w-0 divide-y divide-[#E3E6EA]">
          <Row title="Total plates" hint="All orders together">
            <PlateStepper
              name="Total plates"
              value={values.total}
              onChange={(total) => setValues(setTotalPlates(values, total))}
            />
          </Row>
          <Row title="Kept for subscribers" hint="The rest are for normal orders">
            <PlateStepper
              name="Kept for subscribers"
              value={values.subscriber}
              onChange={(subscriber) => setValues(setSubscriberPlates(values, subscriber))}
            />
          </Row>
          <SwitchRow
            title="New subscribers can join"
            value={values.salesEnabled}
            onChange={(salesEnabled) => setValues({ ...values, salesEnabled })}
          />
        </fieldset>
        <div aria-hidden="true" className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          <span className="bg-[#F62E18]" style={{ flexGrow: bar.booked }} />
          <span className="bg-[#F62E18]/30" style={{ flexGrow: bar.free }} />
          <span className="bg-[#E3E6EA]" style={{ flexGrow: bar.normal }} />
        </div>
        <p className="chef-section-note mt-1.5">{capacityCaption(bar)}</p>
        {server.mixed ? (
          <Warning>
            Your days have different limits now. Saving sets them all to these numbers.
          </Warning>
        ) : null}
        {server.deficit > 0 ? (
          <Warning>
            Subscribers have booked more plates than this limit. Raise it so every subscriber is
            served.
          </Warning>
        ) : null}
      </ChefSection>
      <ul className="chef-section chef-list">
        <li>
          <button
            type="button"
            className="chef-row w-full !rounded-none !border-0 !bg-transparent"
            onClick={openDishSheet}
          >
            <span className="chef-row-icon">
              <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="chef-row-main">
              <span className="chef-row-title block">Limits per dish</span>
              <span className="chef-row-meta block">
                {dishLimitSummary(data.menuItemRules, slot, days, dishName)}
              </span>
            </span>
            <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
          </button>
        </li>
        <li>
          <button
            type="button"
            className="chef-row w-full !rounded-none !border-0 !bg-transparent"
            onClick={openDateSheet}
          >
            <span className="chef-row-icon">
              <CalendarDays className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="chef-row-main">
              <span className="chef-row-title block">Change a single date</span>
              <span className="chef-row-meta block">Festival, holiday or fewer plates</span>
            </span>
            <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <button
        type="button"
        className="chef-btn is-primary is-tall w-full sm:w-auto"
        disabled={frozen || busy}
        aria-busy={busy && sheet === null}
        onClick={() => void saveLimits()}
      >
        {busy && sheet === null ? "Saving…" : "Save"}
      </button>
      <Problem text={mainProblem} />
      <ChefFlash message={notice} onClose={() => setNotice("")} />

      <Sheet
        open={sheet === "dish"}
        onOpenChange={(open) => !open && setSheet(null)}
        title="Limits per dish"
        description={`For ${slotName}. Subscribers can’t order more of a dish than this each day.`}
        busy={busy}
      >
        {/* Sheets open outside the chef page: the theme brings the chef chips and buttons along. */}
        <div className="chef-panel-theme chef-sheet-theme">
          {dishes.length === 0 ? (
            <p className="mt-4 text-sm text-[#6B6B6B]">Turn on a dish on your menu first.</p>
          ) : (
            <fieldset disabled={frozen} className="mt-4 grid min-w-0 gap-3">
              <ChefChoiceChips
                legend="Dish"
                name="limits-dish"
                value={dishId ?? ""}
                onChange={pickDish}
                options={dishOptions}
              />
              <Row title="Most plates a day">
                <PlateStepper
                  name="Plates of this dish"
                  value={dishMax}
                  onChange={(max) => setDishMax(clampPlates(max))}
                />
              </Row>
              <SwitchRow
                title="Subscribers can order this dish"
                value={dishOn}
                onChange={setDishOn}
              />
              {dishLimitsFor(dishId)?.mixed ? (
                <Warning>
                  Your days have different limits for this dish now. Saving sets them all to these
                  numbers.
                </Warning>
              ) : null}
              <button
                type="button"
                className="chef-btn is-primary"
                disabled={frozen || busy}
                aria-busy={busy}
                onClick={() => void saveDish()}
              >
                {busy ? "Saving…" : "Save dish limit"}
              </button>
              <Problem text={sheetProblem} />
            </fieldset>
          )}
        </div>
      </Sheet>

      <Sheet
        open={sheet === "date"}
        onOpenChange={(open) => !open && setSheet(null)}
        title="Change a single date"
        description={`For ${slotName}.`}
        busy={busy}
      >
        <div className="chef-panel-theme chef-sheet-theme">
          <fieldset disabled={frozen} className="mt-4 grid min-w-0 gap-3">
            <div>
              <label htmlFor="limits-date" className="chef-field-label">
                Date
              </label>
              <input
                id="limits-date"
                type="date"
                min={today}
                value={date}
                onChange={(event) => event.target.value && chooseDate(event.target.value)}
                className={`${FIELD} mt-2`}
              />
              <p className="mt-1.5 font-semibold text-[#1A1A1A]" aria-live="polite">
                {date ? `Changing ${dayLabel(date, today)}` : "Pick the day you want to change."}
              </p>
            </div>
            {date && (dateKind === "meal" ? slotChange(date) : dishChange(date, dateDishId)) ? (
              <Warning>This date already has a change. Saving replaces it.</Warning>
            ) : null}
            {dishes.length > 0 ? (
              <ChefChoiceChips
                legend="Change"
                name="limits-date-kind"
                value={dateKind}
                onChange={setDateKind}
                options={[
                  { value: "meal", label: "Whole meal" },
                  { value: "dish", label: "One dish" },
                ]}
              />
            ) : null}
            {dateKind === "meal" ? (
              <>
                <Row title="Total plates">
                  <PlateStepper
                    name="Total plates that day"
                    value={dateValues.total}
                    onChange={(total) => setDateValues(setTotalPlates(dateValues, total))}
                  />
                </Row>
                <Row title="Kept for subscribers">
                  <PlateStepper
                    name="Kept for subscribers that day"
                    value={dateValues.subscriber}
                    onChange={(subscriber) =>
                      setDateValues(setSubscriberPlates(dateValues, subscriber))
                    }
                  />
                </Row>
                <SwitchRow
                  title={`Close ${slotName} on this day`}
                  hint="Your other meals are not changed."
                  value={dateClosed}
                  onChange={setDateClosed}
                />
              </>
            ) : (
              <>
                <ChefChoiceChips
                  legend="Dish"
                  name="limits-date-dish"
                  value={dateDishId ?? ""}
                  onChange={(id) => pickDateDish(id)}
                  options={dishOptions}
                />
                <Row title="Most plates">
                  <PlateStepper
                    name="Plates of this dish that day"
                    value={dateDishMax}
                    onChange={(max) => setDateDishMax(clampPlates(max))}
                  />
                </Row>
                <SwitchRow
                  title="Close this dish on this day"
                  hint="It stays on your menu."
                  value={dateDishClosed}
                  onChange={setDateDishClosed}
                />
              </>
            )}
            <button
              type="button"
              className="chef-btn is-primary"
              disabled={
                !date || date < today || (dateKind === "dish" && !dateDishId) || frozen || busy
              }
              aria-busy={busy}
              onClick={() => void saveDate()}
            >
              {busy ? "Saving…" : "Save date"}
            </button>
            <Problem text={sheetProblem} />
          </fieldset>
          {changes.length > 0 ? (
            <section aria-labelledby="limits-changes" className="mt-5 grid gap-1">
              <h3 id="limits-changes" className="font-semibold text-[#1A1A1A]">
                Dates you’ve changed
              </h3>
              <ul className="grid gap-0.5">
                {changes.map((line) => (
                  <li key={line} className="chef-section-note">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}
