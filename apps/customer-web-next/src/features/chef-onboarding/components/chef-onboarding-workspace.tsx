"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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
import { ChefOnboardingShell, type ChefSaveState } from "@/features/chef-onboarding/components/chef-onboarding-shell";
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
import { Card, Note, Spinner, StatusChip } from "@/features/chef-onboarding/components/chef-onboarding-ui";
import { useChefOnboarding, type ChefOnboardingFlow } from "@/features/chef-onboarding/components/use-chef-onboarding";
import {
  CHEF_SECTIONS,
  CHEF_SECTION_LABELS,
  CHEF_SECTION_TITLES,
  CHEF_SECTION_DESCRIPTIONS,
  FSSAI_GUIDE_DESCRIPTION,
  FSSAI_GUIDE_TITLE,
  activeChefSections,
  applicationPhase,
  bankCanContinue,
  chefFullName,
  firstIncompleteSection,
  sectionProgress,
  type ChefFormSection,
  type ChefSectionProgress,
} from "@/features/chef-onboarding/lib/chef-onboarding-flow";

const SECTION_ICONS: Record<ChefFormSection, ReactNode> = {
  personal: <UserRound size={20} aria-hidden="true" />,
  kitchen: <Store size={20} aria-hidden="true" />,
  fssai: <ShieldCheck size={20} aria-hidden="true" />,
  documents: <IdCard size={20} aria-hidden="true" />,
  bank: <Landmark size={20} aria-hidden="true" />,
};
const PROGRESS_CHIP: Record<ChefSectionProgress, ReactNode> = {
  complete: <StatusChip tone="complete">Complete</StatusChip>,
  "in-progress": <StatusChip tone="progress">In progress</StatusChip>,
  "not-started": <StatusChip tone="idle">Not started</StatusChip>,
  attention: <StatusChip tone="attention">Needs attention</StatusChip>,
};

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
  const state = flow.state!;
  const progress = sectionProgress(state, flow.bank);
  const sections = activeChefSections(state);
  return (
    <div className="cob-stack">
      <Card title="Your application" subtitle="Tap any section to review or edit it.">
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
              <span className="cob-list-label">{CHEF_SECTION_LABELS[section]}</span>
              {PROGRESS_CHIP[progress[section]]}
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      </Card>
      <Note icon={<Check size={18} aria-hidden="true" />}>
        Everything you entered is saved exactly as you left it.
      </Note>
    </div>
  );
}

function SubmittedScreen({ flow }: { flow: ChefOnboardingFlow }) {
  const state = flow.state!;
  return (
    <div className="cob-stack">
      <Card>
        <div className="cob-status-line">
          <span className="cob-icon-well cob-icon-well--neutral">
            <Clock3 size={20} aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <small>Application status</small>
            <strong>Submitted</strong>
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
  const { state, screen, busy } = flow;
  const [bankMode, setBankMode] = useState<BankFormMode>("entry");
  if (flow.unavailable || (state && (!state.enabled || state.legacy) && screen !== "status"))
    return <>{fallback}</>;
  if (flow.signedOut)
    return (
      <PageState
        title="Sign in to continue"
        message="Your saved application stays with your Craves account."
      >
        <Link href="/sign-in?returnTo=/chef/application" className="cob-primary">
          Sign in
        </Link>
      </PageState>
    );
  if (!state)
    return flow.loading ? (
      <PageState busy title="Opening your application" message="Loading your saved details…" />
    ) : (
      <PageState
        title="We couldn’t open your application"
        message={flow.error || "Please try again."}
      >
        <button type="button" className="cob-primary" onClick={() => void flow.load()}>
          <RefreshCw size={18} aria-hidden="true" />
          Try again
        </button>
      </PageState>
    );

  const section = CHEF_SECTIONS.includes(screen as ChefFormSection)
    ? (screen as ChefFormSection)
    : null;
  const guide = screen === "fssai" && flow.fssaiGuide;
  const saveLabel = flow.fromReview ? "Save and return to review" : "Save and continue";
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

  const title = guide ? FSSAI_GUIDE_TITLE : CHEF_SECTION_TITLES[screen];
  const description = guide
    ? FSSAI_GUIDE_DESCRIPTION
    : screen === "resume"
      ? flow.details.firstName
        ? "Continue setting up your kitchen."
        : CHEF_SECTION_DESCRIPTIONS.resume
      : screen === "status"
        ? CHEF_SECTION_DESCRIPTIONS.status
        : CHEF_SECTION_DESCRIPTIONS[screen];
  const heading =
    screen === "resume" && flow.details.firstName
      ? `Welcome back, ${flow.details.firstName}`
      : title;

  const busyLabel = screen === "review" ? "Submitting…" : "Saving…";
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
        View application status
      </Link>
    );
  else if (screen === "status")
    footer =
      phase === "APPROVED" ? (
        <Link href="/chef" className="cob-primary">
          Open Chef Dashboard
        </Link>
      ) : phase === "MORE_INFORMATION_REQUIRED" ? (
        primary("Update application", {
          onClick: () => flow.open(flow.nextCorrection()),
        })
      ) : phase === "REJECTED" ? (
        <Link href="/home" className="cob-secondary">
          Continue browsing as a customer
        </Link>
      ) : (
        <>
          <button
            type="button"
            className="cob-primary"
            disabled={busy || flow.loading}
            onClick={() => void flow.load()}
          >
            {flow.loading ? <Spinner /> : null}
            {flow.loading ? "Checking status…" : "Refresh status"}
          </button>
          <Link href="/home" className="cob-link cob-link--ink cob-link--center">
            Continue browsing as a customer
          </Link>
        </>
      );
  else if (screen === "resume")
    footer = primary(
      (() => {
        const next = firstIncompleteSection(state, flow.bank);
        return next === "review" ? "Review application" : "Continue application";
      })(),
      { onClick: () => flow.open(firstIncompleteSection(state, flow.bank)) },
    );
  else if (screen === "review")
    footer = primary("Submit application", { onClick: () => void flow.submit() });
  else if (guide) footer = primary(saveLabel, { onClick: () => void flow.continueWithoutFssai() });
  else if (section === "bank")
    footer = (
      <button
        type="submit"
        form="chef-bank-form"
        className="cob-primary"
        disabled={busy || (flow.bankUnavailable && !bankCanContinue(flow.bank))}
      >
        {busy ? <Spinner /> : null}
        {busy ? "Saving…" : bankMode === "entry" ? "Continue" : saveLabel}
      </button>
    );
  else if (section)
    footer = (
      <button type="submit" form="chef-section-form" className="cob-primary" disabled={busy}>
        {busy ? <Spinner /> : null}
        {busy ? "Saving…" : saveLabel}
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
      exitLabel={screen === "submitted" ? null : screen === "status" ? "Close" : "Save & exit"}
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
