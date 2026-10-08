"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { ChefOnboardingShell } from "@/components/chef-onboarding-shell";
import { ChefOnboardingBank } from "@/components/chef-onboarding-bank";
import {
  ChefBasicDetails,
  ChefKitchenDetails,
  ChefFssaiDetails,
  ChefIdentityDetails,
  ChefReviewDetails,
} from "@/components/chef-onboarding-sections";
import { useChefOnboarding } from "@/components/use-chef-onboarding";
import {
  CHEF_SECTIONS,
  CHEF_SECTION_TITLES,
  CHEF_SECTION_DESCRIPTIONS,
  completedSections,
  firstIncompleteSection,
  chefFullName,
  bankCanContinue,
  type ChefFormSection,
} from "@/lib/chef-onboarding-flow";

export function ChefOnboardingWorkspace({ fallback }: { fallback: ReactNode }) {
  const flow = useChefOnboarding();
  const { state, screen, busy } = flow;
  if (flow.unavailable || (state && (!state.enabled || state.legacy) && screen !== "status"))
    return <>{fallback}</>;
  if (flow.signedOut)
    return (
      <section className="rounded-3xl bg-white p-7">
        <h1 className="text-xl font-bold">Sign in to continue</h1>
        <p className="mt-3 text-sm">Your saved application stays with your Craves account.</p>
        <Link
          href="/sign-in?returnTo=/chef/application"
          className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-[#F62E18] px-5 font-bold text-white"
        >
          Sign in
        </Link>
      </section>
    );
  if (flow.loading || !state)
    return (
      <section className="rounded-3xl bg-white p-7" aria-busy={flow.loading}>
        {flow.loading ? (
          <p role="status">Opening your saved application…</p>
        ) : (
          <>
            <p role="alert">{flow.error}</p>
            <button
              type="button"
              className="mt-4 min-h-12 font-bold text-[#C4200F]"
              onClick={() => void flow.load()}
            >
              Try again
            </button>
          </>
        )}
      </section>
    );
  const section = CHEF_SECTIONS.includes(screen as ChefFormSection)
    ? (screen as ChefFormSection)
    : null;
  const completion = completedSections(state, flow.bank);
  const canSave = screen !== "submitted" && screen !== "status";
  const buttonLabel =
    screen === "review"
      ? "Submit application"
      : screen === "resume"
        ? "Continue onboarding"
        : screen === "submitted"
          ? "View application status"
          : screen === "status"
            ? state.application.status === "APPROVED"
              ? "Go to dashboard"
              : "Refresh application status"
            : flow.fromReview
              ? "Save and return to review"
              : "Save and continue";
  function action() {
    if (screen === "resume") flow.setScreen(firstIncompleteSection(state!, flow.bank));
    else if (screen === "review") void flow.submit();
    else if (screen === "status") void flow.load();
  }
  const footer =
    screen === "submitted" ? (
      <Link href="/chef/application/status" className="chef-onboarding-button">
        {buttonLabel}
      </Link>
    ) : screen === "status" && state.application.status === "APPROVED" ? (
      <Link href="/chef" className="chef-onboarding-button">
        {buttonLabel}
      </Link>
    ) : (
      <button
        type={section ? "submit" : "button"}
        form={section === "bank" ? "chef-bank-form" : section ? "chef-section-form" : undefined}
        className="chef-onboarding-button"
        disabled={
          busy || (section === "bank" && flow.bankUnavailable && !bankCanContinue(flow.bank))
        }
        onClick={section ? undefined : action}
      >
        {busy ? <LoaderCircle size={20} className="animate-spin" aria-hidden="true" /> : null}
        {busy ? "Please wait…" : buttonLabel}
      </button>
    );
  return (
    <ChefOnboardingShell
      title={CHEF_SECTION_TITLES[screen]}
      description={CHEF_SECTION_DESCRIPTIONS[screen]}
      saved={!flow.dirty && state.details !== null}
      busy={busy}
      canSave={canSave}
      onBack={flow.back}
      onExit={flow.exit}
      footer={footer}
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
        />
      ) : null}
      {screen === "review" ? <ChefReviewDetails flow={flow} /> : null}
      {screen === "resume" ? (
        <div>
          <p className="chef-onboarding-helper mb-4">
            Your saved details are below. We’ll take you to the next section that needs attention.
          </p>
          {CHEF_SECTIONS.map((key) => (
            <div key={key} className="chef-onboarding-resume-row">
              <span>{CHEF_SECTION_TITLES[key]}</span>
              <span>{key === "bank" && state.bankEnrollmentRequired === false ? "Add later" : completion[key] ? "Completed" : "Needs attention"}</span>
            </div>
          ))}
        </div>
      ) : null}
      {screen === "submitted" ? (
        <div>
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEEDEA] text-[#C4200F]">
            <CheckCircle2 size={32} aria-hidden="true" />
          </div>
          <dl className="chef-onboarding-review-block">
            <div className="flex justify-between gap-4 text-sm">
              <dt>Application ID</dt>
              <dd className="break-all text-right">{state.application.id}</dd>
            </div>
            {state.application.submittedAt ? (
              <div className="mt-3 flex justify-between gap-4 text-sm">
                <dt>Submission date</dt>
                <dd>
                  {new Date(state.application.submittedAt).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </dd>
              </div>
            ) : null}
          </dl>
          <section className="chef-onboarding-section">
            <h2>What happens next?</h2>
            <ol className="chef-onboarding-guide">
              <li>
                <strong>Our team reviews your application</strong>
                <p>We check your kitchen details and documents.</p>
              </li>
              <li>
                <strong>Check for updates here</strong>
                <p>Your application status will show the next action you need to take.</p>
              </li>
              <li>
                <strong>Start after approval</strong>
                <p>Your chef dashboard becomes available once Craves approves your application.</p>
              </li>
            </ol>
          </section>
        </div>
      ) : null}
      {screen === "status" ? (
        <div className="chef-onboarding-group">
          <p className="inline-flex w-fit rounded-full bg-[#FEEDEA] px-4 py-2 text-sm font-bold text-[#C4200F]">
            {state.progress?.status === "MORE_INFORMATION_REQUIRED" ? "More information required" : state.progress?.status === "UNDER_REVIEW" ? "Under review" : state.application.status === "PENDING"
              ? state.submitted || state.legacy
                ? "Pending review"
                : "Draft"
              : state.application.status === "NOT_SUBMITTED"
                ? "Draft"
                : state.application.status === "APPROVED"
                  ? "Approved"
                  : "Rejected"}
          </p>
          <p className="text-sm leading-7 text-[#6B6B6B]">
            {state.application.status === "APPROVED"
              ? "Your application is approved. You can open your chef dashboard."
              : state.application.status === "REJECTED"
                ? "Your application needs attention. Contact Craves support about the reason below."
                : "Your chef dashboard becomes available after approval. You can continue using Craves in Customer Mode."}
          </p>
          {state.application.id ? (
            <p className="text-sm">
              Application ID: <span className="break-all">{state.application.id}</span>
            </p>
          ) : null}
          {state.progress?.reason ? <p role="alert" className="chef-onboarding-notice chef-onboarding-error">{state.progress.reason}</p> : null}
          {state.progress?.nextAction === "EDIT_APPLICATION" ? <button type="button" className="chef-onboarding-button" onClick={()=>flow.edit("personal")}>Correct application</button> : null}
          {state.application.rejectionReason ? (
            <p role="alert" className="chef-onboarding-notice chef-onboarding-error">
              {state.application.rejectionReason}
            </p>
          ) : null}
          <Link href="/home" className="chef-onboarding-text-action justify-start">
            Switch to Customer Mode
          </Link>
        </div>
      ) : null}
      {flow.error || flow.fieldError ? (
        <p role="alert" className="chef-onboarding-notice chef-onboarding-error">
          {flow.error || flow.fieldError?.message}
        </p>
      ) : null}
      {flow.notice ? (
        <p role="status" className="chef-onboarding-notice">
          {flow.notice}
        </p>
      ) : null}
    </ChefOnboardingShell>
  );
}

