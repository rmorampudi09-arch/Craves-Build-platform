"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ChefHat,
  XCircle,
} from "lucide-react";
import { ChefOnboardingShell } from "@/components/chef-onboarding-shell";
import {
  Card,
  Note,
  Spinner,
  StatusChip,
  formatDate,
  formatPhone,
} from "@/components/chef-onboarding-ui";
import { parseChefApplication, type ChefApplication } from "@/lib/chef-application-contract";
import type { ChefEvidenceMetadata } from "@/lib/chef-application-evidence-contract";
import { parseOnboardingState, type OnboardingState } from "@/lib/chef-onboarding-v2-contract";
import {
  APPLICATION_PHASE_COPY,
  CHEF_SECTION_LABELS,
  applicationPhase,
  sectionForDocument,
  type ChefApplicationPhase,
} from "@/lib/chef-onboarding-flow";
import { captureSessionContext, isSessionContextCurrent } from "@/services/auth/cravesAuth";

const PHASE_ICON: Record<ChefApplicationPhase, ReactNode> = {
  DRAFT: <FileText size={20} aria-hidden="true" />,
  SUBMITTED: <Clock3 size={20} aria-hidden="true" />,
  UNDER_REVIEW: <Search size={20} aria-hidden="true" />,
  MORE_INFORMATION_REQUIRED: <AlertCircle size={20} aria-hidden="true" />,
  APPROVED: <CheckCircle2 size={20} aria-hidden="true" />,
  REJECTED: <XCircle size={20} aria-hidden="true" />,
};

/** The three truthful next steps shared by the confirmation and the pending status. */
export function WhatHappensNext() {
  return (
    <Card title="What happens next?">
      <div className="cob-next">
        <div className="cob-next-item">
          <span className="cob-icon-well cob-icon-well--neutral cob-icon-well--round">
            <Search size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Application review</strong>
            <p>Our team will review the details you submitted.</p>
          </div>
        </div>
        <div className="cob-next-item">
          <span className="cob-icon-well cob-icon-well--neutral cob-icon-well--round">
            <Bell size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Status update</strong>
            <p>We’ll update your application status as the review progresses.</p>
          </div>
        </div>
        <div className="cob-next-item">
          <span className="cob-icon-well cob-icon-well--neutral cob-icon-well--round">
            <ChefHat size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>Set up your kitchen</strong>
            <p>Once approved, you can add menu items, configure working hours and manage orders.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ApplicationFacts({
  application,
  phase,
}: {
  application: Pick<ChefApplication, "id" | "submittedAt" | "reviewedAt">;
  phase: ChefApplicationPhase;
}) {
  const rows: [string, ReactNode][] = [
    ["Application ID", application.id],
    ["Submitted on", phase === "DRAFT" ? null : formatDate(application.submittedAt)],
    ["Last reviewed", formatDate(application.reviewedAt)],
  ];
  const visible = rows.filter(([, value]) => value);
  if (!visible.length) return null;
  return (
    <dl className="cob-rows">
      {visible.map(([label, value]) => (
        <div key={label} className="cob-row">
          <dt>{label}</dt>
          <dd style={{ fontSize: label === "Application ID" ? 13 : undefined }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type StatusInput = {
  phase: ChefApplicationPhase;
  application: ChefApplication;
  reason?: string | null;
  documents?: ChefEvidenceMetadata[];
  supportPhone?: string;
  supportEmail?: string;
};

/** Status content for every application phase. Operational tools are never linked before approval. */
export function ChefStatusView({
  phase,
  application,
  reason,
  documents = [],
  supportPhone,
  supportEmail,
}: StatusInput) {
  const copy = APPLICATION_PHASE_COPY[phase];
  const needsUpdate = documents.filter((document) => document.status === "REJECTED");
  const sections = Array.from(
    new Set(
      needsUpdate.map((document) => sectionForDocument(document.documentType)).filter(Boolean),
    ),
  ) as (keyof typeof CHEF_SECTION_LABELS)[];
  const explanation = reason ?? application.rejectionReason;
  return (
    <div className="cob-stack">
      <Card>
        <div className="cob-status-line">
          <span
            className={`cob-icon-well ${
              phase === "APPROVED" || phase === "MORE_INFORMATION_REQUIRED" || phase === "REJECTED"
                ? ""
                : "cob-icon-well--neutral"
            }`}
          >
            {PHASE_ICON[phase]}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <small>Application status</small>
            <strong>{copy.label}</strong>
          </div>
        </div>
        <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.55 }}>
          {copy.message}{" "}
          <span style={{ color: "#6B6B6B" }}>
            {phase === "SUBMITTED" || phase === "UNDER_REVIEW"
              ? "Chef tools open once your application is approved."
              : phase === "APPROVED"
                ? "Set up your working hours, availability and menu to start receiving orders."
                : phase === "MORE_INFORMATION_REQUIRED"
                  ? "Update the details below and submit your application again."
                  : phase === "DRAFT"
                    ? "Continue where you left off. Your saved details are kept."
                    : "Contact Craves support if you have questions about this decision."}
          </span>
        </p>
        {phase === "REJECTED" && explanation ? (
          <div className="cob-reason" style={{ marginTop: 14 }}>
            <strong>Reason</strong>
            {explanation}
          </div>
        ) : null}
        <div className="cob-divider" style={{ margin: "16px 0" }} />
        <ApplicationFacts application={application} phase={phase} />
      </Card>

      {phase === "MORE_INFORMATION_REQUIRED" ? (
        <Card icon={<AlertCircle size={20} aria-hidden="true" />} title="What needs updating">
          <div className="cob-fields" style={{ gap: 12 }}>
            {explanation ? (
              <div className="cob-reason">
                <strong>Note from Craves</strong>
                {explanation}
              </div>
            ) : null}
            {sections.length ? (
              <div className="cob-list">
                {sections.map((section) => (
                  <div key={section} className="cob-list-row" style={{ minHeight: 0 }}>
                    <span className="cob-list-label">
                      {CHEF_SECTION_LABELS[section]}
                      {needsUpdate
                        .filter((document) => sectionForDocument(document.documentType) === section)
                        .map((document) => (
                          <small key={document.id}>
                            {document.reviewReason ?? "Upload a new file."}
                          </small>
                        ))}
                    </span>
                    <StatusChip tone="attention">Needs attention</StatusChip>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {phase === "REJECTED" ? (
        <SupportCard phone={supportPhone} email={supportEmail} applicationId={application.id} />
      ) : null}

      {phase === "SUBMITTED" || phase === "UNDER_REVIEW" ? <WhatHappensNext /> : null}

      {phase === "APPROVED" ? (
        <Note icon={<ChefHat size={18} aria-hidden="true" />}>
          Your Chef Dashboard is ready. Add your working hours, availability and menu items there.
        </Note>
      ) : null}
    </div>
  );
}

function SupportCard({
  phone,
  email,
  applicationId,
}: {
  phone?: string;
  email?: string;
  applicationId: string | null;
}) {
  if (!phone && !email) return null;
  const subject = encodeURIComponent(`Chef application ${applicationId ?? ""}`.trim());
  return (
    <Card
      title="Talk to Craves support"
      subtitle="We can explain the decision and what you can do next."
    >
      <div className="cob-fields" style={{ gap: 10 }}>
        {phone ? (
          <a className="cob-secondary" href={`tel:${phone}`}>
            <Phone size={18} aria-hidden="true" />
            Call {formatPhone(phone)}
          </a>
        ) : null}
        {email ? (
          <a className="cob-secondary" href={`mailto:${email}?subject=${subject}`}>
            <Mail size={18} aria-hidden="true" />
            Email {email}
          </a>
        ) : null}
      </div>
    </Card>
  );
}

/** Standalone /chef/application/status route. Pending applicants are never offered the dashboard. */
export function ChefApplicationStatus({ draftsEnabled }: { draftsEnabled: boolean }) {
  const router = useRouter();
  const [application, setApplication] = useState<ChefApplication | null>(null),
    [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [signedOut, setSignedOut] = useState(false);
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
      if (!response.ok) {
        if (response.status === 401) setSignedOut(true);
        throw new Error(
          response.status === 401
            ? "Your session ended. Sign in to check your application."
            : "We couldn’t refresh your application. Please try again.",
        );
      }
      const next = parseChefApplication(await response.json());
      if (!next) throw new Error("Your application status could not be verified.");
      let saved: OnboardingState | null = null;
      if (draftsEnabled && next.status !== "APPROVED") {
        const draft = await fetch("/api/chef/onboarding", {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!draft.ok)
          throw new Error(
            "We couldn’t confirm whether this application was submitted. Please try again.",
          );
        saved = parseOnboardingState(await draft.json());
        if (!saved) throw new Error("Your saved application status could not be verified.");
      }
      if (generation.current === request && isSessionContextCurrent(owner.current)) {
        setApplication(next);
        setOnboarding(saved);
        setSignedOut(false);
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

  const phase = application
    ? applicationPhase({
        application,
        progress: onboarding?.progress,
        submitted: onboarding
          ? onboarding.submitted || onboarding.legacy || !onboarding.enabled
          : application.status !== "NOT_SUBMITTED",
      })
    : null;
  const footer = !phase ? (
    error ? (
      <button type="button" className="cob-primary" disabled={busy} onClick={() => void load()}>
        {busy ? <Spinner /> : <RefreshCw size={18} aria-hidden="true" />}
        Try again
      </button>
    ) : null
  ) : phase === "APPROVED" ? (
    <Link href="/chef" className="cob-primary">
      Open Chef Dashboard
    </Link>
  ) : phase === "DRAFT" || phase === "MORE_INFORMATION_REQUIRED" ? (
    <Link href="/chef/application" className="cob-primary">
      {phase === "DRAFT" ? "Continue application" : "Update application"}
    </Link>
  ) : (
    <>
      <button type="button" className="cob-primary" disabled={busy} onClick={() => void load()}>
        {busy ? <Spinner /> : null}
        {busy ? "Checking status…" : "Refresh status"}
      </button>
      <Link href="/home" className="cob-link cob-link--ink cob-link--center">
        Continue browsing as a customer
      </Link>
    </>
  );
  return (
    <ChefOnboardingShell
      title="Your application"
      description={
        phase
          ? "Your application status and what happens next."
          : "Checking your latest application status."
      }
      screenKey={phase ?? "loading"}
      saveState={null}
      busy={false}
      onBack={null}
      exitLabel="Close"
      onExit={() => router.push("/home")}
      footer={footer}
    >
      {application && phase ? (
        <ChefStatusView
          phase={phase}
          application={application}
          reason={onboarding?.progress?.reason}
          documents={onboarding?.documents}
          supportPhone={onboarding?.supportPhone}
          supportEmail={onboarding?.supportEmail}
        />
      ) : busy ? (
        <div className="cob-stack" role="status" aria-label="Checking your application">
          <div className="cob-skeleton" style={{ height: 168 }} />
          <div className="cob-skeleton" style={{ height: 220 }} />
        </div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 16 }}>
          <Note tone="error" role="alert">
            {error}
            {signedOut ? (
              <>
                <br />
                <Link href="/sign-in?returnTo=/chef/application/status" className="cob-link">
                  Sign in
                </Link>
              </>
            ) : null}
          </Note>
        </div>
      ) : null}
    </ChefOnboardingShell>
  );
}
