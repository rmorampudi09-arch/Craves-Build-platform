"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Gauge,
  Plus,
  SearchX,
  UtensilsCrossed,
} from "lucide-react";
import {
  isComingSoon,
  loadChefMenu,
  loadMealPlans,
  loadMealSchedule,
  setAcceptingSubscribers,
} from "@/features/chef/api/chef-meal-plans";
import { ChefAccessRetry } from "@/features/chef/components/chef-account-menu";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import {
  ChefMealPlanEditor,
  dishPhoto,
  type MenuState,
} from "@/features/chef/components/chef-meal-plan-editor";
import { ChefMenuViews } from "@/features/chef/components/chef-menu-views";
import {
  ChefEmpty,
  ChefFlash,
  ChefNotice,
  ChefPageHead,
  ChefPill,
  ChefSection,
} from "@/features/chef/components/chef-ui";
import { chefErrorText, isChefAccessText } from "@/features/chef/lib/chef-errors";
import type { ChefMenuItem } from "@/features/chef/lib/chef-menu-contract";
import {
  acceptingSubscribersValue,
  chefPlanCounts,
  chefPlanMetaLine,
  chefPlanPriceLabel,
  chefPlanStatus,
  filterChefPlans,
  subscriberCountLabel,
  type ChefPlanFilter,
} from "@/features/chef/lib/chef-meal-plans";
import type {
  ChefMealPlan,
  ChefMealSchedule,
} from "@/features/chef/lib/chef-subscription-plan-contract";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";

const FILTERS: readonly [ChefPlanFilter, string][] = [
  ["ALL", "All"],
  ["LIVE", "Live"],
  ["WAITING", "Waiting approval"],
  ["DRAFTS", "Drafts"],
];

/**
 * The chef's meal plans: on /chef/meal-plans (from More) and as the Meal plans side of the Menu tab (`inMenu`).
 * A plan opens in the editor in place of the list, like a dish.
 */
export function ChefSubscriptionPlanManager({ inMenu = false }: { inMenu?: boolean }) {
  const [plans, setPlans] = useState<ChefMealPlan[] | null>(null);
  const [schedules, setSchedules] = useState<Record<string, ChefMealSchedule | null>>({});
  const [loadError, setLoadError] = useState("");
  const [comingSoon, setComingSoon] = useState(false);
  const [menuItems, setMenuItems] = useState<ChefMenuItem[]>([]);
  const [menuStatus, setMenuStatus] = useState<MenuState["status"]>("loading");
  const [filter, setFilter] = useState<ChefPlanFilter>("ALL");
  const [editing, setEditing] = useState<{ plan: ChefMealPlan | null; step: 1 | 2 } | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await loadMealPlans();
      setPlans(next);
      setLoadError("");
      // Each card's meals and cover photo; a plan whose meals don't load just shows its frequency.
      const loaded = await Promise.all(
        next.map((plan) =>
          loadMealSchedule(plan.id).then(
            (schedule) => [[plan.id, schedule] as const],
            () => [],
          ),
        ),
      );
      setSchedules(Object.fromEntries(loaded.flat()));
    } catch (error) {
      if (isComingSoon(error)) setComingSoon(true);
      else setLoadError(chefErrorText(error, "Your meal plans couldn’t load."));
    }
  }, []);
  const loadMenu = useCallback(async () => {
    setMenuStatus("loading");
    try {
      setMenuItems(await loadChefMenu());
      setMenuStatus("ready");
    } catch {
      setMenuStatus("error");
    }
  }, []);
  useEffect(() => {
    void load();
    void loadMenu();
  }, [load, loadMenu]);

  const menu = useMemo<MenuState>(
    () => ({ items: menuItems, status: menuStatus, retry: () => void loadMenu() }),
    [menuItems, menuStatus, loadMenu],
  );
  const counts = useMemo(() => chefPlanCounts(plans ?? []), [plans]);
  const shown = useMemo(() => filterChefPlans(plans ?? [], filter), [plans, filter]);

  function closeEditor(message?: string) {
    setEditing(null);
    if (message) setNotice(message);
    void load();
  }

  if (editing)
    return (
      <ChefMealPlanEditor
        plan={editing.plan}
        initialStep={editing.step}
        menu={menu}
        onClose={closeEditor}
      />
    );

  const newPlan = (
    <button
      type="button"
      className="chef-btn is-primary"
      disabled={comingSoon}
      onClick={() => setEditing({ plan: null, step: 1 })}
    >
      <Plus className="h-5 w-5" aria-hidden="true" /> New plan
    </button>
  );

  let body;
  if (comingSoon) {
    body = (
      <ComingSoon
        title="Meal plans are on their way"
        message="Soon customers can order your food for a whole week or month. We’ll tell you when it’s ready."
      />
    );
  } else if (loadError && !plans) {
    body = (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title="Couldn’t load your meal plans"
          text={loadError}
          action={
            isChefAccessText(loadError) ? (
              <ChefAccessRetry onRetry={() => void load()} />
            ) : (
              <button type="button" className="chef-btn" onClick={() => void load()}>
                Try again
              </button>
            )
          }
        />
      </ChefSection>
    );
  } else if (!plans) {
    body = <ChefLoading shape="plans" head={false} label="Loading your meal plans" />;
  } else if (plans.length === 0) {
    body = (
      <ChefSection>
        <ChefEmpty
          icon={CalendarDays}
          title="No meal plans yet"
          text="Create a weekly or monthly plan from dishes on your menu."
          action={
            <button
              type="button"
              className="chef-btn is-primary"
              onClick={() => setEditing({ plan: null, step: 1 })}
            >
              Create a plan
            </button>
          }
        />
      </ChefSection>
    );
  } else {
    body = (
      <>
        <div role="group" aria-label="Show plans" className="chef-chips">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="chef-chip"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} <span className="tabular-nums opacity-70">{counts[value]}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <ChefSection>
            <ChefEmpty
              icon={SearchX}
              title="No plans here"
              text="Try another filter."
              action={
                <button type="button" className="chef-btn" onClick={() => setFilter("ALL")}>
                  Show all plans
                </button>
              }
            />
          </ChefSection>
        ) : (
          <ul className="grid gap-3">
            {shown.map((plan) => {
              const items = schedules[plan.id]?.items;
              const cover = items?.[0]
                ? dishPhoto(menuItems.find((item) => item.id === items[0].menuItemId))
                : null;
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  items={items}
                  photoUrl={plan.imageUrl ?? cover}
                  onOpen={() => setEditing({ plan, step: 1 })}
                  onSchedule={() => setEditing({ plan, step: 2 })}
                  onChanged={(updated) =>
                    setPlans(
                      (current) =>
                        current?.map((item) => (item.id === updated.id ? updated : item)) ??
                        current,
                    )
                  }
                />
              );
            })}
          </ul>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {inMenu ? (
        <ChefPageHead title="Menu" action={newPlan} />
      ) : (
        <ChefPageHead
          title="Meal plans"
          back={{ href: "/chef/profile", label: "More" }}
          action={newPlan}
        />
      )}
      <div className="chef-stack">
        {inMenu ? <ChefMenuViews current="plans" /> : null}
        {body}
      </div>
      <ChefFlash message={notice} onClose={() => setNotice("")} />
    </div>
  );
}

function PlanCard({
  plan,
  items,
  photoUrl,
  onOpen,
  onSchedule,
  onChanged,
}: {
  plan: ChefMealPlan;
  items: ChefMealSchedule["items"] | undefined;
  photoUrl: string | null;
  onOpen(): void;
  onSchedule(): void;
  onChanged(plan: ChefMealPlan): void;
}) {
  const status = chefPlanStatus(plan.status);
  const accepting = acceptingSubscribersValue(plan);
  // The position the chef just chose, shown until the server answers (success replaces the plan, failure reverts).
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [toggleError, setToggleError] = useState("");
  const shown = chosen ?? accepting;
  const count = subscriberCountLabel(plan.activeSubscriberCount);
  const price = chefPlanPriceLabel(plan);

  async function toggle(next: boolean) {
    setChosen(next);
    setToggleError("");
    try {
      onChanged(await setAcceptingSubscribers(plan.id, next));
    } catch (error) {
      setToggleError(
        isComingSoon(error)
          ? "Coming soon: you can’t change this here yet."
          : chefErrorText(error, "That didn’t save. Try again."),
      );
    } finally {
      setChosen(null);
    }
  }

  return (
    <li className="chef-section overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start gap-3 p-3 text-left md:p-4"
        aria-label={`${plan.name}, ${status.label}, ${price.replace(" / ", " per ")}`}
        onClick={onOpen}
      >
        <span className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-[14px] bg-[#F1F3F5]">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-[#6B6B6B]">
              <UtensilsCrossed className="size-7" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 font-bold text-[#1A1A1A] [overflow-wrap:anywhere]">
              {plan.name}
            </span>
            <ChefPill tone={status.tone}>{status.label}</ChefPill>
          </span>
          <span className="mt-0.5 block truncate text-sm text-[#6B6B6B]">
            {chefPlanMetaLine(plan.billingPeriod, items)}
          </span>
          <span className="chef-amount mt-1 block font-bold text-[#1A1A1A]">{price}</span>
        </span>
      </button>

      {plan.status === "PENDING_APPROVAL" || plan.status === "REJECTED" ? (
        <div className="px-3 pb-3 md:px-4">
          {plan.status === "PENDING_APPROVAL" ? (
            <ChefNotice icon={Clock3}>
              Craves is checking this plan. You can’t edit it until then.
            </ChefNotice>
          ) : (
            <ChefNotice icon={AlertTriangle}>
              {plan.reviewReason
                ? `Craves asked for changes: ${plan.reviewReason}`
                : "Craves asked for changes. Update the plan and submit it again."}
            </ChefNotice>
          )}
        </div>
      ) : null}

      {shown !== null ? (
        <div className="chef-setting-row px-3 pb-3 md:px-4">
          <div className="min-w-0 flex-1">
            {count ? <p className="text-sm font-bold text-[#1A1A1A]">{count}</p> : null}
            <p id={`plan-${plan.id}-accepting`} className="text-sm text-[#6B6B6B]">
              {shown ? "Taking new subscribers" : "Not taking new subscribers"}
            </p>
            {shown ? null : (
              <p className="text-xs text-[#6B6B6B]">Current subscribers keep getting meals.</p>
            )}
          </div>
          <AppleSwitch
            tone="go"
            size="md"
            aria-label={`${plan.name} taking new subscribers`}
            checked={shown}
            disabled={chosen !== null}
            aria-busy={chosen !== null}
            onCheckedChange={(next) => void toggle(next)}
          />
        </div>
      ) : null}
      {/* Outside the switch row: a 409 can flip the plan out of Live, which hides the row but must keep the message. */}
      <p
        role="status"
        className="px-3 text-sm font-semibold text-[#C4200F] md:px-4 [&:not(:empty)]:pb-3"
      >
        {toggleError}
      </p>

      {plan.status === "ACTIVE" ? (
        <div className="grid grid-cols-2 border-t border-[#E3E6EA]">
          <button
            type="button"
            className="flex min-h-12 items-center justify-center gap-2 font-bold text-[#1A1A1A]"
            onClick={onSchedule}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Schedule
          </button>
          <Link
            href={`/chef/capacity?plan=${plan.id}`}
            className="flex min-h-12 items-center justify-center gap-2 border-l border-[#E3E6EA] font-bold text-[#1A1A1A]"
          >
            <Gauge className="h-4 w-4" aria-hidden="true" /> Daily limits
          </Link>
        </div>
      ) : null}
    </li>
  );
}
