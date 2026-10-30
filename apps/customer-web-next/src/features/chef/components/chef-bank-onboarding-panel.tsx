"use client";
import { sessionFetch } from "@/shared/lib/session-fetch";

import { chefErrorText } from "@/features/chef/lib/chef-errors";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { z } from "zod";
import { bankConsentVersion, bankStatusSchema, bankSubmissionSchema, type BankStatus } from "@/features/admin/finance/lib/bank-onboarding-contract";
import { captureSessionContext, isSessionReady, loadSession, subscribeSession } from "@/features/auth/api/cravesAuth";
import { ChevronDown, Info, Landmark, RefreshCw } from "lucide-react";
import { ChefFlash, ChefNotice, ChefPill, ChefSection, type ChefTone } from "@/features/chef/components/chef-ui";
import { ChefBankSkeleton } from "@/features/chef/components/chef-loading";
import { format, messages, type Language } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { RequiredMark } from "@/shared/ui/forms/required-mark";

const applicantSchema = z.object({firstName: z.string().nullable().optional(), lastName: z.string().nullable().optional(), status: z.string()});
const inputClass = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";

function bankOwnerScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverBankScope = () => "server";

const TEXT = messages({
  en: {
    title: "Bank account",
    signIn: "Sign in to view or update your payout bank account.",
    notAvailable: "Bank account setup isn’t available yet. Your application hasn’t changed.",
    profileUnavailable: "Bank profile unavailable",
    checkFields: "Check that both account numbers match, the IFSC has 11 characters, and the consent box is ticked.",
    conflict: "Your bank details changed or a payout is in progress. Refresh before changing them; a payout already on its way can’t be redirected.",
    tooOften: "You’ve changed your bank account too often today. Try again after 24 hours.",
    notConfirmed: "We couldn’t confirm your bank details were saved. Keep this page open and tap Check again. Trying again won’t create a duplicate.",
    submitFailed: "Bank submission not confirmed",
    saved: "Bank details saved",
    introReady: "Craves sends your money to this account.",
    introOff: "Adding a bank account here isn’t available right now. Your balance shows how money is sent.",
    introFailed: "We couldn’t check your bank account.",
    introChecking: "Checking your bank account…",
    ending: "Account ending {lastFour}",
    none: "No bank account yet",
    tapCheck: "Tap Check again. You can add an account once this loads.",
    applyFirst: "Submit your chef application first. This section updates by itself while the page is open.",
    change: "Change bank account",
    add: "Add bank account",
    holder: "Account holder",
    holderNote: "Taken from your chef application. Use your own account in this name; joint accounts, business names or different initials aren’t approved automatically.",
    account: "Account number",
    confirm: "Confirm account number",
    ifsc: "IFSC",
    consent: "I confirm this is my bank account and consent to Craves sharing these details and my saved contact information with Razorpay for account validation and eligible chef payouts.",
    saving: "Saving securely…",
    save: "Save bank details",
    safety: "Money goes only to a bank account that has been checked. Your account number isn’t kept on this phone.",
    checkAgain: "Check again",
  },
  te: {
    title: "బ్యాంక్ ఖాతా",
    signIn: "మీ చెల్లింపుల బ్యాంక్ ఖాతా చూడడానికి లేదా మార్చడానికి సైన్ ఇన్ చేయండి.",
    notAvailable: "బ్యాంక్ ఖాతా జోడించడం ఇంకా అందుబాటులో లేదు. మీ దరఖాస్తులో ఏమీ మారలేదు.",
    profileUnavailable: "బ్యాంక్ వివరాలు అందుబాటులో లేవు",
    checkFields: "రెండు ఖాతా నంబర్లు ఒకటేనా, IFSC లో 11 అక్షరాలు ఉన్నాయా, అంగీకార బాక్స్ టిక్ చేశారా చూడండి.",
    conflict: "మీ బ్యాంక్ వివరాలు మారాయి, లేదా ఒక చెల్లింపు జరుగుతోంది. మార్చే ముందు పేజీని మళ్లీ లోడ్ చేయండి; ఇప్పటికే బయలుదేరిన చెల్లింపును వేరే ఖాతాకు మార్చలేం.",
    tooOften: "ఈరోజు మీరు బ్యాంక్ ఖాతాను చాలాసార్లు మార్చారు. 24 గంటల తర్వాత మళ్లీ ప్రయత్నించండి.",
    notConfirmed: "మీ బ్యాంక్ వివరాలు సేవ్ అయ్యాయో లేదో నిర్ధారించలేకపోయాం. ఈ పేజీని తెరిచే ఉంచి 'మళ్లీ చూడండి' నొక్కండి. మళ్లీ ప్రయత్నించినా రెండోసారి సేవ్ కాదు.",
    submitFailed: "బ్యాంక్ వివరాలు అందినట్లు నిర్ధారణ కాలేదు",
    saved: "బ్యాంక్ వివరాలు సేవ్ అయ్యాయి",
    introReady: "Craves మీ డబ్బును ఈ ఖాతాకు పంపుతుంది.",
    introOff: "ఇక్కడ బ్యాంక్ ఖాతా జోడించడం ఇప్పుడు కుదరదు. డబ్బు ఎలా పంపుతారో మీ బ్యాలెన్స్‌లో కనిపిస్తుంది.",
    introFailed: "మీ బ్యాంక్ ఖాతాను చూడలేకపోయాం.",
    introChecking: "మీ బ్యాంక్ ఖాతాను చూస్తున్నాం…",
    ending: "{lastFour} తో ముగిసే ఖాతా",
    none: "ఇంకా బ్యాంక్ ఖాతా లేదు",
    tapCheck: "'మళ్లీ చూడండి' నొక్కండి. ఇది లోడ్ అయిన తర్వాత ఖాతా జోడించవచ్చు.",
    applyFirst: "ముందుగా మీ చెఫ్ దరఖాస్తు పంపండి. పేజీ తెరిచి ఉన్నంతసేపు ఈ భాగం దానంతట అదే అప్‌డేట్ అవుతుంది.",
    change: "బ్యాంక్ ఖాతా మార్చండి",
    add: "బ్యాంక్ ఖాతా జోడించండి",
    holder: "ఖాతాదారు పేరు",
    holderNote: "మీ చెఫ్ దరఖాస్తు నుండి తీసుకున్నాం. ఈ పేరుతో ఉన్న మీ సొంత ఖాతానే వాడండి; జాయింట్ ఖాతాలు, వ్యాపారం పేర్లు లేదా వేరే ఇనిషియల్స్ ఉన్నవి ఆటోమేటిక్‌గా ఆమోదం పొందవు.",
    account: "ఖాతా నంబర్",
    confirm: "ఖాతా నంబర్ మళ్లీ రాయండి",
    ifsc: "IFSC",
    consent: "ఇది నా బ్యాంక్ ఖాతా అని నేను నిర్ధారిస్తున్నాను. ఖాతా ధృవీకరణ కోసం, అర్హత ఉన్న చెఫ్ చెల్లింపుల కోసం Craves ఈ వివరాలను, నేను సేవ్ చేసిన నా సంప్రదింపు సమాచారాన్ని Razorpay తో పంచుకోవడానికి నేను అంగీకరిస్తున్నాను.",
    saving: "సురక్షితంగా సేవ్ అవుతోంది…",
    save: "బ్యాంక్ వివరాలు సేవ్ చేయండి",
    safety: "చెక్ చేసిన బ్యాంక్ ఖాతాకు మాత్రమే డబ్బు వెళ్తుంది. మీ ఖాతా నంబర్ ఈ ఫోన్‌లో ఉంచము.",
    checkAgain: "మళ్లీ చూడండి",
  },
  kn: {
    title: "ಬ್ಯಾಂಕ್ ಖಾತೆ",
    signIn: "ನಿಮ್ಮ ಪಾವತಿ ಬ್ಯಾಂಕ್ ಖಾತೆ ನೋಡಲು ಅಥವಾ ಬದಲಾಯಿಸಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.",
    notAvailable: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಸೇರಿಸುವುದು ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ. ನಿಮ್ಮ ಅರ್ಜಿಯಲ್ಲಿ ಏನೂ ಬದಲಾಗಿಲ್ಲ.",
    profileUnavailable: "ಬ್ಯಾಂಕ್ ವಿವರಗಳು ಲಭ್ಯವಿಲ್ಲ",
    checkFields: "ಎರಡೂ ಖಾತೆ ಸಂಖ್ಯೆಗಳು ಒಂದೇ ಇವೆಯೇ, IFSC ಯಲ್ಲಿ 11 ಅಕ್ಷರಗಳಿವೆಯೇ, ಒಪ್ಪಿಗೆ ಬಾಕ್ಸ್ ಟಿಕ್ ಮಾಡಿದ್ದೀರಾ ನೋಡಿ.",
    conflict: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರಗಳು ಬದಲಾಗಿವೆ, ಅಥವಾ ಒಂದು ಪಾವತಿ ನಡೆಯುತ್ತಿದೆ. ಬದಲಾಯಿಸುವ ಮೊದಲು ಪುಟವನ್ನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ; ಈಗಾಗಲೇ ಹೊರಟಿರುವ ಪಾವತಿಯನ್ನು ಬೇರೆ ಖಾತೆಗೆ ತಿರುಗಿಸಲು ಆಗುವುದಿಲ್ಲ.",
    tooOften: "ಇಂದು ನೀವು ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ತುಂಬಾ ಬಾರಿ ಬದಲಾಯಿಸಿದ್ದೀರಿ. 24 ಗಂಟೆಗಳ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    notConfirmed: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರಗಳು ಉಳಿದಿವೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಲು ಆಗಲಿಲ್ಲ. ಈ ಪುಟವನ್ನು ತೆರೆದೇ ಇಟ್ಟು 'ಮತ್ತೆ ನೋಡಿ' ಒತ್ತಿ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿದರೂ ಎರಡು ಬಾರಿ ಉಳಿಯುವುದಿಲ್ಲ.",
    submitFailed: "ಬ್ಯಾಂಕ್ ವಿವರ ತಲುಪಿದ್ದು ಖಚಿತವಾಗಲಿಲ್ಲ",
    saved: "ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ",
    introReady: "Craves ನಿಮ್ಮ ಹಣವನ್ನು ಈ ಖಾತೆಗೆ ಕಳುಹಿಸುತ್ತದೆ.",
    introOff: "ಇಲ್ಲಿ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸೇರಿಸುವುದು ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಹಣ ಹೇಗೆ ಕಳುಹಿಸಲಾಗುತ್ತದೆ ಎಂಬುದು ನಿಮ್ಮ ಬ್ಯಾಲೆನ್ಸ್‌ನಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    introFailed: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಲು ಆಗಲಿಲ್ಲ.",
    introChecking: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…",
    ending: "{lastFour} ರಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುವ ಖಾತೆ",
    none: "ಇನ್ನೂ ಬ್ಯಾಂಕ್ ಖಾತೆ ಇಲ್ಲ",
    tapCheck: "'ಮತ್ತೆ ನೋಡಿ' ಒತ್ತಿ. ಇದು ಲೋಡ್ ಆದ ನಂತರ ಖಾತೆ ಸೇರಿಸಬಹುದು.",
    applyFirst: "ಮೊದಲು ನಿಮ್ಮ ಚೆಫ್ ಅರ್ಜಿಯನ್ನು ಕಳುಹಿಸಿ. ಪುಟ ತೆರೆದಿರುವವರೆಗೆ ಈ ಭಾಗ ತಾನಾಗಿ ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತದೆ.",
    change: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಬದಲಾಯಿಸಿ",
    add: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಸೇರಿಸಿ",
    holder: "ಖಾತೆದಾರರ ಹೆಸರು",
    holderNote: "ನಿಮ್ಮ ಚೆಫ್ ಅರ್ಜಿಯಿಂದ ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ. ಈ ಹೆಸರಿನಲ್ಲಿರುವ ನಿಮ್ಮ ಸ್ವಂತ ಖಾತೆಯನ್ನೇ ಬಳಸಿ; ಜಂಟಿ ಖಾತೆಗಳು, ವ್ಯಾಪಾರದ ಹೆಸರುಗಳು ಅಥವಾ ಬೇರೆ ಇನಿಷಿಯಲ್‌ಗಳಿರುವ ಖಾತೆಗಳು ತಾನಾಗಿ ಅನುಮೋದನೆ ಆಗುವುದಿಲ್ಲ.",
    account: "ಖಾತೆ ಸಂಖ್ಯೆ",
    confirm: "ಖಾತೆ ಸಂಖ್ಯೆ ಮತ್ತೆ ಬರೆಯಿರಿ",
    ifsc: "IFSC",
    consent: "ಇದು ನನ್ನ ಬ್ಯಾಂಕ್ ಖಾತೆ ಎಂದು ನಾನು ದೃಢೀಕರಿಸುತ್ತೇನೆ. ಖಾತೆ ಪರಿಶೀಲನೆಗಾಗಿ ಮತ್ತು ಅರ್ಹ ಚೆಫ್ ಪಾವತಿಗಳಿಗಾಗಿ Craves ಈ ವಿವರಗಳನ್ನು ಮತ್ತು ನಾನು ಉಳಿಸಿದ ನನ್ನ ಸಂಪರ್ಕ ಮಾಹಿತಿಯನ್ನು Razorpay ಜೊತೆ ಹಂಚಿಕೊಳ್ಳಲು ನಾನು ಒಪ್ಪುತ್ತೇನೆ.",
    saving: "ಸುರಕ್ಷಿತವಾಗಿ ಉಳಿಸಲಾಗುತ್ತಿದೆ…",
    save: "ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಉಳಿಸಿ",
    safety: "ಪರಿಶೀಲಿಸಿದ ಬ್ಯಾಂಕ್ ಖಾತೆಗೆ ಮಾತ್ರ ಹಣ ಹೋಗುತ್ತದೆ. ನಿಮ್ಮ ಖಾತೆ ಸಂಖ್ಯೆಯನ್ನು ಈ ಫೋನ್‌ನಲ್ಲಿ ಇಡುವುದಿಲ್ಲ.",
    checkAgain: "ಮತ್ತೆ ನೋಡಿ",
  },
});

// Chef-facing words for the bank enrollment states (never the raw enum).
const BANK_STATE_LABEL = messages({
  en: {
    NOT_SUBMITTED: "Not added yet", QUEUED: "Saved", SUBMITTING: "Verifying", VALIDATING: "Verifying", UNKNOWN: "Checking with the bank",
    WAITING_APPROVAL: "Verified, waiting for approval", VERIFIED: "Verified", VALIDATION_FAILED: "Couldn’t verify", NAME_MISMATCH: "Name doesn’t match",
    APPLICANT_ACTION_REQUIRED: "Needs your attention", SUPERSEDED: "Replaced",
  },
  te: {
    NOT_SUBMITTED: "ఇంకా జోడించలేదు", QUEUED: "సేవ్ అయింది", SUBMITTING: "ధృవీకరిస్తున్నాం", VALIDATING: "ధృవీకరిస్తున్నాం", UNKNOWN: "బ్యాంక్‌తో చెక్ చేస్తున్నాం",
    WAITING_APPROVAL: "ధృవీకరించబడింది, ఆమోదం కోసం వేచి ఉంది", VERIFIED: "ధృవీకరించబడింది", VALIDATION_FAILED: "ధృవీకరించలేకపోయాం", NAME_MISMATCH: "పేరు సరిపోలలేదు",
    APPLICANT_ACTION_REQUIRED: "మీరు చూడాల్సింది ఉంది", SUPERSEDED: "మార్చబడింది",
  },
  kn: {
    NOT_SUBMITTED: "ಇನ್ನೂ ಸೇರಿಸಿಲ್ಲ", QUEUED: "ಉಳಿಸಲಾಗಿದೆ", SUBMITTING: "ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ", VALIDATING: "ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ", UNKNOWN: "ಬ್ಯಾಂಕ್‌ನೊಂದಿಗೆ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ",
    WAITING_APPROVAL: "ಪರಿಶೀಲಿಸಲಾಗಿದೆ, ಅನುಮೋದನೆಗೆ ಕಾಯುತ್ತಿದೆ", VERIFIED: "ಪರಿಶೀಲಿಸಲಾಗಿದೆ", VALIDATION_FAILED: "ಪರಿಶೀಲಿಸಲು ಆಗಲಿಲ್ಲ", NAME_MISMATCH: "ಹೆಸರು ಹೊಂದುತ್ತಿಲ್ಲ",
    APPLICANT_ACTION_REQUIRED: "ನೀವು ನೋಡಬೇಕಾದದ್ದಿದೆ", SUPERSEDED: "ಬದಲಾಯಿಸಲಾಗಿದೆ",
  },
});
const BANK_STATE_TONE: Record<string, ChefTone> = {
  VERIFIED: "success",
  WAITING_APPROVAL: "success",
  VALIDATION_FAILED: "danger",
  NAME_MISMATCH: "danger",
  APPLICANT_ACTION_REQUIRED: "danger",
  NOT_SUBMITTED: "muted",
  SUPERSEDED: "muted",
};

// The bank service's sentences (BankOnboardingService), in plain words; a sentence not listed shows as it was sent.
const SERVICE_TEXT: Record<string, { en?: string; te: string; kn: string }> = {
  "Add your bank details once. Razorpay performs bank validation automatically.": {
    en: "Add your bank details once. Craves checks the account with your bank automatically.",
    te: "మీ బ్యాంక్ వివరాలు ఒక్కసారి జోడించండి. Craves మీ బ్యాంక్‌తో ఖాతాను ఆటోమేటిక్‌గా చెక్ చేస్తుంది.",
    kn: "ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಒಮ್ಮೆ ಸೇರಿಸಿ. Craves ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಜೊತೆ ಖಾತೆಯನ್ನು ತಾನಾಗಿ ಪರಿಶೀಲಿಸುತ್ತದೆ.",
  },
  "Your applicant details changed. Confirm bank enrollment using your current name.": {
    te: "మీ దరఖాస్తు వివరాలు మారాయి. మీ ఇప్పటి పేరుతో బ్యాంక్ ఖాతాను మళ్లీ నిర్ధారించండి.",
    kn: "ನಿಮ್ಮ ಅರ್ಜಿಯ ವಿವರಗಳು ಬದಲಾಗಿವೆ. ನಿಮ್ಮ ಈಗಿನ ಹೆಸರಿನಲ್ಲಿ ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಮತ್ತೆ ದೃಢೀಕರಿಸಿ.",
  },
  "Bank status recheck is pending. New payouts are paused until automatic verification is refreshed.": {
    te: "బ్యాంక్ ఖాతాను మళ్లీ చెక్ చేయాల్సి ఉంది. అది పూర్తయ్యే వరకు కొత్త చెల్లింపులు ఆపి ఉంచాం.",
    kn: "ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಮತ್ತೆ ಪರಿಶೀಲಿಸಬೇಕಿದೆ. ಅದು ಮುಗಿಯುವವರೆಗೆ ಹೊಸ ಪಾವತಿಗಳನ್ನು ನಿಲ್ಲಿಸಲಾಗಿದೆ.",
  },
  "Razorpay bank validation passed. No manual bank approval is required; other payout controls still apply.": {
    te: "Razorpay మీ బ్యాంక్ ఖాతాను ధృవీకరించింది. ఎవరూ చేతితో ఆమోదించాల్సిన అవసరం లేదు; ఇతర చెల్లింపు నియమాలు అలాగే వర్తిస్తాయి.",
    kn: "Razorpay ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಿದೆ. ಯಾರೂ ಕೈಯಾರೆ ಅನುಮೋದಿಸಬೇಕಿಲ್ಲ; ಇತರ ಪಾವತಿ ನಿಯಮಗಳು ಹಾಗೆಯೇ ಅನ್ವಯಿಸುತ್ತವೆ.",
  },
  "Bank validated by Razorpay. Chef application approval is still pending; this is not a bank review.": {
    te: "Razorpay బ్యాంక్ ఖాతాను ధృవీకరించింది. మీ చెఫ్ దరఖాస్తు ఆమోదం ఇంకా రావాలి; ఇది బ్యాంక్ పరిశీలన కాదు.",
    kn: "Razorpay ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಿದೆ. ನಿಮ್ಮ ಚೆಫ್ ಅರ್ಜಿಯ ಅನುಮೋದನೆ ಇನ್ನೂ ಬರಬೇಕಿದೆ; ಇದು ಬ್ಯಾಂಕ್ ಪರಿಶೀಲನೆ ಅಲ್ಲ.",
  },
  "Razorpay could not validate this bank account. Correct your bank details.": {
    te: "Razorpay ఈ బ్యాంక్ ఖాతాను ధృవీకరించలేకపోయింది. మీ బ్యాంక్ వివరాలు సరిచేయండి.",
    kn: "Razorpay ಈ ಬ್ಯಾಂಕ್ ಖಾತೆಯನ್ನು ಪರಿಶೀಲಿಸಲು ಆಗಲಿಲ್ಲ. ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಸರಿಪಡಿಸಿ.",
  },
  "The bank-returned name does not match your saved chef applicant name. Correct your own account or application details.": {
    te: "బ్యాంక్ చెప్పిన పేరు, మీ చెఫ్ దరఖాస్తులోని పేరు ఒకటి కాదు. మీ సొంత ఖాతా వివరాలు లేదా దరఖాస్తు వివరాలు సరిచేయండి.",
    kn: "ಬ್ಯಾಂಕ್ ನೀಡಿದ ಹೆಸರು ನಿಮ್ಮ ಚೆಫ್ ಅರ್ಜಿಯ ಹೆಸರಿನೊಂದಿಗೆ ಹೊಂದುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಸ್ವಂತ ಖಾತೆಯ ವಿವರ ಅಥವಾ ಅರ್ಜಿಯ ವಿವರಗಳನ್ನು ಸರಿಪಡಿಸಿ.",
  },
  "Razorpay response is unconfirmed. Automatic reconciliation is running; no duplicate validation request is sent.": {
    te: "Razorpay నుండి జవాబు ఇంకా ఖరారు కాలేదు. ఆటోమేటిక్‌గా మళ్లీ సరిచూస్తున్నాం; రెండోసారి చెక్ చేయమని అడగడం లేదు.",
    kn: "Razorpay ಉತ್ತರ ಇನ್ನೂ ಖಚಿತವಾಗಿಲ್ಲ. ತಾನಾಗಿ ಮತ್ತೆ ಹೊಂದಿಸಲಾಗುತ್ತಿದೆ; ಎರಡನೇ ಬಾರಿ ಪರಿಶೀಲನೆ ಕೋರಿಕೆ ಕಳುಹಿಸುವುದಿಲ್ಲ.",
  },
  "Your saved chef identity or application status changed. Update and resubmit your bank enrollment.": {
    te: "మీ చెఫ్ గుర్తింపు వివరాలు లేదా దరఖాస్తు స్థితి మారింది. మీ బ్యాంక్ వివరాలు అప్‌డేట్ చేసి మళ్లీ పంపండి.",
    kn: "ನಿಮ್ಮ ಚೆಫ್ ಗುರುತಿನ ವಿವರ ಅಥವಾ ಅರ್ಜಿಯ ಸ್ಥಿತಿ ಬದಲಾಗಿದೆ. ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಅಪ್‌ಡೇಟ್ ಮಾಡಿ ಮತ್ತೆ ಕಳುಹಿಸಿ.",
  },
  "This is an older bank enrollment and cannot receive new payouts.": {
    te: "ఇది పాత బ్యాంక్ ఖాతా వివరం; దీనికి కొత్త చెల్లింపులు రావు.",
    kn: "ಇದು ಹಳೆಯ ಬ್ಯಾಂಕ್ ಖಾತೆ ವಿವರ; ಇದಕ್ಕೆ ಹೊಸ ಪಾವತಿಗಳು ಬರುವುದಿಲ್ಲ.",
  },
  "Bank details saved securely. Automatic Razorpay validation is pending.": {
    te: "బ్యాంక్ వివరాలు సురక్షితంగా సేవ్ అయ్యాయి. Razorpay ఆటోమేటిక్ ధృవీకరణ ఇంకా జరగాలి.",
    kn: "ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಉಳಿಸಲಾಗಿದೆ. Razorpay ತಾನಾಗಿ ಮಾಡುವ ಪರಿಶೀಲನೆ ಇನ್ನೂ ಬಾಕಿ ಇದೆ.",
  },
  "Bank details saved securely. We'll verify them with your bank as soon as payouts open. Nothing else is needed from you.": {
    te: "బ్యాంక్ వివరాలు సురక్షితంగా సేవ్ అయ్యాయి. చెల్లింపులు మొదలైన వెంటనే మీ బ్యాంక్‌తో వాటిని ధృవీకరిస్తాం. మీరు ఇంకేమీ చేయనక్కర్లేదు.",
    kn: "ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಉಳಿಸಲಾಗಿದೆ. ಪಾವತಿಗಳು ಶುರುವಾದ ತಕ್ಷಣ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಜೊತೆ ಅವುಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತೇವೆ. ನೀವು ಬೇರೆ ಏನೂ ಮಾಡಬೇಕಿಲ್ಲ.",
  },
};
function serviceText(message: string, language: Language): string {
  const known = Object.hasOwn(SERVICE_TEXT, message) ? SERVICE_TEXT[message] : undefined;
  return (language === "en" ? known?.en : known?.[language]) ?? message;
}

/** The chef's bank account, read once: undefined while it loads, null when it couldn't be read. */
export function useChefBank(enabled = true): BankStatus | null | undefined {
  const [bank, setBank] = useState<BankStatus | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    sessionFetch("/api/chef-onboarding/bank", {cache: "no-store"})
      .then(response => (response.ok ? response.json() : null))
      .then((body: unknown) => {if (active) setBank(bankStatusSchema.safeParse(body).data ?? null);})
      .catch(() => {if (active) setBank(null);});
    return () => {active = false;};
  }, [enabled]);
  return bank;
}

/** `titled={false}` on a page whose own heading already says "Bank account". */
export function ChefBankOnboardingPanel({ titled = true }: { titled?: boolean }) {
  const text = useText(TEXT);
  const scope = useSyncExternalStore(subscribeSession, bankOwnerScope, serverBankScope);
  // The application page also hosts this panel before CHEF role approval.
  // Establish Auth ownership without treating business approval as bank approval.
  useEffect(() => { void loadSession().catch(() => null); }, []);
  if (!isSessionReady()) return <ChefSection title={titled ? text.title : undefined}><p role="status" className="text-[0.9375rem] text-[#6B6B6B]">{text.signIn}</p></ChefSection>;
  return <ChefBankOnboardingContent key={scope} titled={titled} />;
}

function ChefBankOnboardingContent({ titled }: { titled: boolean }) {
  const text = useText(TEXT);
  const stateLabel = useText(BANK_STATE_LABEL);
  const { language } = useLanguage();
  const [bank, setBank] = useState<BankStatus | null>(null);
  const [name, setName] = useState("");
  const [registered, setRegistered] = useState(false);
  const [account, setAccount] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [availabilityError, setAvailabilityError] = useState(false);
  const pending = useRef<z.infer<typeof bankSubmissionSchema> | null>(null);
  const mounted = useRef(true);
  const loading = useRef(false);
  const bankRef = useRef<BankStatus | null>(null);
  useEffect(() => {
    bankRef.current = bank;
  }, [bank]);
  // A background check (every 15 s or on focus) never wipes the form or a message the chef is
  // reading: it keeps the last known status when it fails and leaves messages alone.
  const refresh = useCallback(async (quiet = false) => {
    if (loading.current) return;
    loading.current = true;
    try {
      const [profileResponse, bankResponse] = await Promise.all([
        sessionFetch("/api/chef/application", {cache: "no-store"}), sessionFetch("/api/chef-onboarding/bank", {cache: "no-store"}),
      ]);
      if (!profileResponse.ok || !bankResponse.ok) throw new Error(text.notAvailable);
      const profile = applicantSchema.parse(await profileResponse.json());
      const status = bankStatusSchema.parse(await bankResponse.json());
      if (mounted.current) {
        setName([profile.firstName, profile.lastName].filter(Boolean).join(" "));
        setRegistered(["PENDING", "APPROVED"].includes(profile.status)); setBank(status);setAvailabilityError(false);if (!quiet) setMessage("");
      }
    } catch (error) {
      if (!mounted.current || (quiet && bankRef.current)) return;
      setBank(null);setAvailabilityError(true);setMessage(chefErrorText(error, text.profileUnavailable));
    }
    finally {loading.current = false;}
  }, [text]);
  useEffect(() => {
    mounted.current = true; void refresh();
    const quietly = () => void refresh(true);
    const timer = setInterval(() => {if (document.visibilityState === "visible") quietly();}, 15000);
    window.addEventListener("focus", quietly);
    return () => {mounted.current = false;clearInterval(timer);window.removeEventListener("focus", quietly);};
  }, [refresh]);
  function edit(action: () => void) {pending.current = null; action();}
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !registered || !bank?.automaticActivation) return;
    const value = pending.current || {requestKey: crypto.randomUUID(), expectedCurrentId: bank.id,
      accountHolderName: name, accountNumber: account, accountNumberConfirmation: confirmation, ifsc,
      consent, consentVersion: bankConsentVersion};
    const parsed = bankSubmissionSchema.safeParse(value);
    if (!parsed.success) {setMessage(text.checkFields);return;}
    pending.current = parsed.data; setBusy(true);setMessage("");setNotice("");
    try {
      const response = await sessionFetch("/api/chef-onboarding/bank", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(pending.current)});
      if (!response.ok) throw new Error(response.status === 409 ? text.conflict : response.status === 429 ? text.tooOften : text.notConfirmed);
      const result = bankStatusSchema.parse(await response.json());
      setBank(result); setAccount("");setConfirmation("");setIfsc("");setConsent(false);pending.current = null;
      setNotice(text.saved);
    } catch (error) {setMessage(chefErrorText(error, text.submitFailed));}
    finally {setBusy(false);}
  }
  const intro = bank?.automaticActivation ? text.introReady : bank ? text.introOff : availabilityError ? text.introFailed : text.introChecking;
  return <ChefSection title={titled ? text.title : undefined} note={intro} labelledBy={titled ? "chef-bank" : undefined}>
    <div className="grid gap-4">
      {titled ? null : <p className="chef-section-note">{intro}</p>}
      {message ? <ChefNotice icon={Info} role="status">{message}</ChefNotice> : null}
      {bank?.automaticActivation ? <div className="flex items-start gap-3 rounded-xl bg-[#F1F3F5] p-4">
        <span className="chef-row-icon !bg-white"><Landmark className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="font-semibold">{bank.lastFour ? format(text.ending, {lastFour: bank.lastFour}) : text.none}</p><ChefPill tone={BANK_STATE_TONE[bank.state] ?? "warning"}>{stateLabel[bank.state]}</ChefPill></div>
          {bank.message ? <p className="mt-1 text-[0.875rem] leading-5 text-[#6B6B6B]">{serviceText(bank.message, language)}</p> : null}
        </div>
      </div> : null}
      {!bank ? (availabilityError ? <p className="text-[0.875rem] text-[#6B6B6B]">{text.tapCheck}</p> : <ChefBankSkeleton />)
      : !bank.automaticActivation ? null
      : !registered ? <p className="text-[0.875rem] text-[#6B6B6B]">{text.applyFirst}</p>
      : <details className="group" open={!bank.lastFour}>
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[#1A1A1A] [&::-webkit-details-marker]:hidden">{bank.lastFour ? text.change : text.add}<ChevronDown className="h-4 w-4 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <form onSubmit={save} className="mt-3 grid gap-4" autoComplete="off">
            <label className="block text-sm font-semibold">{text.holder}<input className={`${inputClass} bg-[#F7F8FA]`} value={name} readOnly aria-readonly="true" /><span className="mt-1.5 block text-[0.8125rem] font-normal leading-5 text-[#6B6B6B]">{text.holderNote}</span></label>
            <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">{text.account}<RequiredMark /><input className={inputClass} inputMode="numeric" type="password" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore="true" data-form-type="other" maxLength={24} value={account} disabled={busy} onChange={event => edit(() => setAccount(event.target.value))} required /></label>
              <label className="text-sm font-semibold">{text.confirm}<RequiredMark /><input className={inputClass} inputMode="numeric" autoComplete="off" maxLength={24} value={confirmation} disabled={busy} onChange={event => edit(() => setConfirmation(event.target.value))} required /></label></div>
            <label className="block text-sm font-semibold">{text.ifsc}<RequiredMark /><input className={`${inputClass} uppercase`} maxLength={11} value={ifsc} disabled={busy} onChange={event => edit(() => setIfsc(event.target.value.toUpperCase()))} required /></label>
            <label className="flex items-start gap-3 text-[0.875rem] leading-6"><input className="mt-1 h-5 w-5 shrink-0 accent-[#1A1A1A]" type="checkbox" checked={consent} disabled={busy} onChange={event => edit(() => setConsent(event.target.checked))} required /><span>{text.consent}</span></label>
            <button type="submit" aria-busy={busy} disabled={busy || !bank?.automaticActivation} className="chef-btn is-primary is-block">{busy ? text.saving : text.save}</button>
          </form>
        </details>}
      <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">{text.safety}</p>
      {bank?.state === "VERIFIED" ? null : <button type="button" onClick={() => void refresh()} disabled={busy} className="chef-btn is-small w-fit"><RefreshCw className="h-4 w-4" aria-hidden="true" />{text.checkAgain}</button>}
      <ChefFlash message={notice} onClose={() => setNotice("")} />
    </div>
  </ChefSection>;
}
