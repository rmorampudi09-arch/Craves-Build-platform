"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Clock3,
  IdCard,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { LanguageOptions } from "@/shared/ui/language/language-chooser";
import { ChefOnboardingShell, type ChefSaveState } from "@/features/chef-onboarding/components/chef-onboarding-shell";
import { switchToCustomerApp } from "@/features/chef/components/chef-account-menu";
import { ChefOnboardingBank, type BankFormMode } from "@/features/chef-onboarding/components/chef-onboarding-bank";
import {
  ChefBasicDetails,
  ChefKitchenDetails,
  ChefFssaiDetails,
  ChefIdentityDetails,
  ChefReviewDetails,
} from "@/features/chef-onboarding/components/chef-onboarding-sections";
import {
  ApplicationFacts,
  ChefStatusView,
  WhatHappensNext,
} from "@/features/chef-onboarding/components/chef-application-status";
import { Card, Note, Spinner, StatusChip, type ChipTone } from "@/features/chef-onboarding/components/chef-onboarding-ui";
import { useChefOnboarding, type ChefOnboardingFlow } from "@/features/chef-onboarding/components/use-chef-onboarding";
import {
  CHEF_SECTIONS,
  activeChefSections,
  applicationPhase,
  applicationPhaseCopy,
  bankCanContinue,
  chefFullName,
  chefSectionDescription,
  chefSectionLabel,
  chefSectionTitle,
  firstIncompleteSection,
  fssaiGuideText,
  sectionProgress,
  type ChefFormSection,
  type ChefSectionProgress,
} from "@/features/chef-onboarding/lib/chef-onboarding-flow";

const TEXT = messages({
  en: {
    complete: "Complete",
    "in-progress": "In progress",
    "not-started": "Not started",
    attention: "Needs attention",
    signInTitle: "Sign in to continue",
    signInText: "Your saved application stays with your Craves account.",
    signIn: "Sign in",
    opening: "Opening your application",
    loading: "Loading your saved details…",
    openFailed: "We couldn’t open your application",
    tryAgainText: "Please try again.",
    tryAgain: "Try again",
    yourApplication: "Your application",
    tapSection: "Tap any section to review or edit it.",
    savedNote: "Everything you entered is saved exactly as you left it.",
    applicationStatus: "Application status",
    saveReturn: "Save and return to review",
    saveContinue: "Save and continue",
    welcomeBack: "Welcome back, {name}",
    submitting: "Submitting…",
    saving: "Saving…",
    viewStatus: "View application status",
    openKitchen: "Open your kitchen",
    update: "Update application",
    switchCustomer: "Switch to customer app",
    checkingStatus: "Checking status…",
    refresh: "Refresh status",
    review: "Review application",
    continueApp: "Continue application",
    submit: "Submit application",
    continue: "Continue",
    close: "Close",
  },
  te: {
    complete: "పూర్తయింది",
    "in-progress": "జరుగుతోంది",
    "not-started": "ఇంకా మొదలుపెట్టలేదు",
    attention: "సరిచేయాలి",
    signInTitle: "కొనసాగడానికి సైన్ ఇన్ చేయండి",
    signInText: "సేవ్ చేసిన మీ దరఖాస్తు మీ Craves ఖాతాలోనే ఉంటుంది.",
    signIn: "సైన్ ఇన్",
    opening: "మీ దరఖాస్తు తెరుస్తున్నాం",
    loading: "సేవ్ చేసిన మీ వివరాలు లోడ్ అవుతున్నాయి…",
    openFailed: "మీ దరఖాస్తు తెరవలేకపోయాం",
    tryAgainText: "మళ్లీ ప్రయత్నించండి.",
    tryAgain: "మళ్లీ ప్రయత్నించండి",
    yourApplication: "మీ దరఖాస్తు",
    tapSection: "చూడడానికి లేదా మార్చడానికి ఏ భాగాన్నైనా నొక్కండి.",
    savedNote: "మీరు ఇచ్చిన ప్రతిదీ మీరు వదిలిన విధంగానే సేవ్ అయింది.",
    applicationStatus: "దరఖాస్తు స్థితి",
    saveReturn: "సేవ్ చేసి వెనక్కి వెళ్లండి",
    saveContinue: "సేవ్ చేసి కొనసాగండి",
    welcomeBack: "మళ్లీ స్వాగతం, {name}",
    submitting: "పంపుతున్నాం…",
    saving: "సేవ్ అవుతోంది…",
    viewStatus: "దరఖాస్తు స్థితి చూడండి",
    openKitchen: "మీ వంటగది తెరవండి",
    update: "దరఖాస్తు మార్చండి",
    switchCustomer: "కస్టమర్ యాప్‌కు మారండి",
    checkingStatus: "స్థితి చూస్తున్నాం…",
    refresh: "స్థితి మళ్లీ చూడండి",
    review: "దరఖాస్తు చూడండి",
    continueApp: "దరఖాస్తు కొనసాగించండి",
    submit: "దరఖాస్తు పంపండి",
    continue: "కొనసాగండి",
    close: "మూసివేయండి",
  },
  kn: {
    complete: "ಪೂರ್ಣಗೊಂಡಿದೆ",
    "in-progress": "ನಡೆಯುತ್ತಿದೆ",
    "not-started": "ಇನ್ನೂ ಶುರು ಮಾಡಿಲ್ಲ",
    attention: "ಸರಿಪಡಿಸಬೇಕು",
    signInTitle: "ಮುಂದುವರಿಸಲು ಸೈನ್ ಇನ್ ಮಾಡಿ",
    signInText: "ಉಳಿಸಿದ ನಿಮ್ಮ ಅರ್ಜಿ ನಿಮ್ಮ Craves ಖಾತೆಯಲ್ಲೇ ಇರುತ್ತದೆ.",
    signIn: "ಸೈನ್ ಇನ್",
    opening: "ನಿಮ್ಮ ಅರ್ಜಿ ತೆರೆಯುತ್ತಿದೆ",
    loading: "ಉಳಿಸಿದ ನಿಮ್ಮ ವಿವರಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…",
    openFailed: "ನಿಮ್ಮ ಅರ್ಜಿ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ",
    tryAgainText: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    yourApplication: "ನಿಮ್ಮ ಅರ್ಜಿ",
    tapSection: "ನೋಡಲು ಅಥವಾ ಬದಲಾಯಿಸಲು ಯಾವುದೇ ಭಾಗವನ್ನು ಒತ್ತಿ.",
    savedNote: "ನೀವು ನಮೂದಿಸಿದ ಎಲ್ಲವೂ ನೀವು ಬಿಟ್ಟ ಹಾಗೆಯೇ ಉಳಿದಿದೆ.",
    applicationStatus: "ಅರ್ಜಿಯ ಸ್ಥಿತಿ",
    saveReturn: "ಉಳಿಸಿ ಹಿಂದೆ ಹೋಗಿ",
    saveContinue: "ಉಳಿಸಿ ಮುಂದುವರಿಸಿ",
    welcomeBack: "ಮತ್ತೆ ಸ್ವಾಗತ, {name}",
    submitting: "ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…",
    saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…",
    viewStatus: "ಅರ್ಜಿಯ ಸ್ಥಿತಿ ನೋಡಿ",
    openKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆಯಿರಿ",
    update: "ಅರ್ಜಿ ಬದಲಾಯಿಸಿ",
    switchCustomer: "ಗ್ರಾಹಕ ಆ್ಯಪ್‌ಗೆ ಬದಲಿಸಿ",
    checkingStatus: "ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…",
    refresh: "ಸ್ಥಿತಿ ಮತ್ತೆ ನೋಡಿ",
    review: "ಅರ್ಜಿ ನೋಡಿ",
    continueApp: "ಅರ್ಜಿ ಮುಂದುವರಿಸಿ",
    submit: "ಅರ್ಜಿ ಕಳುಹಿಸಿ",
    continue: "ಮುಂದುವರಿಸಿ",
    close: "ಮುಚ್ಚಿ",
  },
});

const SECTION_ICONS: Record<ChefFormSection, ReactNode> = {
  personal: <UserRound size={20} aria-hidden="true" />,
  kitchen: <Store size={20} aria-hidden="true" />,
  fssai: <ShieldCheck size={20} aria-hidden="true" />,
  documents: <IdCard size={20} aria-hidden="true" />,
  bank: <Landmark size={20} aria-hidden="true" />,
};
const PROGRESS_TONE: Record<ChefSectionProgress, ChipTone> = {
  complete: "complete",
  "in-progress": "progress",
  "not-started": "idle",
  attention: "attention",
};

/**
 * The start of the application. A chef new to this device first picks a language, asked in all three
 * because we don't know yet which one they read; one tap continues in it.
 */
export function ChefLanguageStart({ children }: { children: ReactNode }) {
  const { chosen } = useLanguage();
  if (chosen) return <>{children}</>;
  return (
    <ChefOnboardingShell
      title="Choose your language"
      description={
        <>
          <span lang="te" className="block">
            మీ భాషను ఎంచుకోండి
          </span>
          <span lang="kn" className="block">
            ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ
          </span>
        </>
      }
      screenKey="language"
      saveState={null}
      busy={false}
      onBack={null}
      exitLabel={null}
      onExit={() => undefined}
    >
      {/* `.cob button` resets every button inside the popup: restate the choices' card shape. */}
      <div className="[&_button]:!rounded-2xl [&_button]:!border">
        <LanguageOptions />
      </div>
    </ChefOnboardingShell>
  );
}

function PageState({
  title,
  message,
  children,
  busy,
}: {
  title: string;
  message: string;
  children?: ReactNode;
  busy?: boolean;
}) {
  return (
    <section className="cob cob-page-state" aria-busy={busy}>
      <span className="cob-icon-well cob-icon-well--round">
        {busy ? <Spinner red /> : <Clock3 size={20} aria-hidden="true" />}
      </span>
      <h2>{title}</h2>
      <p role={busy ? "status" : undefined}>{message}</p>
      {children ? <div className="cob-page-actions">{children}</div> : null}
    </section>
  );
}

function ResumeScreen({ flow }: { flow: ChefOnboardingFlow }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const state = flow.state!;
  const progress = sectionProgress(state, flow.bank);
  const sections = activeChefSections(state);
  return (
    <div className="cob-stack">
      <Card title={text.yourApplication} subtitle={text.tapSection}>
        <div className="cob-list">
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              className="cob-list-row"
              disabled={flow.busy}
              onClick={() => flow.open(section)}
            >
              <span className="cob-icon-well cob-icon-well--neutral cob-icon-well--round">
                {SECTION_ICONS[section]}
              </span>
              <span className="cob-list-label">{chefSectionLabel(section, language)}</span>
              <StatusChip tone={PROGRESS_TONE[progress[section]]}>{text[progress[section]]}</StatusChip>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </Card>
      <Note icon={<Check size={18} aria-hidden="true" />}>{text.savedNote}</Note>
    </div>
  );
}

function SubmittedScreen({ flow }: { flow: ChefOnboardingFlow }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const state = flow.state!;
  return (
    <div className="cob-stack">
      <Card>
        <div className="cob-status-line">
          <span className="cob-icon-well cob-icon-well--neutral">
            <Clock3 size={20} aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <small>{text.applicationStatus}</small>
            <strong>{applicationPhaseCopy("SUBMITTED", language).label}</strong>
          </div>
        </div>
        <div className="cob-divider" style={{ margin: "16px 0" }} />
        <ApplicationFacts application={state.application} phase="SUBMITTED" />
      </Card>
      <WhatHappensNext />
    </div>
  );
}

export function ChefOnboardingWorkspace({ fallback }: { fallback: ReactNode }) {
  const flow = useChefOnboarding();
  const text = useText(TEXT);
  const { language } = useLanguage();
  const { state, screen, busy } = flow;
  const [bankMode, setBankMode] = useState<BankFormMode>("entry");
  const { bank: loadedBank, bankUnavailable, refreshBank } = flow;
  useEffect(() => {
    // An optional bank step is read only when the chef opens it (the application never needs it).
    if (screen === "bank" && !loadedBank && !bankUnavailable) void refreshBank();
  }, [screen, loadedBank, bankUnavailable, refreshBank]);
  if (flow.unavailable || (state && (!state.enabled || state.legacy) && screen !== "status"))
    return <>{fallback}</>;
  if (flow.signedOut)
    return (
      <PageState title={text.signInTitle} message={text.signInText}>
        <Link href="/chef/sign-in?returnTo=%2Fchef%2Fapplication" className="cob-primary">
          {text.signIn}
        </Link>
      </PageState>
    );
  if (!state)
    return flow.loading ? (
      <PageState busy title={text.opening} message={text.loading} />
    ) : (
      <PageState title={text.openFailed} message={flow.error || text.tryAgainText}>
        <button type="button" className="cob-primary" onClick={() => void flow.load()}>
          <RefreshCw size={18} aria-hidden="true" />
          {text.tryAgain}
        </button>
      </PageState>
    );

  const section = CHEF_SECTIONS.includes(screen as ChefFormSection)
    ? (screen as ChefFormSection)
    : null;
  const guide = screen === "fssai" && flow.fssaiGuide ? fssaiGuideText(language) : null;
  const saveLabel = flow.fromReview ? text.saveReturn : text.saveContinue;
  const phase = applicationPhase({
    application: state.application,
    progress: state.progress,
    submitted: state.submitted || state.legacy,
  });
  const editingAllowed = screen !== "submitted" && screen !== "status";
  // Nothing is claimed for a brand-new application until the first confirmed save.
  const saveState: ChefSaveState = !editingAllowed
    ? null
    : busy
      ? "saving"
      : !state.details
        ? null
        : flow.dirty
          ? "unsaved"
          : "saved";

  const title = guide ? guide.title : chefSectionTitle(screen, language);
  const description = guide ? guide.description : chefSectionDescription(screen, language);
  const heading =
    screen === "resume" && flow.details.firstName
      ? format(text.welcomeBack, { name: flow.details.firstName })
      : title;

  const busyLabel = screen === "review" ? text.submitting : text.saving;
  const primary = (label: ReactNode, props: { onClick: () => void }) => (
    <button type="button" className="cob-primary" disabled={busy} onClick={props.onClick}>
      {busy ? <Spinner /> : null}
      {busy ? busyLabel : label}
    </button>
  );
  let footer: ReactNode;
  if (screen === "submitted")
    footer = (
      <Link href="/chef/application/status" className="cob-primary">
        {text.viewStatus}
      </Link>
    );
  else if (screen === "status")
    footer =
      phase === "APPROVED" ? (
        <Link href="/chef" className="cob-primary">
          {text.openKitchen}
        </Link>
      ) : phase === "MORE_INFORMATION_REQUIRED" ? (
        primary(text.update, {
          onClick: () => flow.open(flow.nextCorrection()),
        })
      ) : phase === "REJECTED" ? (
        <button type="button" className="cob-secondary" onClick={switchToCustomerApp}>
          {text.switchCustomer}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="cob-primary"
            disabled={busy || flow.loading}
            onClick={() => void flow.load()}
          >
            {flow.loading ? <Spinner /> : null}
            {flow.loading ? text.checkingStatus : text.refresh}
          </button>
          <button type="button" className="cob-link cob-link--ink cob-link--center" onClick={switchToCustomerApp}>
            {text.switchCustomer}
          </button>
        </>
      );
  else if (screen === "resume")
    footer = primary(
      firstIncompleteSection(state, flow.bank) === "review" ? text.review : text.continueApp,
      { onClick: () => flow.open(firstIncompleteSection(state, flow.bank)) },
    );
  else if (screen === "review")
    footer = primary(text.submit, { onClick: () => void flow.submit() });
  else if (guide) footer = primary(saveLabel, { onClick: () => void flow.continueWithoutFssai() });
  else if (section === "bank")
    footer = (
      <button
        type="submit"
        form="chef-bank-form"
        className="cob-primary"
        // Without automatic bank setup there is nothing to submit; the note above says why.
        disabled={
          busy ||
          (!bankCanContinue(flow.bank) && (flow.bankUnavailable || !flow.bank?.automaticActivation))
        }
      >
        {busy ? <Spinner /> : null}
        {busy ? text.saving : bankMode === "entry" ? text.continue : saveLabel}
      </button>
    );
  else if (section)
    footer = (
      <button type="submit" form="chef-section-form" className="cob-primary" disabled={busy}>
        {busy ? <Spinner /> : null}
        {busy ? text.saving : saveLabel}
      </button>
    );

  const errorNote =
    flow.error && editingAllowed ? (
      <Note tone="error" role="alert">
        {flow.error}
      </Note>
    ) : null;

  return (
    <ChefOnboardingShell
      title={heading}
      description={description}
      screenKey={`${screen}${guide ? "-guide" : ""}`}
      saveState={saveState}
      busy={busy}
      onBack={screen === "submitted" || screen === "status" ? null : flow.back}
      // undefined: the shell's own "Save & exit".
      exitLabel={screen === "submitted" ? null : screen === "status" ? text.close : undefined}
      onExit={flow.exit}
      hero={
        screen === "submitted" ? (
          <div className="cob-hero">
            <span className="cob-hero-badge" aria-hidden="true">
              <span>
                <Check size={34} strokeWidth={3} />
              </span>
            </span>
          </div>
        ) : undefined
      }
      footer={
        <>
          {errorNote}
          {footer}
        </>
      }
    >
      {section && section !== "bank" ? (
        <form
          id="chef-section-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void flow.saveSection(section);
          }}
        >
          {screen === "personal" ? (
            <ChefBasicDetails flow={flow} />
          ) : screen === "kitchen" ? (
            <ChefKitchenDetails flow={flow} />
          ) : screen === "fssai" ? (
            <ChefFssaiDetails flow={flow} />
          ) : (
            <ChefIdentityDetails flow={flow} />
          )}
        </form>
      ) : null}
      {screen === "bank" ? (
        <ChefOnboardingBank
          name={chefFullName(flow.details)}
          bank={flow.bank}
          unavailable={flow.bankUnavailable}
          busy={busy}
          onSaved={flow.savedBank}
          onBusy={flow.bankBusy}
          onRefresh={() => void flow.refreshBank()}
          onModeChange={setBankMode}
        />
      ) : null}
      {screen === "review" ? <ChefReviewDetails flow={flow} /> : null}
      {screen === "resume" ? <ResumeScreen flow={flow} /> : null}
      {screen === "submitted" ? <SubmittedScreen flow={flow} /> : null}
      {screen === "status" ? (
        <ChefStatusView
          phase={phase}
          application={state.application}
          reason={state.progress?.reason}
          documents={state.documents}
          sections={state.progress?.sections}
          supportPhone={state.supportPhone}
          supportEmail={state.supportEmail}
        />
      ) : null}
      {flow.notice ? (
        <div style={{ marginTop: 16 }}>
          <Note tone="neutral" role="status">
            {flow.notice}
          </Note>
        </div>
      ) : null}
      {flow.error && !editingAllowed ? (
        <div style={{ marginTop: 16 }}>
          <Note tone="error" role="alert">
            {flow.error}
          </Note>
        </div>
      ) : null}
    </ChefOnboardingShell>
  );
}
