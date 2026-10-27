"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowLeftRight,
  BellRing,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  Gauge,
  Gift,
  Globe,
  LifeBuoy,
  Lock,
  LogOut,
  ShieldCheck,
  Star,
  Store,
} from "lucide-react";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { switchToCustomerApp, useChefSignOut } from "@/features/chef/components/chef-account-menu";
import { useMinuteClock, useSpecialDay } from "@/features/chef/components/chef-kitchen-switch";
import { ChefPill, ChefSkeleton } from "@/features/chef/components/chef-ui";
import { useKitchenSchedule } from "@/features/chef/api/chef-kitchen-schedule";
import { documentsSummary } from "@/features/chef/lib/chef-documents";
import { chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { hoursLine, kitchenClock, kitchenOpenState } from "@/features/chef/lib/opening-hours";
import { parseOnboardingState, type OnboardingState } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import { format, LANGUAGE_NAMES, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { LanguageSheet } from "@/shared/ui/language/language-chooser";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { Dialog, secondaryActionClass } from "@/shared/ui/overlays/overlay";

type Application = { firstName: string | null; lastName: string | null; status: string };
// Read loosely: the card needs only these, and an older server may not send them all.
type Kitchen = {
  id?: string;
  kitchenName: string;
  displayName?: string | null;
  areaName?: string | null;
  city?: string | null;
  status?: string;
  chefPhotoUrl?: string | null;
};
type Rating = { average: number; count: number };
type Icon = ComponentType<{ className?: string }>;
type Text = (typeof TEXT)["en"];
type Row = { key: keyof Text; meta: keyof Text; icon: Icon } & ({ href: string } | { action: "switch" | "sign-out" });

const TEXT = messages({
  en: {
    chef: "Chef", yourKitchen: "Your kitchen", verified: "Verified chef", inProgress: "Application in progress",
    chefNamed: "Chef {name}", pausedByCraves: "Paused by Craves",
    loadFailed: "Your profile could not load. Please try again.", tryAgain: "Try again", language: "Language",
    kitchenGroup: "My kitchen", ordersGroup: "Orders", helpGroup: "Help", accountGroup: "Account",
    kitchen: "Kitchen details & photos", kitchenMeta: "Name, address and photos", hours: "Opening hours", hoursMeta: "When customers can order",
    limits: "Daily limits", limitsMeta: "How many plates you cook each day", findable: "Can customers find you?", findableMeta: "See what’s done and what’s left",
    documents: "Documents", documentsMeta: "See your documents", documentsVerified: "Verified · {what}", documentsDone: "Verified",
    reviews: "Reviews", reviewsMeta: "What customers say", ratingOne: "★ {average} · 1 review", ratingMany: "★ {average} · {count} reviews",
    orderSettings: "Order settings", orderSettingsMeta: "Order sound, auto-accept and cooking time",
    help: "Help & support", helpMeta: "Chat, call or see your tickets", refer: "Refer a chef", referMeta: "Earn when chefs you invite start cooking",
    security: "Login & security", securityMeta: "Your phone, email and account", application: "Your application", applicationMeta: "What you sent to Craves",
    switch: "Switch to customer app", switchMeta: "Order food for yourself", signOut: "Sign out", signOutMeta: "Sign out on this phone", signingOut: "Signing out…",
    switchTitle: "Switch to customer app?", switchOpen: "Your kitchen stays open, but you won’t see new orders while you are in the customer app.",
    switchClosed: "You won’t see new orders while you are in the customer app.", switchConfirm: "Switch", cancel: "Cancel",
    signOutTitle: "Sign out of Craves?", signOutText: "You’ll need to sign in again with a one-time code.", staySignedIn: "Stay signed in",
  },
  te: {
    chef: "చెఫ్", yourKitchen: "మీ వంటగది", verified: "ధృవీకరించిన చెఫ్", inProgress: "దరఖాస్తు పరిశీలనలో ఉంది",
    chefNamed: "చెఫ్ {name}", pausedByCraves: "Craves ఆపింది",
    loadFailed: "మీ ప్రొఫైల్ లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.", tryAgain: "మళ్లీ ప్రయత్నించండి", language: "భాష",
    kitchenGroup: "నా వంటగది", ordersGroup: "ఆర్డర్లు", helpGroup: "సహాయం", accountGroup: "ఖాతా",
    kitchen: "వంటగది వివరాలు, ఫోటోలు", kitchenMeta: "పేరు, చిరునామా, ఫోటోలు", hours: "వంటగది సమయాలు", hoursMeta: "కస్టమర్లు ఎప్పుడు ఆర్డర్ చేయవచ్చు",
    limits: "రోజువారీ పరిమితి", limitsMeta: "రోజుకు ఎన్ని ప్లేట్లు వండుతారు", findable: "కస్టమర్లకు మీ వంటగది కనిపిస్తుందా?", findableMeta: "ఏం పూర్తయింది, ఏం మిగిలింది చూడండి",
    documents: "పత్రాలు", documentsMeta: "మీ పత్రాలు చూడండి", documentsVerified: "ధృవీకరించబడింది · {what}", documentsDone: "ధృవీకరించబడింది",
    reviews: "రివ్యూలు", reviewsMeta: "కస్టమర్లు ఏమంటున్నారు", ratingOne: "★ {average} · 1 రివ్యూ", ratingMany: "★ {average} · {count} రివ్యూలు",
    orderSettings: "ఆర్డర్ సెట్టింగ్స్", orderSettingsMeta: "ఆర్డర్ శబ్దం, ఆటో-ఒప్పుకోవడం, వంట సమయం",
    help: "సహాయం", helpMeta: "చాట్, కాల్ లేదా మీ టికెట్లు చూడండి", refer: "చెఫ్‌ను పరిచయం చేయండి", referMeta: "మీరు పిలిచిన చెఫ్‌లు వండడం మొదలుపెడితే సంపాదించండి",
    security: "లాగిన్, భద్రత", securityMeta: "మీ ఫోన్, ఈమెయిల్, ఖాతా", application: "మీ దరఖాస్తు", applicationMeta: "మీరు Craves కు పంపిన వివరాలు",
    switch: "కస్టమర్ యాప్‌కు మారండి", switchMeta: "మీ కోసం ఆహారం ఆర్డర్ చేయండి", signOut: "సైన్ అవుట్", signOutMeta: "ఈ ఫోన్‌లో సైన్ అవుట్ చేయండి", signingOut: "సైన్ అవుట్ అవుతోంది…",
    switchTitle: "కస్టమర్ యాప్‌కు మారాలా?", switchOpen: "మీ వంటగది తెరిచే ఉంటుంది, కానీ మీరు కస్టమర్ యాప్‌లో ఉన్నంతసేపు కొత్త ఆర్డర్లు కనిపించవు.",
    switchClosed: "మీరు కస్టమర్ యాప్‌లో ఉన్నంతసేపు కొత్త ఆర్డర్లు కనిపించవు.", switchConfirm: "మారండి", cancel: "రద్దు చేయండి",
    signOutTitle: "Craves నుండి సైన్ అవుట్ చేయాలా?", signOutText: "మళ్లీ ఒక్కసారి వాడే కోడ్ (OTP) తో సైన్ ఇన్ చేయాలి.", staySignedIn: "సైన్ ఇన్‌లోనే ఉండండి",
  },
  kn: {
    chef: "ಚೆಫ್", yourKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ", verified: "ಪರಿಶೀಲಿತ ಚೆಫ್", inProgress: "ಅರ್ಜಿ ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ",
    chefNamed: "ಚೆಫ್ {name}", pausedByCraves: "Craves ನಿಲ್ಲಿಸಿದೆ",
    loadFailed: "ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", language: "ಭಾಷೆ",
    kitchenGroup: "ನನ್ನ ಅಡುಗೆಮನೆ", ordersGroup: "ಆರ್ಡರ್‌ಗಳು", helpGroup: "ಸಹಾಯ", accountGroup: "ಖಾತೆ",
    kitchen: "ಅಡುಗೆಮನೆ ವಿವರಗಳು, ಫೋಟೋಗಳು", kitchenMeta: "ಹೆಸರು, ವಿಳಾಸ, ಫೋಟೋಗಳು", hours: "ಅಡುಗೆಮನೆ ಸಮಯ", hoursMeta: "ಗ್ರಾಹಕರು ಯಾವಾಗ ಆರ್ಡರ್ ಮಾಡಬಹುದು",
    limits: "ದಿನದ ಮಿತಿ", limitsMeta: "ದಿನಕ್ಕೆ ಎಷ್ಟು ಪ್ಲೇಟ್ ಅಡುಗೆ ಮಾಡುತ್ತೀರಿ", findable: "ಗ್ರಾಹಕರಿಗೆ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಕಾಣುತ್ತದೆಯೇ?", findableMeta: "ಏನು ಮುಗಿದಿದೆ, ಏನು ಉಳಿದಿದೆ ನೋಡಿ",
    documents: "ದಾಖಲೆಗಳು", documentsMeta: "ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ನೋಡಿ", documentsVerified: "ಪರಿಶೀಲಿಸಲಾಗಿದೆ · {what}", documentsDone: "ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
    reviews: "ರಿವ್ಯೂಗಳು", reviewsMeta: "ಗ್ರಾಹಕರು ಏನು ಹೇಳುತ್ತಾರೆ", ratingOne: "★ {average} · 1 ರಿವ್ಯೂ", ratingMany: "★ {average} · {count} ರಿವ್ಯೂಗಳು",
    orderSettings: "ಆರ್ಡರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು", orderSettingsMeta: "ಆರ್ಡರ್ ಶಬ್ದ, ಸ್ವಯಂ ಒಪ್ಪಿಗೆ, ಅಡುಗೆ ಸಮಯ",
    help: "ಸಹಾಯ", helpMeta: "ಚಾಟ್, ಕರೆ ಅಥವಾ ನಿಮ್ಮ ಟಿಕೆಟ್‌ಗಳನ್ನು ನೋಡಿ", refer: "ಚೆಫ್ ಅವರನ್ನು ಪರಿಚಯಿಸಿ", referMeta: "ನೀವು ಕರೆದ ಚೆಫ್‌ಗಳು ಅಡುಗೆ ಶುರು ಮಾಡಿದಾಗ ಗಳಿಸಿ",
    security: "ಲಾಗಿನ್, ಭದ್ರತೆ", securityMeta: "ನಿಮ್ಮ ಫೋನ್, ಇಮೇಲ್, ಖಾತೆ", application: "ನಿಮ್ಮ ಅರ್ಜಿ", applicationMeta: "ನೀವು Craves ಗೆ ಕಳುಹಿಸಿದ ವಿವರಗಳು",
    switch: "ಗ್ರಾಹಕ ಆ್ಯಪ್‌ಗೆ ಬದಲಿಸಿ", switchMeta: "ನಿಮಗಾಗಿ ಊಟ ಆರ್ಡರ್ ಮಾಡಿ", signOut: "ಸೈನ್ ಔಟ್", signOutMeta: "ಈ ಫೋನ್‌ನಲ್ಲಿ ಸೈನ್ ಔಟ್ ಮಾಡಿ", signingOut: "ಸೈನ್ ಔಟ್ ಆಗುತ್ತಿದೆ…",
    switchTitle: "ಗ್ರಾಹಕ ಆ್ಯಪ್‌ಗೆ ಬದಲಿಸಬೇಕೇ?", switchOpen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆದೇ ಇರುತ್ತದೆ, ಆದರೆ ನೀವು ಗ್ರಾಹಕ ಆ್ಯಪ್‌ನಲ್ಲಿರುವಾಗ ಹೊಸ ಆರ್ಡರ್‌ಗಳು ಕಾಣುವುದಿಲ್ಲ.",
    switchClosed: "ನೀವು ಗ್ರಾಹಕ ಆ್ಯಪ್‌ನಲ್ಲಿರುವಾಗ ಹೊಸ ಆರ್ಡರ್‌ಗಳು ಕಾಣುವುದಿಲ್ಲ.", switchConfirm: "ಬದಲಿಸಿ", cancel: "ರದ್ದುಮಾಡಿ",
    signOutTitle: "Craves ನಿಂದ ಸೈನ್ ಔಟ್ ಆಗಬೇಕೇ?", signOutText: "ಮತ್ತೆ ಒಂದು ಬಾರಿಯ ಕೋಡ್ (OTP) ನೊಂದಿಗೆ ಸೈನ್ ಇನ್ ಮಾಡಬೇಕಾಗುತ್ತದೆ.", staySignedIn: "ಸೈನ್ ಇನ್‌ನಲ್ಲೇ ಇರಿ",
  },
});

/** Every chef page that is not a tab, grouped by job. Money and Meal plans live in their own tabs. */
const GROUPS: { title: keyof Text; rows: Row[] }[] = [
  { title: "kitchenGroup", rows: [
    { href: "/chef/kitchen", icon: Store, key: "kitchen", meta: "kitchenMeta" },
    { href: "/chef/hours", icon: Clock3, key: "hours", meta: "hoursMeta" },
    { href: "/chef/capacity", icon: Gauge, key: "limits", meta: "limitsMeta" },
    { href: "/chef/operations", icon: ShieldCheck, key: "findable", meta: "findableMeta" },
    { href: "/chef/documents", icon: FileCheck2, key: "documents", meta: "documentsMeta" },
    { href: "/chef/reviews", icon: Star, key: "reviews", meta: "reviewsMeta" },
  ] },
  { title: "ordersGroup", rows: [
    { href: "/chef/preferences", icon: BellRing, key: "orderSettings", meta: "orderSettingsMeta" },
  ] },
  { title: "helpGroup", rows: [
    { href: "/chef/support", icon: LifeBuoy, key: "help", meta: "helpMeta" },
    { href: "/chef/referrals", icon: Gift, key: "refer", meta: "referMeta" },
  ] },
  { title: "accountGroup", rows: [
    { href: "/chef/security", icon: Lock, key: "security", meta: "securityMeta" },
    { href: "/chef/application/status", icon: FileText, key: "application", meta: "applicationMeta" },
    { action: "switch", icon: ArrowLeftRight, key: "switch", meta: "switchMeta" },
    { action: "sign-out", icon: LogOut, key: "signOut", meta: "signOutMeta" },
  ] },
];

const BUTTON_ROW = "chef-row !rounded-none !border-0 !bg-transparent disabled:opacity-60";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "KPHB, Hyderabad": where the kitchen is, each place named once. */
function placeOf(kitchen: Kitchen | null): string {
  const parts = [kitchen?.areaName?.trim(), kitchen?.city?.trim()].filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(", ");
}

/** The kitchen's star rating as customers see it; null while there is none or it can't be read (the row has no chip then). */
function useRating(kitchenId: string | undefined): Rating | null {
  const [rating, setRating] = useState<Rating | null>(null);
  useEffect(() => {
    if (!kitchenId || !UUID.test(kitchenId)) return;
    let active = true;
    void sessionFetch(`/api/reviews/kitchens/${kitchenId}/summary`, { cache: "no-store" })
      .then((response) => (response.status === 200 ? response.json() : null))
      .then((body: unknown) => {
        const summary = body && typeof body === "object" ? (body as { reviewCount?: unknown; overallAverage?: unknown }) : {};
        const { reviewCount: count, overallAverage: average } = summary;
        if (active && typeof count === "number" && count > 0 && typeof average === "number")
          setRating({ average, count });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [kitchenId]);
  return rating;
}

function RowContent({ icon: RowIcon, title, meta, chevron, danger = false, chip }: { icon: Icon; title: string; meta: string; chevron: boolean; danger?: boolean; chip?: string }) {
  return <>
    <span className="chef-row-icon"><RowIcon className="h-5 w-5" aria-hidden="true" /></span>
    <span className="chef-row-main">
      <span className={`chef-row-title block ${danger ? "!text-[#C4200F]" : ""}`}>{title}</span>
      <span className="chef-row-meta block">{meta}</span>
    </span>
    {chip ? <ChefPill tone="active" plain>{chip}</ChefPill> : null}
    {chevron ? <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" /> : null}
  </>;
}

/** Profile: who you are, your language, then every other chef page grouped by job, with what each one holds now. */
export function ChefMoreHub() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [application, setApplication] = useState<Application | null>(null);
  const [kitchen, setKitchen] = useState<Kitchen | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [leaving, setLeaving] = useState<"switch" | "sign-out" | null>(null);
  const signOut = useChefSignOut();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      sessionFetch("/api/chef/application", { cache: "no-store" }),
      sessionFetch("/api/chef/kitchen", { cache: "no-store" }),
    ])
      .then(async ([applicationResponse, kitchenResponse]) => {
        if (!applicationResponse.ok) throw chefApiError(applicationResponse, await applicationResponse.json().catch(() => null), text.loadFailed);
        if (!kitchenResponse.ok) throw chefApiError(kitchenResponse, await kitchenResponse.json().catch(() => null), text.loadFailed);
        const applicationValue = await applicationResponse.json().catch(() => null);
        const kitchenValue = await kitchenResponse.json().catch(() => null);
        if (active) {
          setApplication(applicationValue);
          setKitchen(kitchenValue);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(chefErrorText(cause, text.loadFailed));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
    // The fallback sentence is in the chef's language, so a language change reloads with it.
  }, [retry, text.loadFailed]);

  // The documents from the application, for the Documents row. A chef who joined on the old form has none
  // (or the read fails): no Documents row then, as in the app (1.34.6).
  useEffect(() => {
    let active = true;
    void sessionFetch("/api/chef/onboarding", { cache: "no-store" })
      .then(async (response) => (response.ok ? parseOnboardingState(await response.json().catch(() => null)) : null))
      .then((state) => {
        if (active) setOnboarding(state);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // The Opening hours line: where the kitchen is now. It waits for the schedule's answer, so it never says
  // "Open now" before the hours can say "Closed"; without hours it reads the kitchen alone, as the switch does.
  const view = useKitchenSchedule();
  const schedule = view.state === "ready" ? view.schedule : null;
  const now = useMinuteClock();
  const special = useSpecialDay(schedule, schedule && kitchenClock(now, schedule.timezoneId).date);
  const status = typeof kitchen?.status === "string" ? kitchen.status : null;
  const hours = status && view.state !== "loading" ? hoursLine(kitchenOpenState(status, schedule, now, special, language), language) : null;
  const rating = useRating(kitchen?.id);

  const personName = [application?.firstName, application?.lastName].filter(Boolean).join(" ");
  const name = personName || text.chef;
  const approved = application?.status === "APPROVED";
  const suspended = status === "SUSPENDED";
  const place = placeOf(kitchen);
  // As in the app: the kitchen's name on top, then "Chef Lakshmi · Madhapur".
  const chefName = kitchen ? kitchen.displayName?.trim() || personName : "";
  const who = [chefName ? format(text.chefNamed, { name: chefName }) : null, place || null].filter(Boolean).join(" · ");
  const hasDocuments = Boolean(onboarding?.documents.length);
  const summary = onboarding ? documentsSummary(onboarding, language) : "";
  const live: Partial<Record<keyof Text, string>> = {
    ...(hours ? { hoursMeta: hours } : {}),
    ...(approved ? { documentsMeta: summary ? format(text.documentsVerified, { what: summary }) : text.documentsDone } : {}),
  };
  const chips: Partial<Record<keyof Text, string>> = rating
    ? { reviews: format(rating.count === 1 ? text.ratingOne : text.ratingMany, { average: rating.average.toFixed(1), count: rating.count }) }
    : {};
  return (
    <div className="chef-stack">
      <section className="chef-section" aria-busy={loading}>
        {loading ? (
          <div className="flex items-center gap-4 p-4"><ChefSkeleton className="h-14 w-14 !rounded-full" /><div className="grid flex-1 gap-2"><ChefSkeleton className="h-4 w-1/2" /><ChefSkeleton className="h-3 w-1/3" /></div></div>
        ) : error ? (
          <div className="p-4">
            <p role="alert" className="text-[0.9375rem] text-[#1A1A1A]">{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="chef-btn is-primary mt-4">{text.tryAgain}</button>
          </div>
        ) : (
          // The card is the way into Kitchen details: name, address and photos.
          <Link href="/chef/kitchen" className="flex items-center gap-4 p-4 text-inherit no-underline md:p-5">
            <ChefFace photoUrl={kitchen?.chefPhotoUrl} name={name} size={56} />
            <span className="min-w-0 flex-1">
              <h2 className="truncate font-display text-xl font-bold text-[#1A1A1A]">{kitchen?.kitchenName || name}</h2>
              <span className="mt-0.5 block truncate text-[0.9375rem] text-[#6B6B6B]">{who || (kitchen ? name : text.yourKitchen)}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                {suspended ? <ChefPill tone="danger">{text.pausedByCraves}</ChefPill> : null}
                {approved ? <ChefPill tone="success">{text.verified}</ChefPill> : <ChefPill tone="warning">{text.inProgress}</ChefPill>}
              </span>
            </span>
            <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
          </Link>
        )}
      </section>

      {/* The language comes first: a chef who picked the wrong one must find this without reading it. */}
      <div className="chef-section chef-list">
        <button type="button" className={BUTTON_ROW} aria-haspopup="dialog" aria-expanded={languageOpen} onClick={() => setLanguageOpen(true)}>
          <span className="chef-row-icon"><Globe className="h-5 w-5" aria-hidden="true" /></span>
          <span className="chef-row-main">
            <span className="chef-row-title block">{language === "en" ? text.language : `${text.language} · Language`}</span>
            <span className="chef-row-meta block" lang={language}>{LANGUAGE_NAMES[language].native}</span>
          </span>
          <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <LanguageSheet open={languageOpen} onOpenChange={setLanguageOpen} />

      {GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`more-${group.title}`}>
          <h2 id={`more-${group.title}`} className="mb-2 px-1 text-[0.8125rem] font-semibold text-[#6B6B6B]">{text[group.title]}</h2>
          <div className="chef-section chef-list">
            {group.rows.filter((row) => row.key !== "documents" || hasDocuments).map((row) =>
              "href" in row ? (
                <Link key={row.key} href={row.href} className="chef-row">
                  <RowContent icon={row.icon} title={text[row.key]} meta={live[row.meta] ?? text[row.meta]} chip={chips[row.key]} chevron />
                </Link>
              ) : (
                // Leaving Chef Mode asks first, as in the app.
                <button
                  key={row.key}
                  type="button"
                  className={BUTTON_ROW}
                  aria-haspopup="dialog"
                  onClick={() => setLeaving(row.action)}
                >
                  <RowContent icon={row.icon} title={text[row.key]} meta={text[row.meta]} chevron={false} danger={row.action === "sign-out"} />
                </button>
              ),
            )}
          </div>
        </section>
      ))}

      <Dialog
        open={leaving === "switch"}
        onOpenChange={(open) => !open && setLeaving(null)}
        title={text.switchTitle}
        description={status === "ACTIVE" ? text.switchOpen : text.switchClosed}
        footer={<>
          <button type="button" className={secondaryActionClass} onClick={() => setLeaving(null)}>{text.cancel}</button>
          <button type="button" className="craves-primary-action w-full sm:w-auto" onClick={switchToCustomerApp}>{text.switchConfirm}</button>
        </>}
      />
      <Dialog
        open={leaving === "sign-out"}
        onOpenChange={(open) => !open && setLeaving(null)}
        title={text.signOutTitle}
        description={text.signOutText}
        busy={signOut.busy}
        footer={<>
          <button type="button" className={secondaryActionClass} disabled={signOut.busy} onClick={() => setLeaving(null)}>{text.staySignedIn}</button>
          <button type="button" className="craves-primary-action w-full sm:w-auto" disabled={signOut.busy} aria-busy={signOut.busy} onClick={() => void signOut.signOut()}>{signOut.busy ? text.signingOut : text.signOut}</button>
        </>}
      >
        {signOut.error ? <p role="alert" className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">{signOut.error}</p> : null}
      </Dialog>
    </div>
  );
}
