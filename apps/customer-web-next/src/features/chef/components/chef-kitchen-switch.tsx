"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock3, LifeBuoy, Pause, Play, Store } from "lucide-react";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { Dialog, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import {
  changeKitchenSchedule,
  fetchScheduleOverride,
  scheduleUpdate,
  useKitchenSchedule,
  useOverrideChanges,
} from "@/features/chef/api/chef-kitchen-schedule";
import { ChefChoiceChips } from "@/features/chef/components/chef-ui";
import { ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen, ChefKitchenInput } from "@/features/chef/lib/chef-kitchen-types";
import type { ChefScheduleOverride } from "@/features/chef/lib/chef-schedule-contract";
import {
  formatHoursTime,
  kitchenClock,
  kitchenOpenState,
  pauseEnd,
  type KitchenOpenState,
  type PauseDuration,
} from "@/features/chef/lib/opening-hours";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    updateFailed: "We couldn’t update your kitchen. Check your connection and try again.",
    pause30: "30 min", pause60: "1 hour", pause120: "2 hours", pauseRest: "Rest of today",
    pauseFor30: "Pause for 30 min", pauseFor60: "Pause for 1 hour", pauseFor120: "Pause for 2 hours", pauseForRest: "Pause for the rest of today",
    openTitle: "Open · taking orders", today: "Today {hours}", canOrder: "Customers can order now.",
    pausedUntil: "Paused · back at {time}", paused: "Paused", acceptedCarryOn: "Orders you’ve already accepted carry on.",
    suspendedTitle: "Paused by Craves", suspendedDetail: "Contact Craves support to find out why.",
    notTakingTitle: "Closed · not taking orders", notTakingDetail: "Customers can’t order until you start taking orders again.",
    closedAllDayTitle: "Closed all day", closedAllDayDetail: "Today is a special day in your opening hours.",
    closedOpensAt: "Closed · opens {time}", closed: "Closed", byHours: "Your kitchen opens again by its opening hours.",
    closedDetail: "Customers can’t order until you open it.",
    tomorrow: "tomorrow", atTime: "at {time}",
    checkFailed: "We couldn’t check your kitchen. Try again.", suspendedRefusal: "Craves has paused your kitchen, so you can’t open or close it.",
    openFailed: "Your kitchen didn’t open. Check its pickup address and phone, then try again.", closeFailed: "Your kitchen didn’t close. Try again.",
    notConfirmed: "We couldn’t confirm the change. Refresh to check your kitchen.",
    nowOpen: "Your kitchen is open", nowClosed: "Your kitchen is closed", nowPaused: "New orders paused", nowTaking: "Taking orders again",
    takingOrders: "Taking orders", askWhy: "Ask Craves why", resume: "Resume now", changeHours: "Change opening hours",
    pauseNew: "Pause new orders", pauseFor: "Pause new orders for",
    pauseNote: "Orders you’ve already accepted are not affected. Customers see “Opens again {when}”.",
    checkDetails: "Check kitchen details", closeTitle: "Close your kitchen?",
    closeOne: "{count} order is still cooking. It carries on, but you won’t get new orders until you open the kitchen again.",
    closeMany: "{count} orders are still cooking. They carry on, but you won’t get new orders until you open the kitchen again.",
    keepOpen: "Keep open", closeKitchen: "Close kitchen",
  },
  te: {
    updateFailed: "మీ వంటగదిని మార్చలేకపోయాం. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.",
    pause30: "30 నిమి", pause60: "1 గంట", pause120: "2 గంటలు", pauseRest: "ఈరోజు మిగతా సమయం",
    pauseFor30: "30 నిమి ఆపండి", pauseFor60: "1 గంట ఆపండి", pauseFor120: "2 గంటలు ఆపండి", pauseForRest: "ఈరోజు మిగతా సమయం ఆపండి",
    openTitle: "తెరిచి ఉంది · ఆర్డర్లు తీసుకుంటున్నారు", today: "ఈరోజు {hours}", canOrder: "కస్టమర్లు ఇప్పుడు ఆర్డర్ చేయవచ్చు.",
    pausedUntil: "ఆపి ఉంచారు · {time} కి మళ్లీ మొదలవుతుంది", paused: "ఆపి ఉంచారు", acceptedCarryOn: "మీరు ఇప్పటికే ఒప్పుకున్న ఆర్డర్లు అలాగే కొనసాగుతాయి.",
    suspendedTitle: "Craves ఆపింది", suspendedDetail: "ఎందుకో తెలుసుకోవడానికి Craves సహాయ బృందాన్ని సంప్రదించండి.",
    notTakingTitle: "మూసి ఉంది · ఆర్డర్లు తీసుకోవడం లేదు", notTakingDetail: "మీరు మళ్లీ ఆర్డర్లు తీసుకోవడం మొదలుపెట్టే వరకు కస్టమర్లు ఆర్డర్ చేయలేరు.",
    closedAllDayTitle: "రోజంతా మూసి ఉంది", closedAllDayDetail: "మీ వంటగది సమయాల్లో ఈరోజు ప్రత్యేక రోజు.",
    closedOpensAt: "మూసి ఉంది · {time} కి తెరుస్తుంది", closed: "మూసి ఉంది", byHours: "మీ వంటగది సమయాల ప్రకారం మళ్లీ తెరుస్తుంది.",
    closedDetail: "మీరు తెరిచే వరకు కస్టమర్లు ఆర్డర్ చేయలేరు.",
    tomorrow: "రేపు", atTime: "{time} కి",
    checkFailed: "మీ వంటగదిని చూడలేకపోయాం. మళ్లీ ప్రయత్నించండి.", suspendedRefusal: "Craves మీ వంటగదిని ఆపింది, కాబట్టి మీరు దాన్ని తెరవలేరు, మూసివేయలేరు.",
    openFailed: "మీ వంటగది తెరవలేదు. పికప్ చిరునామా, ఫోన్ సరిచూసి మళ్లీ ప్రయత్నించండి.", closeFailed: "మీ వంటగది మూసివేయలేదు. మళ్లీ ప్రయత్నించండి.",
    notConfirmed: "మార్పు జరిగిందో లేదో చూడలేకపోయాం. మీ వంటగదిని చూడటానికి పేజీని మళ్లీ లోడ్ చేయండి.",
    nowOpen: "మీ వంటగది తెరిచి ఉంది", nowClosed: "మీ వంటగది మూసి ఉంది", nowPaused: "కొత్త ఆర్డర్లు ఆపారు", nowTaking: "మళ్లీ ఆర్డర్లు తీసుకుంటున్నారు",
    takingOrders: "ఆర్డర్లు తీసుకోవడం", askWhy: "ఎందుకో Craves ని అడగండి", resume: "ఇప్పుడే మళ్లీ ప్రారంభించండి", changeHours: "వంటగది సమయాలు మార్చండి",
    pauseNew: "కొత్త ఆర్డర్లు ఆపండి", pauseFor: "కొత్త ఆర్డర్లు ఎంతసేపు ఆపాలి",
    pauseNote: "మీరు ఇప్పటికే ఒప్పుకున్న ఆర్డర్లకు ఏమీ కాదు. మీ వంటగది {when} మళ్లీ తెరుస్తుందని కస్టమర్లకు కనిపిస్తుంది.",
    checkDetails: "వంటగది వివరాలు చూడండి", closeTitle: "మీ వంటగది మూసివేయాలా?",
    closeOne: "{count} ఆర్డర్ ఇంకా వంట అవుతోంది. అది కొనసాగుతుంది, కానీ మీరు వంటగది మళ్లీ తెరిచే వరకు కొత్త ఆర్డర్లు రావు.",
    closeMany: "{count} ఆర్డర్లు ఇంకా వంట అవుతున్నాయి. అవి కొనసాగుతాయి, కానీ మీరు వంటగది మళ్లీ తెరిచే వరకు కొత్త ఆర్డర్లు రావు.",
    keepOpen: "తెరిచే ఉంచండి", closeKitchen: "వంటగది మూసివేయండి",
  },
  kn: {
    updateFailed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಬದಲಾಯಿಸಲು ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    pause30: "30 ನಿಮಿ", pause60: "1 ಗಂಟೆ", pause120: "2 ಗಂಟೆಗಳು", pauseRest: "ಇಂದಿನ ಉಳಿದ ಸಮಯ",
    pauseFor30: "30 ನಿಮಿ ನಿಲ್ಲಿಸಿ", pauseFor60: "1 ಗಂಟೆ ನಿಲ್ಲಿಸಿ", pauseFor120: "2 ಗಂಟೆ ನಿಲ್ಲಿಸಿ", pauseForRest: "ಇಂದಿನ ಉಳಿದ ಸಮಯ ನಿಲ್ಲಿಸಿ",
    openTitle: "ತೆರೆದಿದೆ · ಆರ್ಡರ್ ತೆಗೆದುಕೊಳ್ಳಲಾಗುತ್ತಿದೆ", today: "ಇಂದು {hours}", canOrder: "ಗ್ರಾಹಕರು ಈಗ ಆರ್ಡರ್ ಮಾಡಬಹುದು.",
    pausedUntil: "ನಿಲ್ಲಿಸಲಾಗಿದೆ · {time} ಕ್ಕೆ ಮತ್ತೆ ಶುರು", paused: "ನಿಲ್ಲಿಸಲಾಗಿದೆ", acceptedCarryOn: "ನೀವು ಈಗಾಗಲೇ ಒಪ್ಪಿಕೊಂಡ ಆರ್ಡರ್‌ಗಳು ಹಾಗೆಯೇ ಮುಂದುವರಿಯುತ್ತವೆ.",
    suspendedTitle: "Craves ನಿಲ್ಲಿಸಿದೆ", suspendedDetail: "ಏಕೆ ಎಂದು ತಿಳಿಯಲು Craves ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    notTakingTitle: "ಮುಚ್ಚಿದೆ · ಆರ್ಡರ್ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿಲ್ಲ", notTakingDetail: "ನೀವು ಮತ್ತೆ ಆರ್ಡರ್ ತೆಗೆದುಕೊಳ್ಳಲು ಶುರುಮಾಡುವವರೆಗೆ ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡಲು ಆಗುವುದಿಲ್ಲ.",
    closedAllDayTitle: "ದಿನವಿಡೀ ಮುಚ್ಚಿದೆ", closedAllDayDetail: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಮಯದಲ್ಲಿ ಇಂದು ವಿಶೇಷ ದಿನ.",
    closedOpensAt: "ಮುಚ್ಚಿದೆ · {time} ಕ್ಕೆ ತೆರೆಯುತ್ತದೆ", closed: "ಮುಚ್ಚಿದೆ", byHours: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಮಯದಂತೆ ಮತ್ತೆ ತೆರೆಯುತ್ತದೆ.",
    closedDetail: "ನೀವು ತೆರೆಯುವವರೆಗೆ ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡಲು ಆಗುವುದಿಲ್ಲ.",
    tomorrow: "ನಾಳೆ", atTime: "{time} ಕ್ಕೆ",
    checkFailed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ನೋಡಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", suspendedRefusal: "Craves ನಿಮ್ಮ ಅಡುಗೆಮನೆ ನಿಲ್ಲಿಸಿದೆ, ಆದ್ದರಿಂದ ನೀವು ಅದನ್ನು ತೆರೆಯಲು ಅಥವಾ ಮುಚ್ಚಲು ಆಗುವುದಿಲ್ಲ.",
    openFailed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆಯಲಿಲ್ಲ. ಪಿಕಪ್ ವಿಳಾಸ ಮತ್ತು ಫೋನ್ ಪರಿಶೀಲಿಸಿ, ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", closeFailed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಮುಚ್ಚಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    notConfirmed: "ಬದಲಾವಣೆ ಆಗಿದೆಯೇ ಎಂದು ನೋಡಲು ಆಗಲಿಲ್ಲ. ನಿಮ್ಮ ಅಡುಗೆಮನೆ ನೋಡಲು ಪುಟವನ್ನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    nowOpen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆದಿದೆ", nowClosed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಮುಚ್ಚಿದೆ", nowPaused: "ಹೊಸ ಆರ್ಡರ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ", nowTaking: "ಮತ್ತೆ ಆರ್ಡರ್ ತೆಗೆದುಕೊಳ್ಳಲಾಗುತ್ತಿದೆ",
    takingOrders: "ಆರ್ಡರ್ ತೆಗೆದುಕೊಳ್ಳುವುದು", askWhy: "ಏಕೆ ಎಂದು Craves ಅನ್ನು ಕೇಳಿ", resume: "ಈಗಲೇ ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಿ", changeHours: "ಅಡುಗೆಮನೆ ಸಮಯ ಬದಲಾಯಿಸಿ",
    pauseNew: "ಹೊಸ ಆರ್ಡರ್ ನಿಲ್ಲಿಸಿ", pauseFor: "ಹೊಸ ಆರ್ಡರ್ ಎಷ್ಟು ಸಮಯ ನಿಲ್ಲಿಸಬೇಕು",
    pauseNote: "ನೀವು ಈಗಾಗಲೇ ಒಪ್ಪಿಕೊಂಡ ಆರ್ಡರ್‌ಗಳಿಗೆ ಏನೂ ಆಗುವುದಿಲ್ಲ. ನಿಮ್ಮ ಅಡುಗೆಮನೆ {when} ಮತ್ತೆ ತೆರೆಯುತ್ತದೆ ಎಂದು ಗ್ರಾಹಕರಿಗೆ ಕಾಣುತ್ತದೆ.",
    checkDetails: "ಅಡುಗೆಮನೆ ವಿವರ ನೋಡಿ", closeTitle: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಮುಚ್ಚಬೇಕೇ?",
    closeOne: "{count} ಆರ್ಡರ್ ಇನ್ನೂ ಅಡುಗೆ ಆಗುತ್ತಿದೆ. ಅದು ಮುಂದುವರಿಯುತ್ತದೆ, ಆದರೆ ನೀವು ಅಡುಗೆಮನೆ ಮತ್ತೆ ತೆರೆಯುವವರೆಗೆ ಹೊಸ ಆರ್ಡರ್ ಬರುವುದಿಲ್ಲ.",
    closeMany: "{count} ಆರ್ಡರ್‌ಗಳು ಇನ್ನೂ ಅಡುಗೆ ಆಗುತ್ತಿವೆ. ಅವು ಮುಂದುವರಿಯುತ್ತವೆ, ಆದರೆ ನೀವು ಅಡುಗೆಮನೆ ಮತ್ತೆ ತೆರೆಯುವವರೆಗೆ ಹೊಸ ಆರ್ಡರ್ ಬರುವುದಿಲ್ಲ.",
    keepOpen: "ತೆರೆದೇ ಇಡಿ", closeKitchen: "ಅಡುಗೆಮನೆ ಮುಚ್ಚಿ",
  },
});
type Words = (typeof TEXT)["en"];

const PAUSES = [
  { value: "30", label: "pause30", button: "pauseFor30" },
  { value: "60", label: "pause60", button: "pauseFor60" },
  { value: "120", label: "pause120", button: "pauseFor120" },
  { value: "rest-of-day", label: "pauseRest", button: "pauseForRest" },
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
function kitchenStatusCopy(state: KitchenOpenState, text: Words): { title: string; detail: string } {
  switch (state.status) {
    case "open":
      return {
        title: text.openTitle,
        detail: state.hoursToday ? format(text.today, { hours: state.hoursToday }) : text.canOrder,
      };
    case "paused":
      return {
        title: state.backAt ? format(text.pausedUntil, { time: state.backAt }) : text.paused,
        detail: text.acceptedCarryOn,
      };
    case "suspended":
      return { title: text.suspendedTitle, detail: text.suspendedDetail };
    default:
      return state.closedReason === "not-accepting"
        ? { title: text.notTakingTitle, detail: text.notTakingDetail }
        : state.closedAllDay
          ? { title: text.closedAllDayTitle, detail: text.closedAllDayDetail }
          : state.closedReason === "outside-hours"
            ? {
                title: state.opensAt ? format(text.closedOpensAt, { time: state.opensAt }) : text.closed,
                detail: text.byHours,
              }
            : { title: text.closed, detail: text.closedDetail };
  }
}

/** The time to the minute, so a pause ends and the hours turn over on screen; it stops while the tab is hidden. */
export function useMinuteClock(): Date {
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

/**
 * Today's special day for the kitchen's date, or null when there is none, it isn't read yet or can't be (the week's
 * hours apply). It is read again whenever the schedule is and after a special day is saved or removed, so one for
 * today shows straight away.
 */
export function useSpecialDay(
  schedule: { timezoneId: string } | null,
  date: string | null,
): ChefScheduleOverride | null {
  const [read, setRead] = useState<{ date: string; special: ChefScheduleOverride | null } | null>(
    null,
  );
  const changes = useOverrideChanges();
  useEffect(() => {
    if (!schedule || !date) return;
    let current = true;
    void fetchScheduleOverride(date)
      .catch(() => null)
      .then((special) => {
        if (current) setRead({ date, special });
      });
    return () => {
      current = false;
    };
  }, [schedule, date, changes]);
  return read && read.date === date ? read.special : null;
}

/** Taking orders in one tap, a short pause, and why a closed kitchen is closed. */
export function ChefKitchenSwitch({
  kitchen,
  onChange,
  cookingCount = 0,
}: {
  kitchen: ChefKitchen;
  onChange(kitchen: ChefKitchen): void;
  /** Orders being cooked now (accepted and preparing): closing asks first while there are any. */
  cookingCount?: number;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const view = useKitchenSchedule();
  // Without the schedule (still loading, not live yet, or failed) the switch works as open/closed only.
  const schedule = view.state === "ready" ? view.schedule : null;
  const now = useMinuteClock();
  const special = useSpecialDay(schedule, schedule && kitchenClock(now, schedule.timezoneId).date);
  const state = kitchenOpenState(kitchen.status, schedule, now, special, language);
  const copy = kitchenStatusCopy(state, text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; kitchenLink: boolean } | null>(null);
  const [done, setDone] = useState("");
  const [pausing, setPausing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [choice, setChoice] = useState<PauseChoice>("60");
  const suspended = state.status === "suspended";
  const option = PAUSES.find((candidate) => candidate.value === choice) ?? PAUSES[1];
  const opensAgain =
    !schedule || choice === "rest-of-day"
      ? text.tomorrow
      : format(text.atTime, {
          time: formatHoursTime(
            kitchenClock(new Date(now.getTime() + Number(choice) * 60_000), schedule.timezoneId).time,
            language,
          ),
        });

  async function run(
    action: () => Promise<void>,
    success: string,
    kitchenLink = () => false,
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
      setError({ text: chefErrorText(caught, text.updateFailed), kitchenLink: kitchenLink() });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function setOpen(next: boolean) {
    if (suspended) return;
    // Only a refused kitchen save points to Kitchen details, where its address and phone are fixed.
    let kitchenRefused = false;
    void run(
      async () => {
        // Start from the kitchen as saved now: the page may have been open for hours, and an
        // edit made elsewhere since then must not be written back over.
        const latestResponse = await sessionFetch("/api/chef/kitchen", { cache: "no-store" });
        const latest = latestResponse.ok
          ? parseChefKitchen(await latestResponse.json().catch(() => null))
          : null;
        if (!latest) throw chefApiError(latestResponse, null, text.checkFailed);
        if (latest.status === "SUSPENDED") {
          onChange(latest);
          throw new Error(text.suspendedRefusal);
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
            kitchenRefused = true;
            throw chefApiError(response, body, next ? text.openFailed : text.closeFailed);
          }
          const saved = parseChefKitchen(body);
          if (!saved)
            throw new ChefError(text.notConfirmed, "INVALID_KITCHEN_RESPONSE", response.status);
          onChange(saved);
        }
        if (next && schedule) {
          // Opening also takes orders again when the schedule had stopped them. A schedule that can't be read
          // only matters when the copy on screen said orders were off.
          await changeKitchenSchedule(
            (fresh) =>
              fresh.acceptingOrders ? null : scheduleUpdate(fresh, { acceptingOrders: true }),
            text.updateFailed,
          ).catch((caught: unknown) => {
            if (!schedule.acceptingOrders) throw caught;
          });
        }
      },
      next ? text.nowOpen : text.nowClosed,
      () => kitchenRefused,
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
          text.updateFailed,
        ),
      text.nowPaused,
    );
    if (paused) setPausing(false);
  }

  const resume = () =>
    void run(
      () =>
        changeKitchenSchedule(
          (fresh) => scheduleUpdate(fresh, { pausedUntil: null, pauseReason: null }),
          text.updateFailed,
        ),
      text.nowTaking,
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
        <div className="flex shrink-0 flex-col items-center gap-1">
          <AppleSwitch
            id="chef-taking-orders"
            checked={state.takingOrders}
            disabled={suspended}
            aria-disabled={busy || undefined}
            onCheckedChange={(next) =>
              !next && cookingCount > 0 ? setConfirmClose(true) : setOpen(next)
            }
            size="lg"
            tone="go"
            aria-labelledby="chef-taking-orders-label"
          />
          <label
            id="chef-taking-orders-label"
            htmlFor="chef-taking-orders"
            className="text-[0.75rem] font-semibold text-[#6B6B6B]"
          >
            {text.takingOrders}
          </label>
        </div>
      </div>
      {suspended ? (
        <Link href="/chef/support" className="chef-btn is-small mt-3">
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          {text.askWhy}
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
          {text.resume}
        </button>
      ) : null}
      {state.closedReason === "outside-hours" ? (
        <Link href="/chef/hours" className="chef-btn is-small mt-3">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          {text.changeHours}
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
            {text.pauseNew}
          </button>
          {pausing ? (
            <div id="chef-pause-options" className="mt-4 grid gap-3 border-t border-[#E3E6EA] pt-4">
              <ChefChoiceChips
                legend={text.pauseFor}
                name="chef-pause"
                options={PAUSES.map(({ value, label }) => ({ value, label: text[label] }))}
                value={choice}
                onChange={setChoice}
                disabled={busy}
              />
              <p className="chef-section-note !text-[0.875rem]">
                {format(text.pauseNote, { when: opensAgain })}
              </p>
              <button
                type="button"
                className="chef-btn is-small is-primary justify-self-start"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void pause()}
              >
                {text[option.button]}
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
                {text.checkDetails}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <Dialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={text.closeTitle}
        description={format(cookingCount === 1 ? text.closeOne : text.closeMany, { count: cookingCount })}
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => setConfirmClose(false)}
            >
              {text.keepOpen}
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => {
                setConfirmClose(false);
                setOpen(false);
              }}
            >
              {text.closeKitchen}
            </button>
          </>
        }
      />
    </section>
  );
}
