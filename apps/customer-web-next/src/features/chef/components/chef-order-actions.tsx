"use client";

import { CHEF_ERROR_MESSAGES, ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bike,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LoaderCircle,
  PackageCheck,
  Phone,
  XCircle,
} from "lucide-react";
import { ChefFlash, ChefNotice, ChefSection } from "@/features/chef/components/chef-ui";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { noteOrderAnswered } from "@/features/chef/lib/chef-order-alert";
import {
  parseChefOrderResponse,
  type ChefDeliveryPartner,
  type ChefOrder,
} from "@/features/chef/lib/chef-order-contract";
import { parseChefMenuItems, type ChefMenuItem } from "@/features/chef/lib/chef-menu-contract";
import {
  NOT_PICKED_UP_REASONS,
  acceptReadyMinutes,
  declineConsequence,
  notPickedUpCase,
  pickupEtaLabel,
  prepCountdown,
  respondCountdown,
  type Countdown,
} from "@/features/chef/lib/chef-order-presentation";
import { FEATURE_NOT_AVAILABLE, isFeatureUnavailable } from "@/shared/lib/feature-availability";
import { createSupportCase, SupportCaseError } from "@/shared/lib/support-cases-client";
import { shortOrderNumber } from "@/shared/lib/order-number";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { Dialog, Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

type DecisionStep = "choose" | "accept" | "decline";

const PREP_CHOICES = [15, 30, 45, 60] as const;
/** The chef reads the reason in their language; the order keeps the English one. */
const DECLINE_REASONS = messages({
  en: { busy: "I’m too busy right now", ingredients: "I don’t have the ingredients", closed: "My kitchen is closed today", other: "Something else" },
  te: { busy: "ఇప్పుడు నాకు చాలా పని ఉంది", ingredients: "కావాల్సిన సరుకులు నా దగ్గర లేవు", closed: "ఈరోజు నా వంటగది మూసి ఉంది", other: "ఇంకేదో కారణం" },
  kn: { busy: "ಈಗ ನನಗೆ ತುಂಬಾ ಕೆಲಸ ಇದೆ", ingredients: "ಬೇಕಾದ ಸಾಮಗ್ರಿ ನನ್ನ ಬಳಿ ಇಲ್ಲ", closed: "ಇಂದು ನನ್ನ ಅಡುಗೆಮನೆ ಮುಚ್ಚಿದೆ", other: "ಬೇರೆ ಕಾರಣ" },
});

const TEXT = messages({
  en: {
    reason: "Reason", partnerName: "{name} · Craves delivery", waitingPartner: "Waiting for a delivery partner", callName: "Call {name}", call: "Call",
    sent: "Sent to Craves support", supportSoon: "Support is coming soon. Call Craves support.", notPickedUp: "Not picked up", whatHappened: "What happened with #{number}?",
    cancel: "Cancel", sending: "Sending…", sendToSupport: "Send to support", supportDetails: "Details for support", supportDetailsHint: "Add details (optional)",
    supportNote: "Craves support gets this with the order attached and will call you if needed.", sendFailed: "We couldn’t send this. Check your connection and try again.",
    savingAnswer: "Saving your answer…", handOverSoon: "Handed over is coming soon.", saveFailed: "We couldn’t save your answer. Please try again.",
    orderChanged: "This order changed while you were looking at it. Refresh the order and check it again.", confirmFailed: "We couldn’t confirm the updated order. Please refresh it.",
    markedReady: "Food marked ready for pickup.", markedHandedOver: "Marked as handed over.",
    declinedDone: "Order declined. The customer will see that your kitchen couldn’t take it.", acceptedDone: "Order accepted. The customer sees your cooking time.",
    back: "Back", canYouCook: "Can you cook this now?", saving: "Saving…", acceptOrder: "Accept order", acceptIn: "Accept · ready in {minutes} min", cantTake: "Can’t take it",
    otherTime: "Choose another time", howLong: "How long will it take?", howLongNote: "Time to cook and pack the whole order.", cookingTime: "Cooking time", min: "min",
    anotherTime: "Another cooking time", minutesRange: "Minutes (1 to 1,440)", addNote: "Add a note", optional: "(optional)", noteLabel: "Note for the order",
    noteHint: "Anything useful about cooking or packing", customerSees: "The customer will see ", readyAbout: "Ready in about {minutes} minutes", customerSeesEnd: ".",
    prepError: "Enter a cooking time from 1 to 1,440 minutes, or pick one above.", startCooking: "Start cooking", whyNot: "Why can’t you take it?",
    tellBriefly: "Tell us briefly (at least 3 characters)", reasonHint: "A short reason is enough", declineOrder: "Decline order", chooseReason: "Choose a reason to decline.",
    allPacked: "Is everything packed?", allPackedNote: "Tap only when every item is cooked and packed.", foodReady: "Food is ready for pickup",
    waitingPickup: "Waiting for pickup", waitingPickupNote: "Hand the bag only to the partner shown here. Check the order number on the bag.", handedOver: "Handed over",
    nothingToDo: "Nothing to do right now", nothingToDoNote: "This order updates here if it needs you again.",
    readyTitle: "Is #{number} packed and ready?", partnerTold: "The delivery partner is told to pick it up.", notYet: "Not yet", yesReady: "Yes, it’s ready",
  },
  te: {
    reason: "కారణం", partnerName: "{name} · Craves డెలివరీ", waitingPartner: "డెలివరీ వ్యక్తి కోసం ఎదురుచూస్తోంది", callName: "{name} కి కాల్ చేయండి", call: "కాల్ చేయండి",
    sent: "Craves సహాయానికి పంపాం", supportSoon: "సహాయం త్వరలో వస్తుంది. Craves సహాయానికి కాల్ చేయండి.", notPickedUp: "తీసుకెళ్లలేదు", whatHappened: "#{number} కి ఏమైంది?",
    cancel: "రద్దు చేయండి", sending: "పంపుతున్నాం…", sendToSupport: "సహాయానికి పంపండి", supportDetails: "సహాయం కోసం వివరాలు", supportDetailsHint: "వివరాలు రాయండి (అవసరమైతే)",
    supportNote: "ఆర్డర్ వివరాలతో ఇది Craves సహాయానికి వెళ్తుంది. అవసరమైతే వాళ్లు మీకు కాల్ చేస్తారు.", sendFailed: "ఇది పంపలేకపోయాం. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.",
    savingAnswer: "మీ జవాబు సేవ్ అవుతోంది…", handOverSoon: "'అప్పగించాను' బటన్ త్వరలో వస్తుంది.", saveFailed: "మీ జవాబు సేవ్ చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    orderChanged: "మీరు చూస్తుండగానే ఈ ఆర్డర్ మారింది. ఆర్డర్ మళ్లీ లోడ్ చేసి సరిచూసుకోండి.", confirmFailed: "మారిన ఆర్డర్‌ను నిర్ధారించలేకపోయాం. దయచేసి ఆర్డర్ మళ్లీ లోడ్ చేయండి.",
    markedReady: "ఆహారం తీసుకెళ్లడానికి సిద్ధం అని గుర్తించాం.", markedHandedOver: "అప్పగించినట్టు గుర్తించాం.",
    declinedDone: "ఆర్డర్ తిరస్కరించారు. మీ వంటగది ఈ ఆర్డర్ తీసుకోలేకపోయిందని కస్టమర్‌కు కనిపిస్తుంది.", acceptedDone: "ఆర్డర్ ఒప్పుకున్నారు. మీ వంట సమయం కస్టమర్‌కు కనిపిస్తుంది.",
    back: "వెనక్కి", canYouCook: "ఇది ఇప్పుడు వండగలరా?", saving: "సేవ్ అవుతోంది…", acceptOrder: "ఆర్డర్ ఒప్పుకోండి", acceptIn: "ఒప్పుకోండి · {minutes} నిమి", cantTake: "తీసుకోలేను",
    otherTime: "వేరే సమయం ఎంచుకోండి", howLong: "ఎంత సమయం పడుతుంది?", howLongNote: "మొత్తం ఆర్డర్ వండి, ప్యాక్ చేయడానికి పట్టే సమయం.", cookingTime: "వంట సమయం", min: "నిమి",
    anotherTime: "వేరే వంట సమయం", minutesRange: "నిమిషాలు (1 నుంచి 1,440)", addNote: "నోట్ రాయండి", optional: "(అవసరమైతే)", noteLabel: "ఆర్డర్ కోసం నోట్",
    noteHint: "వంట లేదా ప్యాకింగ్ గురించి ఉపయోగపడే ఏదైనా విషయం", customerSees: "కస్టమర్‌కు ", readyAbout: "సుమారు {minutes} నిమిషాల్లో సిద్ధం", customerSeesEnd: " అని కనిపిస్తుంది.",
    prepError: "1 నుంచి 1,440 నిమిషాల మధ్య వంట సమయం రాయండి, లేదా పైన ఒకటి ఎంచుకోండి.", startCooking: "వంట మొదలుపెట్టండి", whyNot: "ఎందుకు తీసుకోలేరు?",
    tellBriefly: "క్లుప్తంగా చెప్పండి (కనీసం 3 అక్షరాలు)", reasonHint: "చిన్న కారణం చాలు", declineOrder: "ఆర్డర్ తిరస్కరించండి", chooseReason: "తిరస్కరించడానికి ఒక కారణం ఎంచుకోండి.",
    allPacked: "అంతా ప్యాక్ అయిందా?", allPackedNote: "ప్రతి ఐటమ్ వండి, ప్యాక్ చేసిన తర్వాతే నొక్కండి.", foodReady: "ఆహారం తీసుకెళ్లడానికి సిద్ధం",
    waitingPickup: "పికప్ కోసం ఎదురుచూస్తోంది", waitingPickupNote: "ఇక్కడ చూపిన డెలివరీ వ్యక్తికి మాత్రమే బ్యాగ్ ఇవ్వండి. బ్యాగ్ మీద ఆర్డర్ నంబర్ చూసుకోండి.", handedOver: "అప్పగించాను",
    nothingToDo: "ఇప్పుడు చేయాల్సింది ఏమీ లేదు", nothingToDoNote: "ఈ ఆర్డర్‌కు మీరు మళ్లీ అవసరమైతే ఇక్కడ కనిపిస్తుంది.",
    readyTitle: "#{number} ప్యాక్ అయి సిద్ధంగా ఉందా?", partnerTold: "తీసుకెళ్లమని డెలివరీ వ్యక్తికి చెబుతాం.", notYet: "ఇంకా లేదు", yesReady: "అవును, సిద్ధం",
  },
  kn: {
    reason: "ಕಾರಣ", partnerName: "{name} · Craves ಡೆಲಿವರಿ", waitingPartner: "ಡೆಲಿವರಿ ವ್ಯಕ್ತಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ", callName: "{name} ಅವರಿಗೆ ಕರೆ ಮಾಡಿ", call: "ಕರೆ ಮಾಡಿ",
    sent: "Craves ಸಹಾಯಕ್ಕೆ ಕಳುಹಿಸಲಾಗಿದೆ", supportSoon: "ಸಹಾಯ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ. Craves ಸಹಾಯಕ್ಕೆ ಕರೆ ಮಾಡಿ.", notPickedUp: "ತೆಗೆದುಕೊಂಡು ಹೋಗಿಲ್ಲ", whatHappened: "#{number} ಗೆ ಏನಾಯಿತು?",
    cancel: "ರದ್ದುಮಾಡಿ", sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…", sendToSupport: "ಸಹಾಯಕ್ಕೆ ಕಳುಹಿಸಿ", supportDetails: "ಸಹಾಯಕ್ಕಾಗಿ ವಿವರಗಳು", supportDetailsHint: "ವಿವರ ಸೇರಿಸಿ (ಬೇಕಿದ್ದರೆ)",
    supportNote: "ಆರ್ಡರ್ ವಿವರದೊಂದಿಗೆ ಇದು Craves ಸಹಾಯಕ್ಕೆ ಹೋಗುತ್ತದೆ. ಬೇಕಾದರೆ ಅವರು ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತಾರೆ.", sendFailed: "ಇದನ್ನು ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    savingAnswer: "ನಿಮ್ಮ ಉತ್ತರ ಉಳಿಸಲಾಗುತ್ತಿದೆ…", handOverSoon: "'ಹಸ್ತಾಂತರಿಸಿದೆ' ಬಟನ್ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ.", saveFailed: "ನಿಮ್ಮ ಉತ್ತರ ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    orderChanged: "ನೀವು ನೋಡುತ್ತಿರುವಾಗಲೇ ಈ ಆರ್ಡರ್ ಬದಲಾಗಿದೆ. ಆರ್ಡರ್ ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ ಪರಿಶೀಲಿಸಿ.", confirmFailed: "ಬದಲಾದ ಆರ್ಡರ್ ಖಚಿತಪಡಿಸಲಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಆರ್ಡರ್ ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.",
    markedReady: "ಆಹಾರ ತೆಗೆದುಕೊಂಡು ಹೋಗಲು ಸಿದ್ಧ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ.", markedHandedOver: "ಹಸ್ತಾಂತರಿಸಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ.",
    declinedDone: "ಆರ್ಡರ್ ತಿರಸ್ಕರಿಸಲಾಗಿದೆ. ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಇದನ್ನು ತೆಗೆದುಕೊಳ್ಳಲಾಗಲಿಲ್ಲ ಎಂದು ಗ್ರಾಹಕರಿಗೆ ಕಾಣುತ್ತದೆ.", acceptedDone: "ಆರ್ಡರ್ ಒಪ್ಪಿಕೊಂಡಿದ್ದೀರಿ. ನಿಮ್ಮ ಅಡುಗೆ ಸಮಯ ಗ್ರಾಹಕರಿಗೆ ಕಾಣುತ್ತದೆ.",
    back: "ಹಿಂದೆ", canYouCook: "ಇದನ್ನು ಈಗ ಅಡುಗೆ ಮಾಡಬಹುದೇ?", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", acceptOrder: "ಆರ್ಡರ್ ಒಪ್ಪಿಕೊಳ್ಳಿ", acceptIn: "ಒಪ್ಪಿಕೊಳ್ಳಿ · {minutes} ನಿಮಿ", cantTake: "ತೆಗೆದುಕೊಳ್ಳಲಾಗದು",
    otherTime: "ಬೇರೆ ಸಮಯ ಆಯ್ಕೆಮಾಡಿ", howLong: "ಎಷ್ಟು ಸಮಯ ಬೇಕು?", howLongNote: "ಇಡೀ ಆರ್ಡರ್ ಅಡುಗೆ ಮಾಡಿ ಪ್ಯಾಕ್ ಮಾಡಲು ಬೇಕಾದ ಸಮಯ.", cookingTime: "ಅಡುಗೆ ಸಮಯ", min: "ನಿಮಿ",
    anotherTime: "ಬೇರೆ ಅಡುಗೆ ಸಮಯ", minutesRange: "ನಿಮಿಷಗಳು (1 ರಿಂದ 1,440)", addNote: "ಟಿಪ್ಪಣಿ ಸೇರಿಸಿ", optional: "(ಬೇಕಿದ್ದರೆ)", noteLabel: "ಆರ್ಡರ್‌ಗೆ ಟಿಪ್ಪಣಿ",
    noteHint: "ಅಡುಗೆ ಅಥವಾ ಪ್ಯಾಕಿಂಗ್ ಬಗ್ಗೆ ಉಪಯುಕ್ತವಾದ ಏನಾದರೂ", customerSees: "ಗ್ರಾಹಕರಿಗೆ ", readyAbout: "ಸುಮಾರು {minutes} ನಿಮಿಷದಲ್ಲಿ ಸಿದ್ಧ", customerSeesEnd: " ಎಂದು ಕಾಣುತ್ತದೆ.",
    prepError: "1 ರಿಂದ 1,440 ನಿಮಿಷಗಳ ನಡುವೆ ಅಡುಗೆ ಸಮಯ ಬರೆಯಿರಿ, ಅಥವಾ ಮೇಲೆ ಒಂದನ್ನು ಆಯ್ಕೆಮಾಡಿ.", startCooking: "ಅಡುಗೆ ಶುರುಮಾಡಿ", whyNot: "ಯಾಕೆ ತೆಗೆದುಕೊಳ್ಳಲಾಗದು?",
    tellBriefly: "ಸಂಕ್ಷಿಪ್ತವಾಗಿ ತಿಳಿಸಿ (ಕನಿಷ್ಠ 3 ಅಕ್ಷರಗಳು)", reasonHint: "ಚಿಕ್ಕ ಕಾರಣ ಸಾಕು", declineOrder: "ಆರ್ಡರ್ ತಿರಸ್ಕರಿಸಿ", chooseReason: "ತಿರಸ್ಕರಿಸಲು ಒಂದು ಕಾರಣ ಆಯ್ಕೆಮಾಡಿ.",
    allPacked: "ಎಲ್ಲಾ ಪ್ಯಾಕ್ ಆಗಿದೆಯೇ?", allPackedNote: "ಪ್ರತಿ ಐಟಮ್ ಅಡುಗೆ ಆಗಿ ಪ್ಯಾಕ್ ಆದ ಮೇಲೆಯೇ ಒತ್ತಿ.", foodReady: "ಆಹಾರ ತೆಗೆದುಕೊಂಡು ಹೋಗಲು ಸಿದ್ಧ",
    waitingPickup: "ಪಿಕಪ್‌ಗಾಗಿ ಕಾಯುತ್ತಿದೆ", waitingPickupNote: "ಇಲ್ಲಿ ತೋರಿಸಿರುವ ಡೆಲಿವರಿ ವ್ಯಕ್ತಿಗೆ ಮಾತ್ರ ಬ್ಯಾಗ್ ಕೊಡಿ. ಬ್ಯಾಗ್ ಮೇಲಿನ ಆರ್ಡರ್ ಸಂಖ್ಯೆ ನೋಡಿ.", handedOver: "ಹಸ್ತಾಂತರಿಸಿದೆ",
    nothingToDo: "ಈಗ ಮಾಡಬೇಕಾದ್ದು ಏನೂ ಇಲ್ಲ", nothingToDoNote: "ಈ ಆರ್ಡರ್‌ಗೆ ನೀವು ಮತ್ತೆ ಬೇಕಾದರೆ ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    readyTitle: "#{number} ಪ್ಯಾಕ್ ಆಗಿ ಸಿದ್ಧವಾಗಿದೆಯೇ?", partnerTold: "ತೆಗೆದುಕೊಂಡು ಹೋಗಲು ಡೆಲಿವರಿ ವ್ಯಕ್ತಿಗೆ ತಿಳಿಸಲಾಗುತ್ತದೆ.", notYet: "ಇನ್ನೂ ಇಲ್ಲ", yesReady: "ಹೌದು, ಸಿದ್ಧ",
  },
});

// Native radios (one Tab stop, arrow keys) drawn as tiles; the tile shows the focus ring.
const tile =
  "relative flex cursor-pointer items-center rounded-xl border text-[#1A1A1A] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#1A1A1A]";

const field = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";

/** The step's own box on the order page; on an order card (inline) just a heading and note. */
function Frame({
  inline,
  title,
  note,
  action,
  children,
}: {
  inline: boolean;
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  if (!inline) return <ChefSection title={title} note={note} action={action}>{children}</ChefSection>;
  return (
    <div className="chef-order-step">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="chef-order-step-title">{title}</h3>
          {note ? <p className="chef-section-note mt-0.5">{note}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

let dishesRequest: Promise<ChefMenuItem[]> | null = null;

/** The chef's dishes, for the minutes one-tap Accept promises. Cards that open together share one read; a failed read counts as no dishes. */
function loadDishes(): Promise<ChefMenuItem[]> {
  dishesRequest ??= sessionFetch("/api/chef/menu", { cache: "no-store" })
    .then(async (response) => (response.ok ? parseChefMenuItems(await response.json().catch(() => null)) : null) ?? [])
    .catch(() => [])
    .finally(() => {
      dishesRequest = null;
    });
  return dishesRequest;
}

const TONE_COLOR = { danger: "var(--chef-error)", warning: "var(--chef-warning)", success: "var(--chef-success)" } as const;

/** A clock for the countdowns: ticks each second while the tab is visible, and only while something counts down. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const sync = () => {
      window.clearInterval(timer);
      setNow(Date.now());
      if (!document.hidden) timer = window.setInterval(() => setNow(Date.now()), 1_000);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active]);
  return now;
}

/** "Respond in 4:32" and the like, with a bar, and "You promised 12:40 pm" under it. A timer role, so screen readers don't read every tick. */
function CountdownLine({ countdown }: { countdown: Countdown }) {
  const color = TONE_COLOR[countdown.tone];
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-sm font-bold" style={{ color }}>
        {countdown.tone === "danger" ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span role="timer" className="shrink-0">{countdown.label}</span>
        {countdown.fill !== null ? (
          <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-[#F1F3F5]" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.round(countdown.fill * 100)}%`, background: color }} />
          </span>
        ) : null}
      </div>
      {countdown.detail ? <p className="mt-1 pl-6 text-[0.8125rem] font-semibold" style={{ color }}>{countdown.detail}</p> : null}
    </div>
  );
}

/** One reason from a short list, as tiles: the chef reads `labels`, the answer is the English reason. */
function ReasonTiles<K extends string>({ name, reasons, labels, value, onChange }: { name: string; reasons: Record<K, string>; labels: Record<K, string>; value: string; onChange(reason: string): void }) {
  const legend = useText(TEXT).reason;
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">{legend}</legend>
      {(Object.keys(reasons) as K[]).map((key) => {
        const item = reasons[key];
        const selected = value === item;
        return (
          <label
            key={key}
            className={`${tile} min-h-12 gap-3 px-4 text-left text-[0.9375rem] font-semibold ${selected ? "border-[#1A1A1A] bg-white shadow-[inset_0_0_0_1px_#1A1A1A]" : "border-[#D3D7DD] bg-white"}`}
          >
            <input type="radio" name={name} className="sr-only" checked={selected} onChange={() => onChange(item)} />
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-[#1A1A1A]" : "border-[#8A8F98]"}`} aria-hidden="true">{selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#1A1A1A]" /> : null}</span>
            {labels[key]}
          </label>
        );
      })}
    </fieldset>
  );
}

/** The courier for a ready order, or a plain line while none is assigned yet. */
function PartnerRow({ partner, now }: { partner: ChefDeliveryPartner | null | undefined; now: number }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const name = partner?.name;
  const phone = partner?.phone?.replace(/[^\d+]/g, "");
  const eta = pickupEtaLabel(partner?.pickupEtaAt ?? null, now, language);
  return (
    // Wraps: on a narrow phone (or a longer Telugu "Call") the button goes under the name, not beside a squeezed one.
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E3E6EA] bg-white p-3">
      {partner?.photoUrl ? (
        <ChefFace photoUrl={partner.photoUrl} name={name} size={40} />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F1F3F5] text-[#1A1A1A]" aria-hidden="true">
          <Bike className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-36">
        <p className="break-words font-semibold text-[#1A1A1A]">{name ? format(text.partnerName, { name }) : text.waitingPartner}</p>
        {name && eta ? <p className="text-[0.8125rem] text-[#6B6B6B]">{eta}</p> : null}
      </div>
      {name && phone ? (
        <a href={`tel:${phone}`} className="chef-btn is-small" aria-label={format(text.callName, { name })}>
          <Phone className="h-4 w-4" aria-hidden="true" /> {text.call}
        </a>
      ) : null}
    </div>
  );
}

/** "What happened with #X?": sends the answer to Craves support with the order attached. */
function NotPickedUp({ orderId }: { orderId: string }) {
  const text = useText(TEXT);
  const reasons = useText(NOT_PICKED_UP_REASONS);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(NOT_PICKED_UP_REASONS.en.notArrived);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState("");

  async function send() {
    if (sending) return;
    setSending(true);
    setFailed(false);
    try {
      await createSupportCase(notPickedUpCase(orderId, reason, note));
      setSent(text.sent);
      setOpen(false);
    } catch (caught) {
      if (caught instanceof SupportCaseError && caught.code === FEATURE_NOT_AVAILABLE) {
        setSent(text.supportSoon);
        setOpen(false);
      } else setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason(NOT_PICKED_UP_REASONS.en.notArrived);
          setNote("");
          setFailed(false);
          setOpen(true);
        }}
        className="chef-btn is-tall flex-1"
      >
        {text.notPickedUp}
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        busy={sending}
        closeOnOutsideTap={!note.trim()}
        title={format(text.whatHappened, { number: shortOrderNumber(orderId) })}
        footer={
          <>
            <button type="button" onClick={() => setOpen(false)} disabled={sending} className={secondaryActionClass}>{text.cancel}</button>
            <button type="button" onClick={() => void send()} aria-busy={sending || undefined} className="craves-primary-action w-full sm:w-auto">
              {sending ? text.sending : text.sendToSupport}
            </button>
          </>
        }
      >
        {/* Sheets open outside the chef page: the theme brings the chef error colour along. */}
        <div className="chef-panel-theme chef-sheet-theme mt-4">
          <ReasonTiles name={`not-picked-up-${orderId}`} reasons={NOT_PICKED_UP_REASONS.en} labels={reasons} value={reason} onChange={setReason} />
          <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">
            {text.supportDetails}
            <textarea value={note} maxLength={400} onChange={(event) => setNote(event.target.value)} placeholder={text.supportDetailsHint} className={`${field} min-h-24 py-3`} data-craves-single-border="true" />
          </label>
          <p className="mt-3 text-sm text-[#6B6B6B]">{text.supportNote}</p>
          {failed ? <p role="alert" className="chef-field-error mt-2">{text.sendFailed}</p> : null}
        </div>
      </Sheet>
      <ChefFlash message={sent} onClose={() => setSent("")} />
    </>
  );
}

export function ChefOrderActions({
  order,
  onUpdated,
  inline = false,
}: {
  order: ChefOrder;
  onUpdated(order: ChefOrder): void;
  /** On an order card: no box of its own, and nothing shown once the order needs nothing. */
  inline?: boolean;
}) {
  const standardInitial = PREP_CHOICES.includes(order.prepTimeMinutes as (typeof PREP_CHOICES)[number]);
  const [decisionStep, setDecisionStep] = useState<DecisionStep>("choose");
  const [prepTimeMinutes, setPrepTimeMinutes] = useState(
    order.prepTimeMinutes ? String(order.prepTimeMinutes) : "30",
  );
  // What the chef types under "Another cooking time" stays theirs, even when it matches a tile.
  const [customMinutes, setCustomMinutes] = useState(
    order.prepTimeMinutes && !standardInitial ? String(order.prepTimeMinutes) : "",
  );
  // Read once: the chef opens and closes "Another cooking time" freely after that.
  const [customOpen] = useState(() => Boolean(order.prepTimeMinutes) && !standardInitial);
  const [note, setNote] = useState(order.chefResponseNote ?? "");
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [handOverSoon, setHandOverSoon] = useState(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const [dishes, setDishes] = useState<ChefMenuItem[] | null>(null);
  const text = useText(TEXT);
  const declineReasons = useText(DECLINE_REASONS);
  const { language } = useLanguage();
  const stepRef = useRef<HTMLDivElement>(null);
  const stepChanged = useRef(false);
  const pending = order.status === "CHEF_ACCEPTANCE_PENDING";
  const cooking = order.status === "CHEF_ACCEPTED" || order.status === "PREPARING";
  const expiresAt = pending ? order.chefAcceptanceExpiresAt : null;
  const now = useNow(Boolean(expiresAt) || (cooking && Boolean(order.prepTimeMinutes)) || (order.status === "READY_FOR_PICKUP" && Boolean(order.deliveryPartner?.pickupEtaAt)));
  const countdown = expiresAt ? respondCountdown({ createdAt: order.createdAt, chefAcceptanceExpiresAt: expiresAt }, now, language) : prepCountdown(order, now, language);
  const clock = countdown ? <CountdownLine countdown={countdown} /> : null;
  // Null while the dishes load, so the one-tap button never promises a time it is about to change.
  const readyMinutes = order.prepTimeMinutes ?? (dishes ? acceptReadyMinutes(order, dishes) : null);
  const dishSummary = order.items.map((item) => `${item.quantity} × ${item.itemName}`).join(", ");

  useEffect(() => {
    if (!pending || order.prepTimeMinutes != null) return;
    let live = true;
    void loadDishes().then((items) => {
      if (live) setDishes(items);
    });
    return () => {
      live = false;
    };
  }, [pending, order.prepTimeMinutes]);

  // A new step replaces the buttons that were pressed: move focus to the new step's heading.
  useEffect(() => {
    if (!stepChanged.current) return;
    stepChanged.current = false;
    const heading = stepRef.current?.querySelector<HTMLElement>("h2, h3");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [decisionStep]);

  function goTo(step: DecisionStep) {
    if (busyAction) return;
    setError("");
    setMessage("");
    stepChanged.current = true;
    setDecisionStep(step);
  }

  async function act(path: string, body?: Record<string, unknown>) {
    if (busyAction) return;
    setBusyAction(path);
    setMessage(text.savingAnswer);
    setError("");
    try {
      // A chef answers long after the page opened: refresh the short sign-in cookie if needed.
      const response = await sessionFetch(`/api/chef/orders/${order.id}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => null);
      if (path === "handed-over" && isFeatureUnavailable(response.status, result)) {
        setHandOverSoon(true);
        setMessage(text.handOverSoon);
        return;
      }
      if (!response.ok) {
        const failure = chefApiError(response, result, text.saveFailed);
        // A conflict we have no exact text for keeps the plain "order changed" advice.
        throw response.status === 409 && !CHEF_ERROR_MESSAGES[failure.ref]
          ? new ChefError(text.orderChanged, failure.ref, 409)
          : failure;
      }
      const updated = parseChefOrderResponse(result);
      if (!updated || updated.id.toLowerCase() !== order.id.toLowerCase()) {
        throw new ChefError(text.confirmFailed, "INVALID_CHEF_ORDER_RESPONSE", response.status);
      }
      onUpdated(updated);
      noteOrderAnswered(updated);
      setMessage(
        path === "ready-for-pickup"
          ? text.markedReady
          : path === "handed-over"
            ? text.markedHandedOver
            : path === "reject"
              ? text.declinedDone
              : text.acceptedDone,
      );
    } catch (caught) {
      setError(chefErrorText(caught, text.saveFailed));
      setMessage("");
    } finally {
      setBusyAction(null);
    }
  }

  // While saving, buttons stay focusable (aria-disabled), so keyboard focus is never dropped.
  const busyProps = (action: string) => ({
    "aria-disabled": Boolean(busyAction) || undefined,
    "aria-busy": busyAction === action || undefined,
  });
  // While saving, the pressed button says so; the saved answer shows for a moment as a flash below.
  const feedback = error ? <ChefNotice icon={AlertTriangle} tone="danger" role="alert">{error}</ChefNotice> : null;
  const backButton = (
    <button type="button" onClick={() => goTo("choose")} className="chef-btn is-small !border-0 !bg-transparent px-2">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {text.back}
    </button>
  );

  let content: ReactNode;
  if (order.status === "CHEF_ACCEPTANCE_PENDING" && decisionStep === "choose") {
    content = (
      <Frame inline={inline} title={text.canYouCook}>
        {clock}
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            {...busyProps("accept")}
            disabled={readyMinutes === null}
            onClick={() => readyMinutes !== null && void act("accept", { prepTimeMinutes: readyMinutes, note: null, actionId: crypto.randomUUID() })}
            className="chef-btn is-go is-tall"
          >
            {busyAction === "accept" || readyMinutes === null ? <LoaderCircle className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
            {busyAction === "accept" ? text.saving : readyMinutes === null ? text.acceptOrder : format(text.acceptIn, { minutes: readyMinutes })}
          </button>
          <button type="button" {...busyProps("")} onClick={() => goTo("decline")} className="chef-btn is-danger is-tall">
            <XCircle className="h-6 w-6" aria-hidden="true" /> {text.cantTake}
          </button>
        </div>
        <button type="button" {...busyProps("")} onClick={() => goTo("accept")} className="chef-btn is-small is-quiet mt-2">
          {text.otherTime}
        </button>
        {feedback ? <div className="mt-3">{feedback}</div> : null}
      </Frame>
    );
  } else if (order.status === "CHEF_ACCEPTANCE_PENDING" && decisionStep === "accept") {
    const prep = Number(prepTimeMinutes);
    const validPrep = Number.isInteger(prep) && prep >= 1 && prep <= 1_440;
    content = (
      <Frame inline={inline} title={text.howLong} note={text.howLongNote} action={backButton}>
        <div className="chef-step">
          {clock}
          <fieldset>
            <legend className="sr-only">{text.cookingTime}</legend>
            <div className="grid grid-cols-4 gap-2">
              {PREP_CHOICES.map((minutes) => {
                const selected = prep === minutes && !customMinutes;
                return (
                  <label
                    key={minutes}
                    className={`${tile} min-h-14 justify-center text-base font-semibold ${selected ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : "border-[#D3D7DD] bg-white"}`}
                  >
                    <input
                      type="radio"
                      name={`prep-${order.id}`}
                      className="sr-only"
                      checked={selected}
                      onChange={() => {
                        setCustomMinutes("");
                        setPrepTimeMinutes(String(minutes));
                      }}
                    />
                    {minutes}
                    <span className="ml-0.5 text-sm font-medium">{text.min}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <details className="group mt-4" open={customOpen}>
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9375rem] font-semibold text-[#1A1A1A] [&::-webkit-details-marker]:hidden">{text.anotherTime}<ChevronDown className="h-4 w-4 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
            <label className="mt-1 block text-sm font-semibold text-[#1A1A1A]">
              {text.minutesRange}
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                value={customMinutes}
                onChange={(event) => {
                  setCustomMinutes(event.target.value);
                  setPrepTimeMinutes(event.target.value || "30");
                }}
                aria-invalid={!validPrep || undefined}
                aria-describedby={!validPrep ? `prep-error-${order.id}` : undefined}
                className={field}
                data-craves-single-border="true"
              />
            </label>
          </details>
          <details className="group mt-1">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.9375rem] font-semibold text-[#1A1A1A] [&::-webkit-details-marker]:hidden">{text.addNote} <span className="font-normal text-[#6B6B6B]">{text.optional}</span><ChevronDown className="h-4 w-4 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
            <label className="mt-1 block text-sm font-semibold text-[#1A1A1A]">{text.noteLabel}<input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className={field} placeholder={text.noteHint} data-craves-single-border="true" /></label>
          </details>
          <p className="mt-4 text-[0.9375rem] text-[#6B6B6B]">{text.customerSees}<strong className="text-[#1A1A1A]">{format(text.readyAbout, { minutes: validPrep ? prep : "—" })}</strong>{text.customerSeesEnd}</p>
          {!validPrep ? <p id={`prep-error-${order.id}`} className="chef-field-error">{text.prepError}</p> : null}
          {feedback}
          <button type="button" {...busyProps("accept")} disabled={!validPrep} onClick={() => void act("accept", { prepTimeMinutes: prep, note: note.trim() || null, actionId: crypto.randomUUID() })} className="chef-btn is-go is-tall is-block mt-5">{busyAction === "accept" ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}{busyAction === "accept" ? text.saving : text.startCooking}</button>
        </div>
      </Frame>
    );
  } else if (order.status === "CHEF_ACCEPTANCE_PENDING") {
    const reason = selectedReason === DECLINE_REASONS.en.other ? customReason.trim() : selectedReason;
    content = (
      <Frame inline={inline} title={text.whyNot} note={declineConsequence(order, language)} action={backButton}>
        <div className="chef-step">
          {clock}
          <ReasonTiles
            name={`decline-${order.id}`}
            reasons={DECLINE_REASONS.en}
            labels={declineReasons}
            value={selectedReason}
            onChange={(item) => {
              setSelectedReason(item);
              setError("");
            }}
          />
          {selectedReason === DECLINE_REASONS.en.other ? (
            <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">{text.tellBriefly}<textarea value={customReason} maxLength={500} onChange={(event) => setCustomReason(event.target.value)} className={`${field} min-h-24 py-3`} placeholder={text.reasonHint} data-craves-single-border="true" /></label>
          ) : null}
          {feedback}
          <button type="button" {...busyProps("reject")} disabled={reason.length < 3} onClick={() => void act("reject", { reason, actionId: crypto.randomUUID() })} className="chef-btn is-primary is-block mt-5">{busyAction === "reject" ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}{busyAction === "reject" ? text.saving : text.declineOrder}</button>
          {reason.length < 3 ? <p className="mt-2 text-[0.8125rem] text-[#6B6B6B]">{text.chooseReason}</p> : null}
        </div>
      </Frame>
    );
  } else if (order.status === "CHEF_ACCEPTED" || order.status === "PREPARING") {
    content = (
      <Frame inline={inline} title={text.allPacked} note={text.allPackedNote}>
        {clock}
        {feedback}
        <button type="button" {...busyProps("ready-for-pickup")} onClick={() => setConfirmReady(true)} className="chef-btn is-go is-tall is-block mt-1">{busyAction ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PackageCheck className="h-5 w-5" aria-hidden="true" />}{busyAction ? text.saving : text.foodReady}</button>
      </Frame>
    );
  } else if (order.status === "READY_FOR_PICKUP") {
    content = (
      <Frame inline={inline} title={text.waitingPickup} note={text.waitingPickupNote}>
        <PartnerRow partner={order.deliveryPartner} now={now} />
        {feedback ? <div className="mt-3">{feedback}</div> : null}
        <div className="mt-3 flex gap-2">
          <NotPickedUp orderId={order.id} />
          {order.chefHandedOverAt !== null ? null : handOverSoon ? (
            <p className="flex flex-[2] items-center justify-center rounded-xl bg-[#F1F3F5] px-3 text-center text-sm font-semibold text-[#6B6B6B]">{text.handOverSoon}</p>
          ) : (
            <button type="button" {...busyProps("handed-over")} onClick={() => void act("handed-over")} className="chef-btn is-go is-tall flex-[2]">
              {busyAction === "handed-over" ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
              {busyAction === "handed-over" ? text.saving : text.handedOver}
            </button>
          )}
        </div>
      </Frame>
    );
  } else if (inline) {
    content = null;
  } else {
    content = (
      <ChefNotice icon={CheckCircle2}>
        <p className="font-semibold">{text.nothingToDo}</p>
        <p className="mt-0.5 text-[#6B6B6B]">{text.nothingToDoNote}</p>
      </ChefNotice>
    );
  }

  return (
    <>
      <div ref={stepRef} className="[&_h2]:outline-none">
        {content}
      </div>
      {/* Always mounted, so each saved answer is announced (a new live region would stay silent). */}
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      <Dialog
        open={confirmReady}
        onOpenChange={setConfirmReady}
        busy={busyAction === "ready-for-pickup"}
        title={format(text.readyTitle, { number: shortOrderNumber(order.id) })}
        description={`${dishSummary}${dishSummary ? ". " : ""}${text.partnerTold}`}
        footer={
          <>
            <button type="button" onClick={() => setConfirmReady(false)} disabled={Boolean(busyAction)} className={secondaryActionClass}>{text.notYet}</button>
            <button
              type="button"
              aria-busy={busyAction === "ready-for-pickup" || undefined}
              onClick={async () => {
                await act("ready-for-pickup");
                setConfirmReady(false);
              }}
              className="craves-primary-action w-full sm:w-auto"
            >
              {busyAction === "ready-for-pickup" ? text.saving : text.yesReady}
            </button>
          </>
        }
      />
      {/* On an order card the list shows its own update notice, since the card moves on. */}
      {inline ? null : (
        <ChefFlash message={busyAction ? "" : message} announce={false} onClose={() => setMessage("")} />
      )}
    </>
  );
}
