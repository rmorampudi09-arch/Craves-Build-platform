"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  BellOff,
  BellRing,
  ChevronRight,
  RefreshCw,
  Store,
  ToggleRight,
  Utensils,
  Wallet,
} from "lucide-react";
import { ChefAccessRetry } from "@/features/chef/components/chef-account-menu";
import { createKitchenFromApplication } from "@/features/chef/lib/chef-kitchen-handoff";
import {
  ChefEmpty,
  ChefNotice,
  ChefSection,
  formatInr,
  timeAgo,
} from "@/features/chef/components/chef-ui";
import { ChefStars } from "@/features/chef/components/chef-reviews";
import { fetchChefReviews, fetchChefReviewSummary } from "@/features/chef/api/chef-reviews";
import type { ChefReview } from "@/features/chef/lib/chef-review-contract";
import { ChefOrderCard, OrderUpdateNotice, focusOrderAfterUpdate, orderUpdateText } from "@/features/chef/components/chef-order-card";
import { ChefKitchenSwitch } from "@/features/chef/components/chef-kitchen-switch";
import { mergeOrders, noticeNewOrders, useAlertPrefs, useChefOrderPolling, writeAlertPrefs } from "@/features/chef/lib/chef-order-alert";
import {
  parseChefApplication,
  type ChefApplication,
} from "@/features/chef-onboarding/lib/chef-application-contract";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen } from "@/features/chef/lib/chef-kitchen-types";
import { parseChefMenuItems, type ChefMenuItem } from "@/features/chef/lib/chef-menu-contract";
import {
  parseChefOrdersResponse,
  type ChefOrder,
} from "@/features/chef/lib/chef-order-contract";
import {
  parseChefEarnings,
  type ChefEarning,
} from "@/features/chef/lib/chef-earnings-contract";
import { bankStatusSchema } from "@/features/admin/finance/lib/bank-onboarding-contract";
import { chefBalanceSchema, type ChefBalance } from "@/features/admin/finance/lib/finance-contract";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { getSession } from "@/features/auth/api/cravesAuth";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

type DashboardState = "loading" | "approved" | "error";
type Part = "application" | "kitchen" | "menu" | "orders" | "earnings";

type Snapshot = {
  application: ChefApplication | null;
  kitchen: ChefKitchen | null;
  menu: ChefMenuItem[];
  orders: ChefOrder[];
  earnings: ChefEarning[];
  /** True only when the bank check said there is no account to pay into (app needsBankAccount). */
  needsBank: boolean;
  /** Null when the balance couldn't be read: the card shows a dash, never a guess. */
  balance: ChefBalance | null;
  /** Null when reviews can't be read (not live yet, or failed): Home shows nothing about them. */
  reviews: { latest: ChefReview | null; average: number | null } | null;
  unavailable: Part[];
  /** Why each unavailable part failed, as shown to the chef. */
  details: { part: Part; text: string }[];
  /** A part failed because Craves couldn’t confirm chef access, even after re-reading it once. */
  accessProblem?: boolean;
};

const EMPTY: Snapshot = {
  application: null,
  kitchen: null,
  menu: [],
  orders: [],
  earnings: [],
  needsBank: false,
  balance: null,
  reviews: null,
  unavailable: [],
  details: [],
};

// The welcome after approval shows once, only while it is news: approved recently and no dish yet.
const WELCOME_DAYS = 30;

const TEXT = messages({
  en: {
    loading: "Loading Chef Mode", loadFailedTitle: "Chef Mode couldn’t load", loadFailed: "We couldn’t load Chef Mode right now. Please try again.", tryAgain: "Try again",
    morning: "Good morning, {name}", afternoon: "Good afternoon, {name}", evening: "Good evening, {name}", chef: "Chef", yourKitchen: "Your Craves kitchen",
    welcomeTitle: "You’re a Craves chef", welcomeKitchen: "Your kitchen is set up. Add your first dish so customers can find what you cook.",
    welcomeNoKitchen: "Save your kitchen name and pickup address, then add your first dish.", notNow: "Not now", addFirstDish: "Add my first dish", setUpKitchen: "Set up my kitchen",
    ordersFailedTitle: "Your orders couldn’t load", ordersFailedAccess: "Craves couldn’t confirm your chef access just now, so new orders won’t show or ring. We already tried again for you. Tap Try again; if it keeps happening, it’s on our side — tell us in Help. You don’t need to sign in again.",
    someFailed: "Some information couldn’t refresh. Everything else below is up to date.",
    partApplication: "Application", partKitchen: "Kitchen", partMenu: "Menu", partOrders: "Orders", partEarnings: "Earnings",
    fixTitle: "Do this so customers can order", checkTitle: "Check your kitchen and menu", checkText: "We couldn’t check your saved kitchen or dishes. Try again before you carry on.",
    nameTitle: "Give your kitchen a name", nameText: "This is what customers will know your home kitchen by.", nameAction: "Name my kitchen",
    firstDishTitle: "Add your first dish", firstDishText: "Add one dish so customers can see what you cook.", firstDishAction: "Add a dish",
    noDishOnTitle: "No dish is on today", noDishOnText: "Your kitchen is open, but customers can’t order anything. Turn on the dishes you are cooking today.", noDishOnAction: "Turn on dishes",
    soundOffTitle: "Order sound is off", soundOffText: "Your phone won’t ring for new orders. Turn it on so you don’t miss one.", soundOffAction: "Turn sound on",
    bankAction: "Add bank account", available: "Available to withdraw", withdraw: "Withdraw",
    rating: "Rating", latestReview: "Latest reviews", seeAll: "See all",
    newOne: "New order: answer now", newMany: "{count} new orders: answer now", inKitchen: "In your kitchen", allOrders: "All orders",
    noOrders: "No new orders right now.", keepOpen: "Keep Craves open: your phone rings when a customer orders.", checkNow: "Check now",
    ordersUnknown: "Orders couldn’t load. We keep trying every few seconds.", ordersWaitAccess: "Orders show here as soon as Craves confirms your chef access.",
    today: "Today", ordersToday: "Orders today", cookingNow: "Cooking now", dishesOn: "Dishes on today", dishesOf: "{on} of {all}", earnedWeek: "Earned this week",
    soundOn: "Your phone rings for new orders", soundSettings: "Order sound & settings",
  },
  te: {
    loading: "చెఫ్ మోడ్ లోడ్ అవుతోంది", loadFailedTitle: "చెఫ్ మోడ్ లోడ్ కాలేదు", loadFailed: "ఇప్పుడు చెఫ్ మోడ్ లోడ్ చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి.", tryAgain: "మళ్లీ ప్రయత్నించండి",
    morning: "శుభోదయం, {name}", afternoon: "నమస్కారం, {name}", evening: "శుభ సాయంత్రం, {name}", chef: "చెఫ్", yourKitchen: "మీ Craves వంటగది",
    welcomeTitle: "మీరు ఇప్పుడు Craves చెఫ్", welcomeKitchen: "మీ వంటగది సిద్ధంగా ఉంది. కస్టమర్లు చూడాలంటే మీ మొదటి వంటకం జోడించండి.",
    welcomeNoKitchen: "మీ వంటగది పేరు, పికప్ చిరునామా సేవ్ చేసి, తర్వాత మొదటి వంటకం జోడించండి.", notNow: "ఇప్పుడు కాదు", addFirstDish: "మొదటి వంటకం జోడించండి", setUpKitchen: "వంటగది సిద్ధం చేయండి",
    ordersFailedTitle: "మీ ఆర్డర్లు లోడ్ కాలేదు", ordersFailedAccess: "Craves ఇప్పుడు మీ చెఫ్ అనుమతిని నిర్ధారించలేకపోయింది, అందుకే కొత్త ఆర్డర్లు కనిపించవు, మోగవు. మేం ఇప్పటికే మళ్లీ ప్రయత్నించాం. 'మళ్లీ ప్రయత్నించండి' నొక్కండి; ఇలాగే జరిగితే అది మా వైపు సమస్య — సహాయంలో మాకు చెప్పండి. మళ్లీ సైన్ ఇన్ అవసరం లేదు.",
    someFailed: "కొన్ని వివరాలు రిఫ్రెష్ కాలేదు. కింద ఉన్నవన్నీ తాజావే.",
    partApplication: "దరఖాస్తు", partKitchen: "వంటగది", partMenu: "మెనూ", partOrders: "ఆర్డర్లు", partEarnings: "సంపాదన",
    fixTitle: "కస్టమర్లు ఆర్డర్ చేయాలంటే ఇది చేయండి", checkTitle: "మీ వంటగది, మెనూ చూడండి", checkText: "మీ వంటగది లేదా వంటకాలను చూడలేకపోయాం. ముందుకెళ్లే ముందు మళ్లీ ప్రయత్నించండి.",
    nameTitle: "మీ వంటగదికి పేరు పెట్టండి", nameText: "కస్టమర్లు మీ ఇంటి వంటగదిని ఈ పేరుతో గుర్తిస్తారు.", nameAction: "పేరు పెట్టండి",
    firstDishTitle: "మీ మొదటి వంటకం జోడించండి", firstDishText: "మీరు ఏం వండుతారో కస్టమర్లు చూడాలంటే ఒక వంటకం జోడించండి.", firstDishAction: "వంటకం జోడించండి",
    noDishOnTitle: "ఈరోజు ఏ వంటకం ఆన్‌లో లేదు", noDishOnText: "మీ వంటగది తెరిచి ఉంది, కానీ కస్టమర్లు ఏమీ ఆర్డర్ చేయలేరు. ఈరోజు వండే వంటకాలను ఆన్ చేయండి.", noDishOnAction: "వంటకాలు ఆన్ చేయండి",
    soundOffTitle: "ఆర్డర్ శబ్దం ఆఫ్‌లో ఉంది", soundOffText: "కొత్త ఆర్డర్ వస్తే మీ ఫోన్ మోగదు. ఒక్క ఆర్డర్ కూడా మిస్ కాకుండా ఆన్ చేయండి.", soundOffAction: "శబ్దం ఆన్ చేయండి",
    bankAction: "బ్యాంక్ ఖాతా జోడించండి", available: "మీరు తీసుకోగల డబ్బు", withdraw: "డబ్బు తీసుకోండి",
    rating: "రేటింగ్", latestReview: "తాజా రివ్యూలు", seeAll: "అన్నీ చూడండి",
    newOne: "కొత్త ఆర్డర్: ఇప్పుడే జవాబు ఇవ్వండి", newMany: "{count} కొత్త ఆర్డర్లు: ఇప్పుడే జవాబు ఇవ్వండి", inKitchen: "మీ వంటగదిలో", allOrders: "అన్ని ఆర్డర్లు",
    noOrders: "ఇప్పుడు కొత్త ఆర్డర్లు లేవు.", keepOpen: "Craves తెరిచే ఉంచండి: కస్టమర్ ఆర్డర్ చేస్తే మీ ఫోన్ మోగుతుంది.", checkNow: "ఇప్పుడు చూడండి",
    ordersUnknown: "ఆర్డర్లు లోడ్ కాలేదు. కొన్ని సెకన్లకు ఒకసారి మళ్లీ ప్రయత్నిస్తున్నాం.", ordersWaitAccess: "Craves మీ చెఫ్ అనుమతిని నిర్ధారించగానే ఆర్డర్లు ఇక్కడ కనిపిస్తాయి.",
    today: "ఈరోజు", ordersToday: "ఈరోజు ఆర్డర్లు", cookingNow: "ఇప్పుడు వండుతున్నవి", dishesOn: "ఈరోజు ఆన్‌లో ఉన్న వంటకాలు", dishesOf: "{all} లో {on}", earnedWeek: "ఈ వారం సంపాదన",
    soundOn: "కొత్త ఆర్డర్లకు మీ ఫోన్ మోగుతుంది", soundSettings: "ఆర్డర్ శబ్దం, సెట్టింగ్స్",
  },
  kn: {
    loading: "ಚೆಫ್ ಮೋಡ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ", loadFailedTitle: "ಚೆಫ್ ಮೋಡ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ", loadFailed: "ಈಗ ಚೆಫ್ ಮೋಡ್ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    morning: "ಶುಭೋದಯ, {name}", afternoon: "ನಮಸ್ಕಾರ, {name}", evening: "ಶುಭ ಸಂಜೆ, {name}", chef: "ಚೆಫ್", yourKitchen: "ನಿಮ್ಮ Craves ಅಡುಗೆಮನೆ",
    welcomeTitle: "ನೀವು ಈಗ Craves ಚೆಫ್", welcomeKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧವಾಗಿದೆ. ಗ್ರಾಹಕರು ನೋಡಲು ನಿಮ್ಮ ಮೊದಲ ಖಾದ್ಯ ಸೇರಿಸಿ.",
    welcomeNoKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಯ ಹೆಸರು ಮತ್ತು ಪಿಕಪ್ ವಿಳಾಸ ಉಳಿಸಿ, ನಂತರ ಮೊದಲ ಖಾದ್ಯ ಸೇರಿಸಿ.", notNow: "ಈಗ ಬೇಡ", addFirstDish: "ಮೊದಲ ಖಾದ್ಯ ಸೇರಿಸಿ", setUpKitchen: "ಅಡುಗೆಮನೆ ಸಿದ್ಧಮಾಡಿ",
    ordersFailedTitle: "ನಿಮ್ಮ ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ", ordersFailedAccess: "Craves ಈಗ ನಿಮ್ಮ ಚೆಫ್ ಅನುಮತಿಯನ್ನು ಖಚಿತಪಡಿಸಲಾಗಲಿಲ್ಲ, ಹಾಗಾಗಿ ಹೊಸ ಆರ್ಡರ್‌ಗಳು ಕಾಣುವುದಿಲ್ಲ, ರಿಂಗ್ ಆಗುವುದಿಲ್ಲ. ನಾವು ಈಗಾಗಲೇ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿದ್ದೇವೆ. 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' ಒತ್ತಿ; ಹೀಗೆಯೇ ಆದರೆ ಅದು ನಮ್ಮ ಕಡೆಯ ಸಮಸ್ಯೆ — ಸಹಾಯದಲ್ಲಿ ತಿಳಿಸಿ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಬೇಡ.",
    someFailed: "ಕೆಲವು ವಿವರಗಳು ರಿಫ್ರೆಶ್ ಆಗಲಿಲ್ಲ. ಕೆಳಗಿನ ಉಳಿದವೆಲ್ಲ ಹೊಸದಾಗಿವೆ.",
    partApplication: "ಅರ್ಜಿ", partKitchen: "ಅಡುಗೆಮನೆ", partMenu: "ಮೆನು", partOrders: "ಆರ್ಡರ್‌ಗಳು", partEarnings: "ಗಳಿಕೆ",
    fixTitle: "ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡಲು ಇದನ್ನು ಮಾಡಿ", checkTitle: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ, ಮೆನು ನೋಡಿ", checkText: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಅಥವಾ ಖಾದ್ಯಗಳನ್ನು ನೋಡಲಾಗಲಿಲ್ಲ. ಮುಂದುವರಿಯುವ ಮೊದಲು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    nameTitle: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಗೆ ಹೆಸರಿಡಿ", nameText: "ಗ್ರಾಹಕರು ನಿಮ್ಮ ಮನೆಯ ಅಡುಗೆಮನೆಯನ್ನು ಈ ಹೆಸರಿನಿಂದ ಗುರುತಿಸುತ್ತಾರೆ.", nameAction: "ಹೆಸರಿಡಿ",
    firstDishTitle: "ನಿಮ್ಮ ಮೊದಲ ಖಾದ್ಯ ಸೇರಿಸಿ", firstDishText: "ನೀವು ಏನು ಅಡುಗೆ ಮಾಡುತ್ತೀರಿ ಎಂದು ಗ್ರಾಹಕರು ನೋಡಲು ಒಂದು ಖಾದ್ಯ ಸೇರಿಸಿ.", firstDishAction: "ಖಾದ್ಯ ಸೇರಿಸಿ",
    noDishOnTitle: "ಇಂದು ಯಾವ ಖಾದ್ಯವೂ ಆನ್ ಇಲ್ಲ", noDishOnText: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆದಿದೆ, ಆದರೆ ಗ್ರಾಹಕರು ಏನೂ ಆರ್ಡರ್ ಮಾಡಲಾಗದು. ಇಂದು ಮಾಡುವ ಖಾದ್ಯಗಳನ್ನು ಆನ್ ಮಾಡಿ.", noDishOnAction: "ಖಾದ್ಯಗಳನ್ನು ಆನ್ ಮಾಡಿ",
    soundOffTitle: "ಆರ್ಡರ್ ಶಬ್ದ ಆಫ್ ಆಗಿದೆ", soundOffText: "ಹೊಸ ಆರ್ಡರ್ ಬಂದರೆ ನಿಮ್ಮ ಫೋನ್ ರಿಂಗ್ ಆಗುವುದಿಲ್ಲ. ಯಾವ ಆರ್ಡರ್ ಕೂಡ ತಪ್ಪದಂತೆ ಆನ್ ಮಾಡಿ.", soundOffAction: "ಶಬ್ದ ಆನ್ ಮಾಡಿ",
    bankAction: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಸೇರಿಸಿ", available: "ನೀವು ತೆಗೆದುಕೊಳ್ಳಬಹುದಾದ ಹಣ", withdraw: "ಹಣ ತೆಗೆದುಕೊಳ್ಳಿ",
    rating: "ರೇಟಿಂಗ್", latestReview: "ಇತ್ತೀಚಿನ ರಿವ್ಯೂಗಳು", seeAll: "ಎಲ್ಲಾ ನೋಡಿ",
    newOne: "ಹೊಸ ಆರ್ಡರ್: ಈಗಲೇ ಉತ್ತರಿಸಿ", newMany: "{count} ಹೊಸ ಆರ್ಡರ್‌ಗಳು: ಈಗಲೇ ಉತ್ತರಿಸಿ", inKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಯಲ್ಲಿ", allOrders: "ಎಲ್ಲಾ ಆರ್ಡರ್‌ಗಳು",
    noOrders: "ಈಗ ಹೊಸ ಆರ್ಡರ್‌ಗಳಿಲ್ಲ.", keepOpen: "Craves ತೆರೆದೇ ಇಡಿ: ಗ್ರಾಹಕರು ಆರ್ಡರ್ ಮಾಡಿದಾಗ ನಿಮ್ಮ ಫೋನ್ ರಿಂಗ್ ಆಗುತ್ತದೆ.", checkNow: "ಈಗ ನೋಡಿ",
    ordersUnknown: "ಆರ್ಡರ್‌ಗಳು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಕೆಲವು ಸೆಕೆಂಡಿಗೊಮ್ಮೆ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸುತ್ತಿದ್ದೇವೆ.", ordersWaitAccess: "Craves ನಿಮ್ಮ ಚೆಫ್ ಅನುಮತಿ ಖಚಿತಪಡಿಸಿದ ತಕ್ಷಣ ಆರ್ಡರ್‌ಗಳು ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.",
    today: "ಇಂದು", ordersToday: "ಇಂದಿನ ಆರ್ಡರ್‌ಗಳು", cookingNow: "ಈಗ ಅಡುಗೆ ಆಗುತ್ತಿರುವವು", dishesOn: "ಇಂದು ಆನ್ ಇರುವ ಖಾದ್ಯಗಳು", dishesOf: "{all} ರಲ್ಲಿ {on}", earnedWeek: "ಈ ವಾರದ ಗಳಿಕೆ",
    soundOn: "ಹೊಸ ಆರ್ಡರ್‌ಗಳಿಗೆ ನಿಮ್ಮ ಫೋನ್ ರಿಂಗ್ ಆಗುತ್ತದೆ", soundSettings: "ಆರ್ಡರ್ ಶಬ್ದ, ಸೆಟ್ಟಿಂಗ್‌ಗಳು",
  },
});
type Text = (typeof TEXT)["en"];
const PART_LABEL: Record<Part, keyof Text> = { application: "partApplication", kitchen: "partKitchen", menu: "partMenu", orders: "partOrders", earnings: "partEarnings" };

/** One thing that stops customers ordering (or the chef getting paid), with the one button that fixes it. */
type Fix = {
  key: string;
  title: string;
  text: string;
  icon: ComponentType<{ className?: string }>;
  urgent?: boolean;
} & ({ href: string; action: string } | { onClick: () => void; action: string });

function isThisWeek(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - distanceFromMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return date >= start && date < end;
}

/** Shows the welcome only right after approval, only while there is no dish, and once per device. */
export function shouldWelcome(application: ChefApplication, menu: ChefMenuItem[], key: string): boolean {
  if (application.status !== "APPROVED" || menu.length > 0) return false;
  const reviewed = application.reviewedAt ? Date.parse(application.reviewedAt) : Number.NaN;
  // No approval date means no proof the approval is new: a long-time chef on a new phone isn't welcomed again.
  if (Number.isNaN(reviewed) || Date.now() - reviewed > WELCOME_DAYS * 86_400_000) return false;
  try {
    return !window.localStorage.getItem(key);
  } catch {
    // Without storage it can't remember the welcome was seen; the "Add your first dish" card still guides.
    return false;
  }
}

export function ChefModeDashboard() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const alertPrefs = useAlertPrefs();
  const [state, setState] = useState<DashboardState>("loading");
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showApprovalNotice, setShowApprovalNotice] = useState(false);
  const [approvalNoticeKey, setApprovalNoticeKey] = useState("");

  useEffect(() => {
    let active = true;

    async function loadApprovedSnapshot() {
      const kitchenRequest = sessionFetch("/api/chef/kitchen", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const menuRequest = kitchenRequest.then(async response => {
        if (!response.ok) return null;
        const raw = await response.clone().json().catch(() => undefined);
        if (raw === null || !parseChefKitchen(raw)) return null;
        return sessionFetch("/api/chef/menu", { cache: "no-store", credentials: "same-origin" });
      });
      // Only to send a chef with no bank account to add one; a failed check shows Withdraw, as the app does.
      const bankRequest = sessionFetch("/api/chef-onboarding/bank", { cache: "no-store", credentials: "same-origin" })
        .then(async (response) => (response.ok ? bankStatusSchema.safeParse(await response.json().catch(() => null)) : null))
        .catch(() => null);
      const balanceRequest = sessionFetch("/api/chef/finance/balance", { cache: "no-store", credentials: "same-origin" })
        .then(async (response) => (response.ok ? chefBalanceSchema.safeParse(await response.json().catch(() => null)) : null))
        .then((parsed) => (parsed?.success ? parsed.data : null))
        .catch(() => null);
      // The newest review and the kitchen's average; Home leaves reviews out when they can't be read.
      const reviewsRequest = fetchChefReviews({ limit: 1 })
        .then(async ({ items: [latest = null] }) => ({
          latest,
          average: latest ? ((await fetchChefReviewSummary(latest.kitchenId).catch(() => null))?.overallAverage ?? null) : null,
        }))
        .catch(() => null);
      const requests = await Promise.allSettled([
        sessionFetch("/api/chef/application", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        kitchenRequest,
        menuRequest,
        sessionFetch("/api/chef/orders", {
          cache: "no-store",
          credentials: "same-origin",
        }),
        sessionFetch("/api/chef/earnings", {
          cache: "no-store",
          credentials: "same-origin",
        }),
      ]);

      if (!active) return;
      const unavailable: Part[] = [];
      const details: Snapshot["details"] = [];
      let accessProblem = false;
      const fail = (part: Part, failure: unknown) => {
        unavailable.push(part);
        const message = chefErrorText(failure, "It couldn’t be loaded."); // also reports the error to Craves
        // A stale chef sign-in blocks every section at once; the notice explains it once.
        if (failure instanceof ChefError && /^CHEF_(ACCESS|ROLE)_REQUIRED$/.test(failure.ref)) {
          accessProblem = true;
          return;
        }
        details.push({ part, text: message });
      };
      const unreadable = (part: Part, ref: string) => fail(part, new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, ref, 200));
      let application: ChefApplication | null = null;
      let kitchen: ChefKitchen | null = null;
      let menu: ChefMenuItem[] = [];
      let orders: ChefOrder[] = [];
      let earnings: ChefEarning[] = [];

      const parts: Part[] = ["application", "kitchen", "menu", "orders", "earnings"];
      for (let index = 0; index < requests.length; index += 1) {
        const result = requests[index];
        const part = parts[index]!;
        if (index === 2 && result.status === "fulfilled" && result.value === null) continue;
        if (result.status !== "fulfilled") {
          fail(part, result.reason);
          continue;
        }
        if (!result.value?.ok) {
          fail(part, result.value ? chefApiError(result.value, await result.value.json().catch(() => null), "") : null);
          continue;
        }
        const raw = await result.value.json().catch(() => undefined);
        if (index === 0) application = parseChefApplication(raw);
        if (index === 1) {
          kitchen = raw === null ? null : parseChefKitchen(raw);
          if (raw !== null && !kitchen) unreadable(part, "INVALID_KITCHEN_RESPONSE");
        }
        if (index === 2) {
          const parsedMenu = parseChefMenuItems(raw);
          if (parsedMenu) menu = parsedMenu;
          else unreadable(part, "INVALID_MENU_RESPONSE");
        }
        if (index === 3) {
          const parsedOrders = parseChefOrdersResponse(raw);
          if (parsedOrders) orders = parsedOrders;
          else unreadable(part, "INVALID_CHEF_ORDERS_RESPONSE");
        }
        if (index === 4) {
          const parsedEarnings = parseChefEarnings(raw);
          if (parsedEarnings) earnings = parsedEarnings;
          else unreadable(part, "INVALID_CHEF_EARNINGS_RESPONSE");
        }
      }

      if (application?.status === "APPROVED" && !kitchen && !unavailable.includes("kitchen")) {
        // The application already named the kitchen and its address: save it, so the chef's only step is a first dish.
        kitchen = await createKitchenFromApplication(application, getSession()?.phoneNumber ?? "").catch(() => null);
      }
      const [bank, balance, reviews] = await Promise.all([bankRequest, balanceRequest, reviewsRequest]);

      if (!active) return;
      // Orders already waiting when Chef Mode opens are on screen; only later ones ring.
      if (!unavailable.includes("orders")) noticeNewOrders(orders);
      const needsBank = Boolean(bank?.success && (bank.data.state === "NOT_SUBMITTED" || bank.data.state === "SUPERSEDED"));
      setSnapshot({ application, kitchen, menu, orders, earnings, needsBank, balance, reviews, unavailable, details, accessProblem });
      if (application?.status === "APPROVED" && !unavailable.includes("kitchen") && !unavailable.includes("menu")) {
        const noticeKey = `craves-chef-approved:${application.id ?? getSession()?.id}:${application.reviewedAt ?? "approved"}`;
        setApprovalNoticeKey(noticeKey);
        setShowApprovalNotice(shouldWelcome(application, menu, noticeKey));
      }
      setState("approved");
    }

    loadApprovedSnapshot().catch(() => {
      if (!active) return;
      setState("error");
    });

    return () => {
      active = false;
    };
  }, [refreshTick]);

  // New orders appear (and ring) without a refresh; a check never undoes the chef's own tap.
  useChefOrderPolling(state === "approved", (orders) =>
    setSnapshot((current) => ({
      ...current,
      orders: mergeOrders(current.orders, orders),
      unavailable: current.unavailable.filter((part) => part !== "orders"),
      details: current.details.filter((detail) => detail.part !== "orders"),
    })),
  );

  const [orderNotice, setOrderNotice] = useState("");
  function updateOrder(order: ChefOrder) {
    setSnapshot((current) => ({
      ...current,
      orders: current.orders.map((existing) => (existing.id === order.id ? order : existing)),
    }));
    setOrderNotice(orderUpdateText(order, language));
    focusOrderAfterUpdate(order.id, "chef-order-update");
  }

  const stats = useMemo(() => {
    // Oldest first: the order that has waited longest gets answered first.
    const byAge = [...snapshot.orders].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    const actionOrders = byAge.filter(
      (order) => order.status === "CHEF_ACCEPTANCE_PENDING",
    );
    // Still in the kitchen: what's cooking (the next tap) first, then what waits for the rider.
    const cookingOrders = byAge.filter((order) => ["CHEF_ACCEPTED", "PREPARING"].includes(order.status));
    const activeOrders = [...cookingOrders, ...byAge.filter((order) => order.status === "READY_FOR_PICKUP")];
    const availableMenu = snapshot.menu.filter(
      (item) => item.status === "ACTIVE" && item.available,
    );
    const weekEntries = snapshot.earnings.filter(
      (entry) =>
        ["APPROVED", "SETTLEMENT_PENDING", "SETTLED"].includes(entry.status) &&
        isThisWeek(entry.createdAt),
    );
    const weekCurrency = weekEntries[0]?.currency ?? snapshot.earnings[0]?.currency ?? "INR";
    const weekAmount = weekEntries.reduce((sum, entry) => sum + entry.netPayable, 0);
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    // Orders the customer hasn't paid for aren't the chef's yet.
    const todayOrders = snapshot.orders.filter(order => !["PAYMENT_PENDING", "PAID", "CREATED"].includes(order.status) && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(order.createdAt)) === todayKey).length;
    return { actionOrders, activeOrders, cookingCount: cookingOrders.length, availableMenu, weekAmount, weekCurrency, todayOrders };
  }, [snapshot]);

  function dismissApprovalNotice() {
    if (approvalNoticeKey) {
      try {
        window.localStorage.setItem(approvalNoticeKey, "seen");
      } catch {
        // The notice can still close when browser storage is unavailable.
      }
    }
    setShowApprovalNotice(false);
  }

  if (state === "loading") return <ChefLoading shape="dashboard" label={text.loading} />;

  if (state === "error") {
    return (
      <ChefSection>
        <ChefEmpty
          illustration="loadError"
          title={text.loadFailedTitle}
          text={text.loadFailed}
          action={
            <button type="button" onClick={() => setRefreshTick((value) => value + 1)} className="chef-btn is-primary">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
              {text.tryAgain}
            </button>
          }
        />
      </ChefSection>
    );
  }

  const refresh = () => setRefreshTick((value) => value + 1);
  const kitchenOrMenuUnknown = snapshot.unavailable.includes("kitchen") || snapshot.unavailable.includes("menu");
  const takingOrders = snapshot.kitchen?.status === "ACTIVE";
  // Setup first; then what stops a customer ordering today; then what stops the chef hearing or getting paid.
  const fixes: Fix[] = [];
  if (kitchenOrMenuUnknown) fixes.push({ key: "check", title: text.checkTitle, text: text.checkText, icon: RefreshCw, onClick: refresh, action: text.tryAgain });
  else if (!snapshot.kitchen) fixes.push({ key: "name", title: text.nameTitle, text: text.nameText, icon: Store, href: "/chef/kitchen", action: text.nameAction, urgent: true });
  else if (snapshot.menu.length === 0) fixes.push({ key: "first-dish", title: text.firstDishTitle, text: text.firstDishText, icon: Utensils, href: "/chef/menu", action: text.firstDishAction, urgent: true });
  else if (takingOrders && stats.availableMenu.length === 0) fixes.push({ key: "no-dish-on", title: text.noDishOnTitle, text: text.noDishOnText, icon: ToggleRight, href: "/chef/menu", action: text.noDishOnAction, urgent: true });
  if (!alertPrefs.ring) fixes.push({ key: "sound", title: text.soundOffTitle, text: text.soundOffText, icon: BellOff, onClick: () => writeAlertPrefs({ ...alertPrefs, ring: true }), action: text.soundOffAction });
  // A missing bank account is the balance card's button below, as in the app.

  const kitchenName = snapshot.kitchen?.kitchenName || text.yourKitchen;
  // The chef's name from the application: never the phone number, never the customer profile.
  const firstName = snapshot.application?.firstName?.trim() || text.chef;
  const ordersUnknown = snapshot.unavailable.includes("orders");
  const newOrders = stats.actionOrders;
  const activeOrders = stats.activeOrders;

  return (
    <>
      {/* The shared sheet: focus moves in and back, Esc and Back close it, phones get a bottom sheet. */}
      <Sheet
        open={showApprovalNotice}
        onOpenChange={(open) => {
          if (!open) dismissApprovalNotice();
        }}
        title={text.welcomeTitle}
        description={snapshot.kitchen ? text.welcomeKitchen : text.welcomeNoKitchen}
        footer={
          <>
            <button type="button" onClick={dismissApprovalNotice} className={secondaryActionClass}>
              {text.notNow}
            </button>
            <Link
              href={snapshot.kitchen ? "/chef/menu" : "/chef/kitchen"}
              onClick={dismissApprovalNotice}
              className="craves-primary-action w-full sm:w-auto"
            >
              {snapshot.kitchen ? text.addFirstDish : text.setUpKitchen}
            </Link>
          </>
        }
      />

      <div className="chef-stack">
        <header className="flex min-w-0 items-center gap-3">
          {/* The chef's drawn face (never a photo of them), or their initial. */}
          <ChefFace photoUrl={snapshot.kitchen?.chefPhotoUrl} name={firstName} size={52} />
          <div className="min-w-0">
            <h1 className="chef-page-title">{format(text[greeting()], { name: firstName })}</h1>
            <p className="mt-1 truncate text-[0.9375rem] font-semibold text-[#6B6B6B]">{kitchenName}</p>
          </div>
        </header>

        {snapshot.unavailable.length > 0 ? (
          <ChefNotice icon={AlertTriangle} role="status">
            {snapshot.accessProblem ? (
              <>
                <p className="font-semibold">{text.ordersFailedTitle}</p>
                <p className="mt-1 text-[#6B6B6B]">{text.ordersFailedAccess}</p>
              </>
            ) : (
              <p>{text.someFailed}</p>
            )}
            {snapshot.details.map((detail) => <p key={detail.part} className="mt-1 text-[#6B6B6B]">{text[PART_LABEL[detail.part]]}: {detail.text}</p>)}
            {snapshot.accessProblem ? (
              <div className="mt-3">
                <ChefAccessRetry onRetry={refresh} />
              </div>
            ) : null}
          </ChefNotice>
        ) : null}

        {snapshot.kitchen ? (
          <ChefKitchenSwitch
            kitchen={snapshot.kitchen}
            onChange={(kitchen) => setSnapshot((current) => ({ ...current, kitchen }))}
            cookingCount={stats.cookingCount}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-5">
          <div className="chef-stack">
            {fixes.length > 0 ? (
              <section className="chef-stack" aria-labelledby="chef-fixes">
                <h2 id="chef-fixes" className="sr-only">{text.fixTitle}</h2>
                {fixes.map((fix) => (
                  <div key={fix.key} className={`chef-fix-card${fix.urgent ? " is-urgent" : ""}`}>
                    <span className="chef-fix-card-icon"><fix.icon className="h-5 w-5" aria-hidden="true" /></span>
                    <h3 className="chef-fix-card-title">{fix.title}</h3>
                    <p className="chef-fix-card-text">{fix.text}</p>
                    <div className="chef-fix-card-action">
                      {"href" in fix ? (
                        <Link href={fix.href} className={`chef-btn w-full sm:w-auto${fix.urgent ? " is-primary" : ""}`}>{fix.action}</Link>
                      ) : (
                        <button type="button" onClick={fix.onClick} className="chef-btn w-full sm:w-auto">{fix.action}</button>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {/* Times itself out (ChefFlash), paused while pointed at or focused. */}
            <OrderUpdateNotice id="chef-order-update" text={orderNotice} />

            {newOrders.length > 0 ? (
              <section className="chef-stack" aria-labelledby="chef-new-orders">
                <h2 id="chef-new-orders" className="chef-group-title is-attention">
                  <BellRing className="h-5 w-5" aria-hidden="true" />
                  {newOrders.length === 1 ? text.newOne : format(text.newMany, { count: newOrders.length })}
                </h2>
                {newOrders.map((order) => (
                  <ChefOrderCard key={order.id} order={order} onUpdated={updateOrder} />
                ))}
              </section>
            ) : null}

            {activeOrders.length > 0 ? (
              <section className="chef-stack" aria-labelledby="chef-active-orders">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="chef-active-orders" className="chef-group-title">{text.inKitchen}</h2>
                  <Link href="/chef/orders" className="chef-btn is-small">{text.allOrders}</Link>
                </div>
                {activeOrders.map((order) => (
                  <ChefOrderCard key={order.id} order={order} onUpdated={updateOrder} />
                ))}
              </section>
            ) : null}

            {newOrders.length === 0 && activeOrders.length === 0 ? (
              // A calm moment is one line, not a screen-sized card: the switch and the fixes stay on top.
              <div className="chef-quiet-line" role="status">
                <BellRing className="h-5 w-5" aria-hidden="true" />
                <p className="min-w-0 flex-1">
                  {ordersUnknown ? (snapshot.accessProblem ? text.ordersWaitAccess : text.ordersUnknown) : <><strong>{text.noOrders}</strong> {text.keepOpen}</>}
                </p>
                {snapshot.accessProblem ? null : (
                  <button type="button" onClick={refresh} className="chef-btn is-small shrink-0">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {text.checkNow}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="chef-stack">
            <ChefSection title={text.today} flush labelledBy="chef-today">
              <div className="chef-stats mt-1 border-t border-[#E3E6EA]">
                <Link href="/chef/orders" className="chef-stat">
                  <p className="chef-stat-label">{text.ordersToday}</p>
                  <p className="chef-stat-value">{ordersUnknown ? "—" : stats.todayOrders}</p>
                </Link>
                <Link href="/chef/orders" className="chef-stat">
                  <p className="chef-stat-label">{text.cookingNow}</p>
                  <p className="chef-stat-value">{ordersUnknown ? "—" : stats.cookingCount}</p>
                </Link>
                <Link href="/chef/menu" className="chef-stat">
                  <p className="chef-stat-label">{text.dishesOn}</p>
                  <p className="chef-stat-value">{snapshot.menu.length ? format(text.dishesOf, { on: stats.availableMenu.length, all: snapshot.menu.length }) : "0"}</p>
                </Link>
                <Link href="/chef/earnings" className="chef-stat">
                  <p className="chef-stat-label">{text.earnedWeek}</p>
                  <p className="chef-stat-value">{stats.weekAmount > 0 ? formatInr(stats.weekAmount, { currency: stats.weekCurrency, decimals: 0 }) : "₹0"}</p>
                </Link>
                {/* Only a real average: a chef with no reviews yet gets no empty "—" tile. */}
                {snapshot.reviews && snapshot.reviews.average !== null ? (
                  <Link href="/chef/reviews" className="chef-stat col-span-2 !border-r-0">
                    <p className="chef-stat-label">{text.rating}</p>
                    <p className="chef-stat-value">
                      {snapshot.reviews.average.toFixed(1)}<span aria-hidden="true"> ★</span>
                    </p>
                  </Link>
                ) : null}
              </div>
            </ChefSection>
            <section className="rounded-[var(--chef-radius)] bg-[#261A15] p-4 text-white md:p-5" aria-labelledby="chef-home-balance">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  {/* Not text-white: a legacy chef rule turns any heading with "text-white" ink-coloured. */}
                  <h2 id="chef-home-balance" className="text-[0.875rem] font-semibold text-[#EFE6E1]">{text.available}</h2>
                  <p className="chef-amount mt-1 truncate font-display text-[1.75rem] font-bold leading-tight">{snapshot.balance ? formatInr(snapshot.balance.available) : "—"}</p>
                </div>
                <Wallet className="h-7 w-7 shrink-0" aria-hidden="true" />
              </div>
              {/* Withdraw opens Money, where the balance's own button sends it to the bank. */}
              <Link href={snapshot.needsBank ? "/chef/bank" : "/chef/earnings"} className="chef-btn is-block mt-4 focus-visible:!outline-2 focus-visible:!outline-white">
                {snapshot.needsBank ? text.bankAction : text.withdraw}
              </Link>
            </section>
            {snapshot.reviews?.latest ? (
              <ChefSection
                title={text.latestReview}
                labelledBy="chef-latest-review"
                action={<Link href="/chef/reviews" className="chef-btn is-small">{text.seeAll}</Link>}
              >
                <ChefStars rating={snapshot.reviews.latest.overallRating} className="text-lg" />
                {snapshot.reviews.latest.reviewText ? <p className="mt-1 line-clamp-3 break-words text-[0.9375rem] leading-6 text-[#1A1A1A]">{snapshot.reviews.latest.reviewText}</p> : null}
                <p className="mt-2 text-[0.8125rem] text-[#6B6B6B]">{timeAgo(snapshot.reviews.latest.publishedAt, undefined, language)}</p>
              </ChefSection>
            ) : null}
            {alertPrefs.ring ? (
              // Sound settings live in Order settings; Home only says the phone will ring.
              <Link href="/chef/preferences" className="chef-section chef-row">
                <span className="chef-row-icon"><BellRing className="h-5 w-5" aria-hidden="true" /></span>
                <span className="chef-row-main">
                  <span className="chef-row-title block">{text.soundOn}</span>
                  <span className="chef-row-meta block">{text.soundSettings}</span>
                </span>
                <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

/** Good morning/afternoon/evening in India time. */
function greeting(): "morning" | "afternoon" | "evening" {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export default ChefModeDashboard;
