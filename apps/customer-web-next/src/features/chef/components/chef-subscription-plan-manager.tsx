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
import { ChefPageHeader } from "@/features/chef/components/chef-page-header";
import {
  ChefEmpty,
  ChefFlash,
  ChefNotice,
  ChefPill,
  ChefSection,
} from "@/features/chef/components/chef-ui";
import { ChefError, chefErrorText, isChefAccessText } from "@/features/chef/lib/chef-errors";
import type { ChefMenuItem } from "@/features/chef/lib/chef-menu-contract";
import {
  acceptingSubscribersValue,
  chefPlanCounts,
  chefPlanMetaLine,
  chefPlanPriceLabel,
  chefPlanStatus,
  filterChefPlans,
  formatPlanPrice,
  perBillingUnit,
  sortScheduleItems,
  subscriberCountLabel,
  type ChefPlanFilter,
} from "@/features/chef/lib/chef-meal-plans";
import type {
  ChefMealPlan,
  ChefMealSchedule,
} from "@/features/chef/lib/chef-subscription-plan-contract";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";

const TEXT = messages({
  en: {
    ALL: "All", LIVE: "Live", WAITING: "Waiting approval", DRAFTS: "Drafts",
    loadFailed: "Your meal plans couldn’t load.", newPlan: "New plan",
    soonTitle: "Meal plans are on their way", soonText: "Soon customers can order your food for a whole week or month. We’ll tell you when it’s ready.",
    loadTitle: "Couldn’t load your meal plans", tryAgain: "Try again", loading: "Loading your meal plans",
    emptyTitle: "No meal plans yet", emptyText: "Create a weekly or monthly plan from dishes on your menu.", create: "Create a plan",
    showPlans: "Show plans", noneHere: "No plans here", otherFilter: "Try another filter.", showAll: "Show all plans",
    soonToggle: "Coming soon: you can’t change this here yet.", toggleFailed: "That didn’t save. Try again.",
    checking: "Craves is checking this plan. You can’t edit it until then.",
    changesReason: "Craves asked for changes: {reason}", changes: "Craves asked for changes. Update the plan and submit it again.",
    taking: "Taking new subscribers", notTaking: "Not taking new subscribers", keepGetting: "Current subscribers keep getting meals.",
    takingSwitch: "{name} taking new subscribers", schedule: "Schedule", limits: "Daily limits",
  },
  te: {
    ALL: "అన్నీ", LIVE: "నడుస్తోంది", WAITING: "Craves చూస్తోంది", DRAFTS: "డ్రాఫ్ట్‌లు",
    loadFailed: "మీ మీల్ ప్లాన్‌లు లోడ్ కాలేదు.", newPlan: "కొత్త ప్లాన్",
    soonTitle: "మీల్ ప్లాన్‌లు త్వరలో వస్తున్నాయి", soonText: "త్వరలో కస్టమర్లు మీ ఆహారాన్ని వారం లేదా నెల మొత్తానికి ఆర్డర్ చేయవచ్చు. సిద్ధమైనప్పుడు మీకు చెబుతాం.",
    loadTitle: "మీ మీల్ ప్లాన్‌లు లోడ్ కాలేదు", tryAgain: "మళ్లీ ప్రయత్నించండి", loading: "మీ మీల్ ప్లాన్‌లు లోడ్ అవుతున్నాయి",
    emptyTitle: "ఇంకా మీల్ ప్లాన్‌లు లేవు", emptyText: "మీ మెనూలోని వంటకాలతో వారానికో, నెలకో ఒక ప్లాన్ చేయండి.", create: "ప్లాన్ తయారు చేయండి",
    showPlans: "చూపించాల్సిన ప్లాన్‌లు", noneHere: "ఇక్కడ ప్లాన్‌లు లేవు", otherFilter: "వేరే ఎంపిక చూడండి.", showAll: "అన్ని ప్లాన్‌లు చూపించండి",
    soonToggle: "త్వరలో వస్తుంది: ఇది ఇంకా ఇక్కడ మార్చలేరు.", toggleFailed: "సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.",
    checking: "Craves ఈ ప్లాన్ చూస్తోంది. అప్పటివరకు మీరు మార్చలేరు.",
    changesReason: "Craves మార్పులు అడిగింది: {reason}", changes: "Craves మార్పులు అడిగింది. ప్లాన్ మార్చి మళ్లీ పంపండి.",
    taking: "కొత్త సబ్‌స్క్రైబర్లను తీసుకుంటున్నారు", notTaking: "కొత్త సబ్‌స్క్రైబర్లను తీసుకోవడం లేదు", keepGetting: "ఇప్పుడున్న సబ్‌స్క్రైబర్లకు భోజనం వస్తూనే ఉంటుంది.",
    takingSwitch: "{name} — కొత్త సబ్‌స్క్రైబర్లను తీసుకుంటున్నారు", schedule: "షెడ్యూల్", limits: "రోజువారీ పరిమితి",
  },
  kn: {
    ALL: "ಎಲ್ಲಾ", LIVE: "ಚಾಲ್ತಿಯಲ್ಲಿದೆ", WAITING: "Craves ಪರಿಶೀಲಿಸುತ್ತಿದೆ", DRAFTS: "ಡ್ರಾಫ್ಟ್‌ಗಳು",
    loadFailed: "ನಿಮ್ಮ ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ.", newPlan: "ಹೊಸ ಪ್ಲಾನ್",
    soonTitle: "ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ", soonText: "ಶೀಘ್ರದಲ್ಲೇ ಗ್ರಾಹಕರು ನಿಮ್ಮ ಊಟವನ್ನು ಇಡೀ ವಾರ ಅಥವಾ ತಿಂಗಳಿಗೆ ಆರ್ಡರ್ ಮಾಡಬಹುದು. ಸಿದ್ಧವಾದಾಗ ನಿಮಗೆ ತಿಳಿಸುತ್ತೇವೆ.",
    loadTitle: "ನಿಮ್ಮ ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", loading: "ನಿಮ್ಮ ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ",
    emptyTitle: "ಇನ್ನೂ ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳಿಲ್ಲ", emptyText: "ನಿಮ್ಮ ಮೆನುವಿನ ಖಾದ್ಯಗಳಿಂದ ವಾರದ ಅಥವಾ ತಿಂಗಳ ಪ್ಲಾನ್ ಮಾಡಿ.", create: "ಪ್ಲಾನ್ ತಯಾರಿಸಿ",
    showPlans: "ತೋರಿಸಬೇಕಾದ ಪ್ಲಾನ್‌ಗಳು", noneHere: "ಇಲ್ಲಿ ಪ್ಲಾನ್‌ಗಳಿಲ್ಲ", otherFilter: "ಬೇರೆ ಆಯ್ಕೆ ನೋಡಿ.", showAll: "ಎಲ್ಲಾ ಪ್ಲಾನ್‌ಗಳನ್ನು ತೋರಿಸಿ",
    soonToggle: "ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ: ಇದನ್ನು ಇನ್ನೂ ಇಲ್ಲಿ ಬದಲಾಯಿಸಲಾಗದು.", toggleFailed: "ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    checking: "Craves ಈ ಪ್ಲಾನ್ ಪರಿಶೀಲಿಸುತ್ತಿದೆ. ಅಲ್ಲಿಯವರೆಗೆ ನೀವು ಬದಲಾಯಿಸಲಾಗದು.",
    changesReason: "Craves ಬದಲಾವಣೆ ಕೇಳಿದೆ: {reason}", changes: "Craves ಬದಲಾವಣೆ ಕೇಳಿದೆ. ಪ್ಲಾನ್ ಬದಲಾಯಿಸಿ ಮತ್ತೆ ಕಳುಹಿಸಿ.",
    taking: "ಹೊಸ ಚಂದಾದಾರರನ್ನು ತೆಗೆದುಕೊಳ್ಳಲಾಗುತ್ತಿದೆ", notTaking: "ಹೊಸ ಚಂದಾದಾರರನ್ನು ತೆಗೆದುಕೊಳ್ಳುತ್ತಿಲ್ಲ", keepGetting: "ಈಗಿರುವ ಚಂದಾದಾರರಿಗೆ ಊಟ ಬರುತ್ತಲೇ ಇರುತ್ತದೆ.",
    takingSwitch: "{name} — ಹೊಸ ಚಂದಾದಾರರನ್ನು ತೆಗೆದುಕೊಳ್ಳಲಾಗುತ್ತಿದೆ", schedule: "ವೇಳಾಪಟ್ಟಿ", limits: "ದಿನದ ಮಿತಿ",
  },
});

const FILTERS: readonly ChefPlanFilter[] = ["ALL", "LIVE", "WAITING", "DRAFTS"];

/**
 * The chef's meal plans: the Meal plans side of the Menu tab (`inMenu`), and /chef/meal-plans for older links.
 * A plan opens in the editor in place of the list, like a dish.
 */
export function ChefSubscriptionPlanManager({ inMenu = false }: { inMenu?: boolean }) {
  const text = useText(TEXT);
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
      else setLoadError(chefErrorText(error, text.loadFailed));
    }
  }, [text]);
  const loadMenu = useCallback(async () => {
    setMenuStatus("loading");
    try {
      setMenuItems(await loadChefMenu());
      setMenuStatus("ready");
    } catch (error) {
      const noKitchen =
        error instanceof ChefError &&
        error.status === 400 &&
        error.ref === "KITCHEN_PROFILE_REQUIRED";
      setMenuStatus(noKitchen ? "no-kitchen" : "error");
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
      <Plus className="h-5 w-5" aria-hidden="true" /> {text.newPlan}
    </button>
  );

  let body;
  if (comingSoon) {
    body = (
      <ComingSoon
        title={text.soonTitle}
        message={text.soonText}
      />
    );
  } else if (loadError && !plans) {
    body = (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title={text.loadTitle}
          text={loadError}
          action={
            isChefAccessText(loadError) ? (
              <ChefAccessRetry onRetry={() => void load()} />
            ) : (
              <button type="button" className="chef-btn" onClick={() => void load()}>
                {text.tryAgain}
              </button>
            )
          }
        />
      </ChefSection>
    );
  } else if (!plans) {
    body = <ChefLoading shape="plans" head={false} label={text.loading} />;
  } else if (plans.length === 0) {
    body = (
      <ChefSection>
        <ChefEmpty
          icon={CalendarDays}
          title={text.emptyTitle}
          text={text.emptyText}
          action={
            <button
              type="button"
              className="chef-btn is-primary"
              onClick={() => setEditing({ plan: null, step: 1 })}
            >
              {text.create}
            </button>
          }
        />
      </ChefSection>
    );
  } else {
    body = (
      <>
        <div role="group" aria-label={text.showPlans} className="chef-chips">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className="chef-chip"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {text[value]} <span className="tabular-nums opacity-70">{counts[value]}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <ChefSection>
            <ChefEmpty
              icon={SearchX}
              title={text.noneHere}
              text={text.otherFilter}
              action={
                <button type="button" className="chef-btn" onClick={() => setFilter("ALL")}>
                  {text.showAll}
                </button>
              }
            />
          </ChefSection>
        ) : (
          <ul className="grid gap-3">
            {shown.map((plan) => {
              const items = schedules[plan.id]?.items;
              const first = items && sortScheduleItems(items)[0];
              const cover = first
                ? dishPhoto(menuItems.find((item) => item.id === first.menuItemId))
                : null;
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  inMenu={inMenu}
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
        <ChefPageHeader title="Menu" action={newPlan} />
      ) : (
        // Meal plans live in the Menu tab now; this page stays for older links.
        <ChefPageHeader
          title="Meal plans"
          back={{ href: "/chef/menu?view=plans", label: "Menu" }}
          action={newPlan}
        />
      )}
      <div className="chef-stack">
        {inMenu ? (
          <ChefMenuViews
            current="plans"
            counts={{
              dishes: menuStatus === "ready" ? menuItems.length : undefined,
              plans: plans?.length,
            }}
          />
        ) : null}
        {body}
      </div>
      <ChefFlash message={notice} onClose={() => setNotice("")} />
    </div>
  );
}

function PlanCard({
  plan,
  inMenu,
  items,
  photoUrl,
  onOpen,
  onSchedule,
  onChanged,
}: {
  plan: ChefMealPlan;
  inMenu: boolean;
  items: ChefMealSchedule["items"] | undefined;
  photoUrl: string | null;
  onOpen(): void;
  onSchedule(): void;
  onChanged(plan: ChefMealPlan): void;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const status = chefPlanStatus(plan.status, language);
  const accepting = acceptingSubscribersValue(plan);
  // The position the chef just chose, shown until the server answers (success replaces the plan, failure reverts).
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [toggleError, setToggleError] = useState("");
  const shown = chosen ?? accepting;
  const count = subscriberCountLabel(plan.activeSubscriberCount, language);
  const price = chefPlanPriceLabel(plan, language);
  // Screen readers say "₹1,499 per week" for the "₹1,499 / week" on the card.
  const spokenPrice = `${formatPlanPrice(plan.amount, plan.currency)} ${perBillingUnit(plan.billingPeriod, language)}`;

  async function toggle(next: boolean) {
    setChosen(next);
    setToggleError("");
    try {
      onChanged(await setAcceptingSubscribers(plan.id, next));
    } catch (error) {
      setToggleError(
        isComingSoon(error)
          ? text.soonToggle
          : chefErrorText(error, text.toggleFailed),
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
        aria-label={`${plan.name}, ${status.label}, ${spokenPrice}`}
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
          <span className="mt-0.5 block break-words text-sm text-[#6B6B6B]">
            {chefPlanMetaLine(plan.billingPeriod, items, language)}
          </span>
          <span className="chef-amount mt-1 block font-bold text-[#1A1A1A]">{price}</span>
        </span>
      </button>

      {plan.status === "PENDING_APPROVAL" || plan.status === "REJECTED" ? (
        <div className="px-3 pb-3 md:px-4">
          {plan.status === "PENDING_APPROVAL" ? (
            <ChefNotice icon={Clock3}>
              {text.checking}
            </ChefNotice>
          ) : (
            <ChefNotice icon={AlertTriangle}>
              {plan.reviewReason
                ? format(text.changesReason, { reason: plan.reviewReason })
                : text.changes}
            </ChefNotice>
          )}
        </div>
      ) : null}

      {shown !== null ? (
        // Padding on the wrapper: .chef-setting-row's own padding (unlayered CSS) beats Tailwind's px-3.
        <div className="px-3 pb-3 md:px-4"><div className="chef-setting-row">
          <div className="min-w-0 flex-1">
            {count ? <p className="text-sm font-bold text-[#1A1A1A]">{count}</p> : null}
            <p id={`plan-${plan.id}-accepting`} className="text-sm text-[#6B6B6B]">
              {shown ? text.taking : text.notTaking}
            </p>
            {shown ? null : (
              <p className="text-xs text-[#6B6B6B]">{text.keepGetting}</p>
            )}
          </div>
          <AppleSwitch
            tone="go"
            size="md"
            aria-label={format(text.takingSwitch, { name: plan.name })}
            checked={shown}
            disabled={chosen !== null}
            aria-busy={chosen !== null}
            onCheckedChange={(next) => void toggle(next)}
          />
        </div></div>
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
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> {text.schedule}
          </button>
          <Link
            href={`/chef/capacity?plan=${plan.id}${inMenu ? "&from=menu" : ""}`}
            className="flex min-h-12 items-center justify-center gap-2 border-l border-[#E3E6EA] font-bold text-[#1A1A1A]"
          >
            <Gauge className="h-4 w-4" aria-hidden="true" /> {text.limits}
          </Link>
        </div>
      ) : null}
    </li>
  );
}
