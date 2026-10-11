"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parseChefCapacitySummary,
  type ChefCapacitySummary,
} from "@/lib/chef-subscription-capacity-contract";
import {
  parseChefMenuItems,
  type ChefMenuItem,
} from "@/lib/chef-menu-contract";

const DAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [7, "Sunday"],
] as const;

const FOOD_TYPE: Record<string, string> = { VEG: "Veg", NON_VEG: "Non-veg", EGG: "Egg" };
const SLOTS = [
  ["BREAKFAST", "Breakfast"],
  ["LUNCH", "Lunch"],
  ["DINNER", "Dinner"],
  ["SNACK", "Snack"],
] as const;

const DEFAULT_DISH_LIMIT = 5;

function positiveWholeNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100000 ? parsed : null;
}

export function ChefCapacityQuickSetup() {
  const [summary, setSummary] = useState<ChefCapacitySummary | null>(null);
  const [menu, setMenu] = useState<ChefMenuItem[]>([]);
  const [slot, setSlot] = useState("LUNCH");
  const [selectedDays, setSelectedDays] = useState<number[]>(DAYS.map(([value]) => value));
  const [selectedMenuItems, setSelectedMenuItems] = useState<string[]>([]);
  const [dishLimit, setDishLimit] = useState(String(DEFAULT_DISH_LIMIT));
  const [totalOverride, setTotalOverride] = useState("");
  const [subscriptionOverride, setSubscriptionOverride] = useState("");
  const [useSpecificDate, setUseSpecificDate] = useState(false);
  const [specificDate, setSpecificDate] = useState("");
  const [message, setMessage] = useState("Loading your plates…");
  const [busy, setBusy] = useState(false);

  const activeMenu = useMemo(
    () => menu.filter(item => item.status === "ACTIVE" && item.available),
    [menu],
  );

  const load = useCallback(async () => {
    const [capacityResponse, menuResponse] = await Promise.all([
      fetch("/api/chef/subscription-capacity", { cache: "no-store", credentials: "same-origin" }),
      fetch("/api/chef/menu", { cache: "no-store", credentials: "same-origin" }),
    ]);
    const [capacityRaw, menuRaw] = await Promise.all([
      capacityResponse.json().catch(() => null),
      menuResponse.json().catch(() => null),
    ]);

    if (!capacityResponse.ok) {
      throw chefApiError(capacityResponse, capacityRaw, "We couldn’t load your plates. Try again.");
    }
    if (!menuResponse.ok) {
      throw chefApiError(menuResponse, menuRaw, "Your menu could not be loaded.");
    }

    const parsedCapacity = parseChefCapacitySummary(capacityRaw);
    const parsedMenu = parseChefMenuItems(menuRaw);
    if (!parsedCapacity) throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_CAPACITY_RESPONSE", capacityResponse.status);
    if (!parsedMenu) throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_MENU_RESPONSE", menuResponse.status);

    const available = parsedMenu.filter(item => item.status === "ACTIVE" && item.available);
    setSummary(parsedCapacity);
    setMenu(parsedMenu);
    setSelectedMenuItems(current => {
      const validCurrent = current.filter(id => available.some(item => item.id === id));
      return validCurrent.length > 0 ? validCurrent : available.map(item => item.id);
    });
    setMessage("");
  }, []);

  useEffect(() => {
    void load().catch(error => {
      setMessage(chefErrorText(error, "We couldn’t load your plates. Try again."));
    });
  }, [load]);

  const itemLimit = positiveWholeNumber(dishLimit) ?? DEFAULT_DISH_LIMIT;
  const derivedSlotLimit = Math.max(DEFAULT_DISH_LIMIT, selectedMenuItems.length * itemLimit);
  const totalUnits = positiveWholeNumber(totalOverride) ?? derivedSlotLimit;
  const subscriptionUnits = positiveWholeNumber(subscriptionOverride) ?? derivedSlotLimit;

  const readiness = useMemo(
    () => DAYS.map(([day, label]) => {
      const rule = summary?.slotRules.find(
        value => value.isoDayOfWeek === day && value.mealSlotCode === slot,
      );
      const ready = Boolean(rule && rule.salesEnabled && rule.recurringDeficitUnits === 0);
      return { day, label, rule, ready };
    }),
    [summary, slot],
  );

  const readyCount = readiness.filter(item => item.ready).length;
  const allDaysSelected = selectedDays.length === 7;
  const allMenuSelected = activeMenu.length > 0 && selectedMenuItems.length === activeMenu.length;

  function toggleDay(day: number) {
    setSelectedDays(current => current.includes(day)
      ? current.filter(value => value !== day)
      : [...current, day].sort((a, b) => a - b));
  }

  function toggleMenuItem(id: string) {
    setSelectedMenuItems(current => current.includes(id)
      ? current.filter(value => value !== id)
      : [...current, id]);
  }

  async function put(path: string, payload: unknown) {
    const response = await fetch(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw chefApiError(response, body, "We couldn’t save your plates. Try again.");
    }
  }

  async function saveAll() {
    if (selectedDays.length === 0) {
      setMessage("Pick at least one day.");
      return;
    }
    if (selectedMenuItems.length === 0) {
      setMessage("Pick at least one dish.");
      return;
    }
    if (!positiveWholeNumber(dishLimit)) {
      setMessage("Plates for each dish must be a whole number above 0.");
      return;
    }
    if (subscriptionUnits > totalUnits) {
      setMessage("Plates for meal plans can’t be more than all the plates you can cook.");
      return;
    }
    if (useSpecificDate && !specificDate) {
      setMessage("Choose the date you want to change.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      for (const isoDayOfWeek of selectedDays) {
        await put("/api/chef/subscription-capacity/rules/slots", {
          isoDayOfWeek,
          mealSlotCode: slot,
          totalCapacityUnits: totalUnits,
          subscriptionCapacityUnits: subscriptionUnits,
          salesEnabled: true,
          reason: "Chef subscription availability setup",
        });

        for (const menuItemId of selectedMenuItems) {
          await put("/api/chef/subscription-capacity/rules/menu-items", {
            menuItemId,
            isoDayOfWeek,
            mealSlotCode: slot,
            maxSubscriptionUnits: itemLimit,
            salesEnabled: true,
            reason: "Chef subscription availability setup",
          });
        }
      }

      if (useSpecificDate && specificDate) {
        await put("/api/chef/subscription-capacity/overrides/slots", {
          serviceDate: specificDate,
          mealSlotCode: slot,
          totalCapacityUnits: totalUnits,
          subscriptionCapacityUnits: subscriptionUnits,
          closed: false,
          reason: "Chef calendar availability override",
        });

        for (const menuItemId of selectedMenuItems) {
          await put("/api/chef/subscription-capacity/overrides/menu-items", {
            menuItemId,
            serviceDate: specificDate,
            mealSlotCode: slot,
            maxSubscriptionUnits: itemLimit,
            closed: false,
            reason: "Chef calendar availability override",
          });
        }
      }

      await load();
      setMessage(
        `Saved ${slot} availability for ${selectedDays.length} weekday(s) and ${selectedMenuItems.length} dish(es). ` +
        `Each selected dish allows up to ${itemLimit} subscription unit(s).`,
      );
    } catch (error) {
      setMessage(chefErrorText(error, "We couldn’t save your plates. Try again."));
    } finally {
      setBusy(false);
    }
  }

  const slotLabel = SLOTS.find(([value]) => value === slot)?.[1] ?? slot;
  // Today in India: the UTC date is still yesterday until 5:30 am.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="mt-1 font-display text-2xl font-bold text-ink">Change your plates</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You don’t have to do anything here. When you send a meal plan, Craves sets{" "}
            <strong className="text-ink">5 plates for each dish</strong>.
          </p>
        </div>
        <span className="rounded-full bg-success/10 px-3 py-2 text-xs font-bold text-success">
          Craves numbers are on
        </span>
      </div>

      <div className="mt-5 rounded-2xl bg-secondary p-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-semibold text-ink">
            Meal
            <select
              value={slot}
              onChange={event => setSlot(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3"
            >
              {SLOTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="text-sm font-semibold text-ink">
            Plates for each dish
            <input
              type="number"
              min="1"
              value={dishLimit}
              onChange={event => setDishLimit(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-border bg-white px-3"
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Craves uses 5</span>
          </label>

          <div className="text-sm font-semibold text-ink">
            Total plates for this meal
            <div className="mt-2 min-h-11 rounded-xl border border-border bg-white px-3 py-3">
              {derivedSlotLimit} plates
            </div>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Dishes picked × plates for each dish.</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-ink">Days</h3>
              <p className="mt-1 text-xs text-muted-foreground">Monthly plans usually use every day.</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={allDaysSelected}
                onChange={event => setSelectedDays(event.target.checked ? DAYS.map(([value]) => value) : [])}
              />
              All days
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DAYS.map(([day, label]) => (
              <label key={day} className="flex min-h-11 items-center gap-2 rounded-xl bg-secondary px-3 text-sm font-semibold text-ink">
                <input type="checkbox" checked={selectedDays.includes(day)} onChange={() => toggleDay(day)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold text-ink">Dishes</h3>
              <p className="mt-1 text-xs text-muted-foreground">Dishes that are on are picked for you.</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                checked={allMenuSelected}
                disabled={activeMenu.length === 0}
                onChange={event => setSelectedMenuItems(event.target.checked ? activeMenu.map(item => item.id) : [])}
              />
              All dishes
            </label>
          </div>
          {activeMenu.length === 0 ? (
            <p className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm text-[#1A1A1A]">No dishes are on. Turn a dish on in Menu first.</p>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {activeMenu.map(item => (
                <label key={item.id} className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedMenuItems.includes(item.id)}
                    onChange={() => toggleMenuItem(item.id)}
                  />
                  <span><strong>{item.itemName}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.category} · {FOOD_TYPE[item.foodType] ?? item.foodType}</span></span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-border p-4">
        <label className="flex items-start gap-3 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={useSpecificDate}
            onChange={event => setUseSpecificDate(event.target.checked)}
          />
          <span>
            Only for one date
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Use this when one date needs these numbers, not every week.</span>
          </span>
        </label>
        {useSpecificDate && (
          <input
            type="date"
            min={today}
            value={specificDate}
            onChange={event => setSpecificDate(event.target.value)}
            className="mt-3 min-h-11 rounded-xl border border-border px-3"
          />
        )}
      </div>

      <details className="mt-5 rounded-2xl border border-border p-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-ink">More settings</summary>
        <p className="mt-2 text-xs text-muted-foreground">Leave these empty and Craves works them out from the dishes you picked.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-ink">All plates you can cook
            <input type="number" min="1" value={totalOverride} onChange={event => setTotalOverride(event.target.value)} placeholder={String(derivedSlotLimit)} className="mt-2 min-h-11 w-full rounded-xl border border-border px-3" />
          </label>
          <label className="text-sm font-semibold text-ink">Plates for meal plans
            <input type="number" min="1" value={subscriptionOverride} onChange={event => setSubscriptionOverride(event.target.value)} placeholder={String(derivedSlotLimit)} className="mt-2 min-h-11 w-full rounded-xl border border-border px-3" />
          </label>
        </div>
      </details>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || activeMenu.length === 0} aria-busy={busy} onClick={() => void saveAll()} className="chef-btn is-primary">
          {busy ? "Saving…" : "Save plates"}
        </button>
        <p className="text-xs text-muted-foreground">You can skip this. Craves fills in the numbers when you send a meal plan.</p>
      </div>

      {message && <p role="status" className="mt-4 rounded-xl border border-border bg-white p-3 text-sm text-ink">{message}</p>}

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-ink">{slotLabel} every week</h3>
            <p className="mt-1 text-xs text-muted-foreground">Plates set for each day.</p>
          </div>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">{readyCount} of 7 days set</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {readiness.map(item => (
            <div key={item.day} className={`rounded-xl border p-3 ${item.ready ? "border-success/20 bg-success/5" : "border-[#E3E6EA] bg-[#F1F3F5]"}`}>
              <p className="font-bold text-ink">{item.label.slice(0, 3)}</p>
              <p className="mt-1 text-xs">{item.ready ? "Set" : "Craves sets it"}</p>
              {item.rule && <p className="mt-1 text-xs text-muted-foreground">{item.rule.subscriptionCapacityUnits} plates · {item.rule.recurringAvailableUnits} free</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
