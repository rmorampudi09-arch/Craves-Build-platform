"use client";
import { sessionFetch } from "@/shared/lib/session-fetch";

import { ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { ChefEmpty, ChefFlash, ChefNotice, ChefPageHead, ChefPill, ChefSection } from "@/features/chef/components/chef-ui";
import Link from "next/link";
import { AddressMapPicker } from "@/features/addresses/components/AddressMapPicker";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createSupportCase, SupportCaseError } from "@/shared/lib/support-cases-client";
import { SUPPORT_MESSAGE_MAX } from "@/shared/lib/support-cases-contract";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  ImageIcon,
  MapPin,
  Store,
} from "lucide-react";
import { ChefKitchenError, readChefKitchen, saveChefAvatar, uploadKitchenPhoto } from "@/features/chef/api/chef-kitchen";
import { shrinkPhoto } from "@/features/chef/lib/shrink-photo";
import { ChefAvatarGrid } from "@/features/chef/components/chef-avatar";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { Dialog, Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { useRouter } from "next/navigation";
import { useLeaveGuard } from "@/features/chef/lib/use-leave-guard";
import { parseOnboardingState } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import type { ChefApplication } from "@/features/chef-onboarding/lib/chef-application-contract";
import {
  CHEF_KITCHEN_FIELD_LIMITS,
  CHEF_KITCHEN_TAG_LIMITS,
  SOCIAL_LINK_FIELDS,
  SOCIAL_LINK_MAX,
  chefAvatarIdFromUrl,
  isSocialLink,
  kitchenPhotoSlots,
  missingKitchenPickupField,
} from "@/features/chef/lib/chef-kitchen-contract";
import type {
  ChefKitchen,
  ChefKitchenInput,
  EditableKitchenStatus,
} from "@/features/chef/lib/chef-kitchen-types";
import { reverseGeocodeCurrentLocation } from "@/features/addresses/api/reverseGeocode";
import { captureSessionContext, getSession, isSessionContextCurrent } from "@/features/auth/api/cravesAuth";
import { RequiredMark } from "@/shared/ui/forms/required-mark";
import { ChefLoading } from "@/features/chef/components/chef-loading";
import { pageText } from "@/features/chef/lib/chef-page-text";
import { LANGUAGE_NAMES, format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

const TEXT = messages({
  en: {
    website: "Website", photosLocked: "Kitchen photos can’t be changed. To change one, contact Craves support.", photosSoon: "Photos are coming soon.",
    photoInvalid: "Choose a JPEG or PNG photo of 8 MB or less.", add: "Add", back: "Back", setUp: "Set up your kitchen · {step}",
    loading: "Loading your kitchen…", loadingLabel: "Loading your kitchen",
    kitchenName: "Kitchen name", chefName: "Chef name", city: "City", state: "State", pincode: "Pincode",
    tooLong: "{field} must be {limit} characters or fewer.",
    pinMoved: "Pin updated. Check your house and address details below.", pinMovedNoAddress: "Pin updated. Please check your address details below.",
    notApproved: "Your chef approval needs to finish before you can set up a kitchen.", loadFailed: "We couldn’t load your kitchen right now.",
    linkHttps: "{name} link must start with https://", nameNeeded: "Please give your kitchen a name customers can recognize.",
    missingHouse: "flat, house or building", missingCity: "city", missingState: "state", addToContinue: "Add your {list} to continue.",
    noLocation: "This browser can’t use your current location. You can type the address below instead.", finding: "Finding your kitchen address…",
    foundKitchen: "We found your kitchen. Please check the address below.", foundArea: "We found the area. Please check your house or building details below.",
    foundPinOnly: "We found your location, but not the full written address. Please type the missing details below.",
    locationRefused: "Location wasn’t shared. That’s okay — type your kitchen address below.",
    checkBeforeSave: "Please check your kitchen name and address before saving.",
    needPhone: "a kitchen phone", needArea: "the pickup area", needPincode: "the pickup pincode",
    askSupportToAdd: "Your kitchen needs {what} before it can open. Use Move my kitchen to ask Craves support to add it.",
    completeBeforeOpening: "Complete {what} before opening your kitchen. Pickup partners need this to collect orders.",
    needPin: "Use current location before activating this kitchen. We need the pickup point before your kitchen can open.",
    savingKitchen: "Saving your kitchen…", checkDetails: "Please check the kitchen details and try again.",
    notConfirmed: "We couldn’t confirm your kitchen was saved. Reload to check it.", saved: "Kitchen saved",
    saveFailed: "We couldn’t save your kitchen. Please try again.", pictureFailed: "We couldn’t save your picture. Please try again.",
    photoFailed: "We couldn’t save that photo. Please try again.", pictureSaved: "Picture saved", photoSaved: "Photo saved",
    detailsTitle: "Kitchen details", detailsSubtitle: "How customers see your kitchen, and where riders pick up.", myKitchen: "My kitchen",
    pausedByCraves: "Paused by Craves", open: "Open", closedForNow: "Closed for now", pickupAddress: "Pickup address",
    pausedNote: "Craves has paused this kitchen for now. Your saved details are still here.", edit: "Edit kitchen details", goToMenu: "Go to my menu",
    photos: "Photos", yourPicture: "Your picture", comingSoon: "Coming soon", saving: "Saving…", overallFirst: "Add the overall kitchen photo first.",
    overall: "Overall kitchen", setup: "Cooking setup", photoAdded: ": photo added", changePicture: "Change your picture", cancel: "Cancel", save: "Save",
    leaveTitle: "Leave without saving?", leaveText: "Your changes to the kitchen details will be lost.", keepEditing: "Keep editing", leave: "Leave",
    kitchenPhoto: "Kitchen photo", photoLocks: "Photos can’t be changed once added.", chooseAnother: "Choose another", usePhoto: "Use this photo",
    photoAlt: "Your kitchen photo", takePhoto: "Take a photo", gallery: "Choose from gallery",
    stepName: "Name", nameTitle: "What should customers call your kitchen?", nameHelp: "Choose a simple name you’ll be happy to see next to your food.",
    tellCustomers: "Tell customers what you cook", optional: "(optional)", whatYouCook: "What you cook", addChip: "+ Add", addCuisine: "Add a cuisine",
    moreDetails: "More kitchen details", chefNameShown: "Chef name customers see", kitchenEmail: "Kitchen email",
    socialHttps: "Social links start with https://", kitchenPhone: "Kitchen phone", requiredForOrders: "(required to accept orders)", continue: "Continue",
    stepAddress: "Pickup address", addressTitle: "Is this where you cook?", addressHelp: "Pickup partners use this location when food is ready.",
    findingMine: "Finding my address…", refreshLocation: "Refresh current location", useLocation: "Use my current location",
    house: "Flat / House / Building", street: "Street / Road", area: "Area", landmark: "Landmark", cityLabel: "City", stateLabel: "State", pincodeLabel: "Pincode",
    deliveryAreas: "Delivery areas", addArea: "+ Add area", addDeliveryArea: "Add a delivery area",
    lockedAddress: "Your saved area, city, PIN code, state and map pin stay as they are. To move your kitchen, contact Craves support.",
    move: "Move my kitchen", rightPlace: "Yes, this is right", moveHelp: "Tell Craves support the new address. They move your kitchen and its map pin for you.",
    openHelp: "Open Help & support", done: "Done", sending: "Sending…", send: "Send", moveSent: "Sent. Craves support will reply in Help & support.",
    chatSoonTitle: "Chat is on its way", chatSoonText: "You will be able to write to Craves support here soon.",
    newAddress: "Your new kitchen address", sendFailed: "We couldn’t send that. Your message is still here.",
    stepReady: "Ready for orders", readyTitle: "Should your kitchen be ready when your first dish goes live?",
    readyHelp: "You can close your kitchen anytime. Customers still won’t see food until you add an available dish.",
    readyYes: "Yes, get my kitchen ready", readyYesNote: "It can open as soon as an available dish is on your menu.",
    readyNo: "Not yet", readyNoNote: "Save everything and keep the kitchen closed for now.", saveKitchen: "Save my kitchen",
  },
  te: {
    website: "వెబ్‌సైట్", photosLocked: "వంటగది ఫోటోలు మార్చలేరు. ఒకటి మార్చాలంటే Craves సహాయ బృందాన్ని సంప్రదించండి.", photosSoon: "ఫోటోలు త్వరలో వస్తాయి.",
    photoInvalid: "8 MB లేదా అంతకంటే చిన్న JPEG లేదా PNG ఫోటో ఎంచుకోండి.", add: "జోడించండి", back: "వెనక్కి", setUp: "మీ వంటగది సిద్ధం చేయండి · {step}",
    loading: "మీ వంటగది లోడ్ అవుతోంది…", loadingLabel: "మీ వంటగది లోడ్ అవుతోంది",
    kitchenName: "వంటగది పేరు", chefName: "చెఫ్ పేరు", city: "నగరం", state: "రాష్ట్రం", pincode: "పిన్‌కోడ్",
    tooLong: "{field} {limit} అక్షరాలు లేదా అంతకంటే తక్కువ ఉండాలి.",
    pinMoved: "పిన్ మారింది. కింద మీ ఇల్లు, చిరునామా వివరాలు సరిచూడండి.", pinMovedNoAddress: "పిన్ మారింది. దయచేసి కింద మీ చిరునామా వివరాలు సరిచూడండి.",
    notApproved: "వంటగది సిద్ధం చేయడానికి ముందు మీ చెఫ్ ఆమోదం పూర్తి కావాలి.", loadFailed: "ఇప్పుడు మీ వంటగదిని లోడ్ చేయలేకపోయాం.",
    linkHttps: "{name} లింక్ https:// తో మొదలవ్వాలి", nameNeeded: "కస్టమర్లు గుర్తుపట్టే పేరు మీ వంటగదికి పెట్టండి.",
    missingHouse: "ఫ్లాట్, ఇల్లు లేదా బిల్డింగ్", missingCity: "నగరం", missingState: "రాష్ట్రం", addToContinue: "కొనసాగడానికి మీ {list} జోడించండి.",
    noLocation: "ఈ బ్రౌజర్ మీ ప్రస్తుత లొకేషన్ తీసుకోలేదు. బదులుగా కింద చిరునామా రాయవచ్చు.", finding: "మీ వంటగది చిరునామా వెతుకుతున్నాం…",
    foundKitchen: "మీ వంటగది దొరికింది. దయచేసి కింద చిరునామా సరిచూడండి.", foundArea: "ప్రాంతం దొరికింది. దయచేసి కింద మీ ఇల్లు లేదా బిల్డింగ్ వివరాలు సరిచూడండి.",
    foundPinOnly: "మీ లొకేషన్ దొరికింది, కానీ పూర్తి చిరునామా దొరకలేదు. దయచేసి కింద మిగతా వివరాలు రాయండి.",
    locationRefused: "లొకేషన్ ఇవ్వలేదు. పర్వాలేదు — కింద మీ వంటగది చిరునామా రాయండి.",
    checkBeforeSave: "సేవ్ చేసే ముందు మీ వంటగది పేరు, చిరునామా సరిచూడండి.",
    needPhone: "వంటగది ఫోన్ నంబర్", needArea: "పికప్ ప్రాంతం", needPincode: "పికప్ పిన్‌కోడ్",
    askSupportToAdd: "వంటగది తెరవడానికి ముందు {what} కావాలి. దాన్ని జోడించమని Craves సహాయ బృందాన్ని అడగడానికి “వంటగది చోటు మార్చండి” వాడండి.",
    completeBeforeOpening: "వంటగది తెరిచే ముందు {what} పూర్తి చేయండి. ఆర్డర్లు తీసుకెళ్లడానికి డెలివరీ వ్యక్తికి ఇది కావాలి.",
    needPin: "ఈ వంటగది తెరిచే ముందు “నా ప్రస్తుత లొకేషన్ వాడండి” నొక్కండి. వంటగది తెరవడానికి ముందు మాకు పికప్ చోటు కావాలి.",
    savingKitchen: "మీ వంటగది సేవ్ అవుతోంది…", checkDetails: "వంటగది వివరాలు సరిచూసి మళ్లీ ప్రయత్నించండి.",
    notConfirmed: "మీ వంటగది సేవ్ అయిందో లేదో చూడలేకపోయాం. చూడటానికి పేజీని మళ్లీ లోడ్ చేయండి.", saved: "వంటగది సేవ్ అయింది",
    saveFailed: "మీ వంటగది సేవ్ చేయలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.", pictureFailed: "మీ చిత్రం సేవ్ చేయలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.",
    photoFailed: "ఆ ఫోటో సేవ్ చేయలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.", pictureSaved: "చిత్రం సేవ్ అయింది", photoSaved: "ఫోటో సేవ్ అయింది",
    detailsTitle: "వంటగది వివరాలు", detailsSubtitle: "కస్టమర్లకు మీ వంటగది ఎలా కనిపిస్తుంది, డెలివరీ వ్యక్తి ఎక్కడ తీసుకెళ్తారు.", myKitchen: "నా వంటగది",
    pausedByCraves: "Craves ఆపింది", open: "తెరిచి ఉంది", closedForNow: "ప్రస్తుతం మూసి ఉంది", pickupAddress: "పికప్ చిరునామా",
    pausedNote: "Craves ప్రస్తుతానికి ఈ వంటగదిని ఆపింది. మీరు సేవ్ చేసిన వివరాలు ఇక్కడే ఉన్నాయి.", edit: "వంటగది వివరాలు మార్చండి", goToMenu: "నా మెనూకి వెళ్లండి",
    photos: "ఫోటోలు", yourPicture: "మీ చిత్రం", comingSoon: "త్వరలో వస్తుంది", saving: "సేవ్ అవుతోంది…", overallFirst: "ముందు వంటగది మొత్తం ఫోటో జోడించండి.",
    overall: "వంటగది మొత్తం", setup: "వంట చేసే చోటు", photoAdded: ": ఫోటో జోడించారు", changePicture: "మీ చిత్రం మార్చండి", cancel: "రద్దు చేయండి", save: "సేవ్ చేయండి",
    leaveTitle: "సేవ్ చేయకుండా వెళ్లాలా?", leaveText: "వంటగది వివరాల్లో మీరు చేసిన మార్పులు పోతాయి.", keepEditing: "రాయడం కొనసాగించండి", leave: "వెళ్లండి",
    kitchenPhoto: "వంటగది ఫోటో", photoLocks: "జోడించిన తర్వాత ఫోటోలు మార్చలేరు.", chooseAnother: "వేరేది ఎంచుకోండి", usePhoto: "ఈ ఫోటో వాడండి",
    photoAlt: "మీ వంటగది ఫోటో", takePhoto: "ఫోటో తీయండి", gallery: "గ్యాలరీ నుండి ఎంచుకోండి",
    stepName: "పేరు", nameTitle: "కస్టమర్లు మీ వంటగదిని ఏ పేరుతో పిలవాలి?", nameHelp: "మీ ఆహారం పక్కన చూడటానికి మీకు నచ్చే సులభమైన పేరు ఎంచుకోండి.",
    tellCustomers: "మీరు ఏమి వండుతారో కస్టమర్లకు చెప్పండి", optional: "(ఇష్టమైతే)", whatYouCook: "మీరు వండేవి", addChip: "+ జోడించండి", addCuisine: "వంటల రకం జోడించండి",
    moreDetails: "వంటగది మరిన్ని వివరాలు", chefNameShown: "కస్టమర్లకు కనిపించే చెఫ్ పేరు", kitchenEmail: "వంటగది ఈమెయిల్",
    socialHttps: "సోషల్ లింక్‌లు https:// తో మొదలవుతాయి", kitchenPhone: "వంటగది ఫోన్", requiredForOrders: "(ఆర్డర్లు ఒప్పుకోవడానికి తప్పనిసరి)", continue: "కొనసాగండి",
    stepAddress: "పికప్ చిరునామా", addressTitle: "మీరు వంట చేసేది ఇక్కడేనా?", addressHelp: "ఆహారం సిద్ధమైనప్పుడు డెలివరీ వ్యక్తి ఈ చోటుకు వస్తారు.",
    findingMine: "నా చిరునామా వెతుకుతోంది…", refreshLocation: "ప్రస్తుత లొకేషన్ మళ్లీ తీసుకోండి", useLocation: "నా ప్రస్తుత లొకేషన్ వాడండి",
    house: "ఫ్లాట్ / ఇల్లు / బిల్డింగ్", street: "వీధి / రోడ్డు", area: "ప్రాంతం", landmark: "దగ్గరి గుర్తు", cityLabel: "నగరం", stateLabel: "రాష్ట్రం", pincodeLabel: "పిన్‌కోడ్",
    deliveryAreas: "డెలివరీ ప్రాంతాలు", addArea: "+ ప్రాంతం జోడించండి", addDeliveryArea: "డెలివరీ ప్రాంతం జోడించండి",
    lockedAddress: "మీరు సేవ్ చేసిన ప్రాంతం, నగరం, పిన్‌కోడ్, రాష్ట్రం, మ్యాప్ పిన్ అలాగే ఉంటాయి. వంటగది చోటు మార్చాలంటే Craves సహాయ బృందాన్ని సంప్రదించండి.",
    move: "వంటగది చోటు మార్చండి", rightPlace: "అవును, ఇది సరైనదే", moveHelp: "కొత్త చిరునామా Craves సహాయ బృందానికి చెప్పండి. వారు మీ వంటగదిని, దాని మ్యాప్ పిన్‌ను మార్చేస్తారు.",
    openHelp: "సహాయం తెరవండి", done: "పూర్తయింది", sending: "పంపుతోంది…", send: "పంపండి", moveSent: "పంపాం. Craves సహాయ బృందం ‘సహాయం’ లో జవాబు ఇస్తుంది.",
    chatSoonTitle: "చాట్ త్వరలో వస్తుంది", chatSoonText: "త్వరలో ఇక్కడ Craves సహాయ బృందానికి రాయవచ్చు.",
    newAddress: "మీ వంటగది కొత్త చిరునామా", sendFailed: "అది పంపలేకపోయాం. మీ సందేశం ఇక్కడే ఉంది.",
    stepReady: "ఆర్డర్లకు సిద్ధం", readyTitle: "మీ మొదటి వంటకం కస్టమర్లకు కనిపించగానే మీ వంటగది సిద్ధంగా ఉండాలా?",
    readyHelp: "మీ వంటగదిని ఎప్పుడైనా మూసివేయవచ్చు. అందుబాటులో ఉన్న వంటకం జోడించే వరకు కస్టమర్లకు ఆహారం కనిపించదు.",
    readyYes: "అవును, నా వంటగది సిద్ధం చేయండి", readyYesNote: "మీ మెనూలో అందుబాటులో ఉన్న వంటకం ఉండగానే ఇది తెరుచుకుంటుంది.",
    readyNo: "ఇంకా వద్దు", readyNoNote: "అన్నీ సేవ్ చేసి, ప్రస్తుతానికి వంటగదిని మూసి ఉంచండి.", saveKitchen: "నా వంటగది సేవ్ చేయండి",
  },
  kn: {
    website: "ವೆಬ್‌ಸೈಟ್", photosLocked: "ಅಡುಗೆಮನೆ ಫೋಟೋಗಳನ್ನು ಬದಲಾಯಿಸಲು ಆಗುವುದಿಲ್ಲ. ಒಂದನ್ನು ಬದಲಾಯಿಸಲು Craves ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.", photosSoon: "ಫೋಟೋಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ.",
    photoInvalid: "8 MB ಅಥವಾ ಅದಕ್ಕಿಂತ ಚಿಕ್ಕ JPEG ಅಥವಾ PNG ಫೋಟೋ ಆಯ್ಕೆಮಾಡಿ.", add: "ಸೇರಿಸಿ", back: "ಹಿಂದೆ", setUp: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧಪಡಿಸಿ · {step}",
    loading: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ…", loadingLabel: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ",
    kitchenName: "ಅಡುಗೆಮನೆ ಹೆಸರು", chefName: "ಚೆಫ್ ಹೆಸರು", city: "ನಗರ", state: "ರಾಜ್ಯ", pincode: "ಪಿನ್‌ಕೋಡ್",
    tooLong: "{field} {limit} ಅಕ್ಷರ ಅಥವಾ ಅದಕ್ಕಿಂತ ಕಡಿಮೆ ಇರಬೇಕು.",
    pinMoved: "ಪಿನ್ ಬದಲಾಗಿದೆ. ಕೆಳಗೆ ನಿಮ್ಮ ಮನೆ ಮತ್ತು ವಿಳಾಸದ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.", pinMovedNoAddress: "ಪಿನ್ ಬದಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಕೆಳಗೆ ನಿಮ್ಮ ವಿಳಾಸದ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ.",
    notApproved: "ಅಡುಗೆಮನೆ ಸಿದ್ಧಪಡಿಸುವ ಮೊದಲು ನಿಮ್ಮ ಚೆಫ್ ಅನುಮೋದನೆ ಪೂರ್ಣವಾಗಬೇಕು.", loadFailed: "ಈಗ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ.",
    linkHttps: "{name} ಲಿಂಕ್ https:// ನಿಂದ ಶುರುವಾಗಬೇಕು", nameNeeded: "ಗ್ರಾಹಕರು ಗುರುತಿಸುವ ಹೆಸರನ್ನು ನಿಮ್ಮ ಅಡುಗೆಮನೆಗೆ ಇಡಿ.",
    missingHouse: "ಫ್ಲಾಟ್, ಮನೆ ಅಥವಾ ಕಟ್ಟಡ", missingCity: "ನಗರ", missingState: "ರಾಜ್ಯ", addToContinue: "ಮುಂದುವರಿಸಲು ನಿಮ್ಮ {list} ಸೇರಿಸಿ.",
    noLocation: "ಈ ಬ್ರೌಸರ್ ನಿಮ್ಮ ಈಗಿನ ಸ್ಥಳವನ್ನು ಬಳಸಲು ಆಗುವುದಿಲ್ಲ. ಬದಲಿಗೆ ಕೆಳಗೆ ವಿಳಾಸ ಬರೆಯಬಹುದು.", finding: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ವಿಳಾಸ ಹುಡುಕುತ್ತಿದ್ದೇವೆ…",
    foundKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿಕ್ಕಿದೆ. ದಯವಿಟ್ಟು ಕೆಳಗೆ ವಿಳಾಸ ಪರಿಶೀಲಿಸಿ.", foundArea: "ಪ್ರದೇಶ ಸಿಕ್ಕಿದೆ. ದಯವಿಟ್ಟು ಕೆಳಗೆ ನಿಮ್ಮ ಮನೆ ಅಥವಾ ಕಟ್ಟಡದ ವಿವರ ಪರಿಶೀಲಿಸಿ.",
    foundPinOnly: "ನಿಮ್ಮ ಸ್ಥಳ ಸಿಕ್ಕಿದೆ, ಆದರೆ ಪೂರ್ಣ ವಿಳಾಸ ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಕೆಳಗೆ ಉಳಿದ ವಿವರಗಳನ್ನು ಬರೆಯಿರಿ.",
    locationRefused: "ಸ್ಥಳ ಹಂಚಿಕೊಂಡಿಲ್ಲ. ಪರವಾಗಿಲ್ಲ — ಕೆಳಗೆ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ವಿಳಾಸ ಬರೆಯಿರಿ.",
    checkBeforeSave: "ಉಳಿಸುವ ಮೊದಲು ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಹೆಸರು ಮತ್ತು ವಿಳಾಸ ಪರಿಶೀಲಿಸಿ.",
    needPhone: "ಅಡುಗೆಮನೆ ಫೋನ್ ಸಂಖ್ಯೆ", needArea: "ಪಿಕಪ್ ಪ್ರದೇಶ", needPincode: "ಪಿಕಪ್ ಪಿನ್‌ಕೋಡ್",
    askSupportToAdd: "ಅಡುಗೆಮನೆ ತೆರೆಯುವ ಮೊದಲು {what} ಬೇಕು. ಅದನ್ನು ಸೇರಿಸಲು Craves ಸಹಾಯ ತಂಡವನ್ನು ಕೇಳಲು “ಅಡುಗೆಮನೆ ಸ್ಥಳ ಬದಲಿಸಿ” ಬಳಸಿ.",
    completeBeforeOpening: "ಅಡುಗೆಮನೆ ತೆರೆಯುವ ಮೊದಲು {what} ಪೂರ್ಣಗೊಳಿಸಿ. ಆರ್ಡರ್ ತೆಗೆದುಕೊಂಡು ಹೋಗಲು ಡೆಲಿವರಿ ವ್ಯಕ್ತಿಗೆ ಇದು ಬೇಕು.",
    needPin: "ಈ ಅಡುಗೆಮನೆ ತೆರೆಯುವ ಮೊದಲು “ನನ್ನ ಈಗಿನ ಸ್ಥಳ ಬಳಸಿ” ಒತ್ತಿ. ಅಡುಗೆಮನೆ ತೆರೆಯುವ ಮೊದಲು ನಮಗೆ ಪಿಕಪ್ ಸ್ಥಳ ಬೇಕು.",
    savingKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಉಳಿಸಲಾಗುತ್ತಿದೆ…", checkDetails: "ಅಡುಗೆಮನೆ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    notConfirmed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಉಳಿಸಲಾಗಿದೆಯೇ ಎಂದು ನೋಡಲು ಆಗಲಿಲ್ಲ. ನೋಡಲು ಪುಟವನ್ನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.", saved: "ಅಡುಗೆಮನೆ ಉಳಿಸಲಾಗಿದೆ",
    saveFailed: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಉಳಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", pictureFailed: "ನಿಮ್ಮ ಚಿತ್ರ ಉಳಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    photoFailed: "ಆ ಫೋಟೋ ಉಳಿಸಲು ಆಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", pictureSaved: "ಚಿತ್ರ ಉಳಿಸಲಾಗಿದೆ", photoSaved: "ಫೋಟೋ ಉಳಿಸಲಾಗಿದೆ",
    detailsTitle: "ಅಡುಗೆಮನೆ ವಿವರ", detailsSubtitle: "ಗ್ರಾಹಕರಿಗೆ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಹೇಗೆ ಕಾಣುತ್ತದೆ, ಡೆಲಿವರಿ ವ್ಯಕ್ತಿ ಎಲ್ಲಿಂದ ತೆಗೆದುಕೊಳ್ಳುತ್ತಾರೆ.", myKitchen: "ನನ್ನ ಅಡುಗೆಮನೆ",
    pausedByCraves: "Craves ನಿಲ್ಲಿಸಿದೆ", open: "ತೆರೆದಿದೆ", closedForNow: "ಸದ್ಯಕ್ಕೆ ಮುಚ್ಚಿದೆ", pickupAddress: "ಪಿಕಪ್ ವಿಳಾಸ",
    pausedNote: "Craves ಸದ್ಯಕ್ಕೆ ಈ ಅಡುಗೆಮನೆ ನಿಲ್ಲಿಸಿದೆ. ನೀವು ಉಳಿಸಿದ ವಿವರಗಳು ಇಲ್ಲೇ ಇವೆ.", edit: "ಅಡುಗೆಮನೆ ವಿವರ ಬದಲಾಯಿಸಿ", goToMenu: "ನನ್ನ ಮೆನುಗೆ ಹೋಗಿ",
    photos: "ಫೋಟೋಗಳು", yourPicture: "ನಿಮ್ಮ ಚಿತ್ರ", comingSoon: "ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", overallFirst: "ಮೊದಲು ಅಡುಗೆಮನೆಯ ಪೂರ್ಣ ಫೋಟೋ ಸೇರಿಸಿ.",
    overall: "ಪೂರ್ಣ ಅಡುಗೆಮನೆ", setup: "ಅಡುಗೆ ಮಾಡುವ ಜಾಗ", photoAdded: ": ಫೋಟೋ ಸೇರಿಸಲಾಗಿದೆ", changePicture: "ನಿಮ್ಮ ಚಿತ್ರ ಬದಲಾಯಿಸಿ", cancel: "ರದ್ದುಮಾಡಿ", save: "ಉಳಿಸಿ",
    leaveTitle: "ಉಳಿಸದೆ ಹೊರಡಬೇಕೇ?", leaveText: "ಅಡುಗೆಮನೆ ವಿವರಗಳಲ್ಲಿ ನೀವು ಮಾಡಿದ ಬದಲಾವಣೆಗಳು ಹೋಗುತ್ತವೆ.", keepEditing: "ಬರೆಯುವುದನ್ನು ಮುಂದುವರಿಸಿ", leave: "ಹೊರಡಿ",
    kitchenPhoto: "ಅಡುಗೆಮನೆ ಫೋಟೋ", photoLocks: "ಸೇರಿಸಿದ ನಂತರ ಫೋಟೋಗಳನ್ನು ಬದಲಾಯಿಸಲು ಆಗುವುದಿಲ್ಲ.", chooseAnother: "ಬೇರೆಯದು ಆಯ್ಕೆಮಾಡಿ", usePhoto: "ಈ ಫೋಟೋ ಬಳಸಿ",
    photoAlt: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಫೋಟೋ", takePhoto: "ಫೋಟೋ ತೆಗೆಯಿರಿ", gallery: "ಗ್ಯಾಲರಿಯಿಂದ ಆಯ್ಕೆಮಾಡಿ",
    stepName: "ಹೆಸರು", nameTitle: "ಗ್ರಾಹಕರು ನಿಮ್ಮ ಅಡುಗೆಮನೆಯನ್ನು ಯಾವ ಹೆಸರಿನಿಂದ ಕರೆಯಬೇಕು?", nameHelp: "ನಿಮ್ಮ ಆಹಾರದ ಪಕ್ಕ ನೋಡಲು ನಿಮಗೆ ಇಷ್ಟವಾಗುವ ಸರಳ ಹೆಸರು ಆಯ್ಕೆಮಾಡಿ.",
    tellCustomers: "ನೀವು ಏನು ಅಡುಗೆ ಮಾಡುತ್ತೀರಿ ಎಂದು ಗ್ರಾಹಕರಿಗೆ ತಿಳಿಸಿ", optional: "(ಬೇಕಿದ್ದರೆ)", whatYouCook: "ನೀವು ಮಾಡುವ ಅಡುಗೆ", addChip: "+ ಸೇರಿಸಿ", addCuisine: "ಅಡುಗೆಯ ಪ್ರಕಾರ ಸೇರಿಸಿ",
    moreDetails: "ಅಡುಗೆಮನೆಯ ಇನ್ನಷ್ಟು ವಿವರ", chefNameShown: "ಗ್ರಾಹಕರಿಗೆ ಕಾಣುವ ಚೆಫ್ ಹೆಸರು", kitchenEmail: "ಅಡುಗೆಮನೆ ಇಮೇಲ್",
    socialHttps: "ಸೋಶಿಯಲ್ ಲಿಂಕ್‌ಗಳು https:// ನಿಂದ ಶುರುವಾಗುತ್ತವೆ", kitchenPhone: "ಅಡುಗೆಮನೆ ಫೋನ್", requiredForOrders: "(ಆರ್ಡರ್ ಒಪ್ಪಿಕೊಳ್ಳಲು ಕಡ್ಡಾಯ)", continue: "ಮುಂದುವರಿಸಿ",
    stepAddress: "ಪಿಕಪ್ ವಿಳಾಸ", addressTitle: "ನೀವು ಅಡುಗೆ ಮಾಡುವುದು ಇಲ್ಲೇನಾ?", addressHelp: "ಆಹಾರ ಸಿದ್ಧವಾದಾಗ ಡೆಲಿವರಿ ವ್ಯಕ್ತಿ ಈ ಸ್ಥಳಕ್ಕೆ ಬರುತ್ತಾರೆ.",
    findingMine: "ನನ್ನ ವಿಳಾಸ ಹುಡುಕಲಾಗುತ್ತಿದೆ…", refreshLocation: "ಈಗಿನ ಸ್ಥಳ ಮತ್ತೆ ಪಡೆಯಿರಿ", useLocation: "ನನ್ನ ಈಗಿನ ಸ್ಥಳ ಬಳಸಿ",
    house: "ಫ್ಲಾಟ್ / ಮನೆ / ಕಟ್ಟಡ", street: "ಬೀದಿ / ರಸ್ತೆ", area: "ಪ್ರದೇಶ", landmark: "ಹತ್ತಿರದ ಗುರುತು", cityLabel: "ನಗರ", stateLabel: "ರಾಜ್ಯ", pincodeLabel: "ಪಿನ್‌ಕೋಡ್",
    deliveryAreas: "ಡೆಲಿವರಿ ಪ್ರದೇಶಗಳು", addArea: "+ ಪ್ರದೇಶ ಸೇರಿಸಿ", addDeliveryArea: "ಡೆಲಿವರಿ ಪ್ರದೇಶ ಸೇರಿಸಿ",
    lockedAddress: "ನೀವು ಉಳಿಸಿದ ಪ್ರದೇಶ, ನಗರ, ಪಿನ್‌ಕೋಡ್, ರಾಜ್ಯ ಮತ್ತು ಮ್ಯಾಪ್ ಪಿನ್ ಹಾಗೆಯೇ ಇರುತ್ತವೆ. ಅಡುಗೆಮನೆ ಸ್ಥಳ ಬದಲಿಸಲು Craves ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    move: "ಅಡುಗೆಮನೆ ಸ್ಥಳ ಬದಲಿಸಿ", rightPlace: "ಹೌದು, ಇದು ಸರಿ", moveHelp: "ಹೊಸ ವಿಳಾಸವನ್ನು Craves ಸಹಾಯ ತಂಡಕ್ಕೆ ತಿಳಿಸಿ. ಅವರು ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಮತ್ತು ಅದರ ಮ್ಯಾಪ್ ಪಿನ್ ಬದಲಿಸುತ್ತಾರೆ.",
    openHelp: "ಸಹಾಯ ತೆರೆಯಿರಿ", done: "ಮುಗಿದಿದೆ", sending: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…", send: "ಕಳುಹಿಸಿ", moveSent: "ಕಳುಹಿಸಲಾಗಿದೆ. Craves ಸಹಾಯ ತಂಡ ‘ಸಹಾಯ’ದಲ್ಲಿ ಉತ್ತರಿಸುತ್ತದೆ.",
    chatSoonTitle: "ಚಾಟ್ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ", chatSoonText: "ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ Craves ಸಹಾಯ ತಂಡಕ್ಕೆ ಬರೆಯಬಹುದು.",
    newAddress: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಯ ಹೊಸ ವಿಳಾಸ", sendFailed: "ಅದನ್ನು ಕಳುಹಿಸಲು ಆಗಲಿಲ್ಲ. ನಿಮ್ಮ ಸಂದೇಶ ಇಲ್ಲೇ ಇದೆ.",
    stepReady: "ಆರ್ಡರ್‌ಗೆ ಸಿದ್ಧ", readyTitle: "ನಿಮ್ಮ ಮೊದಲ ಖಾದ್ಯ ಗ್ರಾಹಕರಿಗೆ ಕಾಣಿಸಿದ ತಕ್ಷಣ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧವಾಗಿರಬೇಕೇ?",
    readyHelp: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಯನ್ನು ಯಾವಾಗ ಬೇಕಾದರೂ ಮುಚ್ಚಬಹುದು. ಲಭ್ಯವಿರುವ ಖಾದ್ಯ ಸೇರಿಸುವವರೆಗೆ ಗ್ರಾಹಕರಿಗೆ ಆಹಾರ ಕಾಣುವುದಿಲ್ಲ.",
    readyYes: "ಹೌದು, ನನ್ನ ಅಡುಗೆಮನೆ ಸಿದ್ಧಪಡಿಸಿ", readyYesNote: "ನಿಮ್ಮ ಮೆನುವಿನಲ್ಲಿ ಲಭ್ಯವಿರುವ ಖಾದ್ಯ ಇದ್ದ ತಕ್ಷಣ ಇದು ತೆರೆಯಬಹುದು.",
    readyNo: "ಇನ್ನೂ ಬೇಡ", readyNoNote: "ಎಲ್ಲವನ್ನೂ ಉಳಿಸಿ, ಸದ್ಯಕ್ಕೆ ಅಡುಗೆಮನೆ ಮುಚ್ಚಿಡಿ.", saveKitchen: "ನನ್ನ ಅಡುಗೆಮನೆ ಉಳಿಸಿ",
  },
});
type Words = (typeof TEXT)["en"];

// The suggested cuisines are saved in English (customers read them); the chef reads them in their language.
const CUISINE_WORDS = messages({
  en: { Andhra: "Andhra", Telangana: "Telangana", Biryani: "Biryani", Tiffins: "Tiffins", "North Indian": "North Indian", "South Indian": "South Indian", Chinese: "Chinese", Snacks: "Snacks", Sweets: "Sweets", Desserts: "Desserts" },
  te: { Andhra: "ఆంధ్ర", Telangana: "తెలంగాణ", Biryani: "బిర్యానీ", Tiffins: "టిఫిన్లు", "North Indian": "నార్త్ ఇండియన్", "South Indian": "సౌత్ ఇండియన్", Chinese: "చైనీస్", Snacks: "స్నాక్స్", Sweets: "స్వీట్లు", Desserts: "డెజర్ట్స్" },
  kn: { Andhra: "ಆಂಧ್ರ", Telangana: "ತೆಲಂಗಾಣ", Biryani: "ಬಿರಿಯಾನಿ", Tiffins: "ಟಿಫಿನ್", "North Indian": "ನಾರ್ತ್ ಇಂಡಿಯನ್", "South Indian": "ಸೌತ್ ಇಂಡಿಯನ್", Chinese: "ಚೈನೀಸ್", Snacks: "ಸ್ನ್ಯಾಕ್ಸ್", Sweets: "ಸಿಹಿತಿಂಡಿಗಳು", Desserts: "ಡೆಸರ್ಟ್ಸ್" },
});

type FormState = Record<
  keyof Omit<ChefKitchenInput, "latitude" | "longitude" | "status" | "cuisines" | "serviceAreas" | "socialLinks">,
  string
> & {
  latitude: string;
  longitude: string;
  status: EditableKitchenStatus;
  // Only when the server sent them: each field shows only then.
  cuisines?: string[];
  serviceAreas?: string[];
  socialLinks?: Record<SocialLinkField, string>;
};
type SocialLinkField = (typeof SOCIAL_LINK_FIELDS)[number];

const SOCIAL_LINK_LABELS: Record<SocialLinkField, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", website: "Website" };
const SUGGESTED_CUISINES = ["Andhra", "Telangana", "Biryani", "Tiffins", "North Indian", "South Indian", "Chinese", "Snacks", "Sweets", "Desserts"];
// Matches the app: only the first kitchen setup fills the area, city, PIN code and state. Once the kitchen exists
// they, and its map pin, move only through Craves support ("Move my kitchen"), even when one was left empty.
const LOCKED_ADDRESS = ["areaName", "city", "state", "postalCode"] as const;
function savedAddress(kitchen: ChefKitchen | null): Partial<FormState> {
  return kitchen ? Object.fromEntries(LOCKED_ADDRESS.map((field) => [field, kitchen[field] ?? ""])) : {};
}

type SetupStep = "name" | "address" | "ready" | "summary";

const EMPTY: FormState = {
  kitchenName: "",
  displayName: "",
  description: "",
  phoneNumber: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  areaName: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  status: "DRAFT",
};

const PHOTO_TILE =
  "relative flex min-h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-dashed border-[#D0D5DB] bg-white px-1 py-2 text-center text-[0.8125rem] font-semibold text-[#6B6B6B] disabled:cursor-not-allowed";
// Small wrapping words, not a pill: three tiles share a phone's width, and Telugu or Kannada runs longer.
const PHOTO_SOON = "text-[0.6875rem] font-medium leading-tight";

const PHOTO_ERRORS: Record<string, keyof Words> = {
  KITCHEN_PHOTOS_LOCKED: "photosLocked",
  [FEATURE_NOT_AVAILABLE]: "photosSoon",
  INVALID_KITCHEN_PHOTO: "photoInvalid",
};
const PHOTO_SOURCE = `${secondaryActionClass} gap-2 sm:w-full`;

const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#1A1A1A]/10 disabled:bg-[#F1F3F5] read-only:bg-[#F1F3F5] read-only:text-[#6B6B6B]";

function fromKitchen(kitchen: ChefKitchen | null, registeredPhone = ""): FormState {
  if (!kitchen) return EMPTY;
  return {
    kitchenName: kitchen.kitchenName,
    displayName: kitchen.displayName ?? "",
    description: kitchen.description ?? "",
    phoneNumber: kitchen.phoneNumber?.trim() || registeredPhone,
    email: kitchen.email ?? "",
    addressLine1: kitchen.addressLine1,
    addressLine2: kitchen.addressLine2 ?? "",
    landmark: kitchen.landmark ?? "",
    areaName: kitchen.areaName ?? "",
    city: kitchen.city,
    state: kitchen.state,
    postalCode: kitchen.postalCode ?? "",
    latitude: kitchen.latitude === null ? "" : String(kitchen.latitude),
    longitude: kitchen.longitude === null ? "" : String(kitchen.longitude),
    status: kitchen.status === "SUSPENDED" ? "INACTIVE" : kitchen.status,
    ...(kitchen.cuisines ? { cuisines: kitchen.cuisines } : {}),
    ...(kitchen.serviceAreas ? { serviceAreas: kitchen.serviceAreas } : {}),
    ...(kitchen.socialLinks
      ? { socialLinks: { instagram: kitchen.socialLinks.instagram ?? "", facebook: kitchen.socialLinks.facebook ?? "", youtube: kitchen.socialLinks.youtube ?? "", website: kitchen.socialLinks.website ?? "" } }
      : {}),
  };
}

function fromApplication(application: ChefApplication | null, registeredPhone = ""): FormState {
  if (!application || application.status !== "APPROVED") return EMPTY;
  return {
    ...EMPTY,
    displayName: [application.firstName, application.lastName].filter(Boolean).join(" "),
    phoneNumber: registeredPhone,
    email: application.email ?? "",
    addressLine1: application.addressLine1 ?? "",
    addressLine2: application.addressLine2 ?? "",
    landmark: application.landmark ?? "",
    city: application.city ?? "",
    state: application.state ?? "",
    postalCode: application.postalCode ?? "",
    latitude: application.latitude === null ? "" : String(application.latitude),
    longitude: application.longitude === null ? "" : String(application.longitude),
  };
}

function addressSummary(form: FormState): string {
  return [
    form.addressLine1,
    form.addressLine2,
    form.landmark,
    form.areaName,
    form.city,
    form.state,
    form.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

// The way out of the page, apart from each setup step's own Back.
const PAGE_BACK = { href: "/chef/profile", label: "Profile" } as const;
function PageBack() {
  const { language } = useLanguage();
  return (
    <Link href={PAGE_BACK.href} className="chef-back-link">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {pageText(PAGE_BACK.label, language)}
    </Link>
  );
}

/** Chips to switch on and off, with "+ Add" for one of the chef's own (up to 10 in all, 40 characters each). */
function ChipPicker({ label, options, selected, onChange, addLabel, addFieldLabel, chipLabel = (item) => item }: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange(next: string[]): void;
  addLabel: string;
  addFieldLabel: string;
  /** What a chip reads; its value is what is saved. */
  chipLabel?: (item: string) => string;
}) {
  const text = useText(TEXT);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const chips = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const full = selected.length >= CHEF_KITCHEN_TAG_LIMITS.count;
  useEffect(() => {
    if (adding || !closing.current) return;
    closing.current = false;
    // Back to "+ Add", or to the newest chip once ten are chosen and "+ Add" is off.
    Array.from(chips.current?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? []).at(-1)?.focus();
  }, [adding]);
  function close() {
    closing.current = true;
    setAdding(false);
  }
  function add() {
    const word = draft.trim();
    if (word && !selected.some((item) => item.toLowerCase() === word.toLowerCase())) onChange([...selected, word]);
    setDraft("");
    close();
  }
  return (
    <fieldset className="mt-5 grid gap-2">
      <legend className="mb-2 text-sm font-semibold text-[#1A1A1A]">{label}</legend>
      <div ref={chips} className="chef-chips is-wrap">
        {[...new Set([...options, ...selected])].map((item) => {
          const on = selected.includes(item);
          return (
            <button key={item} type="button" aria-pressed={on} disabled={!on && full} onClick={() => onChange(on ? selected.filter((other) => other !== item) : [...selected, item])} className="chef-chip max-w-full !whitespace-normal text-left wrap-anywhere disabled:opacity-60">
              {chipLabel(item)}
            </button>
          );
        })}
        {adding ? null : <button type="button" disabled={full} onClick={() => setAdding(true)} className="chef-chip disabled:opacity-60">{addLabel}</button>}
      </div>
      {adding ? (
        <div className="flex gap-2">
          <input
            aria-label={addFieldLabel}
            autoFocus
            value={draft}
            maxLength={CHEF_KITCHEN_TAG_LIMITS.length}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              } else if (event.key === "Escape") close();
            }}
            className={`${INPUT_CLASS} !mt-0`}
          />
          <button type="button" disabled={!draft.trim()} onClick={add} className="chef-btn">{text.add}</button>
        </div>
      ) : null}
    </fieldset>
  );
}

function StepHeader({
  label,
  onBack,
}: {
  label: string;
  onBack?: () => void;
}) {
  const text = useText(TEXT);
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F1F3F5]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {text.back}
        </button>
      ) : <span />}
      <p className="text-sm font-semibold text-[#6B6B6B]">{format(text.setUp, { step: label })}</p>
    </div>
  );
}

export function ChefKitchenForm() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  // The kitchen is read once per visit, not again when the chef changes language.
  const words = useRef(text);
  useEffect(() => {
    words.current = text;
  });
  const linkLabel = (field: SocialLinkField) => (field === "website" ? text.website : SOCIAL_LINK_LABELS[field]);
  const cuisineLabel = (item: string) =>
    Object.hasOwn(CUISINE_WORDS.en, item) ? CUISINE_WORDS[language][item as keyof (typeof CUISINE_WORDS)["en"]] : item;
  const [kitchen, setKitchen] = useState<ChefKitchen | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  // The details as saved (or as first filled in): the form differs from them while there are unsaved changes.
  const [baseline, setBaseline] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<SetupStep>("name");
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState(text.loading);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoSaving, setPhotoSaving] = useState<"CHEF" | "KITCHEN" | null>(null);
  // A new key each time, so a repeated message is read out again.
  const [photoNote, setPhotoNote] = useState({ text: "", key: 0 });
  const [faceSheet, setFaceSheet] = useState(false);
  const [faceDraft, setFaceDraft] = useState<string | null>(null);
  const [moveSheet, setMoveSheet] = useState(false);
  const [moveDraft, setMoveDraft] = useState("");
  const [moveState, setMoveState] = useState<"idle" | "sending" | "sent" | "failed" | "unavailable">("idle");
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<File | null>(null);
  const photoPreview = useMemo(() => (photoDraft ? URL.createObjectURL(photoDraft) : null), [photoDraft]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  const [invalidField, setInvalidField] = useState<keyof FormState | SocialLinkField | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  useEffect(() => {
    if (!invalidField) return;
    const input = document.getElementById(`kitchen-${invalidField}`);
    const details = input?.closest("details");
    if (details) details.open = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    if (!reduced) input?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 240, iterations: 1 });
  }, [invalidField, validationAttempt]);
  function invalidate(name: keyof FormState | SocialLinkField, reason: string) { setInvalidField(name); setValidationAttempt(value => value + 1); setMessage(reason); }
  function inputProps(name: keyof FormState | SocialLinkField) { return { id: `kitchen-${name}`, "aria-invalid": invalidField === name, "aria-describedby": invalidField === name ? "kitchen-field-error" : undefined }; }
  function checkFieldLengths(fields: (keyof typeof CHEF_KITCHEN_FIELD_LIMITS)[]): boolean {
    const labels = { kitchenName: text.kitchenName, displayName: text.chefName, city: text.city, state: text.state, postalCode: text.pincode };
    for (const field of fields) {
      const limit = CHEF_KITCHEN_FIELD_LIMITS[field];
      if (form[field].trim().length > limit) {
        setStep(field === "kitchenName" || field === "displayName" ? "name" : "address");
        invalidate(field, format(text.tooLong, { field: labels[field], limit }));
        return false;
      }
    }
    return true;
  }
  async function moveKitchenPin(next: { latitude: number; longitude: number }) {
    const version = ++locationRequest.current;
    setForm(current => ({ ...current, latitude: String(next.latitude), longitude: String(next.longitude) }));
    setLocating(true);
    try {
      const address = await reverseGeocodeCurrentLocation(next.latitude, next.longitude);
      if (version !== locationRequest.current) return;
      setForm(current => ({ ...current, addressLine1: address.houseNumber || address.formattedAddress, addressLine2: address.street || "", areaName: address.area || "", city: address.city || current.city, state: address.state || current.state, postalCode: address.postalCode || current.postalCode, ...savedAddress(kitchen) }));
      setMessage(text.pinMoved);
    } catch { if (version === locationRequest.current) setMessage(text.pinMovedNoAddress); }
    finally { if (version === locationRequest.current) setLocating(false); }
  }

  useEffect(() => {
    let active = true;
    const { notApproved, loadFailed } = words.current;
    const sessionContext = captureSessionContext();
    void Promise.all([
      sessionFetch("/api/chef/kitchen", { cache: "no-store" }),
      sessionFetch("/api/chef/application", { cache: "no-store" }),
      sessionFetch("/api/chef/onboarding", { cache: "no-store" }).catch(() => null),
    ])
      .then(async ([kitchenResponse, applicationResponse, onboardingResponse]) => {
        const kitchenBody = await kitchenResponse.json().catch(() => null);
        const applicationBody = applicationResponse.ok
          ? ((await applicationResponse.json().catch(() => null)) as ChefApplication | null)
          : null;
        if (!active || !isSessionContextCurrent(sessionContext)) return;
        if (!kitchenResponse.ok) {
          throw kitchenResponse.status === 403
            ? new ChefError(notApproved, "CHEF_ACCESS_REQUIRED", 403)
            : chefApiError(kitchenResponse, kitchenBody, loadFailed);
        }
        const onboardingBody = onboardingResponse?.ok ? parseOnboardingState(await onboardingResponse.json().catch(() => null)) : null;
        if (!active || !isSessionContextCurrent(sessionContext)) return;
        const nextKitchen = kitchenBody as ChefKitchen | null;
        setKitchen(nextKitchen);
        const registeredPhone = getSession()?.phoneNumber ?? "";
        const initial = nextKitchen ? fromKitchen(nextKitchen, registeredPhone) : fromApplication(applicationBody, registeredPhone);
        // Whatever the approved application already says about the kitchen is filled in, never asked again.
        if (!nextKitchen && applicationBody?.status === "APPROVED" && onboardingBody && applicationBody.id && onboardingBody.application.id === applicationBody.id && onboardingBody.details) {
          initial.kitchenName = onboardingBody.details.kitchenName;
          initial.description = onboardingBody.details.kitchenDescription;
          initial.addressLine1 = onboardingBody.details.addressLine1;
          initial.addressLine2 = onboardingBody.details.addressLine2;
          initial.landmark = onboardingBody.details.landmark;
          initial.city = onboardingBody.details.city;
          initial.state = onboardingBody.details.state;
          initial.postalCode = onboardingBody.details.postalCode;
          initial.latitude = String(onboardingBody.details.latitude ?? "");
          initial.longitude = String(onboardingBody.details.longitude ?? "");
        }
        setForm(initial);
        setBaseline(initial);
        setStep(nextKitchen ? "summary" : "name");
        setMessage("");
        setLoaded(true);
      })
      .catch((error) => {
        if (active && isSessionContextCurrent(sessionContext)) {
          setMessage(chefErrorText(error, loadFailed));
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function setField<K extends keyof FormState>(name: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [name]: value }));
    if (invalidField === name) { setInvalidField(null); setMessage(""); }
  }

  function setLink(field: SocialLinkField, value: string) {
    setForm((current) => (current.socialLinks ? { ...current, socialLinks: { ...current.socialLinks, [field]: value } } : current));
    if (invalidField === field) { setInvalidField(null); setMessage(""); }
  }

  function checkLinks(): boolean {
    const bad = SOCIAL_LINK_FIELDS.find((field) => form.socialLinks && !isSocialLink(form.socialLinks[field]));
    if (!bad) return true;
    setStep("name");
    invalidate(bad, format(text.linkHttps, { name: linkLabel(bad) }));
    return false;
  }

  async function sendMove() {
    const text = moveDraft.trim();
    if (!text || moveState === "sending") return;
    setMoveState("sending");
    try {
      await createSupportCase({ contextRole: "CHEF", subject: "Move my kitchen", message: text });
      setMoveDraft("");
      setMoveState("sent");
    } catch (error) {
      setMoveState(error instanceof SupportCaseError && error.code === FEATURE_NOT_AVAILABLE ? "unavailable" : "failed");
    }
  }

  function go(next: SetupStep) {
    setMessage("");
    setNotice("");
    setInvalidField(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function continueName() {
    if (!form.kitchenName.trim()) {
      invalidate("kitchenName", text.nameNeeded);
      return;
    }
    if (!checkFieldLengths(["kitchenName", "displayName"]) || !checkLinks()) return;
    go("address");
  }

  function continueAddress() {
    const missing = (
      [
        ["addressLine1", text.missingHouse],
        ["city", text.missingCity],
        ["state", text.missingState],
      ] as const
    ).filter(([field]) => !form[field].trim());
    if (missing.length) {
      // Name what is missing and go to the first one.
      const list = new Intl.ListFormat(LANGUAGE_NAMES[language].locale, { type: "conjunction" }).format(missing.map(([, label]) => label));
      invalidate(missing[0][0], format(text.addToContinue, { list }));
      return;
    }
    if (!checkFieldLengths(["city", "state", "postalCode"])) return;
    go("ready");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage(text.noLocation);
      return;
    }
    setLocating(true);
    setMessage(text.finding);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));
        try {
          const detected = await reverseGeocodeCurrentLocation(latitude, longitude);
          setForm((current) => ({
            ...current,
            addressLine1: detected.houseNumber || detected.formattedAddress,
            addressLine2: detected.street || current.addressLine2,
            areaName: detected.area || detected.city || current.areaName,
            city: detected.city || current.city,
            state: detected.state || current.state,
            postalCode: detected.postalCode || current.postalCode,
            latitude: String(latitude),
            longitude: String(longitude),
            ...savedAddress(kitchen),
          }));
          setMessage(detected.preciseHouseNumber ? text.foundKitchen : text.foundArea);
        } catch {
          setForm((current) => ({
            ...current,
            latitude: String(latitude),
            longitude: String(longitude),
          }));
          setMessage(text.foundPinOnly);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setMessage(text.locationRefused);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  function chooseOpen(open: boolean) {
    setForm((current) => ({
      ...current,
      status: open ? "ACTIVE" : kitchen ? "INACTIVE" : "DRAFT",
    }));
    setMessage("");
  }

  async function save() {
    if (!form.kitchenName.trim() || !form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      const missing = !form.kitchenName.trim() ? "kitchenName" : !form.addressLine1.trim() ? "addressLine1" : !form.city.trim() ? "city" : "state";
      setStep(missing === "kitchenName" ? "name" : "address");
      invalidate(missing, text.checkBeforeSave);
      return;
    }
    if (!checkFieldLengths(["kitchenName", "displayName", "city", "state", "postalCode"]) || !checkLinks()) return;
    const missingPickup = form.status === "ACTIVE" ? missingKitchenPickupField(form) : null;
    if (missingPickup) {
      setStep(missingPickup === "phoneNumber" ? "name" : "address");
      const labels = { phoneNumber: text.needPhone, areaName: text.needArea, postalCode: text.needPincode };
      invalidate(missingPickup, format(kitchen && missingPickup !== "phoneNumber" ? text.askSupportToAdd : text.completeBeforeOpening, { what: labels[missingPickup] }));
      return;
    }
    if (form.status === "ACTIVE" && (!form.latitude.trim() || !form.longitude.trim())) {
      setMessage(text.needPin);
      return;
    }
    setBusy(true);
    setMessage(text.savingKitchen);
    try {
      const body = {
        ...form,
        displayName: form.displayName || null,
        description: form.description || null,
        phoneNumber: form.phoneNumber || null,
        email: form.email || null,
        addressLine2: form.addressLine2 || null,
        landmark: form.landmark || null,
        areaName: form.areaName || null,
        postalCode: form.postalCode || null,
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
        // A socialLinks object replaces all four links on the server, so it always carries all four.
        socialLinks: form.socialLinks && Object.fromEntries(SOCIAL_LINK_FIELDS.map((field) => [field, form.socialLinks?.[field].trim() || null])),
      };
      const response = await sessionFetch("/api/chef/kitchen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { message?: unknown } | null;
      if (!response.ok) throw chefApiError(response, result, text.checkDetails);
      if (!result) throw new ChefError(text.notConfirmed, "INVALID_KITCHEN_RESPONSE", response.status);
      const nextKitchen = result as unknown as ChefKitchen;
      setKitchen(nextKitchen);
      setForm(fromKitchen(nextKitchen));
      setBaseline(fromKitchen(nextKitchen));
      setMessage("");
      setNotice(text.saved);
      setStep("summary");
    } catch (error) {
      setMessage(chefErrorText(error, text.saveFailed));
    } finally {
      setBusy(false);
    }
  }

  function notePhoto(text: string) {
    setPhotoNote((current) => ({ text, key: current.key + 1 }));
  }

  /** Photos save apart from the form, one at a time. */
  async function savePhoto(kind: "CHEF" | "KITCHEN", work: () => Promise<ChefKitchen>, done: string) {
    if (photoSaving) return;
    setPhotoSaving(kind);
    notePhoto("");
    try {
      setKitchen(await work());
      setNotice(done);
    } catch (error) {
      const code = error instanceof ChefKitchenError ? error.code : "";
      // The tiles were out of date (photos arrived from the application or another device): show what Craves holds.
      if (code === "KITCHEN_PHOTOS_LOCKED") void readChefKitchen().then((latest) => latest && setKitchen(latest), () => undefined);
      const known = PHOTO_ERRORS[code];
      notePhoto(known ? text[known] : kind === "CHEF" ? text.pictureFailed : text.photoFailed);
    } finally {
      setPhotoSaving(null);
    }
  }

  function saveFace() {
    const avatarId = faceDraft;
    if (!avatarId) return;
    setFaceSheet(false);
    void savePhoto("CHEF", () => saveChefAvatar(avatarId), text.pictureSaved);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    // Photos lock once added, so the chef sees the 4:3 crop and confirms it first, as with the app's crop step.
    if (file) void shrinkPhoto(file, 4 / 3).then((photo) => { setPhotoDraft(photo); setPhotoSheet(true); });
  }

  function showPhotoSheet(open: boolean) {
    setPhotoSheet(open);
    if (!open) setPhotoDraft(null);
  }

  function confirmPhoto() {
    const photo = photoDraft;
    if (!photo) return;
    showPhotoSheet(false);
    void savePhoto("KITCHEN", () => uploadKitchenPhoto(photo), text.photoSaved);
  }

  function pickPhoto(input: HTMLInputElement | null) {
    setPhotoSheet(false);
    input?.click();
  }

  const suspended = kitchen?.status === "SUSPENDED";
  const locked = savedAddress(kitchen);
  const pinLocked = kitchen?.latitude != null && kitchen.longitude != null;
  const photoSlots: (string | null | undefined)[] = kitchen ? kitchenPhotoSlots(kitchen) ?? [undefined, undefined] : [];
  const nextPhotoSlot = photoSlots.indexOf(null);
  const mapped = Boolean(form.latitude.trim()) && Boolean(form.longitude.trim());

  // Leaving the edit steps with changes not saved asks first (app: "Leave without saving?"), for a link
  // anywhere on the page, the step's own Back to the summary, and closing or reloading the tab.
  const router = useRouter();
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const unsaved = loaded && step !== "summary" && JSON.stringify(form) !== JSON.stringify(baseline);
  useLeaveGuard(unsaved, (href) => setLeaving(() => () => router.push(href)));
  const leaveEdit = () => {
    const back = () => {
      setForm(baseline);
      go("summary");
    };
    if (unsaved) setLeaving(() => back);
    else back();
  };
  const leaveDialog = (
    <Dialog
      open={leaving !== null}
      onOpenChange={(open) => !open && setLeaving(null)}
      title={text.leaveTitle}
      description={text.leaveText}
      footer={<>
        <button type="button" className={secondaryActionClass} onClick={() => setLeaving(null)}>{text.keepEditing}</button>
        <button
          type="button"
          className="craves-primary-action w-full sm:w-auto"
          onClick={() => {
            const leave = leaving;
            setLeaving(null);
            leave?.();
          }}
        >
          {text.leave}
        </button>
      </>}
    />
  );

  if (!loaded) {
    return <ChefLoading shape="kitchen" label={text.loadingLabel} />;
  }

  if (!kitchen && message && !form.kitchenName && !form.addressLine1) {
    return (
      <>
        <PageBack />
        <section className="mt-2 rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
          <p className="text-sm text-[#6B6B6B]">{message}</p>
        </section>
      </>
    );
  }

  if (step === "summary") {
    const open = kitchen?.status === "ACTIVE";
    return (
      <div>
        <ChefPageHead title={text.detailsTitle} subtitle={text.detailsSubtitle} back={{ href: PAGE_BACK.href, label: pageText(PAGE_BACK.label, language) }} />
        <div className="chef-stack">
          <ChefSection>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#1A1A1A]">{form.kitchenName || text.myKitchen}</h2>
              <ChefPill tone={suspended ? "danger" : open ? "success" : "muted"}>{suspended ? text.pausedByCraves : open ? text.open : text.closedForNow}</ChefPill>
            </div>
            {form.description ? <p className="mt-2 text-[0.9375rem] leading-6 text-[#6B6B6B]">{form.description}</p> : null}
            <div className="mt-5 flex gap-3 border-t border-[#E3E6EA] pt-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
              <div><p className="text-[0.8125rem] font-semibold text-[#6B6B6B]">{text.pickupAddress}</p><p className="mt-0.5 text-[0.9375rem] leading-6 text-[#1A1A1A]">{addressSummary(form)}</p></div>
            </div>
            {suspended ? <div className="mt-4"><ChefNotice icon={Store}>{text.pausedNote}</ChefNotice></div> : null}
            {message ? <p id="kitchen-field-error" role={invalidField ? "alert" : "status"} className="mt-4 text-[0.9375rem] text-[#6B6B6B]">{message}</p> : null}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={suspended} onClick={() => go("name")} className="chef-btn">{text.edit}</button>
              <Link href="/chef/menu" className="chef-btn">{text.goToMenu} <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          </ChefSection>
          {kitchen ? (
            <ChefSection title={text.photos} labelledBy="kitchen-photos-title">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={PHOTO_TILE}
                  disabled={kitchen.chefPhotoUrl === undefined || photoSaving !== null}
                  aria-busy={photoSaving === "CHEF"}
                  onClick={() => {
                    setFaceDraft(chefAvatarIdFromUrl(kitchen.chefPhotoUrl));
                    setFaceSheet(true);
                  }}
                >
                  <ChefFace photoUrl={kitchen.chefPhotoUrl} name={form.displayName} size={44} />
                  {text.yourPicture}
                  {kitchen.chefPhotoUrl === undefined ? <span className={PHOTO_SOON}>{text.comingSoon}</span> : null}
                  {photoSaving === "CHEF" ? <span className="absolute top-1 text-xs">{text.saving}</span> : null}
                </button>
                {photoSlots.map((url, slot) => {
                  const saving = photoSaving === "KITCHEN" && slot === nextPhotoSlot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={PHOTO_TILE}
                      disabled={url === undefined || photoSaving !== null}
                      aria-busy={saving}
                      onClick={() => {
                        if (url || slot !== nextPhotoSlot) notePhoto(url ? text.photosLocked : text.overallFirst);
                        else setPhotoSheet(true);
                      }}
                    >
                      {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <Store className="h-6 w-6" aria-hidden="true" />}
                      <span className={url ? "absolute inset-x-0 bottom-0 bg-white py-0.5 text-[#1A1A1A]" : undefined}>
                        {slot === 0 ? text.overall : text.setup}
                        {url ? <span className="sr-only">{text.photoAdded}</span> : null}
                      </span>
                      {url === undefined ? <span className={PHOTO_SOON}>{text.comingSoon}</span> : null}
                      {saving ? <span className="absolute top-1 text-xs">{text.saving}</span> : null}
                    </button>
                  );
                })}
              </div>
              <input ref={cameraInput} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={choosePhoto} />
              <input ref={galleryInput} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={choosePhoto} />
              <p aria-live="polite" className="mt-3 text-sm text-[#6B6B6B] empty:mt-0">{photoNote.text ? <span key={photoNote.key}>{photoNote.text}</span> : null}</p>
            </ChefSection>
          ) : null}
        </div>
        <Sheet
          open={faceSheet}
          onOpenChange={setFaceSheet}
          title={text.changePicture}
          footer={
            <>
              <button type="button" className={secondaryActionClass} onClick={() => setFaceSheet(false)}>{text.cancel}</button>
              <button type="button" className="craves-primary-action w-full sm:w-auto" disabled={!faceDraft} onClick={saveFace}>{text.save}</button>
            </>
          }
        >
          <div className="mt-5">
            <ChefAvatarGrid selectedId={faceDraft} onSelect={setFaceDraft} />
          </div>
        </Sheet>
        <Sheet
          open={photoSheet}
          onOpenChange={showPhotoSheet}
          title={text.kitchenPhoto}
          description={text.photoLocks}
          footer={photoPreview ? (
            <>
              <button type="button" className={secondaryActionClass} onClick={() => setPhotoDraft(null)}>{text.chooseAnother}</button>
              <button type="button" className="craves-primary-action w-full sm:w-auto" onClick={confirmPhoto}>{text.usePhoto}</button>
            </>
          ) : undefined}
        >
          {photoPreview ? (
            <img src={photoPreview} alt={text.photoAlt} className="mt-5 aspect-[4/3] w-full rounded-2xl object-cover" />
          ) : (
            <div className="mt-5 grid gap-2">
              <button type="button" className={PHOTO_SOURCE} onClick={() => pickPhoto(cameraInput.current)}><Camera className="h-5 w-5" aria-hidden="true" />{text.takePhoto}</button>
              <button type="button" className={PHOTO_SOURCE} onClick={() => pickPhoto(galleryInput.current)}><ImageIcon className="h-5 w-5" aria-hidden="true" />{text.gallery}</button>
            </div>
          )}
        </Sheet>
        <ChefFlash message={notice} onClose={() => setNotice("")} />
      </div>
    );
  }

  if (step === "name") {
    return (
      <>
      <PageBack />
      <section className="chef-section mt-2 p-5 md:p-7">
        <StepHeader label={text.stepName} onBack={kitchen ? leaveEdit : undefined} />
        <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Store className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">{text.nameTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{text.nameHelp}</p>
        <label className="mt-6 block text-sm font-semibold text-[#1A1A1A]">{text.kitchenName}<RequiredMark /><input {...inputProps("kitchenName")} aria-required="true" value={form.kitchenName} onChange={(event) => setField("kitchenName", event.target.value)} className={INPUT_CLASS} maxLength={CHEF_KITCHEN_FIELD_LIMITS.kitchenName} /></label>
        <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">{text.tellCustomers} <span className="font-normal text-[#6B6B6B]">{text.optional}</span><textarea value={form.description} onChange={(event) => setField("description", event.target.value)} className={`${INPUT_CLASS} min-h-28`} maxLength={1000} /></label>
        {form.cuisines ? <ChipPicker label={text.whatYouCook} options={SUGGESTED_CUISINES} selected={form.cuisines} onChange={(next) => setField("cuisines", next)} addLabel={text.addChip} addFieldLabel={text.addCuisine} chipLabel={cuisineLabel} /> : null}
        <details className="mt-5 rounded-2xl bg-[#F1F3F5] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">{text.moreDetails}</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[#1A1A1A]">{text.chefNameShown} <span className="font-normal text-[#6B6B6B]">{text.optional}</span><input {...inputProps("displayName")} value={form.displayName} onChange={(event) => setField("displayName", event.target.value)} className={INPUT_CLASS} maxLength={CHEF_KITCHEN_FIELD_LIMITS.displayName} /></label>
            <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">{text.kitchenEmail} <span className="font-normal text-[#6B6B6B]">{text.optional}</span><input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} className={INPUT_CLASS} /></label>
            {form.socialLinks ? <p className="text-sm text-[#6B6B6B] sm:col-span-2">{text.socialHttps}</p> : null}
            {form.socialLinks ? SOCIAL_LINK_FIELDS.map((field) => (
              <label key={field} className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">{linkLabel(field)} <span className="font-normal text-[#6B6B6B]">{text.optional}</span><input {...inputProps(field)} type="url" inputMode="url" placeholder="https://" value={form.socialLinks?.[field]} onChange={(event) => setLink(field, event.target.value)} className={INPUT_CLASS} maxLength={SOCIAL_LINK_MAX} /></label>
            )) : null}
          </div>
        </details>
        <label className="mt-5 block text-sm font-semibold text-[#1A1A1A]">{text.kitchenPhone} <span className="font-normal text-[#6B6B6B]">{text.requiredForOrders}</span><input {...inputProps("phoneNumber")} value={form.phoneNumber} onChange={(event) => setField("phoneNumber", event.target.value)} className={INPUT_CLASS} inputMode="tel" maxLength={24} /></label>
        {message ? <p id="kitchen-field-error" role="alert" className="chef-field-error mt-4">{message}</p> : null}
        <button type="button" onClick={continueName} className="chef-btn is-primary is-block mt-7">{text.continue}</button>
      </section>
      {leaveDialog}
      </>
    );
  }

  if (step === "address") {
    return (
      <>
      <PageBack />
      <section className="chef-section mt-2 p-5 md:p-7">
        <StepHeader label={text.stepAddress} onBack={() => go("name")} />
        <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><MapPin className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">{text.addressTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{text.addressHelp}</p>
        {pinLocked ? null : <button type="button" disabled={locating} onClick={useCurrentLocation} className="chef-btn is-block mt-6"><MapPin className="h-4 w-4" aria-hidden="true" />{locating ? text.findingMine : mapped ? text.refreshLocation : text.useLocation}</button>}
        {message ? <p id="kitchen-field-error" role={invalidField ? "alert" : "status"} className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        {!pinLocked && form.latitude !== "" && form.longitude !== "" ? <div className="mt-5"><AddressMapPicker latitude={Number(form.latitude)} longitude={Number(form.longitude)} onCenterChange={next => void moveKitchenPin(next)} onUseCurrentLocation={useCurrentLocation} locating={locating} disabled={locating} /></div> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">{text.house}<RequiredMark /><input {...inputProps("addressLine1")} aria-required="true" value={form.addressLine1} onChange={(event) => setField("addressLine1", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">{text.street} <span className="font-normal text-[#6B6B6B]">{text.optional}</span><input value={form.addressLine2} onChange={(event) => setField("addressLine2", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">{text.area} <span className="font-normal text-[#6B6B6B]">{text.requiredForOrders}</span><input {...inputProps("areaName")} readOnly={"areaName" in locked} value={form.areaName || ("areaName" in locked ? "–" : "")} onChange={(event) => setField("areaName", event.target.value)} className={INPUT_CLASS} maxLength={120} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">{text.landmark} <span className="font-normal text-[#6B6B6B]">{text.optional}</span><input value={form.landmark} onChange={(event) => setField("landmark", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">{text.cityLabel}<RequiredMark /><input {...inputProps("city")} aria-required="true" readOnly={"city" in locked} value={form.city || ("city" in locked ? "–" : "")} onChange={(event) => setField("city", event.target.value)} className={INPUT_CLASS} maxLength={CHEF_KITCHEN_FIELD_LIMITS.city} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">{text.stateLabel}<RequiredMark /><input {...inputProps("state")} aria-required="true" readOnly={"state" in locked} value={form.state || ("state" in locked ? "–" : "")} onChange={(event) => setField("state", event.target.value)} className={INPUT_CLASS} maxLength={CHEF_KITCHEN_FIELD_LIMITS.state} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">{text.pincodeLabel} <span className="font-normal text-[#6B6B6B]">{text.requiredForOrders}</span><input {...inputProps("postalCode")} readOnly={"postalCode" in locked} value={form.postalCode || ("postalCode" in locked ? "–" : "")} onChange={(event) => setField("postalCode", event.target.value)} className={INPUT_CLASS} inputMode="numeric" maxLength={CHEF_KITCHEN_FIELD_LIMITS.postalCode} /></label>
        </div>
        {form.serviceAreas ? <ChipPicker label={text.deliveryAreas} options={form.areaName.trim() ? [form.areaName.trim()] : []} selected={form.serviceAreas} onChange={(next) => setField("serviceAreas", next)} addLabel={text.addArea} addFieldLabel={text.addDeliveryArea} /> : null}
        {kitchen ? (
          <div className="mt-5 rounded-2xl bg-[#F1F3F5] p-4">
            <p className="text-sm leading-6 text-[#6B6B6B]">{text.lockedAddress}</p>
            <button type="button" onClick={() => { if (moveState === "sent") setMoveState("idle"); setMoveSheet(true); }} className="chef-btn is-small mt-3">{text.move}</button>
          </div>
        ) : null}
        <button type="button" onClick={continueAddress} disabled={locating} className="chef-btn is-primary is-block mt-7">{text.rightPlace}</button>
        <Sheet
          open={moveSheet}
          onOpenChange={setMoveSheet}
          title={text.move}
          description={text.moveHelp}
          busy={moveState === "sending"}
          unsavedChanges={moveState !== "sent" && Boolean(moveDraft.trim())}
          footer={moveState === "sent" ? (
            <>
              <Link href="/chef/support" className={secondaryActionClass}>{text.openHelp}</Link>
              <button type="button" className="craves-primary-action w-full sm:w-auto" onClick={() => setMoveSheet(false)}>{text.done}</button>
            </>
          ) : (
            <>
              <button type="button" className={secondaryActionClass} onClick={() => setMoveSheet(false)}>{text.cancel}</button>
              <button type="button" className="craves-primary-action w-full sm:w-auto" disabled={!moveDraft.trim() || moveState === "sending" || moveState === "unavailable"} aria-busy={moveState === "sending"} onClick={() => void sendMove()}>{moveState === "sending" ? text.sending : text.send}</button>
            </>
          )}
        >
          {moveState === "sent" ? (
            <p role="status" className="mt-5 text-[0.9375rem] leading-6 text-[#1A1A1A]">{text.moveSent}</p>
          ) : (
            <>
              {/* Sheets open outside the chef page: the theme brings the chef colours along. */}
              {moveState === "unavailable" ? <div className="chef-panel-theme chef-sheet-theme mt-2"><ChefEmpty illustration="comingSoon" title={text.chatSoonTitle} text={text.chatSoonText} /></div> : null}
              <label className="mt-5 block text-sm font-semibold text-[#1A1A1A]">{text.newAddress}<textarea value={moveDraft} onChange={(event) => setMoveDraft(event.target.value)} className={`${INPUT_CLASS} min-h-28`} maxLength={SUPPORT_MESSAGE_MAX} /></label>
              {moveState === "failed" ? <p role="alert" className="mt-3 text-sm font-medium text-[#C4200F]">{text.sendFailed}</p> : null}
            </>
          )}
        </Sheet>
      </section>
      {leaveDialog}
      </>
    );
  }

  const openSelected = form.status === "ACTIVE";
  return (
    <>
    <PageBack />
    <section className="chef-section mt-2 p-5 md:p-7">
      <StepHeader label={text.stepReady} onBack={() => go("address")} />
      <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Check className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
      <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">{text.readyTitle}</h1>
      <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">{text.readyHelp}</p>
      <div className="mt-6 grid gap-3">
        <button type="button" onClick={() => chooseOpen(true)} className={`rounded-2xl border p-5 text-left transition ${openSelected ? "!border-[#1A1A1A] shadow-[inset_0_0_0_1px_#1A1A1A]" : "border-[#E5E7EB]"}`}>
          <p className="font-semibold text-[#1A1A1A]">{text.readyYes}</p>
          <p className="mt-1 text-sm text-[#6B6B6B]">{text.readyYesNote}</p>
        </button>
        <button type="button" onClick={() => chooseOpen(false)} className={`rounded-2xl border p-5 text-left transition ${!openSelected ? "!border-[#1A1A1A] shadow-[inset_0_0_0_1px_#1A1A1A]" : "border-[#E5E7EB]"}`}>
          <p className="font-semibold text-[#1A1A1A]">{text.readyNo}</p>
          <p className="mt-1 text-sm text-[#6B6B6B]">{text.readyNoNote}</p>
        </button>
      </div>
      {message ? <p id="kitchen-field-error" role="alert" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#C4200F]">{message}</p> : null}
      <button type="button" disabled={busy || locating || suspended} onClick={() => void save()} className="chef-btn is-primary is-block mt-7">{busy ? text.saving : text.saveKitchen}</button>
    </section>
    {leaveDialog}
    </>
  );
}
