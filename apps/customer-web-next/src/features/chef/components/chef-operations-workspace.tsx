"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { ChefEmpty, ChefNotice, ChefSection, clockTime, dateTime } from "@/features/chef/components/chef-ui";
import { ChefKitchenSwitch } from "@/features/chef/components/chef-kitchen-switch";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Clock3, RefreshCw, X } from "lucide-react";
import {
  parseChefApplication,
  type ChefApplication,
} from "@/features/chef-onboarding/lib/chef-application-contract";
import {
  parseChefApplicationReadiness,
  type ChefApplicationReadiness,
} from "@/features/chef/lib/chef-readiness-contract";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import type { ChefKitchen } from "@/features/chef/lib/chef-kitchen-types";
import {
  parseChefMenuItems,
  type ChefMenuItem,
} from "@/features/chef/lib/chef-menu-contract";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";

type LoadState = "loading" | "ready" | "error";
type DocumentState = ChefApplicationReadiness["documents"][number]["status"];

const TEXT = messages({
  en: {
    checking: "Checking your kitchen", failedTitle: "We couldn’t check your kitchen", failed: "We couldn’t check your kitchen right now.", tryAgain: "Try again",
    yes: "Yes, customers can find your kitchen", allDone: "Everything customers need is done.", notYet: "Not yet",
    finishOne: "Finish the step without a tick below.", finishMany: "Finish the {count} steps without a tick below.",
    need: "What customers need", approved: "Craves approved you", approvedOn: "Approved {date}", youreChef: "You’re a Craves chef.",
    askedChange: "Craves asked for a change: {reason}", beingChecked: "Craves is checking your details. This can take a few days.",
    seeApplication: "See application", openApplication: "Open application",
    open: "Kitchen is open", setUpFirst: "Set up your kitchen first.", suspended: "Craves has paused your kitchen. Ask Craves why.",
    canOrder: "Customers can order now.", useSwitch: "Use the switch above to open it.", setUpKitchen: "Set up kitchen",
    mapped: "Pickup address is on the map", addressSaved: "Your address is saved.", addAddressPin: "Add your address and put the pin on your home.",
    checkAddress: "Check address", addAddress: "Add address",
    dishOn: "At least one dish is on", addDishFirst: "Add a dish to your menu.", dishesOnOne: "{on} of {all} dish is on today.", dishesOnMany: "{on} of {all} dishes are on today.",
    goMenu: "Go to menu", addDish: "Add a dish", turnOn: "Turn a dish on",
    good: "Also good to have", photos: "Every dish has a photo", photosLater: "Photos show once you add dishes.", photosDone: "Customers see your food before they order.",
    photosMissingOne: "{count} dish has no photo. Customers see a plain picture instead.", photosMissingMany: "{count} dishes have no photo. Customers see a plain picture instead.",
    addPhotos: "Add photos", documents: "Your documents are checked", documentsCount: "{done} of {all} checked by Craves.", documentsApproved: "Craves checked them when it approved your kitchen.",
    documentsUnknown: "We couldn’t check your documents just now. Your kitchen isn’t affected.", seeDocuments: "See documents",
    hours: "Opening hours", hoursMeta: "When customers can order from you", checkAgain: "Check again", checkedAt: "Checked {time}",
    docPhoto: "Your photo", docIdFront: "ID card (front)", docIdBack: "ID card (back)", docPan: "PAN card", docKitchen1: "Kitchen photo 1", docKitchen2: "Kitchen photo 2",
    docFssai: "Food licence (FSSAI)", docProofFront: "Address proof (front)", docProofBack: "Address proof (back)", docOther: "Document",
    stateMissing: "Not sent", stateUploaded: "Being checked", stateApproved: "Checked", stateRejected: "Send again",
    done: " (done)", notDone: " (not done yet)",
  },
  te: {
    checking: "మీ వంటగదిని చూస్తున్నాం", failedTitle: "మీ వంటగదిని చూడలేకపోయాం", failed: "ఇప్పుడు మీ వంటగదిని చూడలేకపోయాం.", tryAgain: "మళ్లీ ప్రయత్నించండి",
    yes: "అవును, కస్టమర్లకు మీ వంటగది కనిపిస్తుంది", allDone: "కస్టమర్లకు కావాల్సినవన్నీ పూర్తయ్యాయి.", notYet: "ఇంకా లేదు",
    finishOne: "కింద టిక్ లేని పనిని పూర్తి చేయండి.", finishMany: "కింద టిక్ లేని {count} పనులు పూర్తి చేయండి.",
    need: "కస్టమర్లకు కావాల్సినవి", approved: "Craves మిమ్మల్ని ఆమోదించింది", approvedOn: "{date} న ఆమోదించారు", youreChef: "మీరు Craves చెఫ్.",
    askedChange: "Craves ఒక మార్పు అడిగింది: {reason}", beingChecked: "Craves మీ వివరాలు చూస్తోంది. దీనికి కొన్ని రోజులు పట్టవచ్చు.",
    seeApplication: "దరఖాస్తు చూడండి", openApplication: "దరఖాస్తు తెరవండి",
    open: "వంటగది తెరిచి ఉంది", setUpFirst: "ముందు మీ వంటగదిని సిద్ధం చేయండి.", suspended: "Craves మీ వంటగదిని ఆపింది. ఎందుకో Craves ని అడగండి.",
    canOrder: "కస్టమర్లు ఇప్పుడు ఆర్డర్ చేయవచ్చు.", useSwitch: "తెరవడానికి పైన ఉన్న స్విచ్ వాడండి.", setUpKitchen: "వంటగది సిద్ధం చేయండి",
    mapped: "పికప్ చిరునామా మ్యాప్‌లో ఉంది", addressSaved: "మీ చిరునామా సేవ్ అయింది.", addAddressPin: "మీ చిరునామా వేసి, మ్యాప్ పిన్‌ను మీ ఇంటిపై పెట్టండి.",
    checkAddress: "చిరునామా చూడండి", addAddress: "చిరునామా జోడించండి",
    dishOn: "కనీసం ఒక వంటకం ఆన్‌లో ఉంది", addDishFirst: "మీ మెనూలో ఒక వంటకం జోడించండి.", dishesOnOne: "{all} లో {on} వంటకం ఈరోజు ఆన్‌లో ఉంది.", dishesOnMany: "{all} లో {on} వంటకాలు ఈరోజు ఆన్‌లో ఉన్నాయి.",
    goMenu: "మెనూకి వెళ్లండి", addDish: "వంటకం జోడించండి", turnOn: "వంటకం ఆన్ చేయండి",
    good: "ఉంటే మంచిది", photos: "ప్రతి వంటకానికి ఫోటో ఉంది", photosLater: "వంటకాలు జోడించాక ఫోటోలు కనిపిస్తాయి.", photosDone: "ఆర్డర్ చేసే ముందే కస్టమర్లు మీ ఆహారాన్ని చూస్తారు.",
    photosMissingOne: "{count} వంటకానికి ఫోటో లేదు. కస్టమర్లకు ఖాళీ బొమ్మ కనిపిస్తుంది.", photosMissingMany: "{count} వంటకాలకు ఫోటో లేదు. కస్టమర్లకు ఖాళీ బొమ్మ కనిపిస్తుంది.",
    addPhotos: "ఫోటోలు జోడించండి", documents: "మీ పత్రాలు చెక్ అయ్యాయి", documentsCount: "{all} లో {done} Craves చెక్ చేసింది.", documentsApproved: "మీ కిచెన్‌ను ఆమోదించినప్పుడు Craves వాటిని చెక్ చేసింది.",
    documentsUnknown: "ఇప్పుడు మీ పత్రాలు చూడలేకపోయాం. దీని వల్ల మీ వంటగదికి ఏమీ కాదు.", seeDocuments: "పత్రాలు చూడండి",
    hours: "వంటగది సమయాలు", hoursMeta: "కస్టమర్లు ఎప్పుడు ఆర్డర్ చేయవచ్చు", checkAgain: "మళ్లీ చూడండి", checkedAt: "{time} కి చూశాం",
    docPhoto: "మీ ఫోటో", docIdFront: "గుర్తింపు కార్డు (ముందు)", docIdBack: "గుర్తింపు కార్డు (వెనుక)", docPan: "పాన్ కార్డు", docKitchen1: "వంటగది ఫోటో 1", docKitchen2: "వంటగది ఫోటో 2",
    docFssai: "ఆహార లైసెన్స్ (FSSAI)", docProofFront: "చిరునామా రుజువు (ముందు)", docProofBack: "చిరునామా రుజువు (వెనుక)", docOther: "పత్రం",
    stateMissing: "పంపలేదు", stateUploaded: "చెక్ చేస్తున్నారు", stateApproved: "చెక్ అయింది", stateRejected: "మళ్లీ పంపండి",
    done: " (పూర్తయింది)", notDone: " (ఇంకా కాలేదు)",
  },
  kn: {
    checking: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ನೋಡುತ್ತಿದ್ದೇವೆ", failedTitle: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ನೋಡಲಾಗಲಿಲ್ಲ", failed: "ಈಗ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ನೋಡಲಾಗಲಿಲ್ಲ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    yes: "ಹೌದು, ಗ್ರಾಹಕರಿಗೆ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಕಾಣುತ್ತದೆ", allDone: "ಗ್ರಾಹಕರಿಗೆ ಬೇಕಾದ ಎಲ್ಲವೂ ಮುಗಿದಿದೆ.", notYet: "ಇನ್ನೂ ಇಲ್ಲ",
    finishOne: "ಕೆಳಗೆ ಟಿಕ್ ಇಲ್ಲದ ಕೆಲಸವನ್ನು ಮುಗಿಸಿ.", finishMany: "ಕೆಳಗೆ ಟಿಕ್ ಇಲ್ಲದ {count} ಕೆಲಸಗಳನ್ನು ಮುಗಿಸಿ.",
    need: "ಗ್ರಾಹಕರಿಗೆ ಬೇಕಾದವು", approved: "Craves ನಿಮ್ಮನ್ನು ಅನುಮೋದಿಸಿದೆ", approvedOn: "{date} ರಂದು ಅನುಮೋದಿಸಲಾಗಿದೆ", youreChef: "ನೀವು Craves ಚೆಫ್.",
    askedChange: "Craves ಒಂದು ಬದಲಾವಣೆ ಕೇಳಿದೆ: {reason}", beingChecked: "Craves ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದೆ. ಇದಕ್ಕೆ ಕೆಲವು ದಿನ ಬೇಕಾಗಬಹುದು.",
    seeApplication: "ಅರ್ಜಿ ನೋಡಿ", openApplication: "ಅರ್ಜಿ ತೆರೆಯಿರಿ",
    open: "ಅಡುಗೆಮನೆ ತೆರೆದಿದೆ", setUpFirst: "ಮೊದಲು ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧಮಾಡಿ.", suspended: "Craves ನಿಮ್ಮ ಅಡುಗೆಮನೆ ನಿಲ್ಲಿಸಿದೆ. ಯಾಕೆ ಎಂದು Craves ಅನ್ನು ಕೇಳಿ.",
    canOrder: "ಗ್ರಾಹಕರು ಈಗ ಆರ್ಡರ್ ಮಾಡಬಹುದು.", useSwitch: "ತೆರೆಯಲು ಮೇಲಿನ ಸ್ವಿಚ್ ಬಳಸಿ.", setUpKitchen: "ಅಡುಗೆಮನೆ ಸಿದ್ಧಮಾಡಿ",
    mapped: "ಪಿಕಪ್ ವಿಳಾಸ ನಕ್ಷೆಯಲ್ಲಿದೆ", addressSaved: "ನಿಮ್ಮ ವಿಳಾಸ ಉಳಿಸಲಾಗಿದೆ.", addAddressPin: "ನಿಮ್ಮ ವಿಳಾಸ ಹಾಕಿ, ನಕ್ಷೆಯ ಪಿನ್ ಅನ್ನು ನಿಮ್ಮ ಮನೆಯ ಮೇಲೆ ಇಡಿ.",
    checkAddress: "ವಿಳಾಸ ನೋಡಿ", addAddress: "ವಿಳಾಸ ಸೇರಿಸಿ",
    dishOn: "ಕನಿಷ್ಠ ಒಂದು ಖಾದ್ಯ ಆನ್ ಆಗಿದೆ", addDishFirst: "ನಿಮ್ಮ ಮೆನುಗೆ ಒಂದು ಖಾದ್ಯ ಸೇರಿಸಿ.", dishesOnOne: "{all} ರಲ್ಲಿ {on} ಖಾದ್ಯ ಇಂದು ಆನ್ ಆಗಿದೆ.", dishesOnMany: "{all} ರಲ್ಲಿ {on} ಖಾದ್ಯಗಳು ಇಂದು ಆನ್ ಆಗಿವೆ.",
    goMenu: "ಮೆನುಗೆ ಹೋಗಿ", addDish: "ಖಾದ್ಯ ಸೇರಿಸಿ", turnOn: "ಖಾದ್ಯ ಆನ್ ಮಾಡಿ",
    good: "ಇದ್ದರೆ ಒಳ್ಳೆಯದು", photos: "ಪ್ರತಿ ಖಾದ್ಯಕ್ಕೆ ಫೋಟೋ ಇದೆ", photosLater: "ಖಾದ್ಯ ಸೇರಿಸಿದ ಮೇಲೆ ಫೋಟೋಗಳು ಕಾಣುತ್ತವೆ.", photosDone: "ಆರ್ಡರ್ ಮಾಡುವ ಮೊದಲೇ ಗ್ರಾಹಕರು ನಿಮ್ಮ ಊಟ ನೋಡುತ್ತಾರೆ.",
    photosMissingOne: "{count} ಖಾದ್ಯಕ್ಕೆ ಫೋಟೋ ಇಲ್ಲ. ಗ್ರಾಹಕರಿಗೆ ಖಾಲಿ ಚಿತ್ರ ಕಾಣುತ್ತದೆ.", photosMissingMany: "{count} ಖಾದ್ಯಗಳಿಗೆ ಫೋಟೋ ಇಲ್ಲ. ಗ್ರಾಹಕರಿಗೆ ಖಾಲಿ ಚಿತ್ರ ಕಾಣುತ್ತದೆ.",
    addPhotos: "ಫೋಟೋ ಸೇರಿಸಿ", documents: "ನಿಮ್ಮ ದಾಖಲೆಗಳು ಪರಿಶೀಲನೆ ಆಗಿವೆ", documentsCount: "{all} ರಲ್ಲಿ {done} Craves ಪರಿಶೀಲಿಸಿದೆ.", documentsApproved: "ನಿಮ್ಮ ಕಿಚನ್ ಅನುಮೋದಿಸಿದಾಗ Craves ಅವುಗಳನ್ನು ಪರಿಶೀಲಿಸಿದೆ.",
    documentsUnknown: "ಈಗ ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ನೋಡಲಾಗಲಿಲ್ಲ. ಇದರಿಂದ ನಿಮ್ಮ ಅಡುಗೆಮನೆಗೆ ಏನೂ ಆಗುವುದಿಲ್ಲ.", seeDocuments: "ದಾಖಲೆಗಳನ್ನು ನೋಡಿ",
    hours: "ಅಡುಗೆಮನೆ ಸಮಯ", hoursMeta: "ಗ್ರಾಹಕರು ಯಾವಾಗ ಆರ್ಡರ್ ಮಾಡಬಹುದು", checkAgain: "ಮತ್ತೆ ನೋಡಿ", checkedAt: "{time} ಕ್ಕೆ ನೋಡಲಾಗಿದೆ",
    docPhoto: "ನಿಮ್ಮ ಫೋಟೋ", docIdFront: "ಗುರುತಿನ ಚೀಟಿ (ಮುಂಭಾಗ)", docIdBack: "ಗುರುತಿನ ಚೀಟಿ (ಹಿಂಭಾಗ)", docPan: "ಪಾನ್ ಕಾರ್ಡ್", docKitchen1: "ಅಡುಗೆಮನೆ ಫೋಟೋ 1", docKitchen2: "ಅಡುಗೆಮನೆ ಫೋಟೋ 2",
    docFssai: "ಆಹಾರ ಪರವಾನಗಿ (FSSAI)", docProofFront: "ವಿಳಾಸ ಪುರಾವೆ (ಮುಂಭಾಗ)", docProofBack: "ವಿಳಾಸ ಪುರಾವೆ (ಹಿಂಭಾಗ)", docOther: "ದಾಖಲೆ",
    stateMissing: "ಕಳುಹಿಸಿಲ್ಲ", stateUploaded: "ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ", stateApproved: "ಪರಿಶೀಲಿಸಲಾಗಿದೆ", stateRejected: "ಮತ್ತೆ ಕಳುಹಿಸಿ",
    done: " (ಮುಗಿದಿದೆ)", notDone: " (ಇನ್ನೂ ಆಗಿಲ್ಲ)",
  },
});
type Text = (typeof TEXT)["en"];

/** Document names a chef recognises from the card in their hand. */
const DOCUMENT_NAMES: Record<string, keyof Text> = {
  APPLICANT_PHOTO: "docPhoto",
  GOVERNMENT_ID_FRONT: "docIdFront",
  GOVERNMENT_ID_BACK: "docIdBack",
  TAX_ID_CARD: "docPan",
  KITCHEN_PHOTO_1: "docKitchen1",
  KITCHEN_PHOTO_2: "docKitchen2",
  FSSAI_LICENSE: "docFssai",
  SELECTED_PROOF_FRONT: "docProofFront",
  SELECTED_PROOF_BACK: "docProofBack",
};
const DOCUMENT_STATES: Record<DocumentState, keyof Text> = {
  MISSING: "stateMissing",
  UPLOADED: "stateUploaded",
  APPROVED: "stateApproved",
  REJECTED: "stateRejected",
};

/** One thing customers need: a tick when it's done, and the one button that fixes it when it isn't. */
function CheckRow({
  done,
  title,
  detail,
  action,
  children,
}: {
  done: boolean;
  title: string;
  detail?: ReactNode;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  const text = useText(TEXT);
  return (
    <li className={`chef-check${done ? " is-done" : ""}`}>
      <span className="chef-check-mark" aria-hidden="true">
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="chef-check-title">
          {title}
          <span className="sr-only">{done ? text.done : text.notDone}</span>
        </p>
        {detail ? <p className="chef-check-detail">{detail}</p> : null}
        {children}
        {action ? (
          <Link href={action.href} className={`chef-btn is-small mt-3${done ? "" : " is-primary"}`}>
            {action.label}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function ChefOperationsWorkspace() {
  const text = useText(TEXT);
  const [application, setApplication] = useState<ChefApplication | null>(null);
  // Null when the document check couldn't answer: the rest of the list still shows.
  const [readiness, setReadiness] = useState<ChefApplicationReadiness | null>(null);
  const [kitchen, setKitchen] = useState<ChefKitchen | null>(null);
  const [menu, setMenu] = useState<ChefMenuItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setState("loading");
    setError("");
    try {
      const [applicationResponse, kitchenResponse, menuResponse, readinessResponse] =
        await Promise.all([
          sessionFetch("/api/chef/application", { cache: "no-store", credentials: "same-origin" }),
          sessionFetch("/api/chef/kitchen", { cache: "no-store", credentials: "same-origin" }),
          sessionFetch("/api/chef/menu", { cache: "no-store", credentials: "same-origin" }),
          sessionFetch("/api/chef/application/readiness", { cache: "no-store", credentials: "same-origin" }),
        ]);

      const [applicationRaw, kitchenRaw, menuRaw, readinessRaw] = await Promise.all([
        applicationResponse.json().catch(() => null),
        kitchenResponse.json().catch(() => null),
        menuResponse.json().catch(() => null),
        readinessResponse.json().catch(() => null),
      ]);

      if (!applicationResponse.ok) throw chefApiError(applicationResponse, applicationRaw, "We couldn’t check your application.");
      if (!kitchenResponse.ok) throw chefApiError(kitchenResponse, kitchenRaw, "We couldn’t check your kitchen.");
      if (!menuResponse.ok) throw chefApiError(menuResponse, menuRaw, "We couldn’t check your menu.");

      const parsedApplication = parseChefApplication(applicationRaw);
      const parsedKitchen = kitchenRaw === null ? null : parseChefKitchen(kitchenRaw);
      const parsedMenu = parseChefMenuItems(menuRaw);
      if (!parsedApplication) {
        throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_CHEF_APPLICATION_RESPONSE", 0);
      }
      if (kitchenRaw !== null && !parsedKitchen) {
        throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_KITCHEN_RESPONSE", 0);
      }
      if (!parsedMenu) {
        throw new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_MENU_RESPONSE", 0);
      }
      // Documents only add a tick under "good to have": a failed document check never hides the kitchen.
      const parsedReadiness = readinessResponse.ok ? parseChefApplicationReadiness(readinessRaw) : null;
      // Still reported to Craves, so a contract change is noticed.
      if (!parsedReadiness) chefErrorText(readinessResponse.ok ? new ChefError("", "INVALID_READINESS_RESPONSE", 200) : chefApiError(readinessResponse, readinessRaw, ""), "");

      setApplication(parsedApplication);
      setReadiness(parsedReadiness);
      setKitchen(parsedKitchen);
      setMenu(parsedMenu);
      setState("ready");
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(chefErrorText(caught, "We couldn’t check your kitchen right now."));
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const activeItems = menu.filter((item) => item.status === "ACTIVE");
    const availableItems = activeItems.filter((item) => item.available);
    const withImages = activeItems.filter((item) => item.images.length > 0);
    return {
      activeItems: activeItems.length,
      availableItems: availableItems.length,
      withImages: withImages.length,
    };
  }, [menu]);

  if (state === "loading") return <ChefLoading shape="checklist" head={false} label={text.checking} />;

  if (state === "error") {
    return (
      <ChefSection>
        <ChefEmpty
          icon={AlertTriangle}
          title={text.failedTitle}
          text={error}
          action={
            <button type="button" onClick={() => void load()} className="chef-btn is-primary">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {text.tryAgain}
            </button>
          }
        />
      </ChefSection>
    );
  }

  const applicationApproved = application?.status === "APPROVED";
  // Approval means Craves checked the documents, even when each one still reads UPLOADED.
  const hasSupportedProofs =
    applicationApproved ||
    (readiness !== null && readiness.approvedDocumentCount === readiness.requiredDocumentCount);
  const kitchenActive = kitchen?.status === "ACTIVE";
  const locationMapped =
    typeof kitchen?.latitude === "number" &&
    typeof kitchen.longitude === "number";
  const hasDishOn = metrics.availableItems > 0;
  // What makes a kitchen show up for customers; photos help but don't block it.
  const steps = [applicationApproved, kitchenActive, locationMapped, hasDishOn];
  const discoverable = steps.every(Boolean);
  const todo = steps.filter((done) => !done).length;
  const missingPhotos = metrics.activeItems - metrics.withImages;
  const address = [kitchen?.addressLine1, kitchen?.areaName].filter(Boolean).join(", ");
  const documentStatus = (status: DocumentState): DocumentState => (applicationApproved && status === "UPLOADED" ? "APPROVED" : status);

  return (
    <div className="chef-stack">
      <section className={`chef-check-hero${discoverable ? " is-live" : ""}`} aria-live="polite">
        <span className="chef-check-hero-icon">
          {discoverable ? <CheckCircle2 className="h-7 w-7" aria-hidden="true" /> : <Clock3 className="h-7 w-7" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <h2 className="chef-check-hero-title">{discoverable ? text.yes : text.notYet}</h2>
          <p className="chef-check-hero-text">
            {discoverable ? text.allDone : todo === 1 ? text.finishOne : format(text.finishMany, { count: todo })}
          </p>
        </div>
      </section>

      {kitchen ? <ChefKitchenSwitch kitchen={kitchen} onChange={setKitchen} /> : null}

      {kitchen ? (
        <div className="chef-section chef-list">
          <Link href="/chef/hours" className="chef-row">
            <span className="chef-row-icon"><Clock3 className="h-5 w-5" aria-hidden="true" /></span>
            <span className="chef-row-main">
              <span className="chef-row-title block">{text.hours}</span>
              <span className="chef-row-meta block">{text.hoursMeta}</span>
            </span>
            <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      <ChefSection title={text.need} flush labelledBy="chef-checklist">
        <ol className="chef-checklist">
          <CheckRow
            done={applicationApproved}
            title={text.approved}
            detail={
              applicationApproved
                ? application?.reviewedAt ? format(text.approvedOn, { date: dateTime(application.reviewedAt) }) : text.youreChef
                : application?.rejectionReason
                  ? format(text.askedChange, { reason: application.rejectionReason })
                  : text.beingChecked
            }
            action={
              applicationApproved
                ? { href: "/chef/application/status", label: text.seeApplication }
                : { href: "/chef/application", label: text.openApplication }
            }
          />
          <CheckRow
            done={kitchenActive}
            title={text.open}
            detail={!kitchen ? text.setUpFirst : kitchen.status === "SUSPENDED" ? text.suspended : kitchenActive ? text.canOrder : text.useSwitch}
            action={kitchen ? undefined : { href: "/chef/kitchen", label: text.setUpKitchen }}
          />
          <CheckRow
            done={locationMapped}
            title={text.mapped}
            detail={locationMapped ? address || text.addressSaved : text.addAddressPin}
            action={{ href: "/chef/kitchen", label: locationMapped ? text.checkAddress : text.addAddress }}
          />
          <CheckRow
            done={hasDishOn}
            title={text.dishOn}
            detail={
              metrics.activeItems === 0
                ? text.addDishFirst
                : format(metrics.activeItems === 1 ? text.dishesOnOne : text.dishesOnMany, { on: metrics.availableItems, all: metrics.activeItems })
            }
            action={{ href: "/chef/menu", label: hasDishOn ? text.goMenu : metrics.activeItems === 0 ? text.addDish : text.turnOn }}
          />
        </ol>
      </ChefSection>

      <ChefSection title={text.good} flush labelledBy="chef-checklist-extra">
        <ul className="chef-checklist">
          <CheckRow
            done={metrics.activeItems > 0 && missingPhotos === 0}
            title={text.photos}
            detail={
              metrics.activeItems === 0
                ? text.photosLater
                : missingPhotos === 0
                  ? text.photosDone
                  : format(missingPhotos === 1 ? text.photosMissingOne : text.photosMissingMany, { count: missingPhotos })
            }
            action={missingPhotos > 0 ? { href: "/chef/menu", label: text.addPhotos } : undefined}
          />
          <CheckRow
            done={hasSupportedProofs}
            title={text.documents}
            detail={applicationApproved ? text.documentsApproved : readiness ? format(text.documentsCount, { done: readiness.approvedDocumentCount, all: readiness.requiredDocumentCount }) : undefined}
            action={{ href: "/chef/documents", label: text.seeDocuments }}
          >
            {readiness ? (
              readiness.documents.length ? (
                <ul className="chef-check-docs">
                  {readiness.documents.map((document) => {
                    const status = documentStatus(document.status);
                    return (
                      <li key={document.documentType} className={`is-${status.toLowerCase()}`}>
                        {status === "APPROVED" ? (
                          <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                        ) : status === "UPLOADED" ? (
                          <Clock3 className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">{text[DOCUMENT_NAMES[document.documentType] ?? "docOther"]}</span>
                        <span className="chef-check-doc-state">{text[DOCUMENT_STATES[status]]}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null
            ) : applicationApproved ? null : (
              <div className="mt-3"><ChefNotice icon={AlertTriangle}>{text.documentsUnknown}</ChefNotice></div>
            )}
          </CheckRow>
        </ul>
      </ChefSection>

      <div className="flex flex-col items-center gap-2 pt-1">
        <button type="button" disabled={refreshing} onClick={() => void load(true)} className="chef-btn is-small" aria-busy={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {text.checkAgain}
        </button>
        {lastUpdatedAt ? <p className="text-[0.8125rem] text-[#6B6B6B]">{format(text.checkedAt, { time: clockTime(lastUpdatedAt.toISOString()) })}</p> : null}
      </div>
    </div>
  );
}

export default ChefOperationsWorkspace;
