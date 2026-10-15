"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock3, LifeBuoy, Pause, Play, Store } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import {
  changeKitchenSchedule,
  scheduleUpdate,
  useKitchenSchedule,
} from "@/features/chef/api/chef-kitchen-schedule";
import { ChefChoiceChips } from "@/features/chef/components/chef-ui";
import { ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen, ChefKitchenInput } from "@/features/chef/lib/chef-kitchen-types";
import {
  formatHoursTime,
  kitchenClock,
  kitchenOpenState,
  pauseEnd,
  type KitchenOpenState,
  type PauseDuration,
} from "@/features/chef/lib/opening-hours";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

const KITCHEN_UPDATE_FAILED =
  "We couldn’t update your kitchen. Check your connection and try again.";
const PAUSES = [
  { value: "30", label: "30 min", button: "Pause for 30 min" },
  { value: "60", label: "1 hour", button: "Pause for 1 hour" },
  { value: "120", label: "2 hours", button: "Pause for 2 hours" },
  { value: "rest-of-day", label: "Rest of today", button: "Pause for the rest of today" },
] as const;
type PauseChoice = (typeof PAUSES)[number]["value"];
const pauseDuration = (choice: PauseChoice): PauseDuration =>
  choice === "rest-of-day" ? choice : (Number(choice) as 30 | 60 | 120);

/** The saved kitchen with only open/closed changed: the same body the kitchen form saves. Nothing else is filled in. */
export function kitchenWithStatus(
  kitchen: ChefKitchen,
  status: "ACTIVE" | "INACTIVE",
): ChefKitchenInput {
  return {
    kitchenName: kitchen.kitchenName,
    displayName: kitchen.displayName,
    description: kitchen.description,
    phoneNumber: kitchen.phoneNumber?.trim() || null,
    email: kitchen.email,
    addressLine1: kitchen.addressLine1,
    addressLine2: kitchen.addressLine2,
    landmark: kitchen.landmark,
    areaName: kitchen.areaName,
    city: kitchen.city,
    state: kitchen.state,
    postalCode: kitchen.postalCode,
    latitude: kitchen.latitude,
    longitude: kitchen.longitude,
    status,
  };
}

/** The card's title and line for each state, as the app's Kitchen status sheet words them. */
function kitchenStatusCopy(state: KitchenOpenState): { title: string; detail: string } {
  switch (state.status) {
    case "open":
      return {
        title: "Open · taking orders",
        detail: state.hoursToday ? `Today ${state.hoursToday}` : "Customers can order now.",
      };
    case "paused":
      return {
        title: state.backAt ? `Paused · back at ${state.backAt}` : "Paused",
        detail: "Orders you’ve already accepted carry on.",
      };
    case "suspended":
      return { title: "Paused by Craves", detail: "Contact Craves support to find out why." };
    default:
      return state.closedReason === "not-accepting"
        ? {
            title: "Closed · not taking orders",
            detail: "Customers can’t order until you start taking orders again.",
          }
        : state.closedReason === "outside-hours"
          ? {
              title: state.opensAt ? `Closed · opens ${state.opensAt}` : "Closed",
              detail: "Your kitchen opens again by its opening hours.",
            }
          : { title: "Closed", detail: "Customers can’t order until you open it." };
  }
}

/** The time to the minute, so a pause ends and the hours turn over on screen; it stops while the tab is hidden. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const sync = () => {
      window.clearInterval(timer);
      if (document.hidden) return;
      setNow(new Date());
      timer = window.setInterval(() => setNow(new Date()), 30_000);
    };
    document.addEventListener("visibilitychange", sync);
    if (!document.hidden) timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return now;
}

/** Taking orders in one tap, a short pause, and why a closed kitchen is closed. */
export function ChefKitchenSwitch({
  kitchen,
  onChange,
}: {
  kitchen: ChefKitchen;
  onChange(kitchen: ChefKitchen): void;
}) {
  const view = useKitchenSchedule();
  // Without the schedule (still loading, not live yet, or failed) the switch works as open/closed only.
  const schedule = view.state === "ready" ? view.schedule : null;
  const now = useMinuteClock();
  const state = kitchenOpenState(kitchen.status, schedule, now);
  const copy = kitchenStatusCopy(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; kitchenLink: boolean } | null>(null);
  const [done, setDone] = useState("");
  const [pausing, setPausing] = useState(false);
  const [choice, setChoice] = useState<PauseChoice>("60");
  const suspended = state.status === "suspended";
  const option = PAUSES.find((candidate) => candidate.value === choice) ?? PAUSES[1];
  const opensAgain =
    !schedule || choice === "rest-of-day"
      ? "tomorrow"
      : `at ${formatHoursTime(kitchenClock(new Date(now.getTime() + Number(choice) * 60_000), schedule.timezoneId).time)}`;

  async function run(
    action: () => Promise<void>,
    success: string,
    kitchenLink = false,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setDone("");
    try {
      await action();
      setDone(success);
      return true;
    } catch (caught) {
      setError({ text: chefErrorText(caught, KITCHEN_UPDATE_FAILED), kitchenLink });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function setOpen(next: boolean) {
    if (suspended) return;
    void run(
      async () => {
        // Start from the kitchen as saved now: the page may have been open for hours, and an
        // edit made elsewhere since then must not be written back over.
        const latestResponse = await sessionFetch("/api/chef/kitchen", { cache: "no-store" });
        const latest = latestResponse.ok
          ? parseChefKitchen(await latestResponse.json().catch(() => null))
          : null;
        if (!latest)
          throw chefApiError(latestResponse, null, "We couldn’t check your kitchen. Try again.");
        if (latest.status === "SUSPENDED") {
          onChange(latest);
          return;
        }
        const target = next ? "ACTIVE" : "INACTIVE";
        if (latest.status === target) onChange(latest);
        else {
          const response = await sessionFetch("/api/chef/kitchen", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(kitchenWithStatus(latest, target)),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            throw chefApiError(
              response,
              body,
              next
                ? "Your kitchen didn’t open. Check its pickup address and phone, then try again."
                : "Your kitchen didn’t close. Try again.",
            );
          }
          const saved = parseChefKitchen(body);
          if (!saved)
            throw new ChefError(
              "We couldn’t confirm the change. Refresh to check your kitchen.",
              "INVALID_KITCHEN_RESPONSE",
              response.status,
            );
          onChange(saved);
        }
        if (next && schedule) {
          // Opening also takes orders again when the schedule had stopped them. A schedule that can't be read
          // only matters when the copy on screen said orders were off.
          await changeKitchenSchedule(
            (fresh) =>
              fresh.acceptingOrders ? null : scheduleUpdate(fresh, { acceptingOrders: true }),
            KITCHEN_UPDATE_FAILED,
          ).catch((caught: unknown) => {
            if (!schedule.acceptingOrders) throw caught;
          });
        }
      },
      next ? "Your kitchen is open" : "Your kitchen is closed",
      true,
    );
  }

  async function pause() {
    const paused = await run(
      () =>
        changeKitchenSchedule(
          (fresh) =>
            scheduleUpdate(fresh, {
              pausedUntil: pauseEnd(
                pauseDuration(choice),
                new Date(),
                fresh.timezoneId,
              ).toISOString(),
              pauseReason: "Paused by chef",
            }),
          KITCHEN_UPDATE_FAILED,
        ),
      "New orders paused",
    );
    if (paused) setPausing(false);
  }

  const resume = () =>
    void run(
      () =>
        changeKitchenSchedule(
          (fresh) => scheduleUpdate(fresh, { pausedUntil: null, pauseReason: null }),
          KITCHEN_UPDATE_FAILED,
        ),
      "Taking orders again",
    );

  return (
    <section
      className={`chef-kitchen-switch${state.status === "open" ? " is-open" : ""}`}
      aria-labelledby="chef-kitchen-switch-title"
      aria-busy={busy}
    >
      <div className="flex items-center gap-3.5">
        <span className="chef-kitchen-switch-icon">
          <Store className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="chef-kitchen-switch-title" className="chef-kitchen-switch-title">
            {copy.title}
          </h2>
          <p className="chef-section-note mt-0.5 !text-[0.9375rem]">{copy.detail}</p>
        </div>
        <AppleSwitch
          checked={state.takingOrders}
          disabled={suspended}
          aria-disabled={busy || undefined}
          onCheckedChange={(next) => setOpen(next)}
          size="lg"
          tone="go"
          aria-label="Taking orders"
        />
      </div>
      {suspended ? (
        <Link href="/chef/support" className="chef-btn is-small mt-3">
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          Ask Craves why
        </Link>
      ) : null}
      {state.status === "paused" ? (
        <button
          type="button"
          className="chef-btn is-small is-go mt-3"
          disabled={busy}
          aria-busy={busy}
          onClick={resume}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Resume now
        </button>
      ) : null}
      {state.closedReason === "outside-hours" ? (
        <Link href="/chef/operations#chef-hours" className="chef-btn is-small mt-3">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Change opening hours
        </Link>
      ) : null}
      {state.status === "open" && schedule ? (
        <>
          <button
            type="button"
            className="chef-btn is-small mt-3"
            aria-expanded={pausing}
            aria-controls="chef-pause-options"
            onClick={() => setPausing(!pausing)}
          >
            <Pause className="h-4 w-4" aria-hidden="true" />
            Pause new orders
          </button>
          {pausing ? (
            <div id="chef-pause-options" className="mt-4 grid gap-3 border-t border-[#E3E6EA] pt-4">
              <ChefChoiceChips
                legend="Pause new orders for"
                name="chef-pause"
                options={PAUSES}
                value={choice}
                onChange={setChoice}
                disabled={busy}
              />
              <p className="chef-section-note !text-[0.875rem]">
                Orders you’ve already accepted are not affected. Customers see “Opens again{" "}
                {opensAgain}”.
              </p>
              <button
                type="button"
                className="chef-btn is-small is-primary justify-self-start"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void pause()}
              >
                {option.button}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
      <p role="status" className="sr-only">
        {done}
      </p>
      {error ? (
        <p role="alert" className="chef-field-error mt-3 !text-[0.9375rem]">
          {error.text}
          {error.kitchenLink ? (
            <>
              {" "}
              <Link href="/chef/kitchen" className="font-semibold underline underline-offset-2">
                Check kitchen details
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
