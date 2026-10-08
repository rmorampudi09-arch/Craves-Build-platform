"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChefOnboardingShell } from "@/components/chef-onboarding-shell";
import { parseChefApplication, type ChefApplication } from "@/lib/chef-application-contract";
import { parseOnboardingState } from "@/lib/chef-onboarding-v2-contract";
import { captureSessionContext, isSessionContextCurrent } from "@/services/auth/cravesAuth";

export function ChefApplicationStatus({ draftsEnabled }: { draftsEnabled: boolean }) {
  const router = useRouter();
  const [application, setApplication] = useState<ChefApplication | null>(null),
    [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const owner = useRef(captureSessionContext()),
    generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/chef/application", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Your session ended. Sign in to check your application."
            : "We could not refresh your application. Please retry.",
        );
      const next = parseChefApplication(await response.json());
      if (!next) throw new Error("Your application status could not be verified.");
      let isDraft = next.status === "NOT_SUBMITTED";
      if (draftsEnabled && next.status === "PENDING") {
        const saved = await fetch("/api/chef/onboarding", {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!saved.ok)
          throw new Error(
            "We could not verify whether this application is a draft or submitted. Please retry.",
          );
        const onboarding = parseOnboardingState(await saved.json());
        if (!onboarding) throw new Error("Your saved application status could not be verified.");
        isDraft = onboarding.enabled && !onboarding.legacy && !onboarding.submitted;
      }
      if (generation.current === request && isSessionContextCurrent(owner.current)) {
        setApplication(next);
        setDraft(isDraft);
      }
    } catch (failure) {
      if (generation.current === request && isSessionContextCurrent(owner.current))
        setError(failure instanceof Error ? failure.message : "Application status is unavailable.");
    } finally {
      if (generation.current === request && isSessionContextCurrent(owner.current)) setBusy(false);
    }
  }, [draftsEnabled]);
  useEffect(() => {
    const requests = generation;
    void load();
    return () => {
      requests.current++;
    };
  }, [load]);
  const title =
    application?.status === "APPROVED"
      ? "Your application is approved"
      : application?.status === "REJECTED"
        ? "Your application needs attention"
        : draft
          ? "Continue your application"
          : "Your application";
  const footer =
    application?.status === "APPROVED" ? (
      <Link href="/chef" className="chef-onboarding-button">
        Go to dashboard
      </Link>
    ) : draft ? (
      <Link href="/chef/application" className="chef-onboarding-button">
        Continue onboarding
      </Link>
    ) : (
      <button
        type="button"
        className="chef-onboarding-button"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy ? "Checking status…" : "Refresh application status"}
      </button>
    );
  return (
    <ChefOnboardingShell
      title={title}
      description="Your saved application and its current status."
      saved
      busy={busy}
      canSave={false}
      onBack={() => router.push("/home")}
      onExit={() => router.push("/home")}
      footer={footer}
    >
      {application ? (
        <div className="chef-onboarding-group">
          <p className="w-fit rounded-full bg-[#FEEDEA] px-4 py-2 text-sm font-bold text-[#C4200F]">
            {draft
              ? "Draft"
              : application.status === "PENDING"
                ? "Pending review"
                : application.status === "APPROVED"
                  ? "Approved"
                  : "Rejected"}
          </p>
          {application.id ? (
            <p className="break-all text-sm">Application ID: {application.id}</p>
          ) : null}
          {application.submittedAt && !draft ? (
            <p className="text-sm">
              Submitted: {new Date(application.submittedAt).toLocaleString("en-IN")}
            </p>
          ) : null}
          {application.rejectionReason ? (
            <p role="alert" className="chef-onboarding-notice chef-onboarding-error">
              {application.rejectionReason}
            </p>
          ) : null}
          <p className="text-sm leading-7 text-[#6B6B6B]">
            {application.status === "APPROVED"
              ? "You can now open your chef dashboard."
              : draft
                ? "Your saved details are available. Continue onboarding to complete your application."
                : application.status === "REJECTED"
                  ? "Contact Craves support about your application review. Your customer account remains available."
                  : "Craves approval is required before your chef dashboard and operational tools become available."}
          </p>
        </div>
      ) : busy ? (
        <p role="status" className="text-sm">
          Checking your application…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="chef-onboarding-notice chef-onboarding-error">
          {error}
          <Link
            href="/sign-in?returnTo=/chef/application/status"
            className="ml-2 font-bold underline"
          >
            Sign in
          </Link>
        </p>
      ) : null}
      <Link href="/home" className="chef-onboarding-text-action mt-4">
        Switch to Customer Mode
      </Link>
    </ChefOnboardingShell>
  );
}
