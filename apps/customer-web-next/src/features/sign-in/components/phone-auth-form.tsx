"use client";

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { beginMsg91PhoneSignIn, parkMsg91Captcha, type PhoneConfirmation } from "@/features/sign-in/lib/msg91-browser";
import { phoneCodeRequestError, phoneCodeVerifyError } from "@/features/sign-in/lib/phone-auth-errors";
import { getFirebaseBrowserClient } from "@/shared/lib/firebase-client";
import { safeReturnPath, type CravesIdentity } from "@/features/auth/lib/auth-contract";
import { CodeSlots, type CodeSlotsStatus } from "@/shared/ui/forms/code-slots";
import { markCustomerModeVerified } from "@/features/chef/lib/chef-mode";
import { CARD, FIELD, SECONDARY_BUTTON, TEXT_BUTTON } from "@/features/sign-in/components/auth-form-classes";
import { EmailSignInForm } from "@/features/sign-in/components/email-sign-in-form";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";

// Chefs read this form in their language; customer pages have no language provider and read English.
// Customer-only lines stay English below.
const TEXT = messages({
  en: {
    title: "Sign in to your kitchen",
    intro: "We’ll send a code to your phone. This keeps your orders, menu and earnings safe.",
    otp: "Six-digit OTP",
    sentTo: "Sent to {phone}",
    changeNumber: "Change mobile number",
    change: "Change",
    signedInAs: "Signed in as",
    useAnother: "Use another number",
    mobile: "Mobile number",
    tenDigits: "10-digit number",
    opening: "Opening…",
    signingIn: "Signing in…",
    verify: "Verify OTP",
    resendIn: "Resend OTP in {seconds}s",
    resend: "Resend OTP",
    requesting: "Requesting OTP…",
    send: "Send OTP",
    or: "or",
    useEmail: "Use email & password",
    note: "Your OTP is used only to securely confirm your Craves account.",
  },
  te: {
    title: "మీ వంటగదిలోకి సైన్ ఇన్ చేయండి",
    intro: "మీ ఫోన్‌కు ఒక కోడ్ పంపుతాం. దీనివల్ల మీ ఆర్డర్లు, మెనూ, సంపాదన సురక్షితంగా ఉంటాయి.",
    otp: "6 అంకెల OTP",
    sentTo: "{phone} కు పంపాము",
    changeNumber: "మొబైల్ నంబర్ మార్చండి",
    change: "మార్చండి",
    signedInAs: "సైన్ ఇన్ అయిన నంబర్",
    useAnother: "వేరే నంబర్ వాడండి",
    mobile: "మొబైల్ నంబర్",
    tenDigits: "10 అంకెల నంబర్",
    opening: "తెరుస్తున్నాం…",
    signingIn: "సైన్ ఇన్ అవుతోంది…",
    verify: "OTP నిర్ధారించండి",
    resendIn: "{seconds} సెకన్ల తర్వాత మళ్లీ పంపండి",
    resend: "OTP మళ్లీ పంపండి",
    requesting: "OTP అడుగుతున్నాం…",
    send: "OTP పంపండి",
    or: "లేదా",
    useEmail: "ఈమెయిల్, పాస్‌వర్డ్ వాడండి",
    note: "మీ OTP ని మీ Craves ఖాతాను సురక్షితంగా నిర్ధారించడానికి మాత్రమే వాడతాం.",
  },
  kn: {
    title: "ನಿಮ್ಮ ಅಡುಗೆಮನೆಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ",
    intro: "ನಿಮ್ಮ ಫೋನ್‌ಗೆ ಒಂದು ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ. ಇದರಿಂದ ನಿಮ್ಮ ಆರ್ಡರ್‌ಗಳು, ಮೆನು ಮತ್ತು ಗಳಿಕೆ ಸುರಕ್ಷಿತವಾಗಿರುತ್ತವೆ.",
    otp: "6 ಅಂಕಿಯ OTP",
    sentTo: "{phone} ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ",
    changeNumber: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಬದಲಾಯಿಸಿ",
    change: "ಬದಲಾಯಿಸಿ",
    signedInAs: "ಸೈನ್ ಇನ್ ಆಗಿರುವ ಸಂಖ್ಯೆ",
    useAnother: "ಬೇರೆ ಸಂಖ್ಯೆ ಬಳಸಿ",
    mobile: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ",
    tenDigits: "10 ಅಂಕಿಯ ಸಂಖ್ಯೆ",
    opening: "ತೆರೆಯುತ್ತಿದೆ…",
    signingIn: "ಸೈನ್ ಇನ್ ಆಗುತ್ತಿದೆ…",
    verify: "OTP ಪರಿಶೀಲಿಸಿ",
    resendIn: "{seconds} ಸೆಕೆಂಡ್ ನಂತರ ಮತ್ತೆ ಕಳುಹಿಸಿ",
    resend: "OTP ಮತ್ತೆ ಕಳುಹಿಸಿ",
    requesting: "OTP ಕೇಳಲಾಗುತ್ತಿದೆ…",
    send: "OTP ಕಳುಹಿಸಿ",
    or: "ಅಥವಾ",
    useEmail: "ಇಮೇಲ್ ಮತ್ತು ಪಾಸ್‌ವರ್ಡ್ ಬಳಸಿ",
    note: "ನಿಮ್ಮ OTP ಅನ್ನು ನಿಮ್ಮ Craves ಖಾತೆಯನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಖಚಿತಪಡಿಸಲು ಮಾತ್ರ ಬಳಸುತ್ತೇವೆ.",
  },
});

/**
 * Status lines and errors stay English in state (some come from phone-auth-errors and email sign-in) and
 * are shown in the chef's language when listed here; anything else, such as a server's own words, shows as sent.
 */
const SENTENCES: Record<string, { te: string; kn: string }> = {
  "Use your mobile number to receive a one-time password.": {
    te: "OTP పొందడానికి మీ మొబైల్ నంబర్ ఇవ్వండి.",
    kn: "OTP ಪಡೆಯಲು ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನೀಡಿ.",
  },
  "Security check completed. You can request the OTP.": {
    te: "భద్రతా తనిఖీ పూర్తయింది. ఇప్పుడు OTP అడగవచ్చు.",
    kn: "ಭದ್ರತಾ ಪರಿಶೀಲನೆ ಮುಗಿದಿದೆ. ಈಗ OTP ಕೇಳಬಹುದು.",
  },
  "The security check expired. Complete it again.": {
    te: "భద్రతా తనిఖీ సమయం అయిపోయింది. మళ్లీ పూర్తి చేయండి.",
    kn: "ಭದ್ರತಾ ಪರಿಶೀಲನೆಯ ಸಮಯ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಪೂರ್ಣಗೊಳಿಸಿ.",
  },
  "Sending a new OTP…": { te: "కొత్త OTP పంపుతున్నాం…", kn: "ಹೊಸ OTP ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…" },
  "Sending your OTP…": { te: "మీ OTP పంపుతున్నాం…", kn: "ನಿಮ್ಮ OTP ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…" },
  "A new OTP was sent. Enter the latest six-digit code.": {
    te: "కొత్త OTP పంపాము. తాజాగా వచ్చిన 6 అంకెల కోడ్ ఇవ్వండి.",
    kn: "ಹೊಸ OTP ಕಳುಹಿಸಲಾಗಿದೆ. ಇತ್ತೀಚೆಗೆ ಬಂದ 6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ.",
  },
  "OTP sent. Enter the six-digit code.": {
    te: "OTP పంపాము. 6 అంకెల కోడ్ ఇవ్వండి.",
    kn: "OTP ಕಳುಹಿಸಲಾಗಿದೆ. 6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ.",
  },
  "Enter the six-digit OTP.": { te: "6 అంకెల OTP ఇవ్వండి.", kn: "6 ಅಂಕಿಯ OTP ನಮೂದಿಸಿ." },
  "Checking your OTP…": { te: "మీ OTP చూస్తున్నాం…", kn: "ನಿಮ್ಮ OTP ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…" },
  "Verified. Opening your kitchen…": {
    te: "నిర్ధారణ అయింది. మీ వంటగది తెరుస్తున్నాం…",
    kn: "ಪರಿಶೀಲನೆ ಆಗಿದೆ. ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆಯುತ್ತಿದೆ…",
  },
  "Request a new OTP.": { te: "కొత్త OTP అడగండి.", kn: "ಹೊಸ OTP ಕೇಳಿ." },
  "Enter a 10-digit mobile number.": {
    te: "10 అంకెల మొబైల్ నంబర్ ఇవ్వండి.",
    kn: "10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ.",
  },
  "Indian mobile numbers start with 6, 7, 8 or 9.": {
    te: "భారత మొబైల్ నంబర్లు 6, 7, 8 లేదా 9 తో మొదలవుతాయి.",
    kn: "ಭಾರತದ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಗಳು 6, 7, 8 ಅಥವಾ 9 ರಿಂದ ಶುರುವಾಗುತ್ತವೆ.",
  },
  "We couldn’t sign you in. Check the code and try again, or request a new code.": {
    te: "సైన్ ఇన్ చేయలేకపోయాం. కోడ్ చూసి మళ్లీ ప్రయత్నించండి, లేదా కొత్త కోడ్ అడగండి.",
    kn: "ಸೈನ್ ಇನ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ. ಕೋಡ್ ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಹೊಸ ಕೋಡ್ ಕೇಳಿ.",
  },
  "Sign-in failed. Please try again.": { te: "సైన్ ఇన్ కాలేదు. మళ్లీ ప్రయత్నించండి.", kn: "ಸೈನ್ ಇನ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ." },
  // phoneCodeRequestError
  "Too many verification attempts. Please try again later.": {
    te: "చాలా సార్లు ప్రయత్నించారు. కొంతసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
    kn: "ತುಂಬಾ ಸಲ ಪ್ರಯತ್ನಿಸಿದ್ದೀರಿ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "Phone sign-in is temporarily unavailable. Please try again later.": {
    te: "ఫోన్ సైన్ ఇన్ ప్రస్తుతం పని చేయడం లేదు. కొంతసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
    kn: "ಫೋನ್ ಸೈನ್ ಇನ್ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "The security check timed out. Complete it and request a new code.": {
    te: "భద్రతా తనిఖీ సమయం అయిపోయింది. దాన్ని పూర్తి చేసి కొత్త కోడ్ అడగండి.",
    kn: "ಭದ್ರತಾ ಪರಿಶೀಲನೆಯ ಸಮಯ ಮುಗಿದಿದೆ. ಅದನ್ನು ಪೂರ್ಣಗೊಳಿಸಿ ಹೊಸ ಕೋಡ್ ಕೇಳಿ.",
  },
  "The verification service took too long to respond. Please try again.": {
    te: "జవాబు రావడానికి చాలా సమయం పట్టింది. మళ్లీ ప్రయత్నించండి.",
    kn: "ಉತ್ತರ ಬರಲು ತುಂಬಾ ಸಮಯ ಆಯಿತು. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "We couldn’t send the verification code. Please try again in a moment.": {
    te: "కోడ్ పంపలేకపోయాం. కొద్దిసేపట్లో మళ్లీ ప్రయత్నించండి.",
    kn: "ಕೋಡ್ ಕಳುಹಿಸಲು ಆಗಲಿಲ್ಲ. ಸ್ವಲ್ಪ ಹೊತ್ತಿನಲ್ಲಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  // phoneCodeVerifyError
  "That code didn’t match. Check the latest SMS and try again.": {
    te: "ఆ కోడ్ సరిపోలలేదు. తాజా SMS చూసి మళ్లీ ప్రయత్నించండి.",
    kn: "ಆ ಕೋಡ್ ಹೊಂದಿಕೆಯಾಗಲಿಲ್ಲ. ಇತ್ತೀಚಿನ SMS ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "This code has expired. Please request a new code.": {
    te: "ఈ కోడ్ గడువు ముగిసింది. కొత్త కోడ్ అడగండి.",
    kn: "ಈ ಕೋಡ್‌ನ ಅವಧಿ ಮುಗಿದಿದೆ. ಹೊಸ ಕೋಡ್ ಕೇಳಿ.",
  },
  "You’ve asked for several codes. Please wait a few minutes and try again.": {
    te: "మీరు చాలా కోడ్‌లు అడిగారు. కొన్ని నిమిషాలు ఆగి మళ్లీ ప్రయత్నించండి.",
    kn: "ನೀವು ಹಲವು ಕೋಡ್‌ಗಳನ್ನು ಕೇಳಿದ್ದೀರಿ. ಕೆಲವು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "Too many tries. Please wait a minute and try again.": {
    te: "చాలా సార్లు ప్రయత్నించారు. ఒక నిమిషం ఆగి మళ్లీ ప్రయత్నించండి.",
    kn: "ತುಂಬಾ ಸಲ ಪ್ರಯತ್ನಿಸಿದ್ದೀರಿ. ಒಂದು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "We couldn’t verify your number right now. Please try again shortly.": {
    te: "ఇప్పుడు మీ నంబర్‌ను నిర్ధారించలేకపోయాం. కొద్దిసేపట్లో మళ్లీ ప్రయత్నించండి.",
    kn: "ಈಗ ನಿಮ್ಮ ಸಂಖ್ಯೆಯನ್ನು ಪರಿಶೀಲಿಸಲು ಆಗಲಿಲ್ಲ. ಸ್ವಲ್ಪ ಹೊತ್ತಿನಲ್ಲಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "Verification was cancelled. Please request a new code.": {
    te: "నిర్ధారణ రద్దయింది. కొత్త కోడ్ అడగండి.",
    kn: "ಪರಿಶೀಲನೆ ರದ್ದಾಗಿದೆ. ಹೊಸ ಕೋಡ್ ಕೇಳಿ.",
  },
  "Check your internet connection and try again.": {
    te: "ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.",
    kn: "ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "Your number is verified, but we couldn’t finish setting up your account. Please try again.": {
    te: "మీ నంబర్ నిర్ధారణ అయింది, కానీ మీ ఖాతా సిద్ధం చేయడం పూర్తి కాలేదు. మళ్లీ ప్రయత్నించండి.",
    kn: "ನಿಮ್ಮ ಸಂಖ್ಯೆ ಪರಿಶೀಲನೆ ಆಗಿದೆ, ಆದರೆ ನಿಮ್ಮ ಖಾತೆ ಸಿದ್ಧಪಡಿಸುವುದು ಮುಗಿಯಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  "We couldn’t verify this code. Please try again.": {
    te: "ఈ కోడ్‌ను నిర్ధారించలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    kn: "ಈ ಕೋಡ್ ಪರಿಶೀಲಿಸಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
  // Email sign-in sends the chef back here with this reason.
  "This Craves account must have a verified phone number before email sign-in can continue.": {
    te: "ఈమెయిల్‌తో సైన్ ఇన్ చేయాలంటే ఈ Craves ఖాతాకు నిర్ధారించిన ఫోన్ నంబర్ ఉండాలి.",
    kn: "ಇಮೇಲ್‌ನಿಂದ ಸೈನ್ ಇನ್ ಮಾಡಲು ಈ Craves ಖಾತೆಗೆ ಪರಿಶೀಲಿಸಿದ ಫೋನ್ ಸಂಖ್ಯೆ ಇರಬೇಕು.",
  },
};

type Stage = "phone" | "otp" | "creating-session" | "done";
type RecaptchaMode = "visible" | "invisible";

const RESEND_DELAY_SECONDS = 30;

/** The 10 national digits of a typed, pasted or autofilled number: "+91 98765 43210", "09876543210", "(98765) 43210". */
function nationalDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return (/^(?:0{0,2}91)?0?(\d{10})$/.exec(digits)?.[1] ?? digits).slice(0, 10);
}

/** "9876543210" → "98765 43210", also while it is typed. */
const groupDigits = (national: string) => national.replace(/^(\d{5})(?=\d)/, "$1 ");

/** "+919876543210" → "+91 98765 43210"; other numbers stay as they are. */
const showPhone = (e164: string) => e164.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");

/** Why this number can't get an OTP, or "" when it can. Central OTP serves Indian mobiles only. */
function phoneProblem(e164: string, indian: boolean): string {
  if (!indian)
    return /^\+[1-9]\d{7,14}$/.test(e164) ? "" : "Enter the mobile number with country code, for example +919876543210.";
  const national = e164.startsWith("+91") ? e164.slice(3) : "";
  if (!/^\d{10}$/.test(national)) return "Enter a 10-digit mobile number.";
  return /^[6-9]/.test(national) ? "" : "Indian mobile numbers start with 6, 7, 8 or 9.";
}

/**
 * Phone OTP sign-in shared by /sign-in, the admin portal and Chef Mode; customers and chefs can switch to email & password.
 * centralOtp=false: this host has no central MSG91 OTP (admin portal), so sign in with Firebase phone auth.
 */
export function PhoneAuthForm({
  returnTo,
  centralOtp = true,
  anyCountry = false,
  initialPhone,
  onSignedIn,
  heading,
  email = false,
}: {
  returnTo?: string;
  centralOtp?: boolean;
  /** Admin portal only: any country code. Chefs and customers type a +91 mobile, whichever OTP service runs. */
  anyCountry?: boolean;
  /** The signed-in customer's number; shown with "Use another number". */
  initialPhone?: string;
  /** Takes over once the session exists (Chef Mode) instead of opening returnTo. */
  onSignedIn?: (identity: CravesIdentity) => Promise<void> | void;
  /** Replaces the title and line under it, for example when switching over from Chef Mode. */
  heading?: { title: string; text: string };
  /** Opens on email & password (the landing popup's link). */
  email?: boolean;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const translate = (english: string) => (language === "en" ? english : (SENTENCES[english]?.[language] ?? english));
  const destination = safeReturnPath(returnTo);
  const chefJourney = destination.startsWith("/chef");
  // The admin portal (anyCountry) signs in by phone only.
  const [method, setMethod] = useState<"phone" | "email">(email && !anyCountry ? "email" : "phone");
  // E.164 (+919876543210); the +91 field edits only the national digits after the prefix.
  const [phone, setPhone] = useState(initialPhone ?? "+91");
  const [phoneError, setPhoneError] = useState("");
  const [prefilled, setPrefilled] = useState(Boolean(initialPhone));
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState<CodeSlotsStatus>("idle");
  const verifying = useRef(false);
  const [stage, setStage] = useState<Stage>("phone");
  const [message, setMessage] = useState(
    "Use your mobile number to receive a one-time password.",
  );
  const [busy, setBusy] = useState(false);
  // Why email sign-in sent the person back here; an alert, so it is read out as the phone view appears.
  const [notice, setNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const confirmation = useRef<PhoneConfirmation | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const sendButton = useRef<HTMLButtonElement>(null);

  const clearVerifier = useCallback(() => {
    verifier.current?.clear();
    verifier.current = null;
  }, []);

  useEffect(() => () => { clearVerifier(); parkMsg91Captcha(); }, [clearVerifier]);

  useEffect(() => {
    if (stage !== "otp" || resendIn <= 0) return;
    const timer = window.setTimeout(
      () => setResendIn((current) => Math.max(0, current - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendIn, stage]);

  async function recaptcha(mode: RecaptchaMode): Promise<RecaptchaVerifier> {
    clearVerifier();
    const { auth } = getFirebaseBrowserClient();
    const visible = mode === "visible";
    const instance = new RecaptchaVerifier(
      auth,
      visible ? "craves-recaptcha" : "craves-recaptcha-resend",
      {
        size: visible ? "normal" : "invisible",
        callback: () => {
          if (visible)
            setMessage("Security check completed. You can request the OTP.");
        },
        "expired-callback": () => {
          if (visible)
            setMessage("The security check expired. Complete it again.");
        },
      },
    );
    await instance.render();
    verifier.current = instance;
    return instance;
  }

  async function sendOtp(isResend: boolean) {
    const normalized = phone.replace(/[\s()-]/g, "");
    const problem = phoneProblem(normalized, !anyCountry);
    if (problem) {
      setPhoneError(problem);
      phoneInput.current?.focus();
      return;
    }

    setBusy(true);
    setMessage(
      chefJourney
        ? isResend
          ? "Sending a new OTP…"
          : "Sending your OTP…"
        : isResend
          ? "Requesting a new verification code…"
          : "Requesting your verification code…",
    );
    try {
      if (isResend && confirmation.current?.resend) {
        await confirmation.current.resend();
      } else {
        const msg91 = centralOtp ? await beginMsg91PhoneSignIn(normalized, "craves-recaptcha") : null;
        if (msg91) confirmation.current = msg91;
        else {
          const { auth } = getFirebaseBrowserClient();
          confirmation.current = await signInWithPhoneNumber(
            auth, normalized, await recaptcha(isResend ? "invisible" : "visible"),
          );
        }
      }
      clearVerifier();
      setOtp("");
      setStage("otp");
      setNotice("");
      setOtpStatus("idle");
      setResendIn(RESEND_DELAY_SECONDS);
      setMessage(
        isResend
          ? "A new OTP was sent. Enter the latest six-digit code."
          : "OTP sent. Enter the six-digit code.",
      );
    } catch (error) {
      clearVerifier();
      setMessage(phoneCodeRequestError(error));
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    await sendOtp(false);
  }

  async function resendOtp() {
    if (busy || resendIn > 0) return;
    await sendOtp(true);
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    await verifyCode(otp);
  }

  /** Checks a complete code: from Verify OTP, or by itself once the last digit lands. */
  async function verifyCode(code: string) {
    if (verifying.current) return;
    if (!confirmation.current || !/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit OTP.");
      setOtpStatus("error");
      return;
    }
    verifying.current = true;
    setBusy(true);
    setStage("creating-session");
    setOtpStatus("verifying");
    setMessage(chefJourney ? "Checking your OTP…" : "Verifying OTP and creating your Craves session…");
    try {
      const credential = await confirmation.current.confirm(code);
      const firebaseIdToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ firebaseIdToken }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        identity?: CravesIdentity;
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? "We couldn’t sign you in. Check the code and try again, or request a new code.");
      setStage("done");
      setOtpStatus("success");
      setMessage(chefJourney ? "Verified. Opening your kitchen…" : "Signed in successfully.");
      // No wait: the next page starts loading now and the accepted wave plays meanwhile.
      await openSignedIn(body.identity);
    } catch (error) {
      setStage("otp");
      setOtpStatus("error");
      setMessage(phoneCodeVerifyError(error));
      // After the shake, clear the slots so the code can be typed again from the first digit.
      window.setTimeout(() => setOtp((current) => (current === code ? "" : current)), 600);
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  /** Once the session exists, after an OTP or email & password. */
  async function openSignedIn(identity: CravesIdentity | undefined) {
    // A customer sign-in opens the customer app on this device; Chef Mode keeps its own check.
    if (!chefJourney && identity?.id) markCustomerModeVerified(identity.id);
    if (onSignedIn) {
      if (!identity?.id) throw new Error("Sign-in failed. Please try again.");
      await onSignedIn(identity);
    } else {
      // Replace, so Back from the signed-in page never returns to this sign-in form.
      window.location.replace(destination);
    }
  }

  function backToPhone(reason?: string) {
    setMethod("phone");
    setNotice(reason ?? "");
    // A prefilled number has no field, so Send OTP takes focus instead.
    requestAnimationFrame(() => (phoneInput.current ?? sendButton.current)?.focus());
  }

  function useAnotherNumber() {
    clearVerifier();
    confirmation.current = null;
    setOtp("");
    setOtpStatus("idle");
    setResendIn(0);
    setPrefilled(false);
    setStage("phone");
    setMessage("Request a new OTP.");
    requestAnimationFrame(() => phoneInput.current?.focus());
  }

  function enterAnotherNumber() {
    setPrefilled(false);
    setPhone("+91");
    setPhoneError("");
    requestAnimationFrame(() => phoneInput.current?.focus());
  }

  /** Keeps `phone` as +91 and the national digits, shown as "98765 43210". */
  function changeNationalNumber(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const typed = input.value.replace(/\D/g, "");
    const next = nationalDigits(input.value);
    // The caret stays after the same digit as the space comes and goes; a stripped +91/0 prefix or a
    // dropped 11th digit puts it at the end. Delete on the space steps over it instead of sticking.
    const before = typed === next
      ? input.value.slice(0, input.selectionStart ?? undefined).replace(/\D/g, "").length
      : next.length;
    const forward = (event.nativeEvent as InputEvent).inputType === "deleteContentForward";
    const caret = before + (before > 5 || (forward && before === 5 && next.length > 5) ? 1 : 0);
    input.value = groupDigits(next);
    input.setSelectionRange(caret, caret);
    setPhone(`+91${next}`);
    setPhoneError("");
  }

  const otpStage = stage !== "phone";
  const phoneHelp = [phoneError && "phone-error", notice && "phone-notice"].filter(Boolean).join(" ") || undefined;
  // Each language puts the number in its own place: "Sent to {phone}", "{phone} కు పంపాము".
  const [sentBefore, sentAfter] = text.sentTo.split("{phone}");

  if (method === "email") return <EmailSignInForm chef={chefJourney} onSignedIn={openSignedIn} onUsePhone={backToPhone} />;

  return (
    <section className={CARD}>
      {chefJourney ? null : (
        <p className="text-sm font-semibold text-[#C4200F]">Secure Craves access</p>
      )}
      <h1 className={`text-3xl font-bold tracking-tight text-[#1A1A1A] ${chefJourney ? "" : "mt-2"}`}>
        {heading?.title ?? (chefJourney ? text.title : "Sign in with mobile OTP")}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">
        {heading?.text ??
          (chefJourney ? text.intro : "Use one mobile number for both customer and chef mode.")}
      </p>

      {/* noValidate: the number and the code are checked here, with the reason shown under the field. */}
      <form
        className="mt-7 space-y-4"
        noValidate
        onSubmit={otpStage ? verifyOtp : requestOtp}
      >
        {otpStage ? (
          <>
            <div>
              <label
                className="block text-left text-sm font-semibold text-[#1A1A1A]"
                htmlFor="otp"
              >
                {text.otp}
              </label>
              <div className="flex items-center justify-between gap-3">
                <p id="otp-sent-to" className="min-w-0 text-left text-sm text-[#6B6B6B]">
                  {sentBefore}
                  <span className="font-semibold tabular-nums text-[#1A1A1A]">{showPhone(phone)}</span>
                  {sentAfter}
                </p>
                <button
                  type="button"
                  className={`${TEXT_BUTTON} -my-2 -mr-3`}
                  aria-label={text.changeNumber}
                  disabled={busy || stage === "done"}
                  onClick={useAnotherNumber}
                >
                  {text.change}
                </button>
              </div>
            </div>
            <CodeSlots
              id="otp"
              length={6}
              value={otp}
              status={otpStatus}
              onChange={(next) => {
                setOtp(next);
                if (otpStatus !== "verifying" && otpStatus !== "success") setOtpStatus("idle");
              }}
              onComplete={(code) => void verifyCode(code)}
              // Read-only while checking, never disabled: on touch the field keeps focus and the keypad stays up.
              readOnly={busy}
              disabled={stage === "done"}
              aria-describedby={otpStatus === "error" ? "otp-sent-to otp-error" : "otp-sent-to"}
              // Mounts only after "Send OTP", replacing the focused phone field.
              autoFocus
              required
            />
            {/* A wrong code is explained right under the boxes, not below the buttons. */}
            {otpStatus === "error" ? (
              <p id="otp-error" role="alert" className="text-left text-sm font-medium text-[#C4200F]">
                {translate(message)}
              </p>
            ) : null}
          </>
        ) : prefilled ? (
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-[#F1F3F5] py-2 pl-4 pr-2">
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#6B6B6B]">{text.signedInAs}</span>
              <strong className="block text-base tabular-nums text-[#1A1A1A]">{showPhone(phone)}</strong>
            </span>
            <button
              type="button"
              className={TEXT_BUTTON}
              disabled={busy}
              onClick={enterAnotherNumber}
            >
              {text.useAnother}
            </button>
          </div>
        ) : (
          <>
            <label
              className="block text-left text-sm font-semibold text-[#1A1A1A]"
              htmlFor="phone"
            >
              {text.mobile}
            </label>
            {!anyCountry ? (
              // Indian mobiles: +91 is fixed and only the 10 digits are typed.
              <div
                className={`flex h-14 items-center overflow-hidden rounded-2xl border bg-white transition-[border-color,box-shadow] duration-150 focus-within:outline-hidden focus-within:ring-4 focus-within:ring-[#1A1A1A]/10 motion-reduce:transition-none ${phoneError ? "border-[#C4200F]" : "border-[#E5E7EB] focus-within:border-[#F62E18]"}`}
              >
                <label
                  htmlFor="phone"
                  className="flex h-full shrink-0 items-center pl-4 pr-3 text-xl font-semibold tabular-nums text-[#1A1A1A]"
                >
                  +91
                </label>
                <span aria-hidden="true" className="h-6 w-px shrink-0 bg-[#E5E7EB]" />
                {/* Theme rules paint every input; ! keeps this one borderless inside the field. */}
                <input
                  id="phone"
                  ref={phoneInput}
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder={text.tenDigits}
                  className="h-full min-w-0 flex-1 !border-0 bg-transparent pl-3 pr-4 text-xl font-semibold tabular-nums tracking-[0.02em] text-[#1A1A1A] !outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-[#6B6B6B]"
                  value={groupDigits(phone.slice(3))}
                  onChange={changeNationalNumber}
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={phoneHelp}
                  required
                />
              </div>
            ) : (
              <input
                id="phone"
                ref={phoneInput}
                className={FIELD}
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setPhoneError("");
                }}
                autoComplete="tel"
                inputMode="tel"
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneHelp}
                required
              />
            )}
          </>
        )}
        {!otpStage && phoneError ? (
          <p id="phone-error" role="alert" className="text-left text-sm font-medium text-[#C4200F]">
            {translate(phoneError)}
          </p>
        ) : null}
        {!otpStage && notice ? (
          <p id="phone-notice" role="alert" className="text-left text-sm font-medium text-[#1A1A1A]">
            {translate(notice)}
          </p>
        ) : null}

        {!otpStage && (
          <div
            id="craves-recaptcha"
            className="min-h-20 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5] p-2 empty:min-h-0 empty:border-0 empty:p-0"
          />
        )}
        <div
          id="craves-recaptcha-resend"
          className="hidden"
          aria-hidden="true"
        />

        {otpStage ? (
          <>
            {/* "Opening…" holds while the next page loads, so the button never looks ready again. */}
            <button
              className="craves-primary-action w-full"
              aria-busy={busy || stage === "done"}
              disabled={busy || stage === "done"}
            >
              {stage === "done" ? text.opening : busy ? text.signingIn : text.verify}
            </button>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={busy || resendIn > 0 || stage === "done"}
              onClick={() => void resendOtp()}
            >
              {resendIn > 0 ? format(text.resendIn, { seconds: resendIn }) : text.resend}
            </button>
          </>
        ) : (
          <>
            <button ref={sendButton} className="craves-primary-action w-full" aria-busy={busy} disabled={busy}>
              {busy ? text.requesting : text.send}
            </button>
            {anyCountry ? null : (
              <>
                <p className="flex items-center gap-3 text-sm text-[#6B6B6B] before:h-px before:flex-1 before:bg-[#E5E7EB] after:h-px after:flex-1 after:bg-[#E5E7EB]">{text.or}</p>
                <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setMethod("email")}>
                  {text.useEmail}
                </button>
              </>
            )}
          </>
        )}
      </form>

      <p
        aria-live="polite"
        className="mt-4 text-sm leading-6 text-[#1A1A1A]"
      >
        {otpStatus === "error" ? null : translate(message)}
      </p>
      <p className="mt-4 text-xs leading-5 text-[#6B6B6B]">
        {chefJourney ? text.note : "Your phone number and OTP help securely confirm your Craves account."}
      </p>
    </section>
  );
}
