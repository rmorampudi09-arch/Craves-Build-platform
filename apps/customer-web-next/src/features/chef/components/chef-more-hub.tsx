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
  Store,
} from "lucide-react";
import { sessionFetch } from "@/features/auth/api/sessionFetch";
import { switchToCustomerApp, useChefSignOut } from "@/features/chef/components/chef-account-menu";
import { ChefPill, ChefSkeleton } from "@/features/chef/components/chef-ui";
import { chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { LANGUAGE_NAMES, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { LanguageSheet } from "@/shared/ui/language/language-chooser";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";

type Application = { firstName: string | null; lastName: string | null; status: string };
type Kitchen = { kitchenName: string; chefPhotoUrl?: string | null };
type Icon = ComponentType<{ className?: string }>;
type Text = (typeof TEXT)["en"];
type Row = { key: keyof Text; meta: keyof Text; icon: Icon } & ({ href: string } | { action: "switch" | "sign-out" });

const TEXT = messages({
  en: {
    chef: "Chef", yourKitchen: "Your kitchen", verified: "Verified chef", inProgress: "Application in progress",
    loadFailed: "Your profile could not load. Please try again.", tryAgain: "Try again", language: "Language",
    kitchenGroup: "My kitchen", ordersGroup: "Orders", helpGroup: "Help", accountGroup: "Account",
    kitchen: "Kitchen details & photos", kitchenMeta: "Name, address and photos", hours: "Opening hours", hoursMeta: "When customers can order",
    limits: "Daily limits", limitsMeta: "How many plates you cook each day", findable: "Can customers find you?", findableMeta: "See what’s done and what’s left",
    documents: "Documents", documentsMeta: "Verification and your documents", orderSettings: "Order settings", orderSettingsMeta: "Order sound, auto-accept and cooking time",
    help: "Help & support", helpMeta: "Chat, call or see your tickets", refer: "Refer a chef", referMeta: "Earn when chefs you invite start cooking",
    security: "Login & security", securityMeta: "Your phone, email and account", application: "Your application", applicationMeta: "What you sent to Craves",
    switch: "Switch to customer app", switchMeta: "Order food for yourself", signOut: "Sign out", signOutMeta: "Sign out on this phone", signingOut: "Signing out…",
  },
  te: {
    chef: "చెఫ్", yourKitchen: "మీ వంటగది", verified: "ధృవీకరించిన చెఫ్", inProgress: "దరఖాస్తు పరిశీలనలో ఉంది",
    loadFailed: "మీ ప్రొఫైల్ లోడ్ కాలేదు. మళ్లీ ప్రయత్నించండి.", tryAgain: "మళ్లీ ప్రయత్నించండి", language: "భాష",
    kitchenGroup: "నా వంటగది", ordersGroup: "ఆర్డర్లు", helpGroup: "సహాయం", accountGroup: "ఖాతా",
    kitchen: "వంటగది వివరాలు, ఫోటోలు", kitchenMeta: "పేరు, చిరునామా, ఫోటోలు", hours: "వంటగది సమయాలు", hoursMeta: "కస్టమర్లు ఎప్పుడు ఆర్డర్ చేయవచ్చు",
    limits: "రోజువారీ పరిమితి", limitsMeta: "రోజుకు ఎన్ని ప్లేట్లు వండుతారు", findable: "కస్టమర్లకు మీ వంటగది కనిపిస్తుందా?", findableMeta: "ఏం పూర్తయింది, ఏం మిగిలింది చూడండి",
    documents: "పత్రాలు", documentsMeta: "ధృవీకరణ, మీ పత్రాలు", orderSettings: "ఆర్డర్ సెట్టింగ్స్", orderSettingsMeta: "ఆర్డర్ శబ్దం, ఆటో-ఒప్పుకోవడం, వంట సమయం",
    help: "సహాయం", helpMeta: "చాట్, కాల్ లేదా మీ టికెట్లు చూడండి", refer: "చెఫ్‌ను పరిచయం చేయండి", referMeta: "మీరు పిలిచిన చెఫ్‌లు వండడం మొదలుపెడితే సంపాదించండి",
    security: "లాగిన్, భద్రత", securityMeta: "మీ ఫోన్, ఈమెయిల్, ఖాతా", application: "మీ దరఖాస్తు", applicationMeta: "మీరు Craves కు పంపిన వివరాలు",
    switch: "కస్టమర్ యాప్‌కు మారండి", switchMeta: "మీ కోసం ఆహారం ఆర్డర్ చేయండి", signOut: "సైన్ అవుట్", signOutMeta: "ఈ ఫోన్‌లో సైన్ అవుట్ చేయండి", signingOut: "సైన్ అవుట్ అవుతోంది…",
  },
  kn: {
    chef: "ಚೆಫ್", yourKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ", verified: "ಪರಿಶೀಲಿತ ಚೆಫ್", inProgress: "ಅರ್ಜಿ ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ",
    loadFailed: "ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", language: "ಭಾಷೆ",
    kitchenGroup: "ನನ್ನ ಅಡುಗೆಮನೆ", ordersGroup: "ಆರ್ಡರ್‌ಗಳು", helpGroup: "ಸಹಾಯ", accountGroup: "ಖಾತೆ",
    kitchen: "ಅಡುಗೆಮನೆ ವಿವರಗಳು, ಫೋಟೋಗಳು", kitchenMeta: "ಹೆಸರು, ವಿಳಾಸ, ಫೋಟೋಗಳು", hours: "ಅಡುಗೆಮನೆ ಸಮಯ", hoursMeta: "ಗ್ರಾಹಕರು ಯಾವಾಗ ಆರ್ಡರ್ ಮಾಡಬಹುದು",
    limits: "ದಿನದ ಮಿತಿ", limitsMeta: "ದಿನಕ್ಕೆ ಎಷ್ಟು ಪ್ಲೇಟ್ ಅಡುಗೆ ಮಾಡುತ್ತೀರಿ", findable: "ಗ್ರಾಹಕರಿಗೆ ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಕಾಣುತ್ತದೆಯೇ?", findableMeta: "ಏನು ಮುಗಿದಿದೆ, ಏನು ಉಳಿದಿದೆ ನೋಡಿ",
    documents: "ದಾಖಲೆಗಳು", documentsMeta: "ಪರಿಶೀಲನೆ ಮತ್ತು ನಿಮ್ಮ ದಾಖಲೆಗಳು", orderSettings: "ಆರ್ಡರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳು", orderSettingsMeta: "ಆರ್ಡರ್ ಶಬ್ದ, ಸ್ವಯಂ ಒಪ್ಪಿಗೆ, ಅಡುಗೆ ಸಮಯ",
    help: "ಸಹಾಯ", helpMeta: "ಚಾಟ್, ಕರೆ ಅಥವಾ ನಿಮ್ಮ ಟಿಕೆಟ್‌ಗಳನ್ನು ನೋಡಿ", refer: "ಚೆಫ್ ಅವರನ್ನು ಪರಿಚಯಿಸಿ", referMeta: "ನೀವು ಕರೆದ ಚೆಫ್‌ಗಳು ಅಡುಗೆ ಶುರು ಮಾಡಿದಾಗ ಗಳಿಸಿ",
    security: "ಲಾಗಿನ್, ಭದ್ರತೆ", securityMeta: "ನಿಮ್ಮ ಫೋನ್, ಇಮೇಲ್, ಖಾತೆ", application: "ನಿಮ್ಮ ಅರ್ಜಿ", applicationMeta: "ನೀವು Craves ಗೆ ಕಳುಹಿಸಿದ ವಿವರಗಳು",
    switch: "ಗ್ರಾಹಕ ಆ್ಯಪ್‌ಗೆ ಬದಲಿಸಿ", switchMeta: "ನಿಮಗಾಗಿ ಊಟ ಆರ್ಡರ್ ಮಾಡಿ", signOut: "ಸೈನ್ ಔಟ್", signOutMeta: "ಈ ಫೋನ್‌ನಲ್ಲಿ ಸೈನ್ ಔಟ್ ಮಾಡಿ", signingOut: "ಸೈನ್ ಔಟ್ ಆಗುತ್ತಿದೆ…",
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

function RowContent({ icon: RowIcon, title, meta, chevron, danger = false }: { icon: Icon; title: string; meta: string; chevron: boolean; danger?: boolean }) {
  return <>
    <span className="chef-row-icon"><RowIcon className="h-5 w-5" aria-hidden="true" /></span>
    <span className="chef-row-main">
      <span className={`chef-row-title block ${danger ? "!text-[#C4200F]" : ""}`}>{title}</span>
      <span className="chef-row-meta block">{meta}</span>
    </span>
    {chevron ? <ChevronRight className="chef-chevron h-5 w-5" aria-hidden="true" /> : null}
  </>;
}

/** More: who you are, your language, then every other chef page grouped by job. */
export function ChefMoreHub() {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [application, setApplication] = useState<Application | null>(null);
  const [kitchen, setKitchen] = useState<Kitchen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [languageOpen, setLanguageOpen] = useState(false);
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

  const name = [application?.firstName, application?.lastName].filter(Boolean).join(" ") || text.chef;
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
              <h2 className="truncate font-display text-xl font-bold text-[#1A1A1A]">{name}</h2>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-[0.9375rem] text-[#6B6B6B]">
                <span className="truncate">{kitchen?.kitchenName || text.yourKitchen}</span>
                {application?.status === "APPROVED" ? <ChefPill tone="success">{text.verified}</ChefPill> : <ChefPill tone="warning">{text.inProgress}</ChefPill>}
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
            {group.rows.map((row) =>
              "href" in row ? (
                <Link key={row.key} href={row.href} className="chef-row">
                  <RowContent icon={row.icon} title={text[row.key]} meta={text[row.meta]} chevron />
                </Link>
              ) : (
                <button
                  key={row.key}
                  type="button"
                  className={BUTTON_ROW}
                  disabled={row.action === "sign-out" && signOut.busy}
                  onClick={() => (row.action === "switch" ? switchToCustomerApp() : void signOut.signOut())}
                >
                  <RowContent
                    icon={row.icon}
                    title={row.action === "sign-out" && signOut.busy ? text.signingOut : text[row.key]}
                    meta={text[row.meta]}
                    chevron={false}
                    danger={row.action === "sign-out"}
                  />
                </button>
              ),
            )}
          </div>
        </section>
      ))}
      {signOut.error ? <p role="alert" className="text-sm font-medium text-[#C4200F]">{signOut.error}</p> : null}
    </div>
  );
}
