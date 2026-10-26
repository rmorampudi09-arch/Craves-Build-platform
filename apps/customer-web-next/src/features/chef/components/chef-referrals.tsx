"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  FileText,
  Gift,
  Info,
  Loader2,
  Share2,
} from "lucide-react";
import {
  enrollInChefReferrals,
  fetchChefReferralEarnings,
  fetchReferralCode,
  fetchReferralOverview,
  ReferralError,
} from "@/features/chef/api/chef-referrals";
import {
  ChefEmpty,
  ChefFlash,
  ChefSection,
  ChefSkeleton,
  timeAgo,
} from "@/features/chef/components/chef-ui";
import { CHEF_ERROR_MESSAGES, chefErrorWords } from "@/features/chef/lib/chef-errors";
import {
  REFERRAL_NOT_ENROLLED,
  REFERRAL_TERMS_CHANGED,
  referralRupees,
  type ChefReferralEarnings,
  type ReferralCode,
  type ReferralOverview,
} from "@/features/chef/lib/chef-referral-contract";
import {
  CHEF_REFERRAL_RATES_BPS,
  CHEF_REFERRAL_TERMS,
  CHEF_REFERRAL_TERMS_VERSION_LABEL,
} from "@/features/chef/lib/chef-referral-terms";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { Sheet } from "@/shared/ui/overlays/overlay";

// The terms themselves stay in English (chef-referral-terms.ts, word for word); the screen around them reads in the chef's language.
const TEXT = messages({
  en: {
    loadFailed: "Check your connection and try again.", soon: "Coming soon", tryAgain: "Try again", couldNotLoad: "We couldn’t load this",
    joinSoonTitle: "Joining is coming soon", joinSoonText: "You’ll be able to join the referral programme here soon.",
    settingUp: "Setting up your invite link…", slow: "Your invite link is still being set up. Check again in a few minutes.",
    termsChanged: "The referral terms have changed. Joining will be back here soon.", checkFailed: "We couldn’t check right now. Try again.",
    checkAgain: "Check again", joinTitle: "Join the chef referral programme",
    joinShare: "You earn a share of the food sales of chefs you invite, and of the chefs they invite, up to three levels. It comes from Craves’ commission, never from their earnings.",
    noReferrer: "You already have an account, so you join without a referrer.", held: "Rewards are held for 24 hours before they count.",
    readTerms: "Read the full terms", termsInEnglish: "Terms are in English.", accept: "I accept the referral terms",
    joining: "Joining…", join: "Join", terms: "Referral terms",
    earningsSoonTitle: "Referral earnings are on their way", earningsSoonText: "The credits you earn from chefs you invite will be listed here soon.",
    earnings: "Referral earnings", monthNote: "{used} this month · limit {cap}", thisMonth: "This month", ofLimit: "of {cap} monthly limit",
    limitUsed: "This month’s referral limit used", left: "{left} left this month", credits: "Credits", noCredits: "No referral credits yet",
    reversal: "Referral reversal", credit: "Referral credit", addedToEarnings: "Referral credits are added to your chef earnings.",
    copyFailed: "We couldn’t copy it. Select the code and copy it yourself.",
    invite: "Join Craves as a home chef.\nReferral code: {code}\n{link}", inviteCopied: "Invite copied. Paste it in a message.",
    loadingInvite: "Loading your invite", soonTitle: "Referrals are on their way",
    soonText: "Inviting other chefs and seeing what you earn will be here soon.", inviteTitle: "Invite home chefs you know",
    inviteShare: "You earn a share of the sales of chefs you invite.", yourCode: "Your referral code: ", copied: "Copied", copy: "Copy",
    shareInvite: "Share invite", joined: "Joined", onHold: "On hold", earned: "Earned", howItWorks: "How it works", rates: "Rates and rules",
    levelOne: "Level 1 · Direct referrals", level: "Level {number}",
    heldNote: "Each credit is held for 24 hours before it counts. Joining alone does not earn a reward.",
  },
  te: {
    loadFailed: "ఇంటర్నెట్ చూసుకుని మళ్లీ ప్రయత్నించండి.", soon: "త్వరలో వస్తుంది", tryAgain: "మళ్లీ ప్రయత్నించండి", couldNotLoad: "దీన్ని లోడ్ చేయలేకపోయాం",
    joinSoonTitle: "చేరడం త్వరలో వస్తుంది", joinSoonText: "త్వరలో ఇక్కడ రెఫరల్ ప్రోగ్రామ్‌లో చేరవచ్చు.",
    settingUp: "మీ ఆహ్వాన లింక్ సిద్ధం చేస్తున్నాం…", slow: "మీ ఆహ్వాన లింక్ ఇంకా సిద్ధం అవుతోంది. కొన్ని నిమిషాల తర్వాత మళ్లీ చూడండి.",
    termsChanged: "రెఫరల్ నిబంధనలు మారాయి. చేరడం త్వరలో మళ్లీ ఇక్కడ వస్తుంది.", checkFailed: "ఇప్పుడు చూడలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    checkAgain: "మళ్లీ చూడండి", joinTitle: "చెఫ్ రెఫరల్ ప్రోగ్రామ్‌లో చేరండి",
    joinShare: "మీరు ఆహ్వానించిన చెఫ్‌ల, వారు ఆహ్వానించిన చెఫ్‌ల ఆహార అమ్మకాల్లో మూడు స్థాయిల వరకు మీకు వాటా వస్తుంది. ఇది Craves కమీషన్ నుండి వస్తుంది, వారి సంపాదన నుండి ఎప్పుడూ కాదు.",
    noReferrer: "మీకు ఇప్పటికే ఖాతా ఉంది, కాబట్టి ఎవరి రెఫరల్ లేకుండా చేరతారు.", held: "బహుమతులు లెక్కలోకి రావడానికి ముందు 24 గంటలు ఆపి ఉంచుతాం.",
    readTerms: "పూర్తి నిబంధనలు చదవండి", termsInEnglish: "నిబంధనలు ఇంగ్లీష్‌లో ఉన్నాయి.", accept: "రెఫరల్ నిబంధనలు నేను ఒప్పుకుంటున్నాను",
    joining: "చేరుతోంది…", join: "చేరండి", terms: "రెఫరల్ నిబంధనలు",
    earningsSoonTitle: "రెఫరల్ సంపాదన త్వరలో వస్తుంది", earningsSoonText: "మీరు ఆహ్వానించిన చెఫ్‌ల నుండి మీకు వచ్చే డబ్బు త్వరలో ఇక్కడ కనిపిస్తుంది.",
    earnings: "రెఫరల్ సంపాదన", monthNote: "ఈ నెల {used} · పరిమితి {cap}", thisMonth: "ఈ నెల", ofLimit: "నెలవారీ పరిమితి {cap} లో",
    limitUsed: "ఈ నెల రెఫరల్ పరిమితిలో వాడినది", left: "ఈ నెల ఇంకా {left} మిగిలి ఉంది", credits: "వచ్చిన డబ్బు", noCredits: "ఇంకా రెఫరల్ డబ్బు రాలేదు",
    reversal: "రెఫరల్ డబ్బు వెనక్కి", credit: "రెఫరల్ డబ్బు", addedToEarnings: "రెఫరల్ డబ్బు మీ చెఫ్ సంపాదనలో కలుస్తుంది.",
    copyFailed: "కాపీ చేయలేకపోయాం. కోడ్‌ను ఎంచుకుని మీరే కాపీ చేయండి.",
    invite: "ఇంటి చెఫ్‌గా Craves లో చేరండి.\nరెఫరల్ కోడ్: {code}\n{link}", inviteCopied: "ఆహ్వానం కాపీ అయింది. మెసేజ్‌లో పేస్ట్ చేయండి.",
    loadingInvite: "మీ ఆహ్వానం లోడ్ అవుతోంది", soonTitle: "రెఫరల్స్ త్వరలో వస్తాయి",
    soonText: "ఇతర చెఫ్‌లను ఆహ్వానించడం, మీ సంపాదన చూడటం త్వరలో ఇక్కడ వస్తుంది.", inviteTitle: "మీకు తెలిసిన ఇంటి చెఫ్‌లను ఆహ్వానించండి",
    inviteShare: "మీరు ఆహ్వానించిన చెఫ్‌ల అమ్మకాల్లో మీకు వాటా వస్తుంది.", yourCode: "మీ రెఫరల్ కోడ్: ", copied: "కాపీ అయింది", copy: "కాపీ చేయండి",
    shareInvite: "ఆహ్వానం పంపండి", joined: "చేరినవారు", onHold: "ఆపి ఉంచినది", earned: "సంపాదించినది", howItWorks: "ఇది ఎలా పనిచేస్తుంది", rates: "రేట్లు, నియమాలు",
    levelOne: "స్థాయి 1 · మీరే ఆహ్వానించినవారు", level: "స్థాయి {number}",
    heldNote: "ప్రతి డబ్బు లెక్కలోకి రావడానికి ముందు 24 గంటలు ఆపి ఉంచుతాం. కేవలం చేరడం వల్ల బహుమతి రాదు.",
  },
  kn: {
    loadFailed: "ಇಂಟರ್ನೆಟ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", soon: "ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", couldNotLoad: "ಇದನ್ನು ಲೋಡ್ ಮಾಡಲು ಆಗಲಿಲ್ಲ",
    joinSoonTitle: "ಸೇರುವುದು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ", joinSoonText: "ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ರೆಫರಲ್ ಕಾರ್ಯಕ್ರಮಕ್ಕೆ ಸೇರಬಹುದು.",
    settingUp: "ನಿಮ್ಮ ಆಹ್ವಾನ ಲಿಂಕ್ ಸಿದ್ಧಪಡಿಸುತ್ತಿದ್ದೇವೆ…", slow: "ನಿಮ್ಮ ಆಹ್ವಾನ ಲಿಂಕ್ ಇನ್ನೂ ಸಿದ್ಧವಾಗುತ್ತಿದೆ. ಕೆಲವು ನಿಮಿಷಗಳ ನಂತರ ಮತ್ತೆ ನೋಡಿ.",
    termsChanged: "ರೆಫರಲ್ ನಿಯಮಗಳು ಬದಲಾಗಿವೆ. ಸೇರುವುದು ಶೀಘ್ರದಲ್ಲೇ ಮತ್ತೆ ಇಲ್ಲಿ ಬರಲಿದೆ.", checkFailed: "ಈಗ ನೋಡಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    checkAgain: "ಮತ್ತೆ ನೋಡಿ", joinTitle: "ಚೆಫ್ ರೆಫರಲ್ ಕಾರ್ಯಕ್ರಮಕ್ಕೆ ಸೇರಿ",
    joinShare: "ನೀವು ಆಹ್ವಾನಿಸಿದ ಚೆಫ್‌ಗಳ, ಅವರು ಆಹ್ವಾನಿಸಿದ ಚೆಫ್‌ಗಳ ಆಹಾರ ಮಾರಾಟದಲ್ಲಿ ಮೂರು ಹಂತಗಳವರೆಗೆ ನಿಮಗೆ ಪಾಲು ಸಿಗುತ್ತದೆ. ಇದು Craves ಕಮಿಷನ್‌ನಿಂದ ಬರುತ್ತದೆ, ಅವರ ಗಳಿಕೆಯಿಂದ ಎಂದಿಗೂ ಅಲ್ಲ.",
    noReferrer: "ನಿಮಗೆ ಈಗಾಗಲೇ ಖಾತೆ ಇದೆ, ಆದ್ದರಿಂದ ಯಾರ ರೆಫರಲ್ ಇಲ್ಲದೆ ಸೇರುತ್ತೀರಿ.", held: "ಬಹುಮಾನಗಳು ಲೆಕ್ಕಕ್ಕೆ ಬರುವ ಮೊದಲು 24 ಗಂಟೆ ತಡೆಹಿಡಿಯಲಾಗುತ್ತದೆ.",
    readTerms: "ಪೂರ್ಣ ನಿಯಮಗಳನ್ನು ಓದಿ", termsInEnglish: "ನಿಯಮಗಳು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿವೆ.", accept: "ರೆಫರಲ್ ನಿಯಮಗಳನ್ನು ನಾನು ಒಪ್ಪುತ್ತೇನೆ",
    joining: "ಸೇರಲಾಗುತ್ತಿದೆ…", join: "ಸೇರಿ", terms: "ರೆಫರಲ್ ನಿಯಮಗಳು",
    earningsSoonTitle: "ರೆಫರಲ್ ಗಳಿಕೆ ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ", earningsSoonText: "ನೀವು ಆಹ್ವಾನಿಸಿದ ಚೆಫ್‌ಗಳಿಂದ ನಿಮಗೆ ಬರುವ ಹಣ ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ಕಾಣುತ್ತದೆ.",
    earnings: "ರೆಫರಲ್ ಗಳಿಕೆ", monthNote: "ಈ ತಿಂಗಳು {used} · ಮಿತಿ {cap}", thisMonth: "ಈ ತಿಂಗಳು", ofLimit: "ತಿಂಗಳ ಮಿತಿ {cap} ರಲ್ಲಿ",
    limitUsed: "ಈ ತಿಂಗಳ ರೆಫರಲ್ ಮಿತಿಯಲ್ಲಿ ಬಳಸಿದ್ದು", left: "ಈ ತಿಂಗಳು ಇನ್ನೂ {left} ಉಳಿದಿದೆ", credits: "ಬಂದ ಹಣ", noCredits: "ಇನ್ನೂ ರೆಫರಲ್ ಹಣ ಬಂದಿಲ್ಲ",
    reversal: "ರೆಫರಲ್ ಹಣ ಹಿಂದಕ್ಕೆ", credit: "ರೆಫರಲ್ ಹಣ", addedToEarnings: "ರೆಫರಲ್ ಹಣ ನಿಮ್ಮ ಚೆಫ್ ಗಳಿಕೆಗೆ ಸೇರುತ್ತದೆ.",
    copyFailed: "ನಕಲಿಸಲು ಆಗಲಿಲ್ಲ. ಕೋಡ್ ಆಯ್ಕೆಮಾಡಿ ನೀವೇ ನಕಲಿಸಿ.",
    invite: "ಮನೆಯ ಚೆಫ್ ಆಗಿ Craves ಗೆ ಸೇರಿ.\nರೆಫರಲ್ ಕೋಡ್: {code}\n{link}", inviteCopied: "ಆಹ್ವಾನ ನಕಲಾಗಿದೆ. ಸಂದೇಶದಲ್ಲಿ ಪೇಸ್ಟ್ ಮಾಡಿ.",
    loadingInvite: "ನಿಮ್ಮ ಆಹ್ವಾನ ಲೋಡ್ ಆಗುತ್ತಿದೆ", soonTitle: "ರೆಫರಲ್‌ಗಳು ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿವೆ",
    soonText: "ಇತರ ಚೆಫ್‌ಗಳನ್ನು ಆಹ್ವಾನಿಸುವುದು, ನಿಮ್ಮ ಗಳಿಕೆ ನೋಡುವುದು ಶೀಘ್ರದಲ್ಲೇ ಇಲ್ಲಿ ಬರಲಿದೆ.", inviteTitle: "ನಿಮಗೆ ಗೊತ್ತಿರುವ ಮನೆಯ ಚೆಫ್‌ಗಳನ್ನು ಆಹ್ವಾನಿಸಿ",
    inviteShare: "ನೀವು ಆಹ್ವಾನಿಸಿದ ಚೆಫ್‌ಗಳ ಮಾರಾಟದಲ್ಲಿ ನಿಮಗೆ ಪಾಲು ಸಿಗುತ್ತದೆ.", yourCode: "ನಿಮ್ಮ ರೆಫರಲ್ ಕೋಡ್: ", copied: "ನಕಲಾಗಿದೆ", copy: "ನಕಲಿಸಿ",
    shareInvite: "ಆಹ್ವಾನ ಕಳುಹಿಸಿ", joined: "ಸೇರಿದವರು", onHold: "ತಡೆಹಿಡಿದದ್ದು", earned: "ಗಳಿಸಿದ್ದು", howItWorks: "ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ", rates: "ದರಗಳು ಮತ್ತು ನಿಯಮಗಳು",
    levelOne: "ಹಂತ 1 · ನೀವೇ ಆಹ್ವಾನಿಸಿದವರು", level: "ಹಂತ {number}",
    heldNote: "ಪ್ರತಿ ಹಣ ಲೆಕ್ಕಕ್ಕೆ ಬರುವ ಮೊದಲು 24 ಗಂಟೆ ತಡೆಹಿಡಿಯಲಾಗುತ್ತದೆ. ಕೇವಲ ಸೇರುವುದರಿಂದ ಬಹುಮಾನ ಸಿಗುವುದಿಲ್ಲ.",
  },
});

type Read<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "notJoined" }
  | { kind: "soon" }
  | { kind: "failed"; message: string };

const CHECK_EVERY_MS = 3_000;
const GIVE_UP_AFTER_MS = 60_000;
const sum = (values: string[]) => values.reduce((total, value) => total + Number(value), 0);

function asReferralError(error: unknown): ReferralError {
  return error instanceof ReferralError ? error : new ReferralError("NETWORK_ERROR", 0);
}
/** Not a member yet, or the terms the chef accepted are out of date: either way the join step shows. */
function needsJoining(error: ReferralError): boolean {
  return (
    (error.status === 403 && error.code === REFERRAL_NOT_ENROLLED) ||
    (error.status === 409 && error.code === REFERRAL_TERMS_CHANGED)
  );
}
function readFailure<T>(error: ReferralError): Read<T> {
  if (needsJoining(error)) return { kind: "notJoined" };
  if (error.code === FEATURE_NOT_AVAILABLE) return { kind: "soon" };
  // Empty: the screen's own "check your connection" line.
  return { kind: "failed", message: CHEF_ERROR_MESSAGES[error.code] ?? "" };
}

/** Why it failed, in the chef's language. */
function failureText(read: Read<unknown>, fallback: string): string {
  return (read.kind === "failed" && chefErrorWords(read.message)) || fallback;
}

function TermsList() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  return (
    <div className="grid gap-3 text-[0.875rem] leading-6 text-[#6B6B6B]">
      {language === "en" ? null : <p className="font-semibold text-[#1A1A1A]">{text.termsInEnglish}</p>}
      <ol className="grid gap-3" lang="en">
        {CHEF_REFERRAL_TERMS.map((term, index) => (
          <li key={term.title} className="whitespace-pre-line">
            <strong className="text-[#1A1A1A]">{`${index + 1}. ${term.title}`}</strong> {term.body}
          </li>
        ))}
      </ol>
      <p className="italic" lang="en">{CHEF_REFERRAL_TERMS_VERSION_LABEL}</p>
    </div>
  );
}

type JoinStep = "form" | "settingUp" | "slow" | "termsChanged" | "soon" | "failed";

/** For a chef whose account is older than the programme: read the terms, accept, join, then wait for the invite link. */
function ChefReferralJoin({
  onJoined,
  onCheck,
  checking,
}: {
  onJoined(): void;
  onCheck(): Promise<ReferralError | null>;
  checking: boolean;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [step, setStep] = useState<JoinStep>("form");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [terms, setTerms] = useState(false);
  const sending = useRef(false);

  // The invite link appears a few seconds after joining: ask every 3 s (not while the tab is hidden) for up to a minute.
  useEffect(() => {
    if (step !== "settingUp") return;
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void onCheck();
    }, CHECK_EVERY_MS);
    const giveUp = setTimeout(() => setStep("slow"), GIVE_UP_AFTER_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [step, onCheck]);

  async function join() {
    if (!accepted || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await enrollInChefReferrals();
      onJoined();
      setStep("settingUp");
    } catch (error) {
      const failure = asReferralError(error);
      setStep(
        failure.status === 409 && failure.code === REFERRAL_TERMS_CHANGED
          ? "termsChanged"
          : failure.code === FEATURE_NOT_AVAILABLE
            ? "soon"
            : "failed",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function checkAgain() {
    setCheckFailed(false);
    const error = await onCheck();
    // Not a member yet is the normal wait; any other answer means the check itself did not go through.
    setCheckFailed(error !== null && !needsJoining(error));
  }

  if (step === "soon")
    return (
      <ChefSection>
        <ChefEmpty illustration="comingSoon" title={text.joinSoonTitle} text={text.joinSoonText} />
      </ChefSection>
    );
  if (step === "failed")
    return (
      <ChefSection>
        <ChefEmpty
          illustration="loadError"
          title={text.couldNotLoad}
          text={text.loadFailed}
          action={
            <button
              type="button"
              className="chef-btn"
              aria-busy={busy}
              disabled={busy}
              onClick={() => void join()}
            >
              {text.tryAgain}
            </button>
          }
        />
      </ChefSection>
    );
  if (step !== "form")
    return (
      <ChefSection>
        <div className="grid justify-items-center gap-3 py-4 text-center">
          {step === "settingUp" ? (
            <Loader2
              className="h-6 w-6 animate-spin text-[#6B6B6B] motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
          <p
            role={step === "termsChanged" ? "alert" : "status"}
            className="text-[0.9375rem] font-semibold text-[#1A1A1A]"
          >
            {step === "settingUp" ? text.settingUp : step === "slow" ? text.slow : text.termsChanged}
          </p>
          {checkFailed ? (
            <p role="alert" className="text-[0.875rem] text-[#6B6B6B]">
              {text.checkFailed}
            </p>
          ) : null}
          {step === "termsChanged" ? null : (
            <button
              type="button"
              className="chef-btn is-block"
              aria-busy={checking}
              disabled={checking}
              onClick={() => void checkAgain()}
            >
              {text.checkAgain}
            </button>
          )}
        </div>
      </ChefSection>
    );

  return (
    <>
      <ChefSection>
        <span className="chef-empty-icon">
          <Gift className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="chef-section-title mt-3">{text.joinTitle}</h2>
        <div className="mt-1.5 grid gap-1.5 text-[0.875rem] leading-6 text-[#6B6B6B]">
          <p>{text.joinShare}</p>
          <p>{text.noReferrer}</p>
          <p>{text.held}</p>
        </div>
      </ChefSection>
      <div className="chef-section chef-list">
        <button
          type="button"
          className="chef-row w-full !border-0 !bg-transparent text-left"
          onClick={() => setTerms(true)}
        >
          <span className="chef-row-icon">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="chef-row-main">
            <span className="chef-row-title block">{text.readTerms}</span>
            {language === "en" ? null : <span className="chef-row-meta block">{text.termsInEnglish}</span>}
          </span>
          <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[0.9375rem] text-[#1A1A1A]">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[#1A1A1A]"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        {text.accept}
      </label>
      <button
        type="button"
        className="chef-btn is-primary is-block"
        aria-busy={busy}
        disabled={!accepted || busy}
        onClick={() => void join()}
      >
        {busy ? text.joining : text.join}
      </button>
      <Sheet open={terms} onOpenChange={setTerms} title={text.terms}>
        <div className="mt-4">
          <TermsList />
        </div>
      </Sheet>
    </>
  );
}

function EarningsSection({
  earnings,
  onRetry,
}: {
  earnings: Read<ChefReferralEarnings>;
  onRetry(): void;
}) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  if (earnings.kind === "soon")
    return (
      <ChefSection>
        <ChefEmpty illustration="comingSoon" title={text.earningsSoonTitle} text={text.earningsSoonText} />
      </ChefSection>
    );
  const data = earnings.kind === "ready" ? earnings.data : null;
  const cap = Number(data?.monthlyCapPaise ?? 0);
  const percent =
    data && cap > 0
      ? Math.max(0, Math.min(100, Math.round((Number(data.monthUsedPaise) / cap) * 100)))
      : 0;
  return (
    <ChefSection
      title={text.earnings}
      labelledBy="chef-referral-earnings"
      note={
        data
          ? format(text.monthNote, {
              used: referralRupees(data.monthUsedPaise),
              cap: referralRupees(data.monthlyCapPaise),
            })
          : undefined
      }
      flush
    >
      {earnings.kind === "loading" ? (
        <div className="grid gap-2 px-4 pb-4 md:px-5" aria-busy="true">
          <ChefSkeleton className="h-6 w-28 !rounded-md" />
          <ChefSkeleton className="h-2.5 w-full !rounded-full" />
        </div>
      ) : !data ? (
        <ChefEmpty
          illustration="loadError"
          title={text.couldNotLoad}
          text={failureText(earnings, text.loadFailed)}
          action={
            <button type="button" className="chef-btn" onClick={onRetry}>
              {text.tryAgain}
            </button>
          }
        />
      ) : (
        <>
          <div className="px-4 pb-4 md:px-5">
            <p className="text-[0.8125rem] font-semibold text-[#6B6B6B]">{text.thisMonth}</p>
            <p className="chef-amount font-display text-[1.75rem] font-bold leading-tight text-[#1A1A1A]">
              {referralRupees(data.monthUsedPaise)}
            </p>
            <p className="text-[0.8125rem] text-[#6B6B6B]">
              {format(text.ofLimit, { cap: referralRupees(data.monthlyCapPaise) })}
            </p>
            <div
              role="progressbar"
              aria-label={text.limitUsed}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="my-2 h-2.5 overflow-hidden rounded-full bg-[#E3E6EA]"
            >
              <div className="h-full rounded-full bg-[#C4200F]" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-[0.8125rem] text-[#6B6B6B]">
              {format(text.left, { left: referralRupees(data.monthRemainingPaise) })}
            </p>
          </div>
          <h3 className="border-t border-[#E3E6EA] px-4 pt-3 text-[0.9375rem] font-semibold text-[#1A1A1A] md:px-5">
            {text.credits}
          </h3>
          {data.recentPostings.length === 0 ? (
            <p className="px-4 py-4 text-center text-[0.9375rem] text-[#6B6B6B] md:px-5">
              {text.noCredits}
            </p>
          ) : (
            <ul className="chef-list mt-1">
              {data.recentPostings.map((posting) => {
                const reversal = Number(posting.amountPaise) < 0;
                return (
                  <li key={posting.id} className="chef-row">
                    <span className="chef-row-main">
                      <span className="chef-row-title block">
                        {reversal ? text.reversal : text.credit}
                      </span>
                      <span className="chef-row-meta block">
                        {timeAgo(posting.postedAt, undefined, language)}
                      </span>
                    </span>
                    <span
                      className={`chef-row-value chef-amount ${reversal ? "text-[#C4200F]" : ""}`}
                    >
                      {reversal ? "−" : "+"}
                      {referralRupees(Math.abs(Number(posting.amountPaise)))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-[#E3E6EA] px-4 py-3 text-[0.8125rem] text-[#6B6B6B] md:px-5">
            {text.addedToEarnings}
          </p>
        </>
      )}
    </ChefSection>
  );
}

/**
 * Refer a chef: the invite code to copy or share, what it has earned, and the rules.
 * A chef whose account is older than the programme has no code yet and joins here first.
 */
export function ChefReferrals() {
  const text = useText(TEXT);
  const [code, setCode] = useState<Read<ReferralCode>>({ kind: "loading" });
  const [earnings, setEarnings] = useState<Read<ChefReferralEarnings>>({ kind: "loading" });
  const [overview, setOverview] = useState<Read<ReferralOverview>>({ kind: "loading" });
  // True from the server taking the join request until the invite link arrives.
  const [joined, setJoined] = useState(false);
  const [checking, setChecking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [rules, setRules] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  const reading = useRef(false);
  const readCode = useCallback(async (): Promise<ReferralError | null> => {
    // One read at a time, so a slow reply can never land after (and undo) a newer one.
    if (reading.current) return null;
    reading.current = true;
    setChecking(true);
    try {
      setCode({ kind: "ready", data: await fetchReferralCode() });
      return null;
    } catch (error) {
      const failure = asReferralError(error);
      setCode(readFailure(failure));
      return failure;
    } finally {
      reading.current = false;
      setChecking(false);
    }
  }, []);
  const readEarnings = useCallback(async () => {
    setEarnings({ kind: "loading" });
    try {
      setEarnings({ kind: "ready", data: await fetchChefReferralEarnings() });
    } catch (error) {
      setEarnings(readFailure(asReferralError(error)));
    }
  }, []);
  useEffect(() => {
    void readCode();
  }, [readCode]);
  // Earnings and the overview are refused until the chef is a member: read them once the invite is there.
  const ready = code.kind === "ready";
  useEffect(() => {
    if (!ready) return;
    void readEarnings();
    fetchReferralOverview().then(
      (data) => setOverview({ kind: "ready", data }),
      (error: unknown) => setOverview(readFailure(asReferralError(error))),
    );
  }, [ready, readEarnings]);

  async function copy(value: string, done: string) {
    setProblem("");
    try {
      await navigator.clipboard.writeText(value);
      setNotice(done);
    } catch {
      setProblem(text.copyFailed);
    }
  }
  async function share(invite: ReferralCode) {
    if (sharing) return;
    // In the chef's language: it goes to chefs they know.
    const message = format(text.invite, { code: invite.code, link: invite.link });
    setSharing(true);
    try {
      if (typeof navigator.share === "function")
        await navigator.share({ text: message }).catch(() => undefined); // closing the share sheet is fine
      else await copy(message, text.inviteCopied);
    } finally {
      setSharing(false);
    }
  }

  const feedback = (
    <>
      <ChefFlash message={notice} onClose={() => setNotice("")} />
      <ChefFlash message={problem} tone="danger" onClose={() => setProblem("")} />
    </>
  );

  if (code.kind !== "ready" && (code.kind === "notJoined" || joined))
    return (
      <div className="chef-stack">
        <ChefReferralJoin checking={checking} onCheck={readCode} onJoined={() => setJoined(true)} />
      </div>
    );
  if (code.kind === "loading")
    return (
      <div className="chef-stack" aria-busy="true" aria-label={text.loadingInvite}>
        <ChefSkeleton className="h-56 w-full" />
        <ChefSkeleton className="h-24 w-full" />
      </div>
    );
  if (code.kind === "soon")
    return (
      <ChefSection>
        <ChefEmpty illustration="comingSoon" title={text.soonTitle} text={text.soonText} />
      </ChefSection>
    );
  if (code.kind !== "ready")
    return (
      <ChefSection>
        <ChefEmpty
          illustration="loadError"
          title={text.couldNotLoad}
          text={failureText(code, text.loadFailed)}
          action={
            <button
              type="button"
              className="chef-btn"
              aria-busy={checking}
              disabled={checking}
              onClick={() => void readCode()}
            >
              {text.tryAgain}
            </button>
          }
        />
      </ChefSection>
    );

  const invite = code.data;
  // The app's tiles come from the overview; null while it loads.
  const numbers =
    overview.kind === "ready"
      ? {
          joined: String(sum(overview.data.downline.map((level) => level.members))),
          onHold: referralRupees(overview.data.pendingPaise),
          earned: referralRupees(sum(overview.data.levels.map((level) => level.netEarnedPaise))),
        }
      : null;
  const noNumber = overview.kind === "loading" ? null : overview.kind === "soon" ? text.soon : "—";
  // Until the gateway publishes the overview, Earned comes from the chef earnings.
  const earnedSoFar =
    earnings.kind === "ready"
      ? referralRupees(earnings.data.netRecordedPaise)
      : earnings.kind === "loading"
        ? null
        : earnings.kind === "soon"
          ? text.soon
          : "—";
  return (
    <div className="chef-stack">
      <ChefSection>
        <div className="grid justify-items-center gap-1 text-center">
          <span className="chef-empty-icon">
            <Gift className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="chef-section-title mt-2">{text.inviteTitle}</h2>
          <p className="text-[0.875rem] text-[#6B6B6B]">{text.inviteShare}</p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border-2 border-dashed border-[#D3D7DD] bg-white py-1 pl-4 pr-1">
          <p className="min-w-0 select-all break-all font-display text-[1.0625rem] font-extrabold tracking-[0.12em] text-[#1A1A1A]">
            <span className="sr-only">{text.yourCode}</span>
            {invite.code}
          </p>
          <button
            type="button"
            className="chef-btn is-small shrink-0"
            onClick={() => void copy(invite.code, text.copied)}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {text.copy}
          </button>
        </div>
        <button
          type="button"
          className="chef-btn is-primary is-block mt-3"
          aria-busy={sharing}
          disabled={sharing}
          onClick={() => void share(invite)}
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {text.shareInvite}
        </button>
      </ChefSection>

      <ChefSection flush>
        <div className="chef-stats is-three" aria-busy={overview.kind === "loading"}>
          {(
            [
              [text.joined, numbers?.joined ?? noNumber],
              [text.onHold, numbers?.onHold ?? noNumber],
              [text.earned, numbers?.earned ?? (overview.kind === "soon" ? earnedSoFar : noNumber)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="chef-stat">
              <p className="chef-stat-label">{label}</p>
              {value === null ? (
                <ChefSkeleton className="mt-1.5 h-6 w-20 !rounded-md" />
              ) : (
                <p
                  className={
                    value === text.soon
                      ? "mt-1 text-[0.9375rem] font-semibold text-[#6B6B6B]"
                      : "chef-stat-value chef-amount"
                  }
                >
                  {value}
                </p>
              )}
            </div>
          ))}
        </div>
      </ChefSection>

      <EarningsSection earnings={earnings} onRetry={() => void readEarnings()} />

      <div className="chef-section chef-list">
        <button
          type="button"
          className="chef-row w-full !border-0 !bg-transparent text-left"
          onClick={() => setRules(true)}
        >
          <span className="chef-row-icon">
            <Info className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="chef-row-main">
            <span className="chef-row-title block">{text.howItWorks}</span>
            <span className="chef-row-meta block">{text.rates}</span>
          </span>
          <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <Sheet open={rules} onOpenChange={setRules} title={text.howItWorks}>
        {/* Sheets open outside the chef page: the theme brings the chef colours along. */}
        <div className="chef-panel-theme chef-sheet-theme mt-4">
          <ul className="chef-list rounded-xl border border-[#E3E6EA]">
            {CHEF_REFERRAL_RATES_BPS.map((bps, index) => (
              <li key={index} className="chef-row">
                <span className="chef-row-main">
                  <span className="chef-row-title block">
                    {index === 0 ? text.levelOne : format(text.level, { number: index + 1 })}
                  </span>
                </span>
                <span className="chef-row-value">{bps / 100}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.875rem] leading-6 text-[#6B6B6B]">
            {text.heldNote}
          </p>
          <h3 className="mb-2 mt-5 text-[0.9375rem] font-semibold text-[#1A1A1A]">{text.terms}</h3>
          <TermsList />
        </div>
      </Sheet>
      {feedback}
    </div>
  );
}
