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
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";
import { Sheet } from "@/shared/ui/overlays/overlay";

const TEXT = messages({
  en: {
    fewer: "Fewer {name}", more: "More {name}", saveProblem: "We couldn’t save your limits. Try again.", dish: "Dish",
    loadFailed: "Your daily limits couldn’t load.", limitsSaved: "Limits saved", dishSaved: "Dish limit saved", dateSaved: "Date saved",
    soonTitle: "Daily limits are on their way", soonText: "You’ll be able to set how many plates you cook each day in a coming update.",
    loadTitle: "Couldn’t load your daily limits", tryAgain: "Try again", loading: "Loading your daily limits",
    frozen: "Craves has paused new subscriptions for now.", wholeKitchen: "These limits cover your whole kitchen, across all your meal plans.",
    meal: "Meal", total: "Total plates", totalHint: "All orders together", kept: "Kept for subscribers", keptHint: "The rest are for normal orders",
    canJoin: "New subscribers can join",
    mixed: "Your days have different limits now. Saving sets them all to these numbers.",
    deficit: "Subscribers have booked more plates than this limit. Raise it so every subscriber is served.",
    perDish: "Limits per dish", oneDate: "Change a single date", oneDateMeta: "Festival, holiday or fewer plates",
    saving: "Saving…", save: "Save", dishSheet: "For {meal}. Subscribers can’t order more of a dish than this each day.",
    turnOnFirst: "Turn on a dish on your menu first.", mostADay: "Most plates a day", dishPlates: "Plates of this dish",
    dishOn: "Subscribers can order this dish", dishMixed: "Your days have different limits for this dish now. Saving sets them all to these numbers.",
    saveDish: "Save dish limit", dateSheet: "For {meal}.", date: "Date", changing: "Changing {day}", pickDay: "Pick the day you want to change.",
    hasChange: "This date already has a change. Saving replaces it.", change: "Change", wholeMeal: "Whole meal", oneDish: "One dish",
    totalThatDay: "Total plates that day", keptThatDay: "Kept for subscribers that day", closeMeal: "Close {meal} on this day",
    otherMeals: "Your other meals are not changed.", most: "Most plates", dishThatDay: "Plates of this dish that day",
    closeDish: "Close this dish on this day", staysOnMenu: "It stays on your menu.", saveDate: "Save date", changedDates: "Dates you’ve changed",
  },
  te: {
    fewer: "{name} తగ్గించండి", more: "{name} పెంచండి", saveProblem: "మీ పరిమితులు సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.", dish: "వంటకం",
    loadFailed: "మీ రోజువారీ పరిమితి లోడ్ కాలేదు.", limitsSaved: "పరిమితులు సేవ్ అయ్యాయి", dishSaved: "వంటకం పరిమితి సేవ్ అయింది", dateSaved: "తేదీ సేవ్ అయింది",
    soonTitle: "రోజువారీ పరిమితి త్వరలో వస్తుంది", soonText: "రోజుకు ఎన్ని ప్లేట్లు వండాలో త్వరలో వచ్చే అప్‌డేట్‌లో పెట్టుకోవచ్చు.",
    loadTitle: "మీ రోజువారీ పరిమితి లోడ్ కాలేదు", tryAgain: "మళ్లీ ప్రయత్నించండి", loading: "మీ రోజువారీ పరిమితి లోడ్ అవుతోంది",
    frozen: "Craves ప్రస్తుతానికి కొత్త సబ్‌స్క్రిప్షన్లను ఆపింది.", wholeKitchen: "ఈ పరిమితులు మీ వంటగది మొత్తానికి, మీ అన్ని మీల్ ప్లాన్‌లకు వర్తిస్తాయి.",
    meal: "భోజనం", total: "మొత్తం ప్లేట్లు", totalHint: "అన్ని ఆర్డర్లు కలిపి", kept: "సబ్‌స్క్రైబర్లకు ఉంచినవి", keptHint: "మిగతావి మామూలు ఆర్డర్లకు",
    canJoin: "కొత్త సబ్‌స్క్రైబర్లు చేరవచ్చు",
    mixed: "మీ రోజులకు ఇప్పుడు వేర్వేరు పరిమితులు ఉన్నాయి. సేవ్ చేస్తే అన్నింటికీ ఈ సంఖ్యలే వస్తాయి.",
    deficit: "ఈ పరిమితి కంటే ఎక్కువ ప్లేట్లు సబ్‌స్క్రైబర్లు బుక్ చేశారు. ప్రతి సబ్‌స్క్రైబర్‌కు భోజనం అందేలా దీన్ని పెంచండి.",
    perDish: "ఒక్కో వంటకానికి పరిమితి", oneDate: "ఒక్క తేదీ మార్చండి", oneDateMeta: "పండుగ, సెలవు లేదా తక్కువ ప్లేట్లు",
    saving: "సేవ్ అవుతోంది…", save: "సేవ్ చేయండి", dishSheet: "{meal} కోసం. ప్రతి రోజు సబ్‌స్క్రైబర్లు ఒక వంటకాన్ని ఇంతకంటే ఎక్కువ ఆర్డర్ చేయలేరు.",
    turnOnFirst: "ముందు మీ మెనూలో ఒక వంటకం ఆన్ చేయండి.", mostADay: "రోజుకు ఎన్ని ప్లేట్ల వరకు", dishPlates: "ఈ వంటకం ప్లేట్లు",
    dishOn: "సబ్‌స్క్రైబర్లు ఈ వంటకం ఆర్డర్ చేయవచ్చు", dishMixed: "ఈ వంటకానికి మీ రోజుల్లో ఇప్పుడు వేర్వేరు పరిమితులు ఉన్నాయి. సేవ్ చేస్తే అన్నింటికీ ఈ సంఖ్యలే వస్తాయి.",
    saveDish: "వంటకం పరిమితి సేవ్ చేయండి", dateSheet: "{meal} కోసం.", date: "తేదీ", changing: "{day} మారుస్తున్నారు", pickDay: "మీరు మార్చాలనుకునే రోజు ఎంచుకోండి.",
    hasChange: "ఈ తేదీకి ఇప్పటికే ఒక మార్పు ఉంది. సేవ్ చేస్తే దాని స్థానంలో ఇది వస్తుంది.", change: "ఏం మార్చాలి", wholeMeal: "మొత్తం భోజనం", oneDish: "ఒక్క వంటకం",
    totalThatDay: "ఆ రోజు మొత్తం ప్లేట్లు", keptThatDay: "ఆ రోజు సబ్‌స్క్రైబర్లకు ఉంచినవి", closeMeal: "ఈ రోజు {meal} మూసివేయండి",
    otherMeals: "మీ ఇతర భోజనాలు మారవు.", most: "ఎన్ని ప్లేట్ల వరకు", dishThatDay: "ఆ రోజు ఈ వంటకం ప్లేట్లు",
    closeDish: "ఈ రోజు ఈ వంటకం మూసివేయండి", staysOnMenu: "ఇది మీ మెనూలోనే ఉంటుంది.", saveDate: "తేదీ సేవ్ చేయండి", changedDates: "మీరు మార్చిన తేదీలు",
  },
  kn: {
    fewer: "{name} ಕಡಿಮೆ ಮಾಡಿ", more: "{name} ಹೆಚ್ಚಿಸಿ", saveProblem: "ನಿಮ್ಮ ಮಿತಿಗಳನ್ನು ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", dish: "ಖಾದ್ಯ",
    loadFailed: "ನಿಮ್ಮ ದಿನದ ಮಿತಿ ಲೋಡ್ ಆಗಲಿಲ್ಲ.", limitsSaved: "ಮಿತಿಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ", dishSaved: "ಖಾದ್ಯದ ಮಿತಿ ಉಳಿಸಲಾಗಿದೆ", dateSaved: "ದಿನಾಂಕ ಉಳಿಸಲಾಗಿದೆ",
    soonTitle: "ದಿನದ ಮಿತಿ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ", soonText: "ದಿನಕ್ಕೆ ಎಷ್ಟು ಪ್ಲೇಟ್ ಅಡುಗೆ ಮಾಡಬೇಕು ಎಂದು ಮುಂದಿನ ಅಪ್‌ಡೇಟ್‌ನಲ್ಲಿ ಇಡಬಹುದು.",
    loadTitle: "ನಿಮ್ಮ ದಿನದ ಮಿತಿ ಲೋಡ್ ಆಗಲಿಲ್ಲ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", loading: "ನಿಮ್ಮ ದಿನದ ಮಿತಿ ಲೋಡ್ ಆಗುತ್ತಿದೆ",
    frozen: "Craves ಸದ್ಯಕ್ಕೆ ಹೊಸ ಚಂದಾದಾರಿಕೆಗಳನ್ನು ನಿಲ್ಲಿಸಿದೆ.", wholeKitchen: "ಈ ಮಿತಿಗಳು ನಿಮ್ಮ ಇಡೀ ಅಡುಗೆಮನೆಗೆ, ನಿಮ್ಮ ಎಲ್ಲಾ ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳಿಗೆ ಅನ್ವಯಿಸುತ್ತವೆ.",
    meal: "ಊಟ", total: "ಒಟ್ಟು ಪ್ಲೇಟ್‌ಗಳು", totalHint: "ಎಲ್ಲಾ ಆರ್ಡರ್‌ಗಳು ಸೇರಿ", kept: "ಚಂದಾದಾರರಿಗೆ ಮೀಸಲು", keptHint: "ಉಳಿದವು ಸಾಮಾನ್ಯ ಆರ್ಡರ್‌ಗಳಿಗೆ",
    canJoin: "ಹೊಸ ಚಂದಾದಾರರು ಸೇರಬಹುದು",
    mixed: "ನಿಮ್ಮ ದಿನಗಳಿಗೆ ಈಗ ಬೇರೆ ಬೇರೆ ಮಿತಿಗಳಿವೆ. ಉಳಿಸಿದರೆ ಎಲ್ಲಕ್ಕೂ ಇದೇ ಸಂಖ್ಯೆಗಳು ಬರುತ್ತವೆ.",
    deficit: "ಈ ಮಿತಿಗಿಂತ ಹೆಚ್ಚು ಪ್ಲೇಟ್‌ಗಳನ್ನು ಚಂದಾದಾರರು ಬುಕ್ ಮಾಡಿದ್ದಾರೆ. ಪ್ರತಿ ಚಂದಾದಾರರಿಗೂ ಊಟ ಸಿಗುವಂತೆ ಇದನ್ನು ಹೆಚ್ಚಿಸಿ.",
    perDish: "ಪ್ರತಿ ಖಾದ್ಯಕ್ಕೆ ಮಿತಿ", oneDate: "ಒಂದು ದಿನಾಂಕ ಬದಲಾಯಿಸಿ", oneDateMeta: "ಹಬ್ಬ, ರಜೆ ಅಥವಾ ಕಡಿಮೆ ಪ್ಲೇಟ್‌ಗಳು",
    saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", save: "ಉಳಿಸಿ", dishSheet: "{meal} ಗಾಗಿ. ಚಂದಾದಾರರು ಪ್ರತಿದಿನ ಒಂದು ಖಾದ್ಯವನ್ನು ಇದಕ್ಕಿಂತ ಹೆಚ್ಚು ಆರ್ಡರ್ ಮಾಡಲಾಗದು.",
    turnOnFirst: "ಮೊದಲು ನಿಮ್ಮ ಮೆನುವಿನಲ್ಲಿ ಒಂದು ಖಾದ್ಯ ಆನ್ ಮಾಡಿ.", mostADay: "ದಿನಕ್ಕೆ ಎಷ್ಟು ಪ್ಲೇಟ್‌ಗಳವರೆಗೆ", dishPlates: "ಈ ಖಾದ್ಯದ ಪ್ಲೇಟ್‌ಗಳು",
    dishOn: "ಚಂದಾದಾರರು ಈ ಖಾದ್ಯ ಆರ್ಡರ್ ಮಾಡಬಹುದು", dishMixed: "ಈ ಖಾದ್ಯಕ್ಕೆ ನಿಮ್ಮ ದಿನಗಳಲ್ಲಿ ಈಗ ಬೇರೆ ಬೇರೆ ಮಿತಿಗಳಿವೆ. ಉಳಿಸಿದರೆ ಎಲ್ಲಕ್ಕೂ ಇದೇ ಸಂಖ್ಯೆಗಳು ಬರುತ್ತವೆ.",
    saveDish: "ಖಾದ್ಯದ ಮಿತಿ ಉಳಿಸಿ", dateSheet: "{meal} ಗಾಗಿ.", date: "ದಿನಾಂಕ", changing: "{day} ಬದಲಾಯಿಸುತ್ತಿದ್ದೀರಿ", pickDay: "ನೀವು ಬದಲಾಯಿಸಬೇಕಾದ ದಿನ ಆಯ್ಕೆಮಾಡಿ.",
    hasChange: "ಈ ದಿನಾಂಕಕ್ಕೆ ಈಗಾಗಲೇ ಒಂದು ಬದಲಾವಣೆ ಇದೆ. ಉಳಿಸಿದರೆ ಅದರ ಬದಲು ಇದು ಬರುತ್ತದೆ.", change: "ಏನು ಬದಲಾಯಿಸಬೇಕು", wholeMeal: "ಇಡೀ ಊಟ", oneDish: "ಒಂದು ಖಾದ್ಯ",
    totalThatDay: "ಆ ದಿನದ ಒಟ್ಟು ಪ್ಲೇಟ್‌ಗಳು", keptThatDay: "ಆ ದಿನ ಚಂದಾದಾರರಿಗೆ ಮೀಸಲು", closeMeal: "ಈ ದಿನ {meal} ಮುಚ್ಚಿ",
    otherMeals: "ನಿಮ್ಮ ಬೇರೆ ಊಟಗಳು ಬದಲಾಗುವುದಿಲ್ಲ.", most: "ಎಷ್ಟು ಪ್ಲೇಟ್‌ಗಳವರೆಗೆ", dishThatDay: "ಆ ದಿನ ಈ ಖಾದ್ಯದ ಪ್ಲೇಟ್‌ಗಳು",
    closeDish: "ಈ ದಿನ ಈ ಖಾದ್ಯ ಮುಚ್ಚಿ", staysOnMenu: "ಇದು ನಿಮ್ಮ ಮೆನುವಿನಲ್ಲೇ ಇರುತ್ತದೆ.", saveDate: "ದಿನಾಂಕ ಉಳಿಸಿ", changedDates: "ನೀವು ಬದಲಾಯಿಸಿದ ದಿನಾಂಕಗಳು",
  },
});

type PlateValues = { total: number; subscriber: number; salesEnabled: boolean };

// Sent to the API with each change (request bodies stay English).
const REASON = "Updated by Chef in Craves web";
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
  const text = useText(TEXT);
  const lower = name.toLowerCase();
  return (
    <div className="flex items-center" role="group" aria-label={name}>
      <button
        type="button"
        className="chef-icon-button"
        aria-label={format(text.fewer, { name: lower })}
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
        aria-label={format(text.more, { name: lower })}
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
  const text = useText(TEXT);
  const { language } = useLanguage();
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
      else setLoadError(chefErrorText(error, text.loadFailed));
    }
  }, [planId, text]);
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
  const dishName = (id: string) => menuItems.find((item) => item.id === id)?.itemName ?? text.dish;
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
  const slotName = mealSlotLabel(slot, language).toLowerCase();

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
      } else onProblem(text.saveProblem);
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
      text.limitsSaved,
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
      text.dishSaved,
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
      text.dateSaved,
      setSheetProblem,
    );
    if (saved) setSheet(null);
  }

  if (unpublished)
    return (
      <ComingSoon
        title={text.soonTitle}
        message={text.soonText}
      />
    );
  if (loadError) {
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title={text.loadTitle}
          text={loadError}
          action={
            <button type="button" className="chef-btn" onClick={() => void load()}>
              {text.tryAgain}
            </button>
          }
        />
      </ChefSection>
    );
  }
  if (!data) return <ChefLoading shape="form" head={false} label={text.loading} />;

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
    language,
  );
  const dishOptions = dishes.map((item) => ({ value: item.id, label: item.itemName }));

  return (
    <div className="chef-stack">
      {frozen ? (
        <ChefNotice icon={Lock} tone="danger" role="alert">
          {text.frozen}
          {data.freezeReason ? ` ${data.freezeReason}` : ""}
        </ChefNotice>
      ) : null}
      <p className="chef-section-note px-1">
        {text.wholeKitchen}
      </p>
      <ChefChoiceChips
        legend={text.meal}
        name="limits-meal"
        value={slot}
        onChange={setSlotChoice}
        options={MEAL_SLOTS.map((code) => ({ value: code, label: mealSlotLabel(code, language) }))}
      />
      <ChefSection title={limitHeading(slot, days, language)}>
        <fieldset disabled={frozen} className="min-w-0 divide-y divide-[#E3E6EA]">
          <Row title={text.total} hint={text.totalHint}>
            <PlateStepper
              name={text.total}
              value={values.total}
              onChange={(total) => setValues(setTotalPlates(values, total))}
            />
          </Row>
          <Row title={text.kept} hint={text.keptHint}>
            <PlateStepper
              name={text.kept}
              value={values.subscriber}
              onChange={(subscriber) => setValues(setSubscriberPlates(values, subscriber))}
            />
          </Row>
          <SwitchRow
            title={text.canJoin}
            value={values.salesEnabled}
            onChange={(salesEnabled) => setValues({ ...values, salesEnabled })}
          />
        </fieldset>
        <div aria-hidden="true" className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {/* Ink on a neutral track (no red or pink tints); the gap still marks where subscriber plates end. */}
          <span className="bg-[#1A1A1A]" style={{ flexGrow: bar.booked }} />
          <span className="bg-[#E3E6EA]" style={{ flexGrow: bar.free }} />
          <span className="bg-[#E3E6EA]" style={{ flexGrow: bar.normal }} />
        </div>
        <p className="chef-section-note mt-1.5">{capacityCaption(bar, language)}</p>
        {server.mixed ? (
          <Warning>{text.mixed}</Warning>
        ) : null}
        {server.deficit > 0 ? (
          <Warning>{text.deficit}</Warning>
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
              <span className="chef-row-title block">{text.perDish}</span>
              <span className="chef-row-meta block">
                {dishLimitSummary(data.menuItemRules, slot, days, dishName, language)}
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
              <span className="chef-row-title block">{text.oneDate}</span>
              <span className="chef-row-meta block">{text.oneDateMeta}</span>
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
        {busy && sheet === null ? text.saving : text.save}
      </button>
      <Problem text={mainProblem} />
      <ChefFlash message={notice} onClose={() => setNotice("")} />

      <Sheet
        open={sheet === "dish"}
        onOpenChange={(open) => !open && setSheet(null)}
        title={text.perDish}
        description={format(text.dishSheet, { meal: slotName })}
        busy={busy}
      >
        {/* Sheets open outside the chef page: the theme brings the chef chips and buttons along. */}
        <div className="chef-panel-theme chef-sheet-theme">
          {dishes.length === 0 ? (
            <p className="mt-4 text-sm text-[#6B6B6B]">{text.turnOnFirst}</p>
          ) : (
            <fieldset disabled={frozen} className="mt-4 grid min-w-0 gap-3">
              <ChefChoiceChips
                legend={text.dish}
                name="limits-dish"
                value={dishId ?? ""}
                onChange={pickDish}
                options={dishOptions}
              />
              <Row title={text.mostADay}>
                <PlateStepper
                  name={text.dishPlates}
                  value={dishMax}
                  onChange={(max) => setDishMax(clampPlates(max))}
                />
              </Row>
              <SwitchRow
                title={text.dishOn}
                value={dishOn}
                onChange={setDishOn}
              />
              {dishLimitsFor(dishId)?.mixed ? (
                <Warning>{text.dishMixed}</Warning>
              ) : null}
              <button
                type="button"
                className="chef-btn is-primary"
                disabled={frozen || busy}
                aria-busy={busy}
                onClick={() => void saveDish()}
              >
                {busy ? text.saving : text.saveDish}
              </button>
              <Problem text={sheetProblem} />
            </fieldset>
          )}
        </div>
      </Sheet>

      <Sheet
        open={sheet === "date"}
        onOpenChange={(open) => !open && setSheet(null)}
        title={text.oneDate}
        description={format(text.dateSheet, { meal: slotName })}
        busy={busy}
      >
        <div className="chef-panel-theme chef-sheet-theme">
          <fieldset disabled={frozen} className="mt-4 grid min-w-0 gap-3">
            <div>
              <label htmlFor="limits-date" className="chef-field-label">
                {text.date}
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
                {date ? format(text.changing, { day: dayLabel(date, today, language) }) : text.pickDay}
              </p>
            </div>
            {date && (dateKind === "meal" ? slotChange(date) : dishChange(date, dateDishId)) ? (
              <Warning>{text.hasChange}</Warning>
            ) : null}
            {dishes.length > 0 ? (
              <ChefChoiceChips
                legend={text.change}
                name="limits-date-kind"
                value={dateKind}
                onChange={setDateKind}
                options={[
                  { value: "meal", label: text.wholeMeal },
                  { value: "dish", label: text.oneDish },
                ]}
              />
            ) : null}
            {dateKind === "meal" ? (
              <>
                <Row title={text.total}>
                  <PlateStepper
                    name={text.totalThatDay}
                    value={dateValues.total}
                    onChange={(total) => setDateValues(setTotalPlates(dateValues, total))}
                  />
                </Row>
                <Row title={text.kept}>
                  <PlateStepper
                    name={text.keptThatDay}
                    value={dateValues.subscriber}
                    onChange={(subscriber) =>
                      setDateValues(setSubscriberPlates(dateValues, subscriber))
                    }
                  />
                </Row>
                <SwitchRow
                  title={format(text.closeMeal, { meal: slotName })}
                  hint={text.otherMeals}
                  value={dateClosed}
                  onChange={setDateClosed}
                />
              </>
            ) : (
              <>
                <ChefChoiceChips
                  legend={text.dish}
                  name="limits-date-dish"
                  value={dateDishId ?? ""}
                  onChange={(id) => pickDateDish(id)}
                  options={dishOptions}
                />
                <Row title={text.most}>
                  <PlateStepper
                    name={text.dishThatDay}
                    value={dateDishMax}
                    onChange={(max) => setDateDishMax(clampPlates(max))}
                  />
                </Row>
                <SwitchRow
                  title={text.closeDish}
                  hint={text.staysOnMenu}
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
              {busy ? text.saving : text.saveDate}
            </button>
            <Problem text={sheetProblem} />
          </fieldset>
          {changes.length > 0 ? (
            <section aria-labelledby="limits-changes" className="mt-5 grid gap-1">
              <h3 id="limits-changes" className="font-semibold text-[#1A1A1A]">
                {text.changedDates}
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
