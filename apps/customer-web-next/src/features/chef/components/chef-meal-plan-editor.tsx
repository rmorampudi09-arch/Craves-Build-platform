"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  Coffee,
  Cookie,
  Copy,
  Lock,
  Minus,
  Moon,
  Plus,
  Sun,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import {
  isComingSoon,
  loadMealSchedule,
  saveMealPlan,
  saveMealSchedule,
  submitMealPlan,
  uploadMealPlanPhoto,
} from "@/features/chef/api/chef-meal-plans";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import {
  ChefChoiceChips,
  ChefEmpty,
  ChefNotice,
  ChefPill,
  ChefSection,
} from "@/features/chef/components/chef-ui";
import { ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import type { ChefMenuItem, FoodType } from "@/features/chef/lib/chef-menu-contract";
import {
  addMealLabel,
  addSlot,
  chefPlanMetaLine,
  chefPlanPriceLabel,
  chefPlanStatus,
  copyDayToWeekdays,
  dayName,
  dayRangeLabel,
  daysWithMeals,
  DESCRIPTION_MAX,
  editorScheduleKind,
  formatPlanPrice,
  formatServiceTime,
  freeSlotsForDay,
  groupMealDays,
  initialSlots,
  LEAD_HOUR_OPTIONS,
  leadHoursLabel,
  mealSlotLabel,
  NAME_MAX,
  NOTE_MAX,
  otherWeekdaysHaveMeals,
  removeSlot,
  repeatsLabel,
  setSlotDish,
  setSlotQuantity,
  setSlotTime,
  perBillingUnit,
  billingPeriodLabel,
  slotsToScheduleRequest,
  stepWithErrors,
  TIME_OPTIONS,
  validateMealPlanForm,
  WEEK_ORDER,
  type EditorSlot,
  type MealPlanFormValues,
  type MealSlot,
} from "@/features/chef/lib/chef-meal-plans";
import { shrinkPhoto } from "@/features/chef/lib/shrink-photo";
import type {
  ChefMealPlan,
  ChefMealPlanPeriod,
  ChefMealSchedule,
} from "@/features/chef/lib/chef-subscription-plan-contract";
import { supportCaseNumber } from "@/shared/lib/order-number";
import { createSupportCase, SupportCaseError } from "@/shared/lib/support-cases-client";
import { SUPPORT_MESSAGE_MAX, SUPPORT_SUBJECT_MAX } from "@/shared/lib/support-cases-contract";
import { RequiredMark } from "@/shared/ui/forms/required-mark";
import {
  Dialog,
  Sheet,
  secondaryActionClass,
  useOverlayHistory,
} from "@/shared/ui/overlays/overlay";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    details: "Details", meals: "Meals", review: "Review", VEG: "Veg", NON_VEG: "Non-veg", EGG: "Egg",
    photoTooLarge: "Photo is too large. Pick a smaller photo.", photoType: "Choose a JPEG or PNG photo.", photoOther: "Choose another photo.",
    planLoadFailed: "This meal plan couldn’t load.", planLoadTitle: "Couldn’t load this meal plan", tryAgain: "Try again", loadingPlan: "Loading meal plan",
    mealPlans: "Meal plans", dish: "Dish",
    photosSoon: "Plan photos aren’t available yet.", retry: "Try again.", photoUploadFailed: "Photo couldn’t be uploaded. Try again.",
    photoNotUploaded: "Plan saved, but the photo wasn’t uploaded. {reason}",
    sent: "Sent to Craves for approval", draftSaved: "Draft saved", saveFailed: "The meal plan could not be saved. Try again.",
    planPhoto: "Plan photo", planPhotoNote: "Customers see it on the plan card. JPEG or PNG.", changePhoto: "Change photo", addPhoto: "Add plan photo",
    planName: "Plan name", planNamePlaceholder: "e.g. Weekly home lunch", howOften: "How often", price: "Price", pricePer: "Price {per}",
    leadLabel: "Cook how early", leadHelp: "How long before each meal you start preparing.",
    description: "Description", descriptionPlaceholder: "What customers get, how it’s packed", descriptionFull: "Description is at the {max} character limit.",
    datePlan: "This plan was set up by date. Set up one week; it repeats every week.",
    days: "Days", hasMeals: "{day}, has meals", keepMeal: "Add at least one meal to save schedule changes.",
    missingDish: "Select a dish for every meal: {days}.", noMeals: "No meals on {day}.", addFor: "{label} for {day}",
    copyDay: "Copy {day} to all weekdays", onlyOn: "You can only pick dishes that are on and available on your menu.",
    editDetails: "Edit details", edit: "Edit", editMeals: "Edit meals",
    note: "Note for Craves (optional)", notePlaceholder: "Anything the Craves team should know",
    locked: "You can’t edit the plan while Craves checks it. Usually takes a day.",
    checking: "Craves is checking this plan. You can’t edit it until then.",
    liveNote: "This plan is live. To change something, send us a request.",
    notLiveNote: "This plan isn’t live. To change something, send us a request.",
    dayNumber: "day {day}", editPlan: "Edit meal plan", newPlan: "New meal plan", step: "Step {step} of 3 · {name}",
    updatePlan: "Update the plan and submit it again.", show: "Show",
    back: "Back", nextMeals: "Next: Meals", nextReview: "Next: Review", sending: "Sending…", submit: "Submit for approval", requestChange: "Request a change",
    savingDraft: "Saving draft…", sendingCraves: "Sending to Craves…", pickDish: "Pick a dish", addMealFor: "Add a meal for {day}",
    saveDraftTitle: "Save as draft?", saveDraftText: "Your plan isn’t sent to Craves yet. A draft keeps what you’ve done so far.",
    keepEditing: "Keep editing", discard: "Discard", saveDraft: "Save draft",
    removeTitle: "Remove {meal} on {day}?", removeThis: "Remove this meal?", removeText: "The dish planned for it on this day is removed.",
    cancel: "Cancel", remove: "Remove", copyTitle: "Copy {day} to all weekdays?", copyText: "This replaces any meals already planned for the other weekdays.", copy: "Copy",
    unavailable: "This dish is not available on your menu right now.",
    slotTime: "{meal} time, for every {lower} in this plan", removeMeal: "Remove {meal}",
    slotDish: "{meal} dish, {dish}", notSelected: "not selected", onMenu: "{price} on menu", addDish: "Add a dish",
    portions: "{meal} portions", fewer: "Fewer {meal} portions", more: "More {meal} portions",
    setUpFirst: "Set up your kitchen first, then add dishes to your menu.", setUpKitchen: "Set up my kitchen",
    menuFailed: "Couldn’t load your menu. Check your connection and try again.", loadingMenu: "Loading your menu…",
    noneOn: "None of your dishes are on and available yet.",
    tellUs: "Tell us what you want to change.", sessionExpired: "Your session expired. Sign in again to continue.", requestFailed: "Your request didn’t send. Try again.",
    sentBefore: "Request sent (#{number}). A Craves support person will reply in ", help: "Help & support", sentAfter: ".",
    requestsSoon: "Coming soon: requests from here aren’t open yet. Use Help & support to reach Craves.",
    whatChange: "What should change?", requestFor: "For “{name}”. Tell us what to change and a Craves support person will reply.",
    done: "Done", sendRequest: "Send request",
  },
  te: {
    details: "వివరాలు", meals: "భోజనాలు", review: "సరిచూడండి", VEG: "వెజ్", NON_VEG: "నాన్-వెజ్", EGG: "ఎగ్",
    photoTooLarge: "ఫోటో చాలా పెద్దది. చిన్న ఫోటో ఎంచుకోండి.", photoType: "JPEG లేదా PNG ఫోటో ఎంచుకోండి.", photoOther: "వేరే ఫోటో ఎంచుకోండి.",
    planLoadFailed: "ఈ మీల్ ప్లాన్ లోడ్ కాలేదు.", planLoadTitle: "ఈ మీల్ ప్లాన్ లోడ్ కాలేదు", tryAgain: "మళ్లీ ప్రయత్నించండి", loadingPlan: "మీల్ ప్లాన్ లోడ్ అవుతోంది",
    mealPlans: "మీల్ ప్లాన్‌లు", dish: "వంటకం",
    photosSoon: "ప్లాన్ ఫోటోలు ఇంకా అందుబాటులో లేవు.", retry: "మళ్లీ ప్రయత్నించండి.", photoUploadFailed: "ఫోటో అప్‌లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.",
    photoNotUploaded: "ప్లాన్ సేవ్ అయింది, కానీ ఫోటో అప్‌లోడ్ కాలేదు. {reason}",
    sent: "ఆమోదం కోసం Craves కు పంపాం", draftSaved: "డ్రాఫ్ట్ సేవ్ అయింది", saveFailed: "మీల్ ప్లాన్ సేవ్ కాలేదు. మళ్లీ ప్రయత్నించండి.",
    planPhoto: "ప్లాన్ ఫోటో", planPhotoNote: "ప్లాన్ కార్డుపై కస్టమర్లకు ఇది కనిపిస్తుంది. JPEG లేదా PNG.", changePhoto: "ఫోటో మార్చండి", addPhoto: "ప్లాన్ ఫోటో జోడించండి",
    planName: "ప్లాన్ పేరు", planNamePlaceholder: "ఉదా. Weekly home lunch", howOften: "ఎన్ని రోజులకు ఒకసారి", price: "ధర", pricePer: "{per} ధర",
    leadLabel: "ఎంత ముందు వండాలి", leadHelp: "ప్రతి భోజనానికి ఎంత ముందు వంట మొదలుపెడతారు.",
    description: "వివరణ", descriptionPlaceholder: "కస్టమర్లకు ఏం వస్తుంది, ఎలా ప్యాక్ చేస్తారు", descriptionFull: "వివరణ {max} అక్షరాల పరిమితికి చేరింది.",
    datePlan: "ఈ ప్లాన్ తేదీల ప్రకారం చేశారు. ఒక వారం సెట్ చేయండి; అది ప్రతి వారం మళ్లీ వస్తుంది.",
    days: "రోజులు", hasMeals: "{day}, భోజనాలు ఉన్నాయి", keepMeal: "షెడ్యూల్ మార్పులు సేవ్ చేయడానికి కనీసం ఒక భోజనం జోడించండి.",
    missingDish: "ప్రతి భోజనానికి ఒక వంటకం ఎంచుకోండి: {days}.", noMeals: "{day} భోజనాలు లేవు.", addFor: "{day}: {label}",
    copyDay: "{day} భోజనాలను సోమ – శుక్ర అన్ని రోజులకు కాపీ చేయండి", onlyOn: "మీ మెనూలో ఆన్‌లో ఉన్న వంటకాలను మాత్రమే ఎంచుకోగలరు.",
    editDetails: "వివరాలు మార్చండి", edit: "మార్చండి", editMeals: "భోజనాలు మార్చండి",
    note: "Craves కోసం నోట్ (తప్పనిసరి కాదు)", notePlaceholder: "Craves టీమ్‌కు తెలియాల్సింది ఏదైనా",
    locked: "Craves చూస్తున్నంత సేపు ప్లాన్ మార్చలేరు. సాధారణంగా ఒక రోజు పడుతుంది.",
    checking: "Craves ఈ ప్లాన్ చూస్తోంది. అప్పటివరకు మీరు మార్చలేరు.",
    liveNote: "ఈ ప్లాన్ నడుస్తోంది. ఏదైనా మార్చాలంటే మాకు రిక్వెస్ట్ పంపండి.",
    notLiveNote: "ఈ ప్లాన్ ఇప్పుడు నడవడం లేదు. ఏదైనా మార్చాలంటే మాకు రిక్వెస్ట్ పంపండి.",
    dayNumber: "రోజు {day}", editPlan: "మీల్ ప్లాన్ మార్చండి", newPlan: "కొత్త మీల్ ప్లాన్", step: "దశ {step}/3 · {name}",
    updatePlan: "ప్లాన్ మార్చి మళ్లీ పంపండి.", show: "ఏది చూడాలి",
    back: "వెనక్కి", nextMeals: "తర్వాత: భోజనాలు", nextReview: "తర్వాత: సరిచూడండి", sending: "పంపుతున్నాం…", submit: "ఆమోదం కోసం పంపండి", requestChange: "మార్పు కోసం అడగండి",
    savingDraft: "డ్రాఫ్ట్ సేవ్ అవుతోంది…", sendingCraves: "Craves కు పంపుతున్నాం…", pickDish: "వంటకం ఎంచుకోండి", addMealFor: "{day}: భోజనం జోడించండి",
    saveDraftTitle: "డ్రాఫ్ట్‌గా సేవ్ చేయాలా?", saveDraftText: "మీ ప్లాన్ ఇంకా Craves కు పంపలేదు. డ్రాఫ్ట్‌లో ఇప్పటివరకు చేసినది ఉంటుంది.",
    keepEditing: "మార్చడం కొనసాగించండి", discard: "వదిలేయండి", saveDraft: "డ్రాఫ్ట్ సేవ్ చేయండి",
    removeTitle: "{day} {meal} తీసేయాలా?", removeThis: "ఈ భోజనం తీసేయాలా?", removeText: "ఈ రోజు దానికి పెట్టిన వంటకం తీసేస్తాం.",
    cancel: "రద్దు చేయండి", remove: "తీసేయండి", copyTitle: "{day} భోజనాలను సోమ – శుక్ర అన్ని రోజులకు కాపీ చేయాలా?", copyText: "సోమ – శుక్ర మిగతా రోజుల్లో ఇప్పటికే ఉన్న భోజనాల స్థానంలో ఇవి వస్తాయి.", copy: "కాపీ చేయండి",
    unavailable: "ఈ వంటకం ఇప్పుడు మీ మెనూలో అందుబాటులో లేదు.",
    slotTime: "{meal} సమయం (ఈ ప్లాన్‌లోని అన్ని రోజులకు)", removeMeal: "{meal} తీసేయండి",
    slotDish: "{meal} వంటకం, {dish}", notSelected: "ఎంచుకోలేదు", onMenu: "మెనూలో {price}", addDish: "వంటకం జోడించండి",
    portions: "{meal} ప్లేట్లు", fewer: "{meal} ప్లేట్లు తగ్గించండి", more: "{meal} ప్లేట్లు పెంచండి",
    setUpFirst: "ముందు మీ వంటగదిని సిద్ధం చేయండి, తర్వాత మీ మెనూలో వంటకాలు జోడించండి.", setUpKitchen: "వంటగది సిద్ధం చేయండి",
    menuFailed: "మీ మెనూ లోడ్ కాలేదు. ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", loadingMenu: "మీ మెనూ లోడ్ అవుతోంది…",
    noneOn: "మీ వంటకాలు ఏవీ ఇంకా ఆన్‌లో లేవు.",
    tellUs: "ఏం మార్చాలో మాకు చెప్పండి.", sessionExpired: "మీ సెషన్ ముగిసింది. కొనసాగడానికి మళ్లీ సైన్ ఇన్ చేయండి.", requestFailed: "మీ రిక్వెస్ట్ వెళ్లలేదు. మళ్లీ ప్రయత్నించండి.",
    sentBefore: "రిక్వెస్ట్ పంపాం (#{number}). Craves నుండి ఒకరు ", help: "సహాయం", sentAfter: " పేజీలో జవాబు ఇస్తారు.",
    requestsSoon: "త్వరలో వస్తుంది: ఇక్కడి నుండి రిక్వెస్ట్‌లు ఇంకా మొదలవలేదు. Craves ను చేరడానికి సహాయం పేజీ వాడండి.",
    whatChange: "ఏం మారాలి?", requestFor: "“{name}” కోసం. ఏం మార్చాలో చెప్పండి, Craves నుండి ఒకరు జవాబు ఇస్తారు.",
    done: "పూర్తయింది", sendRequest: "రిక్వెస్ట్ పంపండి",
  },
  kn: {
    details: "ವಿವರಗಳು", meals: "ಊಟಗಳು", review: "ಪರಿಶೀಲಿಸಿ", VEG: "ವೆಜ್", NON_VEG: "ನಾನ್-ವೆಜ್", EGG: "ಎಗ್",
    photoTooLarge: "ಫೋಟೋ ತುಂಬಾ ದೊಡ್ಡದಿದೆ. ಚಿಕ್ಕ ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.", photoType: "JPEG ಅಥವಾ PNG ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.", photoOther: "ಬೇರೆ ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.",
    planLoadFailed: "ಈ ಮೀಲ್ ಪ್ಲಾನ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ.", planLoadTitle: "ಈ ಮೀಲ್ ಪ್ಲಾನ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", loadingPlan: "ಮೀಲ್ ಪ್ಲಾನ್ ಲೋಡ್ ಆಗುತ್ತಿದೆ",
    mealPlans: "ಮೀಲ್ ಪ್ಲಾನ್‌ಗಳು", dish: "ಖಾದ್ಯ",
    photosSoon: "ಪ್ಲಾನ್ ಫೋಟೋಗಳು ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ.", retry: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", photoUploadFailed: "ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    photoNotUploaded: "ಪ್ಲಾನ್ ಉಳಿಸಲಾಗಿದೆ, ಆದರೆ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ. {reason}",
    sent: "ಅನುಮೋದನೆಗಾಗಿ Craves ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ", draftSaved: "ಡ್ರಾಫ್ಟ್ ಉಳಿಸಲಾಗಿದೆ", saveFailed: "ಮೀಲ್ ಪ್ಲಾನ್ ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    planPhoto: "ಪ್ಲಾನ್ ಫೋಟೋ", planPhotoNote: "ಪ್ಲಾನ್ ಕಾರ್ಡ್‌ನಲ್ಲಿ ಗ್ರಾಹಕರಿಗೆ ಇದು ಕಾಣುತ್ತದೆ. JPEG ಅಥವಾ PNG.", changePhoto: "ಫೋಟೋ ಬದಲಾಯಿಸಿ", addPhoto: "ಪ್ಲಾನ್ ಫೋಟೋ ಸೇರಿಸಿ",
    planName: "ಪ್ಲಾನ್ ಹೆಸರು", planNamePlaceholder: "ಉದಾ. Weekly home lunch", howOften: "ಎಷ್ಟು ದಿನಕ್ಕೊಮ್ಮೆ", price: "ಬೆಲೆ", pricePer: "{per} ಬೆಲೆ",
    leadLabel: "ಎಷ್ಟು ಮೊದಲು ಅಡುಗೆ ಮಾಡಬೇಕು", leadHelp: "ಪ್ರತಿ ಊಟಕ್ಕೆ ಎಷ್ಟು ಮೊದಲು ಅಡುಗೆ ಶುರುಮಾಡುತ್ತೀರಿ.",
    description: "ವಿವರಣೆ", descriptionPlaceholder: "ಗ್ರಾಹಕರಿಗೆ ಏನು ಸಿಗುತ್ತದೆ, ಹೇಗೆ ಪ್ಯಾಕ್ ಮಾಡುತ್ತೀರಿ", descriptionFull: "ವಿವರಣೆ {max} ಅಕ್ಷರಗಳ ಮಿತಿ ತಲುಪಿದೆ.",
    datePlan: "ಈ ಪ್ಲಾನ್ ದಿನಾಂಕಗಳ ಪ್ರಕಾರ ಮಾಡಲಾಗಿತ್ತು. ಒಂದು ವಾರ ಸಿದ್ಧಪಡಿಸಿ; ಅದು ಪ್ರತಿ ವಾರ ಮತ್ತೆ ಬರುತ್ತದೆ.",
    days: "ದಿನಗಳು", hasMeals: "{day}, ಊಟಗಳಿವೆ", keepMeal: "ವೇಳಾಪಟ್ಟಿ ಬದಲಾವಣೆ ಉಳಿಸಲು ಕನಿಷ್ಠ ಒಂದು ಊಟ ಸೇರಿಸಿ.",
    missingDish: "ಪ್ರತಿ ಊಟಕ್ಕೂ ಒಂದು ಖಾದ್ಯ ಆಯ್ಕೆಮಾಡಿ: {days}.", noMeals: "{day} ಊಟಗಳಿಲ್ಲ.", addFor: "{day}: {label}",
    copyDay: "{day} ದಿನದ ಊಟಗಳನ್ನು ಸೋಮ – ಶುಕ್ರ ಎಲ್ಲಾ ದಿನಗಳಿಗೆ ಕಾಪಿ ಮಾಡಿ", onlyOn: "ನಿಮ್ಮ ಮೆನುವಿನಲ್ಲಿ ಆನ್ ಇರುವ ಖಾದ್ಯಗಳನ್ನು ಮಾತ್ರ ಆಯ್ಕೆಮಾಡಬಹುದು.",
    editDetails: "ವಿವರಗಳನ್ನು ಬದಲಾಯಿಸಿ", edit: "ಬದಲಾಯಿಸಿ", editMeals: "ಊಟಗಳನ್ನು ಬದಲಾಯಿಸಿ",
    note: "Craves ಗಾಗಿ ಟಿಪ್ಪಣಿ (ಕಡ್ಡಾಯವಲ್ಲ)", notePlaceholder: "Craves ತಂಡಕ್ಕೆ ತಿಳಿಯಬೇಕಾದ್ದು ಏನಾದರೂ",
    locked: "Craves ಪರಿಶೀಲಿಸುತ್ತಿರುವಾಗ ಪ್ಲಾನ್ ಬದಲಾಯಿಸಲಾಗದು. ಸಾಮಾನ್ಯವಾಗಿ ಒಂದು ದಿನ ಬೇಕಾಗುತ್ತದೆ.",
    checking: "Craves ಈ ಪ್ಲಾನ್ ಪರಿಶೀಲಿಸುತ್ತಿದೆ. ಅಲ್ಲಿಯವರೆಗೆ ನೀವು ಬದಲಾಯಿಸಲಾಗದು.",
    liveNote: "ಈ ಪ್ಲಾನ್ ಚಾಲ್ತಿಯಲ್ಲಿದೆ. ಏನಾದರೂ ಬದಲಾಯಿಸಲು ನಮಗೆ ವಿನಂತಿ ಕಳುಹಿಸಿ.",
    notLiveNote: "ಈ ಪ್ಲಾನ್ ಚಾಲ್ತಿಯಲ್ಲಿಲ್ಲ. ಏನಾದರೂ ಬದಲಾಯಿಸಲು ನಮಗೆ ವಿನಂತಿ ಕಳುಹಿಸಿ.",
    dayNumber: "ದಿನ {day}", editPlan: "ಮೀಲ್ ಪ್ಲಾನ್ ಬದಲಾಯಿಸಿ", newPlan: "ಹೊಸ ಮೀಲ್ ಪ್ಲಾನ್", step: "ಹಂತ {step}/3 · {name}",
    updatePlan: "ಪ್ಲಾನ್ ಬದಲಾಯಿಸಿ ಮತ್ತೆ ಕಳುಹಿಸಿ.", show: "ಯಾವುದನ್ನು ನೋಡಬೇಕು",
    back: "ಹಿಂದೆ", nextMeals: "ಮುಂದೆ: ಊಟಗಳು", nextReview: "ಮುಂದೆ: ಪರಿಶೀಲಿಸಿ", sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…", submit: "ಅನುಮೋದನೆಗೆ ಕಳುಹಿಸಿ", requestChange: "ಬದಲಾವಣೆಗೆ ವಿನಂತಿಸಿ",
    savingDraft: "ಡ್ರಾಫ್ಟ್ ಉಳಿಸಲಾಗುತ್ತಿದೆ…", sendingCraves: "Craves ಗೆ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…", pickDish: "ಖಾದ್ಯ ಆಯ್ಕೆಮಾಡಿ", addMealFor: "{day}: ಊಟ ಸೇರಿಸಿ",
    saveDraftTitle: "ಡ್ರಾಫ್ಟ್ ಆಗಿ ಉಳಿಸಬೇಕೇ?", saveDraftText: "ನಿಮ್ಮ ಪ್ಲಾನ್ ಇನ್ನೂ Craves ಗೆ ಕಳುಹಿಸಿಲ್ಲ. ಡ್ರಾಫ್ಟ್‌ನಲ್ಲಿ ಇಲ್ಲಿಯವರೆಗೆ ಮಾಡಿದ್ದು ಉಳಿಯುತ್ತದೆ.",
    keepEditing: "ಬದಲಾಯಿಸುವುದನ್ನು ಮುಂದುವರಿಸಿ", discard: "ಬಿಟ್ಟುಬಿಡಿ", saveDraft: "ಡ್ರಾಫ್ಟ್ ಉಳಿಸಿ",
    removeTitle: "{day} {meal} ತೆಗೆದುಹಾಕಬೇಕೇ?", removeThis: "ಈ ಊಟ ತೆಗೆದುಹಾಕಬೇಕೇ?", removeText: "ಈ ದಿನ ಅದಕ್ಕೆ ಇಟ್ಟಿದ್ದ ಖಾದ್ಯ ತೆಗೆದುಹಾಕಲಾಗುತ್ತದೆ.",
    cancel: "ರದ್ದುಮಾಡಿ", remove: "ತೆಗೆದುಹಾಕಿ", copyTitle: "{day} ದಿನದ ಊಟಗಳನ್ನು ಸೋಮ – ಶುಕ್ರ ಎಲ್ಲಾ ದಿನಗಳಿಗೆ ಕಾಪಿ ಮಾಡಬೇಕೇ?", copyText: "ಸೋಮ – ಶುಕ್ರದ ಉಳಿದ ದಿನಗಳಲ್ಲಿ ಈಗಾಗಲೇ ಇರುವ ಊಟಗಳ ಬದಲು ಇವು ಬರುತ್ತವೆ.", copy: "ಕಾಪಿ ಮಾಡಿ",
    unavailable: "ಈ ಖಾದ್ಯ ಈಗ ನಿಮ್ಮ ಮೆನುವಿನಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ.",
    slotTime: "{meal} ಸಮಯ (ಈ ಪ್ಲಾನ್‌ನ ಎಲ್ಲಾ ದಿನಗಳಿಗೆ)", removeMeal: "{meal} ತೆಗೆದುಹಾಕಿ",
    slotDish: "{meal} ಖಾದ್ಯ, {dish}", notSelected: "ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ", onMenu: "ಮೆನುವಿನಲ್ಲಿ {price}", addDish: "ಖಾದ್ಯ ಸೇರಿಸಿ",
    portions: "{meal} ಪ್ಲೇಟ್‌ಗಳು", fewer: "{meal} ಪ್ಲೇಟ್ ಕಡಿಮೆ ಮಾಡಿ", more: "{meal} ಪ್ಲೇಟ್ ಹೆಚ್ಚಿಸಿ",
    setUpFirst: "ಮೊದಲು ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧಮಾಡಿ, ನಂತರ ನಿಮ್ಮ ಮೆನುಗೆ ಖಾದ್ಯಗಳನ್ನು ಸೇರಿಸಿ.", setUpKitchen: "ಅಡುಗೆಮನೆ ಸಿದ್ಧಮಾಡಿ",
    menuFailed: "ನಿಮ್ಮ ಮೆನು ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", loadingMenu: "ನಿಮ್ಮ ಮೆನು ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
    noneOn: "ನಿಮ್ಮ ಯಾವ ಖಾದ್ಯವೂ ಇನ್ನೂ ಆನ್ ಆಗಿಲ್ಲ.",
    tellUs: "ಏನು ಬದಲಾಯಿಸಬೇಕು ಎಂದು ನಮಗೆ ತಿಳಿಸಿ.", sessionExpired: "ನಿಮ್ಮ ಸೆಷನ್ ಮುಗಿದಿದೆ. ಮುಂದುವರಿಸಲು ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.", requestFailed: "ನಿಮ್ಮ ವಿನಂತಿ ಹೋಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    sentBefore: "ವಿನಂತಿ ಕಳುಹಿಸಲಾಗಿದೆ (#{number}). Craves ನಿಂದ ಒಬ್ಬರು ", help: "ಸಹಾಯ", sentAfter: " ಪುಟದಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ.",
    requestsSoon: "ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ: ಇಲ್ಲಿಂದ ವಿನಂತಿಗಳು ಇನ್ನೂ ಶುರುವಾಗಿಲ್ಲ. Craves ಅನ್ನು ಸಂಪರ್ಕಿಸಲು ಸಹಾಯ ಪುಟ ಬಳಸಿ.",
    whatChange: "ಏನು ಬದಲಾಗಬೇಕು?", requestFor: "“{name}” ಗಾಗಿ. ಏನು ಬದಲಾಯಿಸಬೇಕು ಎಂದು ತಿಳಿಸಿ, Craves ನಿಂದ ಒಬ್ಬರು ಉತ್ತರಿಸುತ್ತಾರೆ.",
    done: "ಮುಗಿದಿದೆ", sendRequest: "ವಿನಂತಿ ಕಳುಹಿಸಿ",
  },
});
type Text = (typeof TEXT)["en"];

type Step = 1 | 2 | 3;
const STEP_NAMES: Record<Step, "details" | "meals" | "review"> = { 1: "details", 2: "meals", 3: "review" };
// What the plan photo route takes: JPEG or PNG, 2 MB at most.
const PLAN_PHOTO_TYPES = ["image/jpeg", "image/png"];
const PLAN_PHOTO_MAX_BYTES = 2_097_152;
const MONTH_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
const SLOT_ICON: Record<MealSlot, typeof Sun> = {
  BREAKFAST: Coffee,
  LUNCH: Sun,
  SNACK: Cookie,
  DINNER: Moon,
};
const FIELD =
  "mt-2 block min-h-12 w-full rounded-xl border border-[#E3E6EA] bg-white px-4 text-base text-[#1A1A1A] disabled:bg-[#F1F3F5]";
const FOOD_COLOR: Record<FoodType, string> = { VEG: "#2E7D32", NON_VEG: "#D92D20", EGG: "#D99A00" };

/** The dish's cover photo, or its first. */
export const dishPhoto = (item: ChefMenuItem | undefined) =>
  item?.images.find((image) => image.primary)?.publicUrl ?? item?.images[0]?.publicUrl ?? null;
const isAvailable = (item: ChefMenuItem) => item.status === "ACTIVE" && item.available;

function photoProblem(error: unknown, text: Text): string {
  const ref = error instanceof ChefError ? error.ref : "";
  if (ref === "PLAN_IMAGE_SIZE_INVALID") return text.photoTooLarge;
  if (ref === "PLAN_IMAGE_TYPE_UNSUPPORTED" || ref === "INVALID_PLAN_IMAGE")
    return text.photoType;
  return error instanceof Error ? error.message : text.photoOther;
}

export type MenuState = {
  items: ChefMenuItem[];
  /** no-kitchen: the menu needs a kitchen profile first (400 KITCHEN_PROFILE_REQUIRED). */
  status: "loading" | "ready" | "error" | "no-kitchen";
  retry(): void;
};

/**
 * New plan, or an existing one (its meals load first). Drafts and plans sent back for changes are edited in 3 steps;
 * plans waiting approval, live or inactive are read-only with "Request a change". `initialStep` 2 opens on the meals.
 */
export function ChefMealPlanEditor({
  plan,
  initialStep,
  menu,
  onClose,
}: {
  plan: ChefMealPlan | null;
  initialStep: 1 | 2;
  menu: MenuState;
  onClose(message?: string): void;
}) {
  const text = useText(TEXT);
  const [schedule, setSchedule] = useState<ChefMealSchedule | null | undefined>(
    plan ? undefined : null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const loadFailed = text.planLoadFailed;

  useEffect(() => {
    if (!plan) return;
    let live = true;
    loadMealSchedule(plan.id)
      .then((value) => live && setSchedule(value))
      .catch((cause) => live && setError(chefErrorText(cause, loadFailed)));
    return () => {
      live = false;
    };
  }, [plan, attempt, loadFailed]);

  if (schedule !== undefined)
    return (
      <MealPlanForm
        plan={plan}
        schedule={schedule}
        initialStep={initialStep}
        menu={menu}
        onClose={onClose}
      />
    );
  return (
    <div className="chef-dish-editor">
      <BackButton onClick={() => onClose()} />
      {error ? (
        <ChefSection>
          <ChefEmpty
            illustration="loadError"
            title={text.planLoadTitle}
            text={error}
            action={
              <button
                type="button"
                className="chef-btn"
                onClick={() => {
                  setError("");
                  setAttempt((value) => value + 1);
                }}
              >
                {text.tryAgain}
              </button>
            }
          />
        </ChefSection>
      ) : (
        <ChefLoading shape="form" head={false} label={text.loadingPlan} />
      )}
    </div>
  );
}

function BackButton({ onClick, disabled }: { onClick(): void; disabled?: boolean }) {
  const text = useText(TEXT);
  return (
    <button
      type="button"
      className="chef-back-link !border-0 !bg-transparent !shadow-none"
      disabled={disabled}
      onClick={onClick}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {text.mealPlans}
    </button>
  );
}

function MealPlanForm({
  plan,
  schedule,
  initialStep,
  menu,
  onClose,
}: {
  plan: ChefMealPlan | null;
  schedule: ChefMealSchedule | null;
  initialStep: Step;
  menu: MenuState;
  onClose(message?: string): void;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const editable = !plan || plan.status === "DRAFT" || plan.status === "REJECTED";
  const kind = editorScheduleKind(editable, schedule);
  const datePlanReset = editable && schedule?.recurrenceType === "MONTHLY";

  const [step, setStep] = useState<Step>(initialStep);
  const [savedPlanId, setSavedPlanId] = useState(plan?.id ?? null);
  const [form, setForm] = useState<MealPlanFormValues>({
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    amount: plan ? String(plan.amount) : "",
  });
  const [period, setPeriod] = useState<ChefMealPlanPeriod>(plan?.billingPeriod ?? "WEEKLY");
  const [leadHours, setLeadHours] = useState(schedule?.generationLeadHours ?? 24);
  const [slots, setSlots] = useState<EditorSlot[]>(() => initialSlots(editable, schedule));
  const [day, setDay] = useState(() => slots[0]?.day ?? WEEK_ORDER[0]);
  const [imageUrl, setImageUrl] = useState(plan?.imageUrl ?? null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [attempt, setAttempt] = useState<"draft" | "submit" | null>(null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [serverError, setServerError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const [sheet, setSheet] = useState<{ kind: "dish"; key: string } | { kind: "add" } | null>(null);
  const [note, setNote] = useState("");
  const [hasServerSchedule, setHasServerSchedule] = useState(schedule !== null);
  const [scheduleNote, setScheduleNote] = useState(false);
  const [removing, setRemoving] = useState<EditorSlot | null>(null);
  const [copying, setCopying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const router = useRouter();
  // State lags a frame behind a tap; the lock keeps a double tap to one request.
  const saving = useRef(false);
  /** The page a link was taking the chef to when "Save as draft?" opened. */
  const leaveTo = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);

  // Errors appear after the first Next / save attempt and then follow the chef's edits.
  const errors = attempt ? validateMealPlanForm(form, slots, attempt, language) : {};
  const locked = !editable || busy !== null;
  const hasDishes = slots.some((slot) => slot.menuItemId !== null);
  // Only a schedule with dishes is sent, so a draft without any keeps the server's old schedule.
  const scheduleKept = hasServerSchedule && !hasDishes;
  const mealDays = daysWithMeals(slots);
  const daySlots = slots.filter((slot) => slot.day === day);
  const freeSlots = freeSlotsForDay(slots, day);
  const missingDishDays =
    attempt === "submit"
      ? [...new Set(slots.filter((slot) => slot.menuItemId === null).map((slot) => slot.day))]
      : [];
  const availableDishes = useMemo(() => menu.items.filter(isAvailable), [menu.items]);
  const menuById = useMemo(
    () => new Map(menu.items.map((item) => [item.id, item] as const)),
    [menu.items],
  );
  const scheduledNames = useMemo(
    () =>
      new Map((schedule?.items ?? []).map((item) => [item.menuItemId, item.menuItemName] as const)),
    [schedule],
  );
  const dishName = (menuItemId: string) =>
    menuById.get(menuItemId)?.itemName ?? scheduledNames.get(menuItemId) ?? text.dish;
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const photoUrl = preview ?? imageUrl;

  /** Close, the back link and Back: ask first when a draft would be lost. */
  function requestLeave(): boolean {
    if (saving.current) return false;
    if (editable && dirty) {
      setAskLeave(true);
      return false;
    }
    onClose();
    return true;
  }
  // The editor is its own screen to the phone: Back returns to the plans instead of leaving the page.
  useOverlayHistory(true, requestLeave);
  useEffect(() => {
    if (!editable || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    // In-app links (the header, the desktop nav) would drop the draft too: ask first, then follow the link.
    const guard = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target ||
        link.hasAttribute("download") ||
        link.origin !== window.location.origin ||
        (link.pathname === window.location.pathname && link.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (saving.current) return;
      leaveTo.current = link.pathname + link.search + link.hash;
      setSheet(null);
      setAskLeave(true);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guard, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guard, true);
    };
  }, [editable, dirty]);
  /** Done with the editor: back to the plans, or on to the page of the link that asked to leave. */
  function leave(message?: string, to = leaveTo.current) {
    leaveTo.current = null;
    if (!to) return onClose(message);
    setDirty(false);
    router.push(to);
  }
  function stay() {
    leaveTo.current = null;
    setAskLeave(false);
  }
  // A new step starts at its top, and screen readers hear which step it is.
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const updateForm = (field: keyof MealPlanFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  };
  const updateSlots = (change: (current: EditorSlot[]) => EditorSlot[]) => {
    setSlots(change);
    setDirty(true);
  };

  async function pickPhoto(file: File) {
    setPhotoError("");
    if (!PLAN_PHOTO_TYPES.includes(file.type)) return setPhotoError(text.photoType);
    // Shown 4:3 on plan cards, like the app's picker; a photo the browser can't read is sent as chosen and the server checks it.
    const prepared = await shrinkPhoto(file, 4 / 3);
    if (prepared.size > PLAN_PHOTO_MAX_BYTES)
      return setPhotoError(text.photoTooLarge);
    setPhoto(prepared);
    setDirty(true);
  }

  /** False when the chef has to deal with the photo before going on; the saved plan is kept either way. */
  async function uploadPhoto(planId: string, file: File) {
    try {
      setImageUrl((await uploadMealPlanPhoto(planId, file)).imageUrl);
      setPhoto(null);
      return true;
    } catch (cause) {
      if (isComingSoon(cause)) {
        setPhoto(null);
        setPhotoError(text.photosSoon);
        return true;
      }
      const rejected = cause instanceof ChefError && cause.status === 400;
      const reason = rejected ? photoProblem(cause, text) : text.retry;
      if (rejected) setPhoto(null);
      else setDirty(true); // the plan is saved; only the photo still waits to upload
      setPhotoError(rejected ? reason : text.photoUploadFailed);
      setServerError(format(text.photoNotUploaded, { reason }));
      return false;
    }
  }

  async function save(mode: "draft" | "submit") {
    setAttempt(mode);
    setAskLeave(false);
    if (saving.current) return;
    const to = leaveTo.current;
    leaveTo.current = null;
    const problem = stepWithErrors(validateMealPlanForm(form, slots, mode));
    if (problem) return setStep(problem);
    saving.current = true;
    setBusy(mode);
    setServerError("");
    setPhotoError("");
    setScheduleNote(false);
    try {
      const input = {
        name: form.name.trim(),
        description: form.description.trim(),
        billingPeriod: period,
        amount: Number(form.amount.trim()),
        currency: "INR" as const,
      };
      const saved = await saveMealPlan(savedPlanId, input);
      setSavedPlanId(saved.id);
      if (hasDishes) {
        await saveMealSchedule(saved.id, slotsToScheduleRequest(slots, leadHours));
        setHasServerSchedule(true);
      }
      setDirty(false);
      // Before submit: the server takes photos only while the plan is a draft.
      if (photo && !(await uploadPhoto(saved.id, photo))) return;
      if (mode === "submit") await submitMealPlan(saved.id, note);
      if (scheduleKept) {
        // A schedule can't be emptied, so the server kept the old one; stay, and show the Meals step that says so.
        setScheduleNote(true);
        setDirty(true);
        setStep(2);
        return;
      }
      leave(mode === "submit" ? text.sent : text.draftSaved, to);
    } catch (cause) {
      setServerError(chefErrorText(cause, text.saveFailed));
    } finally {
      saving.current = false;
      setBusy(null);
    }
  }

  function goToMeals() {
    setAttempt((current) => current ?? "draft");
    if (Object.keys(validateMealPlanForm(form, slots, "draft")).length === 0) setStep(2);
  }
  function goToReview() {
    setAttempt("submit");
    setStep(stepWithErrors(validateMealPlanForm(form, slots, "submit")) ?? 3);
  }
  function copyToWeekdays() {
    updateSlots((current) => copyDayToWeekdays(current, day));
    setCopying(false);
  }

  const perUnit = perBillingUnit(period, language);
  const dayLong = dayName(kind, day, "long", language);
  const status = plan ? chefPlanStatus(plan.status, language) : null;
  const fieldError = (key: string) =>
    errors[key] ? (
      <p id={`plan-${key}-error`} className="chef-field-error">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: string) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `plan-${key}-error` } : {};

  const details = (
    <fieldset disabled={locked} className="chef-stack min-w-0">
      {editable || photoUrl ? (
        <ChefSection
          title={text.planPhoto}
          note={editable ? text.planPhotoNote : undefined}
        >
          <div className="grid gap-3 sm:grid-cols-[16rem_minmax(0,1fr)] sm:items-center">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-[#F1F3F5]">
              {photoUrl ? (
                <img src={photoUrl} alt={text.planPhoto} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center text-[#6B6B6B]">
                  <UtensilsCrossed className="size-8" aria-hidden="true" />
                </span>
              )}
            </div>
            {editable ? (
              <label className="chef-btn w-fit cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[#1A1A1A]">
                <Camera className="h-4 w-4" aria-hidden="true" />
                {photoUrl ? text.changePhoto : text.addPhoto}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  aria-describedby={photoError ? "plan-photo-error" : undefined}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void pickPhoto(file);
                  }}
                />
              </label>
            ) : null}
          </div>
          {photoError ? (
            <p id="plan-photo-error" role="alert" className="chef-field-error">
              {photoError}
            </p>
          ) : null}
        </ChefSection>
      ) : null}
      <ChefSection>
        <div className="grid gap-5">
          <div>
            <label htmlFor="plan-name" className="chef-field-label">
              {text.planName}
              <RequiredMark />
            </label>
            <input
              id="plan-name"
              required
              maxLength={NAME_MAX}
              autoComplete="off"
              className={FIELD}
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder={text.planNamePlaceholder}
              {...invalid("name")}
            />
            {fieldError("name")}
          </div>
          <ChefChoiceChips
            legend={text.howOften}
            name="plan-period"
            disabled={locked}
            value={period}
            onChange={(next) => {
              // The week is the same for every bill length, so changing it keeps the meals.
              setPeriod(next);
              setDirty(true);
            }}
            options={(["WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const).map((value) => ({
              value,
              label: billingPeriodLabel(value, language),
            }))}
          />
          <div>
            <label htmlFor="plan-amount" className="chef-field-label">
              {text.price}
              <RequiredMark />
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-[#1A1A1A]"
              >
                ₹
              </span>
              <input
                id="plan-amount"
                required
                inputMode="decimal"
                autoComplete="off"
                className={`${FIELD} !mt-0 pl-8 pr-28`}
                value={form.amount}
                onChange={(event) => updateForm("amount", event.target.value)}
                placeholder="1499"
                aria-label={format(text.pricePer, { per: perUnit })}
                {...invalid("amount")}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#6B6B6B]"
              >
                {perUnit}
              </span>
            </div>
            {fieldError("amount")}
          </div>
          <div>
            <label htmlFor="plan-lead" className="chef-field-label">
              {text.leadLabel}
              <RequiredMark />
            </label>
            <select
              id="plan-lead"
              className={FIELD}
              value={leadHours}
              aria-describedby="plan-lead-help"
              onChange={(event) => {
                setLeadHours(Number(event.target.value));
                setDirty(true);
              }}
            >
              {LEAD_HOUR_OPTIONS.map((hours) => (
                <option key={hours} value={hours}>
                  {leadHoursLabel(hours, language)}
                </option>
              ))}
            </select>
            <p id="plan-lead-help" className="chef-section-note mt-1.5">
              {text.leadHelp}
            </p>
          </div>
          <div>
            <label htmlFor="plan-description" className="chef-field-label">
              {text.description}
              <RequiredMark />
            </label>
            <textarea
              id="plan-description"
              required
              rows={3}
              maxLength={DESCRIPTION_MAX}
              className={`${FIELD} py-3 leading-6`}
              value={form.description}
              onChange={(event) => updateForm("description", event.target.value)}
              placeholder={text.descriptionPlaceholder}
              {...invalid("description")}
              aria-describedby={`${errors.description ? "plan-description-error " : ""}plan-description-count`}
            />
            <p id="plan-description-count" className="chef-section-note mt-1.5 text-right tabular-nums">
              {form.description.length}/{DESCRIPTION_MAX}
            </p>
            <p className="sr-only" role="status">
              {form.description.length >= DESCRIPTION_MAX
                ? format(text.descriptionFull, { max: DESCRIPTION_MAX })
                : ""}
            </p>
            {fieldError("description")}
          </div>
        </div>
      </ChefSection>
    </fieldset>
  );

  const dayTabs = kind === "WEEKLY" ? WEEK_ORDER : MONTH_DAYS;
  function onDayKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = dayTabs.indexOf(day);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: dayTabs.length - 1 }[
      event.key
    ];
    if (next === undefined) return;
    event.preventDefault();
    const target = dayTabs[(next + dayTabs.length) % dayTabs.length];
    setDay(target);
    document.getElementById(`plan-day-${target}`)?.focus();
  }

  const meals = (
    <div className="chef-stack">
      {datePlanReset ? (
        <ChefNotice icon={AlertTriangle}>
          {text.datePlan}
        </ChefNotice>
      ) : null}
      <div
        role="tablist"
        aria-label={text.days}
        className={kind === "WEEKLY" ? "grid grid-cols-7 gap-1" : "chef-chips"}
      >
        {dayTabs.map((value) => {
          const selected = day === value;
          const label = kind === "WEEKLY" ? dayName(kind, value, "short", language) : String(value);
          const longName = dayName(kind, value, "long", language);
          return (
            <button
              key={value}
              id={`plan-day-${value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="plan-day-panel"
              aria-label={mealDays.has(value) ? format(text.hasMeals, { day: longName }) : longName}
              tabIndex={selected ? 0 : -1}
              onClick={() => setDay(value)}
              onKeyDown={onDayKey}
              className={`relative flex min-h-12 min-w-11 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A] ${selected ? "border-[#1A1A1A] bg-[#1A1A1A] text-white" : mealDays.has(value) ? "border-[#E3E6EA] bg-white text-[#1A1A1A]" : "border-dashed border-[#C9CDD2] bg-white text-[#6B6B6B]"}`}
            >
              {label}
              {mealDays.has(value) ? (
                <span
                  aria-hidden="true"
                  className={`mt-0.5 size-1.5 rounded-full ${selected ? "bg-white" : "bg-[#F62E18]"}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        id="plan-day-panel"
        role="tabpanel"
        aria-labelledby={`plan-day-${day}`}
        className="chef-stack"
      >
        {errors.schedule ? (
          <p role="alert" className="chef-field-error !mt-0">
            {errors.schedule}
          </p>
        ) : null}
        {scheduleNote && scheduleKept ? (
          <p role="alert" className="chef-field-error !mt-0">
            {text.keepMeal}
          </p>
        ) : null}
        {missingDishDays.length > 0 ? (
          <p role="alert" className="chef-field-error !mt-0">
            {format(text.missingDish, {
              days: missingDishDays.map((value) => dayName(kind, value, "short", language)).join(", "),
            })}
          </p>
        ) : null}
        {daySlots.length === 0 ? (
          <p className="chef-section-note px-1">{format(text.noMeals, { day: dayLong })}</p>
        ) : null}
        {daySlots.map((slot) => (
          <SlotCard
            key={slot.key}
            slot={slot}
            dish={slot.menuItemId ? menuById.get(slot.menuItemId) : undefined}
            dishName={slot.menuItemId ? dishName(slot.menuItemId) : null}
            dishUnavailable={
              slot.menuItemId !== null &&
              menu.status === "ready" &&
              !availableDishes.some((item) => item.id === slot.menuItemId)
            }
            editable={editable}
            locked={locked}
            error={errors[`slot:${slot.key}`]}
            onDelete={() => setRemoving(slot)}
            onDish={() => setSheet({ kind: "dish", key: slot.key })}
            onQuantity={(quantity) =>
              updateSlots((current) => setSlotQuantity(current, slot.key, quantity))
            }
            onTime={(time) => updateSlots((current) => setSlotTime(current, slot.slot, time))}
          />
        ))}
        {editable && freeSlots.length > 0 ? (
          <button
            type="button"
            className="chef-btn"
            disabled={locked}
            aria-label={format(text.addFor, { label: addMealLabel(freeSlots, language), day: dayLong })}
            onClick={() => setSheet({ kind: "add" })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {addMealLabel(freeSlots, language)}
          </button>
        ) : null}
        {editable && kind === "WEEKLY" && daySlots.length > 0 ? (
          <button
            type="button"
            className="chef-btn is-quiet"
            disabled={locked}
            onClick={() =>
              otherWeekdaysHaveMeals(slots, day) ? setCopying(true) : copyToWeekdays()
            }
          >
            <Copy className="h-4 w-4" aria-hidden="true" /> {format(text.copyDay, { day: dayLong })}
          </button>
        ) : null}
        {editable ? (
          <p className="chef-section-note px-1">
            {text.onlyOn}
          </p>
        ) : null}
      </div>
    </div>
  );

  const reviewItems =
    kind === "WEEKLY" ? slotsToScheduleRequest(slots, leadHours).items : (schedule?.items ?? []);
  const review = (
    <div className="chef-stack">
      <ChefSection
        title={text.details}
        action={
          <button
            type="button"
            className="chef-btn is-small is-quiet"
            aria-label={text.editDetails}
            onClick={() => setStep(1)}
          >
            {text.edit}
          </button>
        }
      >
        <div className="flex gap-3">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="aspect-[4/3] w-24 shrink-0 rounded-xl object-cover"
            />
          ) : null}
          <div className="min-w-0">
            <p className="font-bold text-[#1A1A1A] [overflow-wrap:anywhere]">{form.name.trim()}</p>
            <p className="chef-section-note">{chefPlanMetaLine(period, reviewItems, language)}</p>
            <p className="chef-section-note">{repeatsLabel(period, language)}</p>
            <p className="chef-amount mt-1 font-bold text-[#1A1A1A]">
              {chefPlanPriceLabel(
                {
                  amount: Number(form.amount.trim()),
                  currency: "INR",
                  billingPeriod: period,
                },
                language,
              )}
            </p>
          </div>
        </div>
      </ChefSection>
      <ChefSection
        title={text.meals}
        flush
        action={
          <button
            type="button"
            className="chef-btn is-small is-quiet"
            aria-label={text.editMeals}
            onClick={() => setStep(2)}
          >
            {text.edit}
          </button>
        }
      >
        <ul className="chef-list">
          {groupMealDays(slots, kind).flatMap((group) =>
            group.meals.map((meal) => (
              <li key={`${group.days[0]}-${meal.slot}`} className="px-4 py-3 md:px-5">
                <p className="font-semibold text-[#1A1A1A]">{`${dayRangeLabel(kind, group.days, language)} · ${mealSlotLabel(meal.slot, language)} ${formatServiceTime(meal.time)}`}</p>
                <p className="chef-section-note">
                  {meal.menuItemId ? dishName(meal.menuItemId) : ""}
                  {meal.quantity > 1 ? ` × ${meal.quantity}` : ""}
                </p>
              </li>
            )),
          )}
        </ul>
      </ChefSection>
      <div>
        <label htmlFor="plan-note" className="chef-field-label">
          {text.note}
        </label>
        <textarea
          id="plan-note"
          rows={3}
          maxLength={NOTE_MAX}
          disabled={busy !== null}
          className={`${FIELD} py-3 leading-6`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={text.notePlaceholder}
        />
      </div>
      <ChefNotice icon={Lock}>
        {text.locked}
      </ChefNotice>
    </div>
  );

  const readOnlyNote =
    editable || !plan
      ? null
      : plan.status === "PENDING_APPROVAL"
        ? text.checking
        : plan.status === "ACTIVE"
          ? text.liveNote
          : text.notLiveNote;
  const removingDay = removing
    ? kind === "WEEKLY"
      ? dayName(kind, removing.day, "long", language)
      : format(text.dayNumber, { day: removing.day })
    : "";

  return (
    <div className="chef-dish-editor">
      <header className="mb-4">
        <BackButton onClick={requestLeave} disabled={busy !== null} />
        <h1 ref={heading} tabIndex={-1} className="chef-page-title outline-none">
          {editable ? (plan ? text.editPlan : text.newPlan) : plan?.name}
        </h1>
        <p className="chef-page-subtitle">
          {editable ? (
            format(text.step, { step, name: text[STEP_NAMES[step]] })
          ) : status ? (
            <ChefPill tone={status.tone}>{status.label}</ChefPill>
          ) : null}
        </p>
        {editable ? (
          <div aria-hidden="true" className="mt-3 grid grid-cols-3 gap-1.5">
            {([1, 2, 3] as const).map((value) => (
              <span
                key={value}
                className={`h-1 rounded-full ${value <= step ? "bg-[#F62E18]" : "bg-[#E3E6EA]"}`}
              />
            ))}
          </div>
        ) : null}
      </header>

      <div className="chef-stack">
        {readOnlyNote ? (
          <ChefNotice icon={Lock} role="status">
            {readOnlyNote}
          </ChefNotice>
        ) : null}
        {plan?.status === "REJECTED" ? (
          <ChefNotice icon={AlertTriangle}>
            <strong className="block">{chefPlanStatus("REJECTED", language).label}</strong>
            {plan.reviewReason ?? text.updatePlan}
          </ChefNotice>
        ) : null}
        {serverError ? (
          <ChefNotice icon={AlertTriangle} tone="danger" role="alert">
            {serverError}
          </ChefNotice>
        ) : null}
        {!editable ? (
          <ChefChoiceChips
            legend={text.show}
            name="plan-view"
            value={step === 2 ? "meals" : "details"}
            onChange={(value) => setStep(value === "meals" ? 2 : 1)}
            options={[
              { value: "details", label: text.details },
              { value: "meals", label: text.meals },
            ]}
          />
        ) : null}
        {step === 1 ? details : step === 2 ? meals : review}
      </div>

      <div className="chef-dish-actions lg:!max-w-none">
        {editable ? (
          <>
            {step > 1 ? (
              <button
                type="button"
                className="chef-btn"
                disabled={busy !== null}
                onClick={() => setStep((step - 1) as Step)}
              >
                {text.back}
              </button>
            ) : null}
            {step === 1 ? (
              <button
                type="button"
                className="chef-btn is-primary flex-1"
                disabled={busy !== null}
                onClick={goToMeals}
              >
                {text.nextMeals}
              </button>
            ) : null}
            {step === 2 ? (
              <button
                type="button"
                className="chef-btn is-primary flex-1"
                disabled={busy !== null}
                onClick={goToReview}
              >
                {text.nextReview}
              </button>
            ) : null}
            {step === 3 ? (
              <button
                type="button"
                className="chef-btn is-primary flex-1"
                disabled={busy !== null}
                aria-busy={busy === "submit"}
                onClick={() => void save("submit")}
              >
                {busy === "submit" ? text.sending : text.submit}
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="chef-btn is-primary flex-1"
            onClick={() => setRequesting(true)}
          >
            {text.requestChange}
          </button>
        )}
      </div>
      <p className="sr-only" role="status">
        {busy === "draft" ? text.savingDraft : busy === "submit" ? text.sendingCraves : ""}
      </p>

      <Sheet
        open={sheet?.kind === "dish"}
        onOpenChange={(open) => !open && setSheet(null)}
        title={text.pickDish}
      >
        {/* Sheets open outside the chef page: the theme brings the chef buttons along. */}
        <div className="chef-panel-theme chef-sheet-theme">
          <DishChoices
            menu={menu}
            dishes={availableDishes}
            selected={
              sheet?.kind === "dish"
                ? (slots.find((slot) => slot.key === sheet.key)?.menuItemId ?? null)
                : null
            }
            onPick={(id) => {
              if (sheet?.kind === "dish")
                updateSlots((current) => setSlotDish(current, sheet.key, id));
              setSheet(null);
            }}
          />
        </div>
      </Sheet>
      <Sheet
        open={sheet?.kind === "add"}
        onOpenChange={(open) => !open && setSheet(null)}
        title={format(text.addMealFor, { day: dayName(kind, day, "short", language) })}
      >
        <div className="chef-panel-theme chef-sheet-theme mt-4 grid gap-2">
          {freeSlots.map((code) => {
            const Icon = SLOT_ICON[code];
            return (
              <button
                key={code}
                type="button"
                className="chef-btn justify-start"
                onClick={() => {
                  updateSlots((current) => addSlot(current, day, code));
                  setSheet(null);
                }}
              >
                <Icon className="h-5 w-5 text-[#6B6B6B]" aria-hidden="true" /> {mealSlotLabel(code, language)}
              </button>
            );
          })}
        </div>
      </Sheet>
      <Dialog
        open={askLeave}
        onOpenChange={(open) => !open && stay()}
        title={text.saveDraftTitle}
        description={text.saveDraftText}
        footer={
          <>
            <button type="button" className={secondaryActionClass} onClick={stay}>
              {text.keepEditing}
            </button>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => {
                setAskLeave(false);
                leave();
              }}
            >
              {text.discard}
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => void save("draft")}
            >
              {text.saveDraft}
            </button>
          </>
        }
      />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={
          removing
            ? format(text.removeTitle, { meal: mealSlotLabel(removing.slot, language).toLowerCase(), day: removingDay })
            : text.removeThis
        }
        description={text.removeText}
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => setRemoving(null)}
            >
              {text.cancel}
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => {
                if (removing) updateSlots((current) => removeSlot(current, removing.key));
                setRemoving(null);
              }}
            >
              {text.remove}
            </button>
          </>
        }
      />
      <Dialog
        open={copying}
        onOpenChange={setCopying}
        title={format(text.copyTitle, { day: dayLong })}
        description={text.copyText}
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => setCopying(false)}
            >
              {text.cancel}
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={copyToWeekdays}
            >
              {text.copy}
            </button>
          </>
        }
      />
      {plan && !editable ? (
        <RequestChangeDialog open={requesting} onOpenChange={setRequesting} planName={plan.name} />
      ) : null}
    </div>
  );
}

function VegMark({ type }: { type: FoodType }) {
  const text = useText(TEXT);
  const color = FOOD_COLOR[type];
  return (
    <span
      role="img"
      aria-label={text[type]}
      className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px]"
      style={{ borderColor: color }}
    >
      <span className="size-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function DishThumb({ item, size }: { item: ChefMenuItem | undefined; size: string }) {
  const url = dishPhoto(item);
  return url ? (
    <img src={url} alt="" loading="lazy" className={`${size} shrink-0 rounded-lg object-cover`} />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-[#F1F3F5] text-[#6B6B6B]`}
    >
      <UtensilsCrossed className="size-4" aria-hidden="true" />
    </span>
  );
}

function SlotCard({
  slot,
  dish,
  dishName,
  dishUnavailable,
  editable,
  locked,
  error,
  onDelete,
  onDish,
  onQuantity,
  onTime,
}: {
  slot: EditorSlot;
  dish: ChefMenuItem | undefined;
  dishName: string | null;
  dishUnavailable: boolean;
  editable: boolean;
  /** Not editable, or a save is in flight. */
  locked: boolean;
  error?: string;
  onDelete(): void;
  onDish(): void;
  onQuantity(quantity: number): void;
  onTime(time: string): void;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const label = mealSlotLabel(slot.slot, language);
  const Icon = SLOT_ICON[slot.slot];
  const problem =
    error ?? (dishUnavailable ? text.unavailable : null);
  return (
    <section aria-label={label} className="chef-section p-4 md:p-5">
      <div className="flex items-center gap-2">
        <Icon
          className={`h-5 w-5 ${slot.slot === "DINNER" ? "text-[#C4200F]" : "text-[#B26B00]"}`}
          aria-hidden="true"
        />
        <h3 className="flex-1 font-bold text-[#1A1A1A]">{label}</h3>
        {editable ? (
          <label className="flex items-center gap-1 text-sm text-[#6B6B6B]">
            <span className="sr-only">
              {format(text.slotTime, { meal: label, lower: label.toLowerCase() })}
            </span>
            <select
              value={slot.time}
              disabled={locked}
              onChange={(event) => onTime(event.target.value)}
              className="min-h-11 rounded-full border border-[#E3E6EA] bg-white px-3 text-sm font-semibold text-[#1A1A1A]"
            >
              {TIME_OPTIONS.map((time) => (
                <option key={time} value={time}>
                  {formatServiceTime(time)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="rounded-full bg-[#F1F3F5] px-3 py-1 text-sm font-semibold text-[#1A1A1A]">
            {formatServiceTime(slot.time)}
          </span>
        )}
        {editable ? (
          <button
            type="button"
            className="chef-icon-button"
            disabled={locked}
            aria-label={format(text.removeMeal, { meal: label.toLowerCase() })}
            onClick={onDelete}
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={locked}
          onClick={onDish}
          aria-label={format(text.slotDish, { meal: label, dish: dishName ?? text.notSelected })}
          aria-describedby={problem ? `slot-${slot.key}-problem` : undefined}
          className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:cursor-default ${dishName ? "border-[#E3E6EA] bg-white" : "border-dashed border-[#C9CDD2] bg-[#F7F8FA] font-semibold text-[#C4200F]"} ${error ? "!border-[#C4200F]" : ""}`}
        >
          {dishName ? (
            <>
              {dish ? <DishThumb item={dish} size="size-11" /> : null}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  {dish ? <VegMark type={dish.foodType} /> : null}
                  <span className="line-clamp-2 font-semibold text-[#1A1A1A]">{dishName}</span>
                </span>
                {dish ? (
                  <span className="chef-section-note block">
                    {format(text.onMenu, { price: formatPlanPrice(dish.price, dish.currency) })}
                  </span>
                ) : null}
              </span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" /> {text.addDish}
            </>
          )}
        </button>
        {dishName ? (
          editable ? (
            <div className="flex items-center" role="group" aria-label={format(text.portions, { meal: label })}>
              <button
                type="button"
                className="chef-icon-button"
                disabled={locked || slot.quantity <= 1}
                aria-label={format(text.fewer, { meal: label.toLowerCase() })}
                onClick={() => onQuantity(slot.quantity - 1)}
              >
                <Minus className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="min-w-8 text-center font-bold tabular-nums" aria-live="polite">
                {slot.quantity}
              </span>
              <button
                type="button"
                className="chef-icon-button"
                disabled={locked || slot.quantity >= 100}
                aria-label={format(text.more, { meal: label.toLowerCase() })}
                onClick={() => onQuantity(slot.quantity + 1)}
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <span className="font-bold tabular-nums">× {slot.quantity}</span>
          )
        ) : null}
      </div>
      {problem ? (
        <p id={`slot-${slot.key}-problem`} className="chef-field-error">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

function DishChoices({
  menu,
  dishes,
  selected,
  onPick,
}: {
  menu: MenuState;
  dishes: ChefMenuItem[];
  selected: string | null;
  onPick(id: string): void;
}) {
  const text = useText(TEXT);
  if (dishes.length === 0) {
    if (menu.status === "no-kitchen")
      return (
        <div className="mt-4 grid justify-items-start gap-3">
          <p className="text-sm text-[#1A1A1A]">
            {text.setUpFirst}
          </p>
          <Link href="/chef/kitchen" className="chef-btn">
            {text.setUpKitchen}
          </Link>
        </div>
      );
    return menu.status === "error" ? (
      <div className="mt-4 grid justify-items-start gap-3">
        <p className="text-sm text-[#1A1A1A]">
          {text.menuFailed}
        </p>
        <button type="button" className="chef-btn" onClick={menu.retry}>
          {text.tryAgain}
        </button>
      </div>
    ) : (
      <p role="status" className="mt-4 text-sm text-[#6B6B6B]">
        {menu.status === "loading"
          ? text.loadingMenu
          : text.noneOn}
      </p>
    );
  }
  return (
    <ul className="mt-4 grid gap-2">
      {dishes.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-pressed={item.id === selected}
            onClick={() => onPick(item.id)}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-[#E3E6EA] bg-white px-3 py-2 text-left aria-pressed:border-[#1A1A1A]"
          >
            <DishThumb item={item} size="size-11" />
            <VegMark type={item.foodType} />
            <span className="min-w-0 flex-1 font-semibold text-[#1A1A1A]">{item.itemName}</span>
            {item.id === selected ? (
              <Check className="h-5 w-5 text-[#1A1A1A]" aria-hidden="true" />
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** "Request a change" on a plan that can't be edited: a support ticket "Change meal plan: <name>". */
function RequestChangeDialog({
  open,
  onOpenChange,
  planName,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  planName: string;
}) {
  const text = useText(TEXT);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "soon" | { sent: string }>("idle");
  const [error, setError] = useState("");
  const sent = typeof state === "object";

  async function send() {
    if (!message.trim()) return setError(text.tellUs);
    setState("busy");
    setError("");
    try {
      const created = await createSupportCase({
        contextRole: "CHEF",
        // Read by Craves support, so it stays English whatever the chef reads.
        subject: `Change meal plan: ${planName}`.slice(0, SUPPORT_SUBJECT_MAX),
        message: message.trim(),
      });
      setState({ sent: supportCaseNumber(created.caseNumber) });
      setMessage("");
    } catch (cause) {
      const code = cause instanceof SupportCaseError ? cause.code : "";
      if (code === "FEATURE_NOT_AVAILABLE") return setState("soon");
      setState("idle");
      setError(
        code === "SESSION_EXPIRED"
          ? text.sessionExpired
          : text.requestFailed,
      );
    }
  }

  let body: ReactNode;
  if (sent) {
    body = (
      <p role="status" className="mt-4 text-sm leading-6 text-[#1A1A1A]">
        {format(text.sentBefore, { number: state.sent })}
        <Link href="/chef/support" className="font-semibold underline">
          {text.help}
        </Link>
        {text.sentAfter}
      </p>
    );
  } else if (state === "soon") {
    body = (
      <p role="status" className="mt-4 text-sm leading-6 text-[#1A1A1A]">
        {text.requestsSoon}
      </p>
    );
  } else {
    body = (
      <div className="mt-4">
        <label htmlFor="plan-change-message" className="chef-field-label">
          {text.whatChange}
          <RequiredMark />
        </label>
        <textarea
          id="plan-change-message"
          rows={4}
          required
          maxLength={SUPPORT_MESSAGE_MAX}
          className={`${FIELD} py-3 leading-6`}
          value={message}
          disabled={state === "busy"}
          onChange={(event) => setMessage(event.target.value)}
          aria-describedby={error ? "plan-change-error" : undefined}
        />
        {error ? (
          <p id="plan-change-error" role="alert" className="chef-field-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && state !== "busy") setState("idle");
      }}
      title={text.requestChange}
      description={format(text.requestFor, { name: planName })}
      busy={state === "busy"}
      unsavedChanges={!!message.trim()}
      closeOnOutsideTap={!message.trim()}
      footer={
        sent || state === "soon" ? (
          <button
            type="button"
            className="craves-primary-action w-full sm:w-auto"
            onClick={() => {
              onOpenChange(false);
              setState("idle");
            }}
          >
            {text.done}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={secondaryActionClass}
              disabled={state === "busy"}
              onClick={() => onOpenChange(false)}
            >
              {text.cancel}
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              disabled={state === "busy"}
              aria-busy={state === "busy"}
              onClick={() => void send()}
            >
              {state === "busy" ? text.sending : text.sendRequest}
            </button>
          </>
        )
      }
    >
      {/* Dialogs open outside the chef page: the theme brings the chef field colours along. */}
      <div className="chef-panel-theme chef-sheet-theme">{body}</div>
    </Dialog>
  );
}
