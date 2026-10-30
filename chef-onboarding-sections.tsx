"use client";
import { sessionFetch } from "@/shared/lib/session-fetch";

import { chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Headset,
  IdCard,
  Landmark,
  LocateFixed,
  MapPin,
  Move,
  PencilLine,
  Phone,
  Play,
  PlayCircle,
  Search,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { EmailVerificationPanel } from "@/features/sign-in/components/EmailVerificationPanel";
import { AddressMapPicker } from "@/features/addresses/components/AddressMapPicker";
import { searchLocations, type LocationSearchResult } from "@/features/addresses/api/searchLocation";
import { reverseGeocodeCurrentLocation } from "@/features/addresses/api/reverseGeocode";
import {
  PROOF_LABELS,
  PROOF_OPTIONS,
  proofNeedsBack,
  type LearningContent,
  type OnboardingDetails,
  type ProofKind,
} from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import { format, messages } from "@/shared/i18n/language";
import { useText } from "@/shared/i18n/language-context";
import {
  CHEF_SECTION_LABELS,
  adultCutoff,
  bankCanContinue,
  chefFullName,
  completedSections,
  evidenceComplete,
  kitchenAddress,
  missingKitchenFields,
  type ChefFormSection,
} from "@/features/chef-onboarding/lib/chef-onboarding-flow";
import { ChefOnboardingUpload, useSavedPreview } from "@/features/chef-onboarding/components/chef-onboarding-upload";
import {
  Card,
  FieldError,
  FieldShell,
  LockedInput,
  Note,
  Spinner,
  StatusChip,
  VerifiedBadge,
  describedBy,
  formatDate,
  formatDateOfBirth,
  formatFssai,
  formatPhone,
} from "@/features/chef-onboarding/components/chef-onboarding-ui";
import { chefOnboardingApi, type ChefOnboardingFlow } from "@/features/chef-onboarding/components/use-chef-onboarding";
import { DateOfBirthPicker } from "@/features/chef-onboarding/components/chef-date-of-birth";
import { LanguagePicker } from "@/features/chef-onboarding/components/chef-language-picker";

const TEXT = messages({
  en: {
    // Basic details
    dobLabel: "Date of birth", dobHelper: "You must be at least 18 years old to apply.", aboutYou: "About you", fullName: "Full name",
    nameHelper: "Enter your name as it appears on your bank account.", namePlaceholder: "First and last name",
    contact: "Contact details", contactHelper: "We’ll use these for updates about your application.", mobile: "Mobile number",
    verified: "Verified", signInAgain: "Sign in again to verify your mobile number.", verifyMobile: "Verify mobile number",
    // Your kitchen
    pinNoAddress: "Your pin is selected. We couldn’t fill in the address automatically, so please enter or correct it below.",
    noLocation: "Location isn’t available in this browser. Search for your address instead.",
    locationOff: "Location access is turned off. Allow it in your browser settings, or search for your address.",
    locationFailed: "We couldn’t find your location. Search for your address or try again.",
    searchShort: "Enter at least 3 characters to search.", noResults: "No matching address found. Try a nearby landmark or area name.",
    searchFailed: "Address search is unavailable right now. Use your current location or enter the address below.",
    kitchenInfo: "Kitchen information", kitchenName: "Kitchen name", kitchenNameExample: "For example, Ananya’s Kitchen",
    aboutKitchen: "About your kitchen", aboutKitchenPlaceholder: "A line about the food you love to cook",
    kitchenAddress: "Kitchen address", kitchenAddressHelper: "Find your kitchen, then check the pin.", dragHint: "Drag the map to adjust the pin",
    mapLabel: "Kitchen map. Drag the map or use the arrow keys to move the pin to your kitchen.",
    pinHere: "Your kitchen pin will appear here", pinHow: "Search for your address or use your current location.",
    searchLabel: "Search location", searchPlaceholder: "Building, street or area", searchButton: "Search address", searching: "Searching addresses…",
    locating: "Finding your location…", useLocation: "Use my current location", pinPlaced: "Pin placed on the map",
    pinCheck: "Move the map if the pin isn’t exactly on your kitchen.", addressLine1: "Flat / house number / building", addressLine2: "Street / area",
    landmark: "Landmark", landmarkExample: "For example, near the metro station", postalCode: "PIN code", city: "City", state: "State", mapPin: "Map pin",
    photos: "Kitchen photos", photosHelper: "Two clear photos of where you cook. Customers see them on your kitchen page.",
    photosWait: "Finish your kitchen address to add photos", photosWaitWhy: "Photos are saved with your address. Still needed:", goTo: "Go to {field}",
    overallPhoto: "Overall kitchen photo", overallPhotoHelper: "Show the full kitchen space where you prepare food.",
    setupPhoto: "Cooking setup photo", setupPhotoHelper: "Show your stove and the cooking equipment you use.",
    photoFormats: "JPG, PNG, HEIC or WebP · up to 10 MB each",
    // FSSAI and its guide
    fssaiHelper: "The 14-digit number on your FSSAI registration or licence.", fssaiLabel: "FSSAI registration number",
    noFssai: "Don’t have FSSAI?", fssaiPlaceholder: "14-digit number", verifiedByCraves: "Verified by Craves",
    guideUnavailable: "The video guide is unavailable right now.", guideUnreadable: "The video guide could not be loaded.",
    videoNotOpened: "The video could not be opened. Please try again.", videoFailed: "The video could not be opened.",
    step1: "Visit the official FSSAI FoSCoS portal", step1Before: "Open the official registration and licensing website, ", step1After: ".",
    step2: "Choose the registration or licence for your business", step2Text: "Use the portal’s eligibility guidance to pick the right option.",
    step3: "Enter your details", step3Text: "Complete the required personal and food business information.",
    step4: "Upload documents and submit", step4Text: "Provide the requested documents and pay the applicable fee shown on the portal.",
    step5: "Track your application", step5Text: "Use your acknowledgement or reference number to follow the status on FoSCoS.",
    watch: "Watch how to apply", videoLanguage: "Video language", loadingGuide: "Loading video guide", tryAgain: "Try again",
    guideSoon: "The video guide is coming soon. Follow the steps above, or ask us to call you.",
    playbackFailed: "Video access expired or playback failed. Play it again to retry.", watchVideo: "Watch video: {title}",
    inEnglish: "In English", reloadVideo: "Reload video", fssaiHelp: "Need help with FSSAI?",
    fssaiHelpText: "Our team can guide you through the application process.", contacted: "Our team contacted you", received: "Request received",
    contactedText: "Our Craves team has spoken to you about your FSSAI application. We’ll follow up if anything else is needed.",
    receivedText: "Our Craves team will call you on your registered mobile number to help with your FSSAI application.",
    reference: "Reference {case}", requested: " · Requested {date}",
    resolved: "Your last request ({case}) is resolved. Ask again if you still need help.", requestCall: "Request a call from Craves",
    finishOthers: "You can finish the other sections now. Add your FSSAI number before you submit your application.",
    haveFssai: "I have an FSSAI number",
    // Identity
    docType: "Document type", identityDocument: "Identity document",
    removeFirst: "To choose a different document, remove the uploaded files first.", chooseOne: "Choose one valid document that shows your name.",
    idName: "Name of the ID", idNameExample: "For example, Voter ID, Driving Licence or Passport", noBack: "This document has no back side",
    frontAndBack: "Upload the front and the back.", oneFile: "Upload one clear photo or PDF.", front: "Front side", addFront: "Add front side",
    addDocument: "Add document", back: "Back side", addBack: "Add back side", fileFormats: "PDF, JPG, PNG, HEIC or WebP · up to 10 MB each",
    clearPhoto: "Make sure all four corners are visible, the text is readable and there is no glare.",
    // Review
    complete: "Complete", attention: "Needs attention", editSection: "Edit {section}", edit: "Edit", notAdded: "Not added",
    photoUploaded: "{photo} uploaded", photoMissing: "{photo} missing", mobileShort: "Mobile", email: "Email", address: "Address",
    location: "Location", pinned: "Pinned on map", overallShort: "Overall kitchen", setupShort: "Cooking setup", status: "Status",
    numberAdded: "Number added", notAddedYet: "Not added yet", registrationNumber: "Registration number", document: "Document",
    uploaded: "Uploaded", saved: "Saved", addLater: "Add later", accountSaved: "Account ending {lastFour} is saved. {message}",
    bankLater: "You can add bank details later. They aren’t needed to submit your application for review. Saving them now means one less step when payouts open.",
    changeBank: "Change bank details", addBankNow: "Add bank details now", addOrCheckBank: "Add or check bank details",
    accountHolder: "Account holder", bank: "Bank", account: "Account",
    termsBefore: "I confirm these details are correct and agree to the ", terms: "Craves Chef Terms", termsMiddle: " and ",
    privacy: "Privacy Policy", termsAfter: ".",
  },
  te: {
    dobLabel: "పుట్టిన తేదీ", dobHelper: "దరఖాస్తు చేయాలంటే మీకు కనీసం 18 ఏళ్లు ఉండాలి.", aboutYou: "మీ గురించి", fullName: "పూర్తి పేరు",
    nameHelper: "మీ బ్యాంక్ ఖాతాలో ఉన్నట్టే మీ పేరు రాయండి.", namePlaceholder: "పేరు, ఇంటి పేరు",
    contact: "మీ ఫోన్, ఈమెయిల్", contactHelper: "మీ దరఖాస్తు గురించిన సమాచారం వీటికే పంపుతాం.", mobile: "మొబైల్ నంబర్",
    verified: "ధృవీకరించిన", signInAgain: "మీ మొబైల్ నంబర్ ధృవీకరించడానికి మళ్లీ సైన్ ఇన్ చేయండి.", verifyMobile: "మొబైల్ నంబర్ ధృవీకరించండి",
    pinNoAddress: "మీ పిన్ పెట్టాం. చిరునామా మేమే నింపలేకపోయాం, కింద మీరే రాయండి లేదా సరిచేయండి.",
    noLocation: "ఈ బ్రౌజర్‌లో లొకేషన్ పని చేయదు. మీ చిరునామా వెతకండి.",
    locationOff: "లొకేషన్ అనుమతి ఆఫ్‌లో ఉంది. బ్రౌజర్ సెట్టింగ్స్‌లో ఆన్ చేయండి, లేదా మీ చిరునామా వెతకండి.",
    locationFailed: "మీ లొకేషన్ దొరకలేదు. మీ చిరునామా వెతకండి, లేదా మళ్లీ ప్రయత్నించండి.",
    searchShort: "వెతకడానికి కనీసం 3 అక్షరాలు రాయండి.", noResults: "ఈ చిరునామా దొరకలేదు. దగ్గర్లోని ల్యాండ్‌మార్క్ లేదా ఏరియా పేరుతో వెతకండి.",
    searchFailed: "ఇప్పుడు చిరునామా వెతకడం కుదరడం లేదు. మీ లొకేషన్ వాడండి, లేదా కింద చిరునామా రాయండి.",
    kitchenInfo: "వంటగది వివరాలు", kitchenName: "వంటగది పేరు", kitchenNameExample: "ఉదాహరణకు, Ananya’s Kitchen",
    aboutKitchen: "మీ వంటగది గురించి", aboutKitchenPlaceholder: "మీకు ఇష్టమైన వంటల గురించి ఒక మాట",
    kitchenAddress: "వంటగది చిరునామా", kitchenAddressHelper: "మీ వంటగదిని వెతకండి, తర్వాత పిన్ సరిగ్గా ఉందో చూడండి.", dragHint: "పిన్ సరిచేయడానికి మ్యాప్ జరపండి",
    mapLabel: "వంటగది మ్యాప్. పిన్‌ను మీ వంటగది మీదకు తేవడానికి మ్యాప్ జరపండి, లేదా బాణం కీలు వాడండి.",
    pinHere: "మీ వంటగది పిన్ ఇక్కడ కనిపిస్తుంది", pinHow: "మీ చిరునామా వెతకండి, లేదా మీ ఇప్పటి లొకేషన్ వాడండి.",
    searchLabel: "చిరునామా వెతకండి", searchPlaceholder: "బిల్డింగ్, వీధి లేదా ఏరియా", searchButton: "చిరునామా వెతకండి", searching: "చిరునామాలు వెతుకుతున్నాం…",
    locating: "మీ లొకేషన్ వెతుకుతున్నాం…", useLocation: "నా ఇప్పటి లొకేషన్ వాడండి", pinPlaced: "మ్యాప్ మీద పిన్ పెట్టాం",
    pinCheck: "పిన్ సరిగ్గా మీ వంటగది మీద లేకపోతే మ్యాప్ జరపండి.", addressLine1: "ఫ్లాట్ / ఇంటి నంబర్ / బిల్డింగ్", addressLine2: "వీధి / ఏరియా",
    landmark: "ల్యాండ్‌మార్క్", landmarkExample: "ఉదాహరణకు, మెట్రో స్టేషన్ దగ్గర", postalCode: "పిన్ కోడ్", city: "నగరం", state: "రాష్ట్రం", mapPin: "మ్యాప్ పిన్",
    photos: "వంటగది ఫోటోలు", photosHelper: "మీరు వంట చేసే చోటును రెండు స్పష్టమైన ఫోటోలు తీయండి. కస్టమర్లు వీటిని మీ వంటగది పేజీలో చూస్తారు.",
    photosWait: "ఫోటోలు పెట్టాలంటే ముందు వంటగది చిరునామా పూర్తి చేయండి", photosWaitWhy: "ఫోటోలు మీ చిరునామాతో పాటు సేవ్ అవుతాయి. ఇంకా కావాల్సినవి:", goTo: "{field} కి వెళ్లండి",
    overallPhoto: "వంటగది మొత్తం ఫోటో", overallPhotoHelper: "మీరు వంట చేసే వంటగది మొత్తం కనిపించేలా ఫోటో తీయండి.",
    setupPhoto: "స్టవ్, వంట సామాను ఫోటో", setupPhotoHelper: "మీ స్టవ్, మీరు వాడే వంట సామాను కనిపించేలా ఫోటో తీయండి.",
    photoFormats: "JPG, PNG, HEIC లేదా WebP · ఒక్కోటి 10 MB వరకు",
    fssaiHelper: "మీ FSSAI రిజిస్ట్రేషన్ లేదా లైసెన్స్ మీద ఉన్న 14 అంకెల నంబర్.", fssaiLabel: "FSSAI రిజిస్ట్రేషన్ నంబర్",
    noFssai: "FSSAI లేదా?", fssaiPlaceholder: "14 అంకెల నంబర్", verifiedByCraves: "Craves ధృవీకరించింది",
    guideUnavailable: "వీడియో గైడ్ ఇప్పుడు అందుబాటులో లేదు.", guideUnreadable: "వీడియో గైడ్ లోడ్ కాలేదు.",
    videoNotOpened: "వీడియో తెరవలేకపోయాం. మళ్లీ ప్రయత్నించండి.", videoFailed: "వీడియో తెరవలేకపోయాం.",
    step1: "అధికారిక FSSAI FoSCoS వెబ్‌సైట్‌కి వెళ్లండి", step1Before: "అధికారిక రిజిస్ట్రేషన్, లైసెన్స్ వెబ్‌సైట్ ", step1After: " తెరవండి.",
    step2: "మీ వ్యాపారానికి సరిపడే రిజిస్ట్రేషన్ లేదా లైసెన్స్ ఎంచుకోండి", step2Text: "సరైనది ఎంచుకోవడానికి వెబ్‌సైట్‌లో ఉన్న సూచనలు చూడండి.",
    step3: "మీ వివరాలు రాయండి", step3Text: "అడిగిన మీ వ్యక్తిగత వివరాలు, ఆహార వ్యాపారం వివరాలు నింపండి.",
    step4: "పత్రాలు అప్‌లోడ్ చేసి పంపండి", step4Text: "అడిగిన పత్రాలు ఇవ్వండి, వెబ్‌సైట్‌లో చూపిన ఫీజు కట్టండి.",
    step5: "మీ దరఖాస్తు ఎక్కడ ఉందో చూడండి", step5Text: "మీకు వచ్చిన రసీదు లేదా రెఫరెన్స్ నంబర్‌తో FoSCoS లో స్థితి చూడండి.",
    watch: "ఎలా దరఖాస్తు చేయాలో చూడండి", videoLanguage: "వీడియో భాష", loadingGuide: "వీడియో గైడ్ లోడ్ అవుతోంది", tryAgain: "మళ్లీ ప్రయత్నించండి",
    guideSoon: "వీడియో గైడ్ త్వరలో వస్తుంది. పైన ఉన్న దశలు పాటించండి, లేదా మీకు కాల్ చేయమని మమ్మల్ని అడగండి.",
    playbackFailed: "వీడియో సమయం ముగిసింది లేదా ప్లే కాలేదు. మళ్లీ ప్లే చేయండి.", watchVideo: "వీడియో చూడండి: {title}",
    inEnglish: "ఇంగ్లీష్‌లో", reloadVideo: "వీడియో మళ్లీ లోడ్ చేయండి", fssaiHelp: "FSSAI కోసం సహాయం కావాలా?",
    fssaiHelpText: "దరఖాస్తు చేయడంలో మా బృందం మీకు సహాయం చేస్తుంది.", contacted: "మా బృందం మిమ్మల్ని సంప్రదించింది", received: "మీ అభ్యర్థన అందింది",
    contactedText: "మా Craves బృందం మీ FSSAI దరఖాస్తు గురించి మీతో మాట్లాడింది. ఇంకేమైనా కావాలంటే మళ్లీ సంప్రదిస్తాం.",
    receivedText: "మీ FSSAI దరఖాస్తుకు సహాయం చేయడానికి మా Craves బృందం మీ రిజిస్టర్డ్ మొబైల్ నంబర్‌కు కాల్ చేస్తుంది.",
    reference: "రెఫరెన్స్ {case}", requested: " · అడిగిన తేదీ {date}",
    resolved: "మీ గత అభ్యర్థన ({case}) పూర్తయింది. ఇంకా సహాయం కావాలంటే మళ్లీ అడగండి.", requestCall: "నాకు కాల్ చేయండి",
    finishOthers: "మిగతా భాగాలు ఇప్పుడే పూర్తి చేయవచ్చు. దరఖాస్తు పంపే ముందు మీ FSSAI నంబర్ జోడించండి.",
    haveFssai: "నా దగ్గర FSSAI నంబర్ ఉంది",
    docType: "ఏ పత్రం", identityDocument: "గుర్తింపు పత్రం",
    removeFirst: "వేరే పత్రం ఎంచుకోవాలంటే, ముందు అప్‌లోడ్ చేసిన ఫైళ్లు తొలగించండి.", chooseOne: "మీ పేరు ఉన్న ఒక సరైన పత్రం ఎంచుకోండి.",
    idName: "గుర్తింపు కార్డు పేరు", idNameExample: "ఉదాహరణకు, ఓటర్ ID, డ్రైవింగ్ లైసెన్స్ లేదా పాస్‌పోర్ట్", noBack: "ఈ పత్రానికి వెనక వైపు లేదు",
    frontAndBack: "ముందు వైపు, వెనక వైపు అప్‌లోడ్ చేయండి.", oneFile: "ఒక స్పష్టమైన ఫోటో లేదా PDF అప్‌లోడ్ చేయండి.", front: "ముందు వైపు", addFront: "ముందు వైపు జోడించండి",
    addDocument: "పత్రం జోడించండి", back: "వెనక వైపు", addBack: "వెనక వైపు జోడించండి", fileFormats: "PDF, JPG, PNG, HEIC లేదా WebP · ఒక్కోటి 10 MB వరకు",
    clearPhoto: "నాలుగు మూలలూ కనిపించాలి, అక్షరాలు స్పష్టంగా చదవగలగాలి, మెరుపు పడకూడదు.",
    complete: "పూర్తయింది", attention: "సరిచేయాలి", editSection: "{section} మార్చండి", edit: "మార్చండి", notAdded: "జోడించలేదు",
    photoUploaded: "{photo} అప్‌లోడ్ అయింది", photoMissing: "{photo} లేదు", mobileShort: "మొబైల్", email: "ఈమెయిల్", address: "చిరునామా",
    location: "లొకేషన్", pinned: "మ్యాప్‌లో పిన్ పెట్టారు", overallShort: "వంటగది మొత్తం", setupShort: "స్టవ్, వంట సామాను", status: "స్థితి",
    numberAdded: "నంబర్ జోడించారు", notAddedYet: "ఇంకా జోడించలేదు", registrationNumber: "రిజిస్ట్రేషన్ నంబర్", document: "పత్రం",
    uploaded: "అప్‌లోడ్ అయింది", saved: "సేవ్ అయింది", addLater: "తర్వాత జోడించండి", accountSaved: "{lastFour} తో ముగిసే ఖాతా సేవ్ అయింది. {message}",
    bankLater: "బ్యాంక్ వివరాలు తర్వాత కూడా జోడించవచ్చు. దరఖాస్తు పంపడానికి అవి అవసరం లేదు. ఇప్పుడే సేవ్ చేస్తే, బ్యాంక్‌కు డబ్బు పంపడం మొదలైనప్పుడు ఒక పని తగ్గుతుంది.",
    changeBank: "బ్యాంక్ వివరాలు మార్చండి", addBankNow: "బ్యాంక్ వివరాలు ఇప్పుడే జోడించండి", addOrCheckBank: "బ్యాంక్ వివరాలు జోడించండి లేదా చూడండి",
    accountHolder: "ఖాతాదారు", bank: "బ్యాంక్", account: "ఖాతా",
    termsBefore: "ఈ వివరాలు సరైనవే అని నిర్ధారిస్తున్నాను. ", terms: "Craves చెఫ్ నిబంధనలు", termsMiddle: ", ",
    privacy: "గోప్యతా విధానం", termsAfter: " నాకు అంగీకారమే.",
  },
  kn: {
    dobLabel: "ಹುಟ್ಟಿದ ದಿನಾಂಕ", dobHelper: "ಅರ್ಜಿ ಹಾಕಲು ನಿಮಗೆ ಕನಿಷ್ಠ 18 ವರ್ಷ ಆಗಿರಬೇಕು.", aboutYou: "ನಿಮ್ಮ ಬಗ್ಗೆ", fullName: "ಪೂರ್ಣ ಹೆಸರು",
    nameHelper: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಯಲ್ಲಿ ಇರುವಂತೆಯೇ ಹೆಸರು ಬರೆಯಿರಿ.", namePlaceholder: "ಮೊದಲ ಹೆಸರು, ಕೊನೆಯ ಹೆಸರು",
    contact: "ನಿಮ್ಮ ಫೋನ್, ಇಮೇಲ್", contactHelper: "ನಿಮ್ಮ ಅರ್ಜಿಯ ಬಗ್ಗೆ ಮಾಹಿತಿಯನ್ನು ಇವುಗಳಿಗೇ ಕಳುಹಿಸುತ್ತೇವೆ.", mobile: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ",
    verified: "ಪರಿಶೀಲಿತ", signInAgain: "ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಲು ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.", verifyMobile: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಿ",
    pinNoAddress: "ನಿಮ್ಮ ಪಿನ್ ಹಾಕಲಾಗಿದೆ. ವಿಳಾಸವನ್ನು ನಾವೇ ತುಂಬಲು ಆಗಲಿಲ್ಲ, ಕೆಳಗೆ ನೀವೇ ಬರೆಯಿರಿ ಅಥವಾ ಸರಿಪಡಿಸಿ.",
    noLocation: "ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಲೊಕೇಶನ್ ಸಿಗುವುದಿಲ್ಲ. ನಿಮ್ಮ ವಿಳಾಸ ಹುಡುಕಿ.",
    locationOff: "ಲೊಕೇಶನ್ ಅನುಮತಿ ಆಫ್ ಆಗಿದೆ. ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಆನ್ ಮಾಡಿ, ಅಥವಾ ನಿಮ್ಮ ವಿಳಾಸ ಹುಡುಕಿ.",
    locationFailed: "ನಿಮ್ಮ ಲೊಕೇಶನ್ ಸಿಗಲಿಲ್ಲ. ನಿಮ್ಮ ವಿಳಾಸ ಹುಡುಕಿ, ಅಥವಾ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    searchShort: "ಹುಡುಕಲು ಕನಿಷ್ಠ 3 ಅಕ್ಷರ ಬರೆಯಿರಿ.", noResults: "ಈ ವಿಳಾಸ ಸಿಗಲಿಲ್ಲ. ಹತ್ತಿರದ ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಅಥವಾ ಏರಿಯಾ ಹೆಸರಿನಿಂದ ಹುಡುಕಿ.",
    searchFailed: "ಈಗ ವಿಳಾಸ ಹುಡುಕಲು ಆಗುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಲೊಕೇಶನ್ ಬಳಸಿ, ಅಥವಾ ಕೆಳಗೆ ವಿಳಾಸ ಬರೆಯಿರಿ.",
    kitchenInfo: "ಅಡುಗೆಮನೆ ವಿವರಗಳು", kitchenName: "ಅಡುಗೆಮನೆಯ ಹೆಸರು", kitchenNameExample: "ಉದಾಹರಣೆಗೆ, Ananya’s Kitchen",
    aboutKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಯ ಬಗ್ಗೆ", aboutKitchenPlaceholder: "ನಿಮಗೆ ಇಷ್ಟವಾದ ಅಡುಗೆಯ ಬಗ್ಗೆ ಒಂದು ಸಾಲು",
    kitchenAddress: "ಅಡುಗೆಮನೆಯ ವಿಳಾಸ", kitchenAddressHelper: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಹುಡುಕಿ, ನಂತರ ಪಿನ್ ಸರಿಯಾಗಿದೆಯೇ ನೋಡಿ.", dragHint: "ಪಿನ್ ಸರಿಪಡಿಸಲು ಮ್ಯಾಪ್ ಸರಿಸಿ",
    mapLabel: "ಅಡುಗೆಮನೆಯ ಮ್ಯಾಪ್. ಪಿನ್ ಅನ್ನು ನಿಮ್ಮ ಅಡುಗೆಮನೆಯ ಮೇಲೆ ತರಲು ಮ್ಯಾಪ್ ಸರಿಸಿ, ಅಥವಾ ಬಾಣದ ಕೀಗಳನ್ನು ಬಳಸಿ.",
    pinHere: "ಅಡುಗೆಮನೆಯ ಪಿನ್ ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ", pinHow: "ನಿಮ್ಮ ವಿಳಾಸ ಹುಡುಕಿ, ಅಥವಾ ನಿಮ್ಮ ಈಗಿನ ಲೊಕೇಶನ್ ಬಳಸಿ.",
    searchLabel: "ವಿಳಾಸ ಹುಡುಕಿ", searchPlaceholder: "ಬಿಲ್ಡಿಂಗ್, ರಸ್ತೆ ಅಥವಾ ಏರಿಯಾ", searchButton: "ವಿಳಾಸ ಹುಡುಕಿ", searching: "ವಿಳಾಸಗಳನ್ನು ಹುಡುಕುತ್ತಿದ್ದೇವೆ…",
    locating: "ನಿಮ್ಮ ಲೊಕೇಶನ್ ಹುಡುಕುತ್ತಿದ್ದೇವೆ…", useLocation: "ನನ್ನ ಈಗಿನ ಲೊಕೇಶನ್ ಬಳಸಿ", pinPlaced: "ಮ್ಯಾಪ್ ಮೇಲೆ ಪಿನ್ ಹಾಕಲಾಗಿದೆ",
    pinCheck: "ಪಿನ್ ಸರಿಯಾಗಿ ನಿಮ್ಮ ಅಡುಗೆಮನೆಯ ಮೇಲೆ ಇಲ್ಲದಿದ್ದರೆ ಮ್ಯಾಪ್ ಸರಿಸಿ.", addressLine1: "ಫ್ಲ್ಯಾಟ್ / ಮನೆ ಸಂಖ್ಯೆ / ಬಿಲ್ಡಿಂಗ್", addressLine2: "ರಸ್ತೆ / ಏರಿಯಾ",
    landmark: "ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್", landmarkExample: "ಉದಾಹರಣೆಗೆ, ಮೆಟ್ರೋ ನಿಲ್ದಾಣದ ಹತ್ತಿರ", postalCode: "ಪಿನ್ ಕೋಡ್", city: "ನಗರ", state: "ರಾಜ್ಯ", mapPin: "ಮ್ಯಾಪ್ ಪಿನ್",
    photos: "ಅಡುಗೆಮನೆಯ ಫೋಟೋಗಳು", photosHelper: "ನೀವು ಅಡುಗೆ ಮಾಡುವ ಜಾಗದ ಎರಡು ಸ್ಪಷ್ಟ ಫೋಟೋಗಳು. ಗ್ರಾಹಕರು ಇವನ್ನು ನಿಮ್ಮ ಅಡುಗೆಮನೆಯ ಪುಟದಲ್ಲಿ ನೋಡುತ್ತಾರೆ.",
    photosWait: "ಫೋಟೋ ಹಾಕಲು ಮೊದಲು ಅಡುಗೆಮನೆಯ ವಿಳಾಸ ಪೂರ್ಣಗೊಳಿಸಿ", photosWaitWhy: "ಫೋಟೋಗಳು ನಿಮ್ಮ ವಿಳಾಸದ ಜೊತೆ ಉಳಿಯುತ್ತವೆ. ಇನ್ನೂ ಬೇಕಾಗಿರುವುದು:", goTo: "{field} ಗೆ ಹೋಗಿ",
    overallPhoto: "ಅಡುಗೆಮನೆಯ ಪೂರ್ತಿ ಫೋಟೋ", overallPhotoHelper: "ನೀವು ಅಡುಗೆ ಮಾಡುವ ಅಡುಗೆಮನೆ ಪೂರ್ತಿ ಕಾಣುವಂತೆ ಫೋಟೋ ತೆಗೆಯಿರಿ.",
    setupPhoto: "ಸ್ಟವ್, ಅಡುಗೆ ಸಾಮಾನುಗಳ ಫೋಟೋ", setupPhotoHelper: "ನಿಮ್ಮ ಸ್ಟವ್ ಮತ್ತು ನೀವು ಬಳಸುವ ಅಡುಗೆ ಸಾಮಾನುಗಳು ಕಾಣುವಂತೆ ಫೋಟೋ ತೆಗೆಯಿರಿ.",
    photoFormats: "JPG, PNG, HEIC ಅಥವಾ WebP · ಪ್ರತಿಯೊಂದೂ 10 MB ವರೆಗೆ",
    fssaiHelper: "ನಿಮ್ಮ FSSAI ನೋಂದಣಿ ಅಥವಾ ಲೈಸೆನ್ಸ್ ಮೇಲಿರುವ 14 ಅಂಕಿಯ ಸಂಖ್ಯೆ.", fssaiLabel: "FSSAI ನೋಂದಣಿ ಸಂಖ್ಯೆ",
    noFssai: "FSSAI ಇಲ್ಲವೇ?", fssaiPlaceholder: "14 ಅಂಕಿಯ ಸಂಖ್ಯೆ", verifiedByCraves: "Craves ಪರಿಶೀಲಿಸಿದೆ",
    guideUnavailable: "ವೀಡಿಯೊ ಮಾರ್ಗದರ್ಶಿ ಈಗ ಲಭ್ಯವಿಲ್ಲ.", guideUnreadable: "ವೀಡಿಯೊ ಮಾರ್ಗದರ್ಶಿ ಲೋಡ್ ಆಗಲಿಲ್ಲ.",
    videoNotOpened: "ವೀಡಿಯೊ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", videoFailed: "ವೀಡಿಯೊ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ.",
    step1: "ಅಧಿಕೃತ FSSAI FoSCoS ವೆಬ್‌ಸೈಟ್‌ಗೆ ಹೋಗಿ", step1Before: "ಅಧಿಕೃತ ನೋಂದಣಿ ಮತ್ತು ಲೈಸೆನ್ಸ್ ವೆಬ್‌ಸೈಟ್ ", step1After: " ತೆರೆಯಿರಿ.",
    step2: "ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ಸರಿಯಾದ ನೋಂದಣಿ ಅಥವಾ ಲೈಸೆನ್ಸ್ ಆಯ್ಕೆಮಾಡಿ", step2Text: "ಸರಿಯಾದದ್ದನ್ನು ಆಯ್ಕೆಮಾಡಲು ವೆಬ್‌ಸೈಟ್‌ನಲ್ಲಿರುವ ಸೂಚನೆಗಳನ್ನು ನೋಡಿ.",
    step3: "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಬರೆಯಿರಿ", step3Text: "ಕೇಳಿದ ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ವಿವರಗಳು ಮತ್ತು ಆಹಾರ ವ್ಯಾಪಾರದ ವಿವರಗಳನ್ನು ತುಂಬಿ.",
    step4: "ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಸಲ್ಲಿಸಿ", step4Text: "ಕೇಳಿದ ದಾಖಲೆಗಳನ್ನು ಕೊಡಿ, ವೆಬ್‌ಸೈಟ್‌ನಲ್ಲಿ ತೋರಿಸುವ ಶುಲ್ಕ ಕಟ್ಟಿ.",
    step5: "ನಿಮ್ಮ ಅರ್ಜಿ ಎಲ್ಲಿದೆ ಎಂದು ನೋಡಿ", step5Text: "ನಿಮಗೆ ಸಿಕ್ಕ ರಸೀದಿ ಅಥವಾ ರೆಫರೆನ್ಸ್ ಸಂಖ್ಯೆಯಿಂದ FoSCoS ನಲ್ಲಿ ಸ್ಥಿತಿ ನೋಡಿ.",
    watch: "ಅರ್ಜಿ ಹಾಕುವುದು ಹೇಗೆ ಎಂದು ನೋಡಿ", videoLanguage: "ವೀಡಿಯೊ ಭಾಷೆ", loadingGuide: "ವೀಡಿಯೊ ಮಾರ್ಗದರ್ಶಿ ಲೋಡ್ ಆಗುತ್ತಿದೆ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    guideSoon: "ವೀಡಿಯೊ ಮಾರ್ಗದರ್ಶಿ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ. ಮೇಲಿನ ಹಂತಗಳನ್ನು ಅನುಸರಿಸಿ, ಅಥವಾ ನಿಮಗೆ ಕರೆ ಮಾಡಲು ನಮ್ಮನ್ನು ಕೇಳಿ.",
    playbackFailed: "ವೀಡಿಯೊ ಅವಧಿ ಮುಗಿದಿದೆ ಅಥವಾ ಪ್ಲೇ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ಲೇ ಮಾಡಿ.", watchVideo: "ವೀಡಿಯೊ ನೋಡಿ: {title}",
    inEnglish: "ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ", reloadVideo: "ವೀಡಿಯೊ ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ", fssaiHelp: "FSSAI ಗೆ ಸಹಾಯ ಬೇಕೇ?",
    fssaiHelpText: "ಅರ್ಜಿ ಹಾಕಲು ನಮ್ಮ ತಂಡ ನಿಮಗೆ ಸಹಾಯ ಮಾಡುತ್ತದೆ.", contacted: "ನಮ್ಮ ತಂಡ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸಿದೆ", received: "ನಿಮ್ಮ ಮನವಿ ಸಿಕ್ಕಿದೆ",
    contactedText: "ನಮ್ಮ Craves ತಂಡ ನಿಮ್ಮ FSSAI ಅರ್ಜಿಯ ಬಗ್ಗೆ ನಿಮ್ಮೊಂದಿಗೆ ಮಾತನಾಡಿದೆ. ಇನ್ನೇನಾದರೂ ಬೇಕಾದರೆ ಮತ್ತೆ ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.",
    receivedText: "ನಿಮ್ಮ FSSAI ಅರ್ಜಿಗೆ ಸಹಾಯ ಮಾಡಲು ನಮ್ಮ Craves ತಂಡ ನಿಮ್ಮ ನೋಂದಾಯಿತ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಗೆ ಕರೆ ಮಾಡುತ್ತದೆ.",
    reference: "ರೆಫರೆನ್ಸ್ {case}", requested: " · ಕೇಳಿದ ದಿನಾಂಕ {date}",
    resolved: "ನಿಮ್ಮ ಹಿಂದಿನ ಮನವಿ ({case}) ಮುಗಿದಿದೆ. ಇನ್ನೂ ಸಹಾಯ ಬೇಕಾದರೆ ಮತ್ತೆ ಕೇಳಿ.", requestCall: "ನನಗೆ ಕರೆ ಮಾಡಿ",
    finishOthers: "ಉಳಿದ ಭಾಗಗಳನ್ನು ಈಗಲೇ ಮುಗಿಸಬಹುದು. ಅರ್ಜಿ ಸಲ್ಲಿಸುವ ಮೊದಲು ನಿಮ್ಮ FSSAI ಸಂಖ್ಯೆ ಸೇರಿಸಿ.",
    haveFssai: "ನನ್ನ ಬಳಿ FSSAI ಸಂಖ್ಯೆ ಇದೆ",
    docType: "ಯಾವ ದಾಖಲೆ", identityDocument: "ಗುರುತಿನ ದಾಖಲೆ",
    removeFirst: "ಬೇರೆ ದಾಖಲೆ ಆಯ್ಕೆಮಾಡಲು, ಮೊದಲು ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಫೈಲ್‌ಗಳನ್ನು ತೆಗೆದುಹಾಕಿ.", chooseOne: "ನಿಮ್ಮ ಹೆಸರು ಇರುವ ಒಂದು ಸರಿಯಾದ ದಾಖಲೆ ಆಯ್ಕೆಮಾಡಿ.",
    idName: "ಗುರುತಿನ ಚೀಟಿಯ ಹೆಸರು", idNameExample: "ಉದಾಹರಣೆಗೆ, ವೋಟರ್ ಐಡಿ, ಡ್ರೈವಿಂಗ್ ಲೈಸೆನ್ಸ್ ಅಥವಾ ಪಾಸ್‌ಪೋರ್ಟ್", noBack: "ಈ ದಾಖಲೆಗೆ ಹಿಂಭಾಗ ಇಲ್ಲ",
    frontAndBack: "ಮುಂಭಾಗ ಮತ್ತು ಹಿಂಭಾಗ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.", oneFile: "ಒಂದು ಸ್ಪಷ್ಟ ಫೋಟೋ ಅಥವಾ PDF ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.", front: "ಮುಂಭಾಗ", addFront: "ಮುಂಭಾಗ ಸೇರಿಸಿ",
    addDocument: "ದಾಖಲೆ ಸೇರಿಸಿ", back: "ಹಿಂಭಾಗ", addBack: "ಹಿಂಭಾಗ ಸೇರಿಸಿ", fileFormats: "PDF, JPG, PNG, HEIC ಅಥವಾ WebP · ಪ್ರತಿಯೊಂದೂ 10 MB ವರೆಗೆ",
    clearPhoto: "ದಾಖಲೆಯ ನಾಲ್ಕೂ ಮೂಲೆಗಳು ಕಾಣಬೇಕು, ಅಕ್ಷರಗಳು ಸ್ಪಷ್ಟವಾಗಿ ಓದುವಂತಿರಬೇಕು, ಹೊಳಪು ಬೀಳಬಾರದು.",
    complete: "ಮುಗಿದಿದೆ", attention: "ಸರಿಪಡಿಸಿ", editSection: "{section} ಬದಲಾಯಿಸಿ", edit: "ಬದಲಾಯಿಸಿ", notAdded: "ಸೇರಿಸಿಲ್ಲ",
    photoUploaded: "{photo} ಅಪ್‌ಲೋಡ್ ಆಗಿದೆ", photoMissing: "{photo} ಇಲ್ಲ", mobileShort: "ಮೊಬೈಲ್", email: "ಇಮೇಲ್", address: "ವಿಳಾಸ",
    location: "ಲೊಕೇಶನ್", pinned: "ಮ್ಯಾಪ್‌ನಲ್ಲಿ ಪಿನ್ ಹಾಕಲಾಗಿದೆ", overallShort: "ಅಡುಗೆಮನೆ ಪೂರ್ತಿ", setupShort: "ಸ್ಟವ್, ಅಡುಗೆ ಸಾಮಾನು", status: "ಸ್ಥಿತಿ",
    numberAdded: "ಸಂಖ್ಯೆ ಸೇರಿಸಲಾಗಿದೆ", notAddedYet: "ಇನ್ನೂ ಸೇರಿಸಿಲ್ಲ", registrationNumber: "ನೋಂದಣಿ ಸಂಖ್ಯೆ", document: "ದಾಖಲೆ",
    uploaded: "ಅಪ್‌ಲೋಡ್ ಆಗಿದೆ", saved: "ಉಳಿಸಲಾಗಿದೆ", addLater: "ನಂತರ ಸೇರಿಸಿ", accountSaved: "{lastFour} ರಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುವ ಖಾತೆ ಉಳಿಸಲಾಗಿದೆ. {message}",
    bankLater: "ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ನಂತರವೂ ಸೇರಿಸಬಹುದು. ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಅವು ಬೇಕಿಲ್ಲ. ಈಗಲೇ ಉಳಿಸಿದರೆ, ಬ್ಯಾಂಕ್‌ಗೆ ಹಣ ಕಳುಹಿಸುವುದು ಶುರುವಾದಾಗ ಒಂದು ಕೆಲಸ ಕಡಿಮೆ.",
    changeBank: "ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಬದಲಾಯಿಸಿ", addBankNow: "ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಈಗಲೇ ಸೇರಿಸಿ", addOrCheckBank: "ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಸೇರಿಸಿ ಅಥವಾ ನೋಡಿ",
    accountHolder: "ಖಾತೆದಾರರು", bank: "ಬ್ಯಾಂಕ್", account: "ಖಾತೆ",
    termsBefore: "ಈ ವಿವರಗಳು ಸರಿಯಾಗಿವೆ ಎಂದು ಖಚಿತಪಡಿಸುತ್ತೇನೆ. ", terms: "Craves ಚೆಫ್ ನಿಯಮಗಳು", termsMiddle: " ಮತ್ತು ",
    privacy: "ಗೌಪ್ಯತಾ ನೀತಿ", termsAfter: " ನನಗೆ ಒಪ್ಪಿಗೆ ಇದೆ.",
  },
});
type Text = (typeof TEXT)["en"];
/** Short section names on Review; the same words as the Welcome back list. */
const SECTION_LABELS = messages({
  en: CHEF_SECTION_LABELS,
  te: { personal: "మీ వివరాలు", kitchen: "వంటగది వివరాలు", fssai: "FSSAI", documents: "గుర్తింపు పత్రం", bank: "బ్యాంక్ వివరాలు" },
  kn: { personal: "ನಿಮ್ಮ ವಿವರಗಳು", kitchen: "ಅಡುಗೆಮನೆ ವಿವರಗಳು", fssai: "FSSAI", documents: "ಗುರುತಿನ ದಾಖಲೆ", bank: "ಬ್ಯಾಂಕ್ ವಿವರಗಳು" },
});
// A missing-detail chip names its field in the words of that field's label.
const KITCHEN_FIELD_TEXT: Record<string, keyof Text> = {
  kitchenName: "kitchenName",
  location: "mapPin",
  addressLine1: "addressLine1",
  postalCode: "postalCode",
  city: "city",
  state: "state",
};

type Props = { flow: ChefOnboardingFlow };

function fieldError(flow: ChefOnboardingFlow, name: string) {
  return flow.fieldErrors.find((item) => item.field === name)?.message || null;
}

type TextFieldProps = Props & {
  name: keyof OnboardingDetails;
  label: string;
  maxLength?: number;
  type?: string;
  helper?: ReactNode;
  optional?: boolean;
  placeholder?: string;
  inputMode?: "numeric" | "text";
  autoComplete?: string;
  sanitize?: (value: string) => string;
};
function TextField({
  flow,
  name,
  label,
  maxLength = 255,
  type = "text",
  helper,
  optional,
  placeholder,
  inputMode,
  autoComplete,
  sanitize,
}: TextFieldProps) {
  const id = `chef-${name}`;
  const error = fieldError(flow, name);
  return (
    <FieldShell id={id} label={label} optional={optional} helper={helper} error={error}>
      <input
        id={id}
        type={type}
        className="cob-input"
        inputMode={inputMode}
        autoComplete={autoComplete ?? "off"}
        placeholder={placeholder}
        value={String(flow.details[name] ?? "")}
        max={type === "date" ? adultCutoff() : undefined}
        min={type === "date" ? "1900-01-01" : undefined}
        maxLength={maxLength}
        disabled={flow.busy}
        aria-required={optional ? undefined : true}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, error, helper)}
        onChange={(event) =>
          flow.field(name, (sanitize ? sanitize(event.target.value) : event.target.value) as never)
        }
      />
    </FieldShell>
  );
}

function Upload({
  flow,
  type,
  label,
  photo,
  helper,
  emptyTitle,
  beforePick,
}: Props & {
  type: string;
  label: string;
  photo?: boolean;
  helper?: string;
  emptyTitle?: string;
  beforePick?: () => boolean;
}) {
  return (
    <ChefOnboardingUpload
      type={type}
      label={label}
      photo={photo}
      helper={helper}
      emptyTitle={emptyTitle}
      beforePick={beforePick}
      disabled={flow.busy}
      fieldError={fieldError(flow, type)}
      evidence={flow.state?.documents.find((document) => document.documentType === type)}
      onUpload={flow.uploadFile}
      onRemove={flow.removeFile}
      onCancel={flow.cancelUpload}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Screen 2 - Basic details                                            */
/* ------------------------------------------------------------------ */

function DateOfBirthField({ flow }: Props) {
  const text = useText(TEXT);
  const id = "chef-dateOfBirth";
  const error = fieldError(flow, "dateOfBirth");
  const helper = text.dobHelper;
  return (
    <div className="cob-field">
      <label id={`${id}-label`} className="cob-label" htmlFor={id} data-required="">
        {text.dobLabel}
      </label>
      <DateOfBirthPicker
        id={id}
        labelId={`${id}-label`}
        value={flow.details.dateOfBirth}
        max={adultCutoff()}
        disabled={flow.busy}
        invalid={Boolean(error)}
        describedBy={describedBy(id, error, helper)}
        onChange={(value) => flow.field("dateOfBirth", value)}
      />
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : (
        <span id={`${id}-helper`} className="cob-helper">
          {helper}
        </span>
      )}
    </div>
  );
}

export function ChefBasicDetails({ flow }: Props) {
  const text = useText(TEXT);
  const [name, setName] = useState(() => chefFullName(flow.details));
  const nameError = fieldError(flow, "fullName");
  const phoneError = fieldError(flow, "phoneNumber");
  const emailError = fieldError(flow, "email");
  const nameHelper = text.nameHelper;
  return (
    <div className="cob-stack">
      <Card icon={<UserRound size={20} aria-hidden="true" />} title={text.aboutYou}>
        <div className="cob-fields">
          <FieldShell id="chef-fullName" label={text.fullName} helper={nameHelper} error={nameError}>
            <input
              id="chef-fullName"
              autoComplete="name"
              className="cob-input"
              value={name}
              maxLength={120}
              placeholder={text.namePlaceholder}
              disabled={flow.busy}
              aria-invalid={Boolean(nameError) || undefined}
              aria-describedby={describedBy("chef-fullName", nameError, nameHelper)}
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                const split = value.trim().lastIndexOf(" ");
                flow.updateDetails((previous) => ({
                  ...previous,
                  firstName: split > -1 ? value.trim().slice(0, split) : value.trim(),
                  lastName: split > -1 ? value.trim().slice(split + 1) : "",
                }));
              }}
            />
          </FieldShell>
          <DateOfBirthField flow={flow} />
        </div>
      </Card>
      <Card
        icon={<ShieldCheck size={20} aria-hidden="true" />}
        title={text.contact}
        subtitle={text.contactHelper}
      >
        <div className="cob-fields">
          {flow.state?.phoneNumber ? (
            <LockedInput
              id="chef-phoneNumber"
              label={text.mobile}
              value={formatPhone(flow.state.phoneNumber)}
              badge={<VerifiedBadge label={text.verified} />}
            />
          ) : (
            <div className="cob-field" id="chef-phoneNumber" tabIndex={-1}>
              <span className="cob-label">{text.mobile}</span>
              <FieldError>{phoneError ?? text.signInAgain}</FieldError>
              <Link href="/chef/sign-in?returnTo=%2Fchef%2Fapplication" className="cob-link">
                {text.verifyMobile}
              </Link>
            </div>
          )}
          <div id="chef-email" tabIndex={-1} className="cob-field">
            <EmailVerificationPanel
              required
              variant="onboarding"
              initialEmail={flow.details.email}
              onStateChange={flow.onEmail}
            />
            {emailError ? <FieldError>{emailError}</FieldError> : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 3 - Kitchen details                                          */
/* ------------------------------------------------------------------ */

export function ChefKitchenDetails({ flow }: Props) {
  const text = useText(TEXT);
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<LocationSearchResult[]>([]);
  const [locating, setLocating] = useState(false),
    [searching, setSearching] = useState(false),
    [locationError, setLocationError] = useState("");
  const [pinnedLabel, setPinnedLabel] = useState("");
  const generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const d = flow.details;
  const hasPin = d.latitude != null && d.longitude != null;
  async function pin(latitude: number, longitude: number, label = "") {
    const request = ++generation.current;
    flow.updateDetails((previous) => ({ ...previous, latitude, longitude }));
    setLocationError("");
    setPinnedLabel(label);
    setLocating(true);
    try {
      const address = await reverseGeocodeCurrentLocation(latitude, longitude);
      if (!mounted.current || request !== generation.current) return;
      setPinnedLabel(address.formattedAddress);
      flow.updateDetails((previous) => ({
        ...previous,
        addressLine1: address.houseNumber ?? previous.addressLine1,
        addressLine2:
          [address.street, address.area].filter(Boolean).join(", ") || previous.addressLine2,
        city: address.city ?? previous.city,
        state: address.state ?? previous.state,
        postalCode: address.postalCode ?? previous.postalCode,
      }));
    } catch {
      if (mounted.current && request === generation.current) setLocationError(text.pinNoAddress);
    } finally {
      if (mounted.current && request === generation.current) setLocating(false);
    }
  }
  async function locate() {
    if (!navigator.geolocation) {
      setLocationError(text.noLocation);
      return;
    }
    setLocating(true);
    setLocationError("");
    const request = ++generation.current;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 15000,
          enableHighAccuracy: true,
        }),
      );
      if (mounted.current && request === generation.current)
        await pin(position.coords.latitude, position.coords.longitude);
    } catch (failure) {
      if (mounted.current && request === generation.current) {
        const denied =
          typeof failure === "object" &&
          failure !== null &&
          "code" in failure &&
          failure.code === 1;
        setLocationError(denied ? text.locationOff : text.locationFailed);
        setLocating(false);
      }
    }
  }
  async function search() {
    if (query.trim().length < 3) {
      setLocationError(text.searchShort);
      return;
    }
    const request = ++generation.current;
    setSearching(true);
    setLocationError("");
    setResults([]);
    try {
      const found = await searchLocations(
        query.trim(),
        hasPin ? { latitude: d.latitude!, longitude: d.longitude! } : undefined,
      );
      if (!mounted.current || request !== generation.current) return;
      setResults(found);
      if (!found.length) setLocationError(text.noResults);
    } catch (failure) {
      if (mounted.current && request === generation.current)
        setLocationError(chefErrorText(failure, text.searchFailed));
    } finally {
      if (mounted.current && request === generation.current) setSearching(false);
    }
  }
  const state = flow.state;
  const photosDone = Boolean(
    state &&
    evidenceComplete(state, "KITCHEN_PHOTO_1") &&
    evidenceComplete(state, "KITCHEN_PHOTO_2"),
  );
  const addressDone = Boolean(
    hasPin && d.addressLine1 && d.city && d.state && /^\d{6}$/.test(d.postalCode),
  );
  const description = d.kitchenDescription ?? "";
  const locationFieldError = fieldError(flow, "location");
  // Photos are saved with the application, which needs these details first (server rule).
  const missing = missingKitchenFields(d);
  return (
    <div className="cob-stack">
      <Card
        icon={<Store size={20} aria-hidden="true" />}
        title={text.kitchenInfo}
        done={Boolean(d.kitchenName.trim())}
      >
        <div className="cob-fields">
          <TextField
            flow={flow}
            name="kitchenName"
            label={text.kitchenName}
            maxLength={160}
            placeholder={text.kitchenNameExample}
          />
          <FieldShell
            id="chef-kitchenDescription"
            label={text.aboutKitchen}
            optional
            after={<span className="cob-counter">{description.length}/1000</span>}
          >
            <textarea
              id="chef-kitchenDescription"
              className="cob-input"
              rows={3}
              maxLength={1000}
              placeholder={text.aboutKitchenPlaceholder}
              disabled={flow.busy}
              value={description}
              onChange={(event) => flow.field("kitchenDescription", event.target.value)}
            />
          </FieldShell>
        </div>
      </Card>

      <Card
        id="chef-location"
        icon={<MapPin size={20} aria-hidden="true" />}
        title={text.kitchenAddress}
        subtitle={text.kitchenAddressHelper}
        done={addressDone}
      >
        <div className="cob-fields">
          <div className="cob-map">
            {hasPin ? (
              <>
                <span className="cob-map-hint">
                  <Move size={14} aria-hidden="true" />
                  {text.dragHint}
                </span>
                <AddressMapPicker
                  latitude={d.latitude!}
                  longitude={d.longitude!}
                  disabled={flow.busy || searching}
                  locating={locating}
                  showLocateButton={false}
                  ariaLabel={text.mapLabel}
                  onCenterChange={(point) => void pin(point.latitude, point.longitude)}
                  onUseCurrentLocation={() => void locate()}
                />
              </>
            ) : (
              // Grows when its two lines wrap on a 320 px phone, instead of clipping them (overflow: hidden).
              <div className="cob-map-empty" style={{ overflow: "visible" }}>
                <div>
                  <span className="cob-icon-well">
                    <MapPin size={22} aria-hidden="true" />
                  </span>
                  <strong>{text.pinHere}</strong>
                  <span>{text.pinHow}</span>
                </div>
              </div>
            )}
          </div>

          <div className="cob-field">
            <label className="cob-label" htmlFor="chef-location-search">
              {text.searchLabel}
            </label>
            <div className="cob-control">
              <Search size={18} className="cob-input-icon" aria-hidden="true" />
              <input
                id="chef-location-search"
                type="search"
                enterKeyHint="search"
                className="cob-input cob-input--with-icon cob-input--with-trailing-icon"
                autoComplete="off"
                placeholder={text.searchPlaceholder}
                value={query}
                maxLength={200}
                disabled={flow.busy}
                aria-controls={results.length ? "chef-location-results" : undefined}
                onChange={(event) => {
                  generation.current++;
                  setQuery(event.target.value);
                  setResults([]);
                  setSearching(false);
                  setLocating(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void search();
                  }
                }}
              />
              <button
                type="button"
                aria-label={text.searchButton}
                className="cob-trailing-button"
                disabled={flow.busy || searching}
                onClick={() => void search()}
              >
                {searching ? <Spinner red /> : <Search size={18} aria-hidden="true" />}
              </button>
            </div>
            {searching ? (
              <span role="status" className="cob-helper">
                {text.searching}
              </span>
            ) : null}
            {results.length ? (
              <ul id="chef-location-results" className="cob-results">
                {results.map((result) => (
                  <li key={result.id}>
                  <button
                    type="button"
                    className="cob-result"
                    onClick={() => {
                      setResults([]);
                      setQuery(result.formattedAddress);
                      void pin(result.latitude, result.longitude, result.formattedAddress);
                    }}
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>{result.formattedAddress}</span>
                  </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <button
            type="button"
            className="cob-outline-red"
            disabled={flow.busy || locating}
            onClick={() => void locate()}
          >
            {locating ? <Spinner red /> : <LocateFixed size={18} aria-hidden="true" />}
            {locating ? text.locating : text.useLocation}
          </button>

          {locationError || locationFieldError ? (
            <FieldError>{locationError || locationFieldError}</FieldError>
          ) : null}

          {hasPin ? (
            <div className="cob-pinned" role="status">
              <MapPin size={18} aria-hidden="true" />
              <span>
                {pinnedLabel || kitchenAddress(d) || text.pinPlaced}
                <small>{text.pinCheck}</small>
              </span>
            </div>
          ) : null}

          <div className="cob-divider" style={{ margin: "2px 0" }} />

          <div
            className="cob-fields"
            onChange={() => {
              generation.current++;
              setLocating(false);
              setSearching(false);
            }}
          >
            <TextField
              flow={flow}
              name="addressLine1"
              label={text.addressLine1}
              autoComplete="address-line1"
            />
            <TextField
              flow={flow}
              name="addressLine2"
              label={text.addressLine2}
              optional
              autoComplete="address-line2"
            />
            <TextField
              flow={flow}
              name="landmark"
              label={text.landmark}
              optional
              placeholder={text.landmarkExample}
            />
            <div className="cob-pair">
              <TextField
                flow={flow}
                name="postalCode"
                label={text.postalCode}
                maxLength={6}
                inputMode="numeric"
                autoComplete="postal-code"
                sanitize={(value) => value.replace(/\D/g, "").slice(0, 6)}
              />
              <TextField
                flow={flow}
                name="city"
                label={text.city}
                maxLength={80}
                autoComplete="address-level2"
              />
            </div>
            <TextField
              flow={flow}
              name="state"
              label={text.state}
              maxLength={80}
              autoComplete="address-level1"
            />
          </div>
        </div>
      </Card>

      <Card
        icon={<Camera size={20} aria-hidden="true" />}
        title={text.photos}
        subtitle={text.photosHelper}
        done={photosDone}
      >
        {missing.length && !photosDone ? (
          <div className="cob-requires" role="group" aria-labelledby="chef-photos-requires">
            <p id="chef-photos-requires">
              <strong>{text.photosWait}</strong>
              {text.photosWaitWhy}
            </p>
            <ul className="cob-requires-list">
              {missing.map((item) => {
                const key = KITCHEN_FIELD_TEXT[item.field];
                const name = key ? text[key] : item.label;
                return (
                  <li key={item.field}>
                    <button
                      type="button"
                      className="cob-requires-chip"
                      aria-label={format(text.goTo, { field: name })}
                      onClick={() => flow.goToField(item.field)}
                    >
                      {name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className="cob-photo-grid">
          <Upload
            flow={flow}
            type="KITCHEN_PHOTO_1"
            label={text.overallPhoto}
            photo
            helper={text.overallPhotoHelper}
            beforePick={flow.kitchenReadyForPhotos}
          />
          <Upload
            flow={flow}
            type="KITCHEN_PHOTO_2"
            label={text.setupPhoto}
            photo
            helper={text.setupPhotoHelper}
            beforePick={flow.kitchenReadyForPhotos}
          />
          <p className="cob-formats">{text.photoFormats}</p>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 4 - FSSAI                                                    */
/* ------------------------------------------------------------------ */

const FOSCOS_URL = "https://foscos.fssai.gov.in/";

export function ChefFssaiDetails({ flow }: Props) {
  const text = useText(TEXT);
  if (flow.fssaiGuide) return <FssaiGuide flow={flow} />;
  const id = "chef-fssaiNumber";
  const value = flow.details.fssaiNumber;
  const error = fieldError(flow, "fssaiNumber");
  const reviewed = Boolean(
    flow.state?.progress?.fssaiVerified && flow.state.details?.fssaiNumber === value,
  );
  const complete = /^\d{14}$/.test(value);
  const helper = text.fssaiHelper;
  return (
    <div className="cob-stack">
      <Card>
        <FieldShell
          id={id}
          label={text.fssaiLabel}
          helper={helper}
          error={error}
          after={
            <button
              type="button"
              className="cob-link"
              style={{ justifySelf: "start", marginTop: 4 }}
              disabled={flow.busy}
              onClick={() => flow.setFssaiGuide(true)}
            >
              {text.noFssai}
            </button>
          }
        >
          <div className="cob-control">
            <input
              id={id}
              className="cob-input cob-input--with-adornment cob-mono"
              inputMode="numeric"
              autoComplete="off"
              placeholder={text.fssaiPlaceholder}
              maxLength={14}
              value={value}
              disabled={flow.busy}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={describedBy(id, error, helper)}
              onChange={(event) =>
                flow.field("fssaiNumber", event.target.value.replace(/\D/g, "").slice(0, 14))
              }
            />
            <span className="cob-adornment">
              {reviewed ? (
                <VerifiedBadge label={text.verifiedByCraves} />
              ) : complete ? (
                <span className="cob-success-line">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  14/14
                </span>
              ) : value ? (
                <span className="cob-helper cob-mono">{value.length}/14</span>
              ) : null}
            </span>
          </div>
        </FieldShell>
      </Card>
    </div>
  );
}

function isLearningContent(item: unknown): item is LearningContent {
  if (!item || typeof item !== "object") return false;
  const value = item as Record<string, unknown>;
  return (
    typeof value.id === "string" &&
    /^[0-9a-f-]{36}$/i.test(value.id) &&
    typeof value.title === "string" &&
    (value.kind === "ARTICLE" || value.kind === "VIDEO") &&
    typeof value.language === "string" &&
    (value.body == null || typeof value.body === "string")
  );
}

function FssaiGuide({ flow }: Props) {
  const text = useText(TEXT);
  const [content, setContent] = useState<LearningContent[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [playback, setPlayback] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [videoError, setVideoError] = useState("");
  const language = flow.details.language;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setContent([]);
    setPlayback({});
    setVideoError("");
    void sessionFetch("/api/chef/onboarding/content?language=" + encodeURIComponent(language), {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw chefApiError(response, await response.json().catch(() => null), text.guideUnavailable);
        const raw: unknown = await response.json();
        if (!Array.isArray(raw) || raw.length > 100 || !raw.every(isLearningContent))
          throw new Error(text.guideUnreadable);
        if (controller.signal.aborted) return;
        const ready = raw.filter((item) => item.published === true && item.ready === true);
        const own = ready.filter((item) => item.language === language);
        // The service sends English only when nothing is published in the chosen language.
        setContent(own.length || language === "en" ? own : ready.filter((item) => item.language === "en"));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(chefErrorText(failure, text.guideUnavailable));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [language, attempt, text]);

  async function play(item: LearningContent) {
    setOpening(item.id);
    setVideoError("");
    try {
      const result = await chefOnboardingApi(`/api/chef/onboarding/content/${item.id}/playback`);
      if (
        !result ||
        typeof result !== "object" ||
        !("url" in result) ||
        typeof result.url !== "string" ||
        !result.url.startsWith("https://")
      )
        throw new Error(text.videoNotOpened);
      setPlayback((previous) => ({ ...previous, [item.id]: result.url as string }));
    } catch (failure) {
      setVideoError(chefErrorText(failure, text.videoFailed));
    } finally {
      setOpening(null);
    }
  }

  const videos = content.filter((item) => item.kind === "VIDEO");
  const articles = content.filter((item) => item.kind === "ARTICLE");
  return (
    <div className="cob-stack">
      <Card>
        <ol className="cob-steps">
          <li>
            <strong>{text.step1}</strong>
            <p>
              {text.step1Before}
              <a href={FOSCOS_URL} target="_blank" rel="noopener noreferrer">
                foscos.fssai.gov.in
                <ExternalLink
                  size={13}
                  aria-hidden="true"
                  style={{ display: "inline", marginLeft: 3 }}
                />
              </a>
              {text.step1After}
            </p>
          </li>
          <li>
            <strong>{text.step2}</strong>
            <p>{text.step2Text}</p>
          </li>
          <li>
            <strong>{text.step3}</strong>
            <p>{text.step3Text}</p>
          </li>
          <li>
            <strong>{text.step4}</strong>
            <p>{text.step4Text}</p>
          </li>
          <li>
            <strong>{text.step5}</strong>
            <p>{text.step5Text}</p>
          </li>
        </ol>
      </Card>

      <Card>
        <div className="cob-card-head">
          <span className="cob-icon-well">
            <PlayCircle size={20} aria-hidden="true" />
          </span>
          <div className="cob-card-title">
            <h2>{text.watch}</h2>
          </div>
        </div>
        <div className="cob-field" style={{ marginBottom: 14 }}>
          <span id="chef-language-label" className="cob-label">
            {text.videoLanguage}
          </span>
          <LanguagePicker
            labelId="chef-language-label"
            value={language}
            disabled={flow.busy}
            onChange={(next) => flow.field("language", next)}
          />
        </div>
        {loading ? (
          <div
            className="cob-skeleton"
            style={{ aspectRatio: "16 / 9" }}
            role="status"
            aria-label={text.loadingGuide}
          />
        ) : error ? (
          <div className="cob-video-empty" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="cob-link"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {text.tryAgain}
            </button>
          </div>
        ) : videos.length === 0 && articles.length === 0 ? (
          <div className="cob-video-empty">
            <PlayCircle size={28} aria-hidden="true" />
            <span>{text.guideSoon}</span>
          </div>
        ) : (
          <div className="cob-fields">
            {videos.map((item) => (
              <div key={item.id} className="cob-field" lang={item.language}>
                <div className="cob-video">
                  {playback[item.id] ? (
                    <video
                      controls
                      autoPlay
                      playsInline
                      preload="metadata"
                      src={playback[item.id]}
                      aria-label={item.title}
                      onError={() => setVideoError(text.playbackFailed)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="cob-video-poster"
                      disabled={opening !== null}
                      aria-label={format(text.watchVideo, { title: item.title })}
                      onClick={() => void play(item)}
                    >
                      <span className="cob-play" aria-hidden="true">
                        {opening === item.id ? <Spinner /> : <Play size={24} fill="currentColor" />}
                      </span>
                      <span>{item.title}</span>
                    </button>
                  )}
                </div>
                {/* Said on the video itself when the chosen language has no version of it yet. */}
                {item.language === "en" && language !== "en" ? <span className="cob-helper">{text.inEnglish}</span> : null}
                {playback[item.id] ? (
                  <button
                    type="button"
                    className="cob-link"
                    onClick={() => {
                      setPlayback((previous) => {
                        const next = { ...previous };
                        delete next[item.id];
                        return next;
                      });
                      void play(item);
                    }}
                  >
                    {text.reloadVideo}
                  </button>
                ) : null}
              </div>
            ))}
            {videoError ? <FieldError>{videoError}</FieldError> : null}
            {articles.map((item) => (
              <article key={item.id} lang={item.language}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</h3>
                <p
                  className="cob-helper"
                  style={{ marginTop: 4, whiteSpace: "pre-wrap", fontSize: 14 }}
                >
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card
        icon={<Headset size={20} aria-hidden="true" />}
        title={text.fssaiHelp}
        subtitle={text.fssaiHelpText}
      >
        {flow.callbackCase ? (
          <div className="cob-success" role="status">
            <CheckCircle2
              size={22}
              aria-hidden="true"
              style={{ color: "#C4200F", flexShrink: 0 }}
            />
            <div>
              <strong>{flow.callback?.status === "CONTACTED" ? text.contacted : text.received}</strong>
              <p>{flow.callback?.status === "CONTACTED" ? text.contactedText : text.receivedText}</p>
              <small>
                {format(text.reference, { case: flow.callbackCase })}
                {flow.callback?.requestedAt ? format(text.requested, { date: formatDate(flow.callback.requestedAt) }) : ""}
              </small>
            </div>
          </div>
        ) : (
          <>
          {flow.callback?.status === "RESOLVED" ? (
            <p className="cob-helper" style={{ marginBottom: 10 }}>
              {format(text.resolved, { case: flow.callback.caseNumber })}
            </p>
          ) : null}
          <button
            type="button"
            className="cob-secondary"
            disabled={flow.busy}
            onClick={() => void flow.requestCallback()}
          >
            <Phone size={18} aria-hidden="true" />
            {text.requestCall}
          </button>
          </>
        )}
      </Card>

      <Note tone="neutral">{text.finishOthers}</Note>

      <button
        type="button"
        className="cob-link cob-link--center"
        disabled={flow.busy}
        onClick={() => flow.setFssaiGuide(false)}
      >
        {text.haveFssai}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 5 - Identity                                                 */
/* ------------------------------------------------------------------ */

export function ChefIdentityDetails({ flow }: Props) {
  const text = useText(TEXT);
  const proofs = useText(PROOF_LABELS);
  const proof = flow.details.proofKind;
  const locked = Boolean(
    flow.state?.documents.some((document) => document.documentType.startsWith("SELECTED_PROOF_")),
  );
  const twoSided = proofNeedsBack(proof, flow.details.proofHasBack);
  const proofError = fieldError(flow, "proofKind");
  const done = Boolean(
    proof &&
    flow.state &&
    evidenceComplete(flow.state, "SELECTED_PROOF_FRONT") &&
    (!twoSided || evidenceComplete(flow.state, "SELECTED_PROOF_BACK")),
  );
  return (
    <div className="cob-stack">
      <Card
        id="chef-proofKind"
        icon={<IdCard size={20} aria-hidden="true" />}
        title={text.docType}
      >
        <div className="cob-fields">
          {/* Native radios: one Tab stop and arrow keys, drawn as chips. */}
          <fieldset className="cob-choices">
            <legend className="sr-only">{text.identityDocument}</legend>
            {PROOF_OPTIONS.map(([key]) => {
              const selected = proof === key;
              const disabled = flow.busy || (locked && !selected);
              return (
                <label
                  key={key}
                  className="cob-choice"
                  data-checked={selected || undefined}
                  data-disabled={disabled || undefined}
                >
                  <input
                    type="radio"
                    name="chef-proof-kind"
                    className="sr-only"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => {
                      flow.field("proofKind", key as ProofKind);
                      if (key !== "OTHER_GOVERNMENT_ID") flow.field("proofHasBack", null);
                    }}
                  />
                  {selected ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : null}
                  {proofs[key]}
                </label>
              );
            })}
          </fieldset>
          {proofError ? (
            <FieldError>{proofError}</FieldError>
          ) : (
            <span className="cob-helper">{locked ? text.removeFirst : text.chooseOne}</span>
          )}
          {proof === "OTHER_GOVERNMENT_ID" ? (
            <TextField
              flow={flow}
              name="otherGovernmentId"
              label={text.idName}
              maxLength={80}
              placeholder={text.idNameExample}
            />
          ) : null}
          {proof === "OTHER_GOVERNMENT_ID" ? (
            <label className="cob-check">
              <input
                type="checkbox"
                checked={flow.details.proofHasBack === false}
                disabled={flow.busy}
                onChange={(event) => flow.field("proofHasBack", event.target.checked ? false : null)}
              />
              <span>{text.noBack}</span>
            </label>
          ) : null}
        </div>
      </Card>
      {proof ? (
        <Card
          icon={<FileCheck2 size={20} aria-hidden="true" />}
          title={proofs[proof]}
          subtitle={twoSided ? text.frontAndBack : text.oneFile}
          done={done}
        >
          <div className="cob-photo-grid">
            <Upload
              flow={flow}
              type="SELECTED_PROOF_FRONT"
              label={twoSided ? text.front : proofs[proof]}
              emptyTitle={twoSided ? text.addFront : text.addDocument}
            />
            {twoSided ? (
              <Upload
                flow={flow}
                type="SELECTED_PROOF_BACK"
                label={text.back}
                emptyTitle={text.addBack}
              />
            ) : null}
            <p className="cob-formats">{text.fileFormats}</p>
          </div>
        </Card>
      ) : null}
      {proof ? <Note>{text.clearPhoto}</Note> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen 7 - Review                                                   */
/* ------------------------------------------------------------------ */

function ReviewCard({
  flow,
  icon,
  section,
  complete,
  children,
  editable = true,
}: Props & {
  icon: ReactNode;
  section: ChefFormSection;
  complete: boolean;
  children: ReactNode;
  editable?: boolean;
}) {
  const text = useText(TEXT);
  const title = useText(SECTION_LABELS)[section];
  return (
    <section className="cob-card" aria-labelledby={`review-${section}`}>
      <div className="cob-review-head">
        <span className="cob-icon-well">{icon}</span>
        <div className="cob-card-title">
          <h2 id={`review-${section}`}>{title}</h2>
          {complete ? (
            <StatusChip tone="complete">{text.complete}</StatusChip>
          ) : (
            <StatusChip tone="attention">{text.attention}</StatusChip>
          )}
        </div>
        {editable ? (
          <button
            type="button"
            className="cob-link"
            aria-label={format(text.editSection, { section: title })}
            disabled={flow.busy}
            onClick={() => flow.edit(section)}
          >
            <PencilLine size={16} aria-hidden="true" />
            {text.edit}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  const text = useText(TEXT);
  return (
    <dl className="cob-rows">
      {rows.map(([label, value]) => (
        <div key={label} className="cob-row">
          <dt>{label}</dt>
          <dd className={value ? undefined : "cob-muted"}>{value || text.notAdded}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewPhoto({ flow, type, label }: Props & { type: string; label: string }) {
  const text = useText(TEXT);
  const evidence = flow.state?.documents.find(
    (document) => document.documentType === type && document.status !== "REJECTED",
  );
  const preview = useSavedPreview(evidence);
  return (
    <div className="cob-review-photo">
      <span className="cob-thumb">
        {preview ? (
          <img src={preview} alt={label} />
        ) : evidence ? (
          <Check size={20} aria-label={format(text.photoUploaded, { photo: label })} style={{ color: "#C4200F" }} />
        ) : (
          <Camera size={20} aria-label={format(text.photoMissing, { photo: label })} />
        )}
      </span>
      <span>{label}</span>
    </div>
  );
}

export function ChefReviewDetails({ flow }: Props) {
  const text = useText(TEXT);
  const proofs = useText(PROOF_LABELS);
  const sections = useText(SECTION_LABELS);
  const d = flow.details,
    saved = flow.state;
  if (!saved) return null;
  const completion = completedSections(saved, flow.bank);
  const uploaded = (type: string) => evidenceComplete(saved, type);
  const fssaiAdded = /^\d{14}$/.test(d.fssaiNumber);
  const fssaiReviewed = Boolean(
    saved.progress?.fssaiVerified && saved.details?.fssaiNumber === d.fssaiNumber,
  );
  const bankDeferred = saved.bankEnrollmentRequired === false;
  return (
    <div className="cob-stack">
      <ReviewCard
        flow={flow}
        section="personal"
        icon={<UserRound size={20} aria-hidden="true" />}
        complete={completion.personal}
      >
        <Rows
          rows={[
            [text.fullName, chefFullName(d)],
            [text.dobLabel, d.dateOfBirth ? formatDateOfBirth(d.dateOfBirth) : ""],
            [
              text.mobileShort,
              saved.phoneNumber ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {formatPhone(saved.phoneNumber)}
                  <CheckCircle2 size={15} aria-label={text.verified} style={{ color: "#C4200F" }} />
                </span>
              ) : (
                ""
              ),
            ],
            [
              text.email,
              d.email ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {d.email}
                  {completion.personal ? (
                    <CheckCircle2
                      size={15}
                      aria-label={text.verified}
                      style={{ color: "#C4200F", flexShrink: 0 }}
                    />
                  ) : null}
                </span>
              ) : (
                ""
              ),
            ],
          ]}
        />
      </ReviewCard>

      <ReviewCard
        flow={flow}
        section="kitchen"
        icon={<Store size={20} aria-hidden="true" />}
        complete={completion.kitchen}
      >
        <Rows
          rows={[
            [text.kitchenName, d.kitchenName],
            [text.address, kitchenAddress(d)],
            [text.location, d.latitude != null && d.longitude != null ? text.pinned : ""],
          ]}
        />
        <div className="cob-review-photos" style={{ marginTop: 14 }}>
          <ReviewPhoto flow={flow} type="KITCHEN_PHOTO_1" label={text.overallShort} />
          <ReviewPhoto flow={flow} type="KITCHEN_PHOTO_2" label={text.setupShort} />
        </div>
      </ReviewCard>

      <ReviewCard
        flow={flow}
        section="fssai"
        icon={<ShieldCheck size={20} aria-hidden="true" />}
        complete={completion.fssai}
      >
        <Rows
          rows={[
            [
              text.status,
              fssaiReviewed ? text.verifiedByCraves : fssaiAdded ? text.numberAdded : text.notAddedYet,
            ],
            [
              text.registrationNumber,
              fssaiAdded ? <span className="cob-mono">{formatFssai(d.fssaiNumber)}</span> : "",
            ],
          ]}
        />
      </ReviewCard>

      <ReviewCard
        flow={flow}
        section="documents"
        icon={<IdCard size={20} aria-hidden="true" />}
        complete={completion.documents}
      >
        <Rows
          rows={[
            [
              text.docType,
              d.proofKind
                ? d.proofKind === "OTHER_GOVERNMENT_ID" && d.otherGovernmentId
                  ? d.otherGovernmentId
                  : proofs[d.proofKind]
                : "",
            ],
            ...(proofNeedsBack(d.proofKind, d.proofHasBack)
              ? ([
                  [text.front, uploaded("SELECTED_PROOF_FRONT") ? text.uploaded : ""],
                  [text.back, uploaded("SELECTED_PROOF_BACK") ? text.uploaded : ""],
                ] as [string, string][])
              : ([[text.document, uploaded("SELECTED_PROOF_FRONT") ? text.uploaded : ""]] as [
                  string,
                  string,
                ][])),
          ]}
        />
      </ReviewCard>

      {bankDeferred ? (
        <section className="cob-card" aria-labelledby="review-bank">
          <div className="cob-review-head" style={{ marginBottom: 10 }}>
            <span className="cob-icon-well cob-icon-well--neutral">
              <Landmark size={20} aria-hidden="true" />
            </span>
            <div className="cob-card-title">
              <h2 id="review-bank">{sections.bank}</h2>
              {bankCanContinue(flow.bank) ? (
                <StatusChip tone="complete">{text.saved}</StatusChip>
              ) : (
                <StatusChip tone="idle">{text.addLater}</StatusChip>
              )}
            </div>
          </div>
          <p className="cob-helper" style={{ fontSize: 14 }}>
            {bankCanContinue(flow.bank)
              ? format(text.accountSaved, { lastFour: flow.bank?.lastFour ?? "", message: flow.bank?.message ?? "" })
              : text.bankLater}
          </p>
          <button
            type="button"
            className="cob-link"
            style={{ marginTop: 8 }}
            disabled={flow.busy}
            onClick={() => flow.edit("bank")}
          >
            {bankCanContinue(flow.bank) ? text.changeBank : flow.bank ? text.addBankNow : text.addOrCheckBank}
          </button>
        </section>
      ) : (
        <ReviewCard
          flow={flow}
          section="bank"
          icon={<Building2 size={20} aria-hidden="true" />}
          complete={completion.bank}
        >
          <Rows
            rows={[
              [text.accountHolder, flow.bank?.accountHolderName || chefFullName(d)],
              [text.bank, flow.bank?.bankName ?? ""],
              [
                text.account,
                flow.bank?.lastFour ? (
                  <span className="cob-mono">•••• {flow.bank.lastFour}</span>
                ) : (
                  ""
                ),
              ],
              ["IFSC", flow.bank?.ifsc ?? ""],
            ]}
          />
          {flow.bank?.message && !completion.bank ? (
            <p className="cob-helper" style={{ marginTop: 10 }}>
              {flow.bank.message}
            </p>
          ) : null}
        </ReviewCard>
      )}

      <section className="cob-card">
        <label className="cob-check">
          <input
            type="checkbox"
            checked={flow.terms}
            disabled={flow.busy}
            onChange={(event) => flow.setTerms(event.target.checked)}
          />
          <span>
            {text.termsBefore}
            <Link href="/terms" target="_blank" rel="noopener noreferrer">
              {text.terms}
            </Link>
            {text.termsMiddle}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer">
              {text.privacy}
            </Link>
            {text.termsAfter}
          </span>
        </label>
      </section>
    </div>
  );
}

/** Renders a definition list row group; exported for the status and confirmation screens. */
export function SummaryRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="cob-rows">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <Fragment key={label}>
            <div className="cob-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          </Fragment>
        ))}
    </dl>
  );
}
