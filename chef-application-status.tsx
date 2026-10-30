"use client";
import { sessionFetch } from "@/shared/lib/session-fetch";

import { chefApiError, ChefError, chefErrorText } from "@/features/chef/lib/chef-errors";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Bell, CheckCircle2, ChefHat, ChevronRight, Clock3, FileText, Mail, Phone, RefreshCw, Search, XCircle } from "lucide-react";
import { format, messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { switchToCustomerApp } from "@/features/chef/components/chef-account-menu";
import {
  Card,
  Note,
  Spinner,
  StatusChip,
  formatDate,
  formatPhone,
} from "@/features/chef-onboarding/components/chef-onboarding-ui";
import { parseChefApplication, type ChefApplication } from "@/features/chef-onboarding/lib/chef-application-contract";
import type { ChefEvidenceMetadata } from "@/features/chef-onboarding/lib/chef-application-evidence-contract";
import { parseOnboardingState, type OnboardingState } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import {
  CHEF_SECTIONS,
  applicationPhase,
  applicationPhaseCopy,
  chefSectionDescription,
  chefSectionLabel,
  chefSectionTitle,
  correctionSections,
  sectionForDocument,
  type ChefApplicationPhase,
} from "@/features/chef-onboarding/lib/chef-onboarding-flow";
import { captureSessionContext, isSessionContextCurrent } from "@/features/auth/api/cravesAuth";
import "@/features/chef-onboarding/styles/chef-onboarding.css";

const PHASE_ICON: Record<ChefApplicationPhase, ReactNode> = {
  DRAFT: <FileText size={20} aria-hidden="true" />,
  SUBMITTED: <Clock3 size={20} aria-hidden="true" />,
  UNDER_REVIEW: <Search size={20} aria-hidden="true" />,
  MORE_INFORMATION_REQUIRED: <AlertCircle size={20} aria-hidden="true" />,
  APPROVED: <CheckCircle2 size={20} aria-hidden="true" />,
  REJECTED: <XCircle size={20} aria-hidden="true" />,
};

const TEXT = messages({
  en: {
    whatNext: "What happens next?",
    reviewTitle: "Application review",
    reviewText: "Our team will review the details you submitted.",
    updateTitle: "Status update",
    updateText: "We’ll update your application status as the review progresses.",
    kitchenTitle: "Set up your kitchen",
    kitchenText: "Once approved, you can add menu items, configure working hours and manage orders.",
    reference: "Application reference",
    applicationId: "Application ID",
    submittedOn: "Submitted on",
    lastReviewed: "Last reviewed",
    applicationStatus: "Application status",
    toolsOpen: "Chef tools open once your application is approved.",
    approvedNext: "Set up your working hours, availability and menu to start receiving orders.",
    moreInfoNext: "Update the details below and submit your application again.",
    draftNext: "Continue where you left off. Your saved details are kept.",
    rejectedNext: "Contact Craves support if you have questions about this decision.",
    reason: "Reason",
    needsUpdating: "What needs updating",
    note: "Note from Craves",
    uploadNew: "Upload a new file.",
    needsAttention: "Needs attention",
    inOrder:
      "Applications are reviewed in the order they arrive, so the time can vary. You don’t need to do anything now: this page shows the decision as soon as it’s made.",
    kitchenReady: "Your kitchen is ready. Add your working hours, availability and menu items there.",
    supportTitle: "Talk to Craves support",
    supportText: "We can explain the decision and what you can do next.",
    call: "Call {phone}",
    email: "Email {email}",
    sessionEnded: "Your session ended. Sign in to check your application.",
    refreshFailed: "We couldn’t refresh your application. Please try again.",
    unverified: "Your application status could not be verified.",
    submittedUnknown: "We couldn’t confirm whether this application was submitted. Please try again.",
    savedUnverified: "Your saved application status could not be verified.",
    unavailable: "Application status is unavailable.",
    switchCustomer: "Switch to customer app",
    tryAgain: "Try again",
    openKitchen: "Open your kitchen",
    continueApp: "Continue application",
    update: "Update application",
    contactSupport: "Contact Craves support",
    checkingStatus: "Checking status…",
    refresh: "Refresh status",
    checkingText: "Checking your latest application status.",
    checkingAria: "Checking your application",
    signIn: "Sign in",
  },
  te: {
    whatNext: "తర్వాత ఏమి జరుగుతుంది?",
    reviewTitle: "దరఖాస్తు పరిశీలన",
    reviewText: "మీరు పంపిన వివరాలను మా బృందం చూస్తుంది.",
    updateTitle: "స్థితి సమాచారం",
    updateText: "పరిశీలన జరిగే కొద్దీ మీ దరఖాస్తు స్థితిని మారుస్తాం.",
    kitchenTitle: "మీ వంటగది సిద్ధం చేసుకోండి",
    kitchenText: "ఆమోదం వచ్చాక మీరు మెనూలో వంటకాలు జోడించవచ్చు, పని సమయాలు పెట్టుకోవచ్చు, ఆర్డర్లు చూసుకోవచ్చు.",
    reference: "దరఖాస్తు నంబర్",
    applicationId: "దరఖాస్తు ID",
    submittedOn: "పంపిన తేదీ",
    lastReviewed: "చివరిగా చూసిన తేదీ",
    applicationStatus: "దరఖాస్తు స్థితి",
    toolsOpen: "మీ దరఖాస్తు ఆమోదించాక చెఫ్ టూల్స్ తెరుచుకుంటాయి.",
    approvedNext: "ఆర్డర్లు రావడం మొదలవ్వాలంటే మీ పని సమయాలు, అందుబాటు, మెనూ సిద్ధం చేయండి.",
    moreInfoNext: "కింది వివరాలు మార్చి, మీ దరఖాస్తును మళ్లీ పంపండి.",
    draftNext: "మీరు ఆపిన చోటు నుంచి కొనసాగండి. సేవ్ చేసిన వివరాలు అలాగే ఉంటాయి.",
    rejectedNext: "ఈ నిర్ణయం గురించి సందేహాలుంటే Craves సహాయ బృందాన్ని సంప్రదించండి.",
    reason: "కారణం",
    needsUpdating: "ఏమి మార్చాలి",
    note: "Craves నుంచి సందేశం",
    uploadNew: "కొత్త ఫైల్ అప్‌లోడ్ చేయండి.",
    needsAttention: "సరిచేయాలి",
    inOrder:
      "దరఖాస్తులను వచ్చిన వరుసలో చూస్తాం, అందుకే సమయం మారవచ్చు. ఇప్పుడు మీరు ఏమీ చేయనక్కర్లేదు: నిర్ణయం తీసుకోగానే ఈ పేజీలో కనిపిస్తుంది.",
    kitchenReady: "మీ వంటగది సిద్ధంగా ఉంది. అక్కడ మీ పని సమయాలు, అందుబాటు, మెనూ వంటకాలు జోడించండి.",
    supportTitle: "Craves సహాయ బృందంతో మాట్లాడండి",
    supportText: "నిర్ణయం గురించి, తర్వాత మీరు ఏమి చేయవచ్చో మేము చెబుతాం.",
    call: "{phone} కు కాల్ చేయండి",
    email: "{email} కు ఈమెయిల్ చేయండి",
    sessionEnded: "మీ సైన్ ఇన్ ముగిసింది. దరఖాస్తు చూడడానికి సైన్ ఇన్ చేయండి.",
    refreshFailed: "మీ దరఖాస్తును మళ్లీ చూపించలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    unverified: "మీ దరఖాస్తు స్థితిని నిర్ధారించలేకపోయాం.",
    submittedUnknown: "ఈ దరఖాస్తు పంపారో లేదో నిర్ధారించలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    savedUnverified: "సేవ్ చేసిన మీ దరఖాస్తు స్థితిని నిర్ధారించలేకపోయాం.",
    unavailable: "దరఖాస్తు స్థితి ప్రస్తుతం అందుబాటులో లేదు.",
    switchCustomer: "కస్టమర్ యాప్‌కు మారండి",
    tryAgain: "మళ్లీ ప్రయత్నించండి",
    openKitchen: "మీ వంటగది తెరవండి",
    continueApp: "దరఖాస్తు కొనసాగించండి",
    update: "దరఖాస్తు మార్చండి",
    contactSupport: "Craves సహాయ బృందాన్ని సంప్రదించండి",
    checkingStatus: "స్థితి చూస్తున్నాం…",
    refresh: "స్థితి మళ్లీ చూడండి",
    checkingText: "మీ దరఖాస్తు తాజా స్థితి చూస్తున్నాం.",
    checkingAria: "మీ దరఖాస్తు చూస్తున్నాం",
    signIn: "సైన్ ఇన్",
  },
  kn: {
    whatNext: "ಮುಂದೆ ಏನಾಗುತ್ತದೆ?",
    reviewTitle: "ಅರ್ಜಿ ಪರಿಶೀಲನೆ",
    reviewText: "ನೀವು ಕಳುಹಿಸಿದ ವಿವರಗಳನ್ನು ನಮ್ಮ ತಂಡ ಪರಿಶೀಲಿಸುತ್ತದೆ.",
    updateTitle: "ಸ್ಥಿತಿಯ ಮಾಹಿತಿ",
    updateText: "ಪರಿಶೀಲನೆ ನಡೆದಂತೆ ನಿಮ್ಮ ಅರ್ಜಿಯ ಸ್ಥಿತಿಯನ್ನು ಬದಲಾಯಿಸುತ್ತೇವೆ.",
    kitchenTitle: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧಪಡಿಸಿ",
    kitchenText: "ಅನುಮೋದನೆ ಸಿಕ್ಕ ನಂತರ ನೀವು ಮೆನುಗೆ ಖಾದ್ಯಗಳನ್ನು ಸೇರಿಸಬಹುದು, ಕೆಲಸದ ಸಮಯ ಹೊಂದಿಸಬಹುದು ಮತ್ತು ಆರ್ಡರ್‌ಗಳನ್ನು ನೋಡಿಕೊಳ್ಳಬಹುದು.",
    reference: "ಅರ್ಜಿ ಸಂಖ್ಯೆ",
    applicationId: "ಅರ್ಜಿ ID",
    submittedOn: "ಕಳುಹಿಸಿದ ದಿನಾಂಕ",
    lastReviewed: "ಕೊನೆಯ ಪರಿಶೀಲನೆಯ ದಿನಾಂಕ",
    applicationStatus: "ಅರ್ಜಿಯ ಸ್ಥಿತಿ",
    toolsOpen: "ನಿಮ್ಮ ಅರ್ಜಿ ಅನುಮೋದನೆಯಾದ ನಂತರ ಚೆಫ್ ಟೂಲ್‌ಗಳು ತೆರೆಯುತ್ತವೆ.",
    approvedNext: "ಆರ್ಡರ್‌ಗಳು ಬರಲು ಶುರುವಾಗಲು ನಿಮ್ಮ ಕೆಲಸದ ಸಮಯ, ಲಭ್ಯತೆ ಮತ್ತು ಮೆನು ಸಿದ್ಧಪಡಿಸಿ.",
    moreInfoNext: "ಕೆಳಗಿನ ವಿವರಗಳನ್ನು ಬದಲಾಯಿಸಿ, ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಮತ್ತೆ ಕಳುಹಿಸಿ.",
    draftNext: "ನೀವು ನಿಲ್ಲಿಸಿದ ಕಡೆಯಿಂದ ಮುಂದುವರಿಸಿ. ಉಳಿಸಿದ ವಿವರಗಳು ಹಾಗೆಯೇ ಇರುತ್ತವೆ.",
    rejectedNext: "ಈ ನಿರ್ಧಾರದ ಬಗ್ಗೆ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ Craves ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    reason: "ಕಾರಣ",
    needsUpdating: "ಏನು ಬದಲಾಯಿಸಬೇಕು",
    note: "Craves ನಿಂದ ಸಂದೇಶ",
    uploadNew: "ಹೊಸ ಫೈಲ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
    needsAttention: "ಸರಿಪಡಿಸಬೇಕು",
    inOrder:
      "ಅರ್ಜಿಗಳನ್ನು ಬಂದ ಕ್ರಮದಲ್ಲಿ ಪರಿಶೀಲಿಸುತ್ತೇವೆ, ಹಾಗಾಗಿ ಸಮಯ ಬದಲಾಗಬಹುದು. ಈಗ ನೀವು ಏನೂ ಮಾಡಬೇಕಿಲ್ಲ: ನಿರ್ಧಾರ ಆದ ತಕ್ಷಣ ಈ ಪುಟದಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.",
    kitchenReady: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ಸಿದ್ಧವಾಗಿದೆ. ಅಲ್ಲಿ ನಿಮ್ಮ ಕೆಲಸದ ಸಮಯ, ಲಭ್ಯತೆ ಮತ್ತು ಮೆನು ಖಾದ್ಯಗಳನ್ನು ಸೇರಿಸಿ.",
    supportTitle: "Craves ಸಹಾಯ ತಂಡದೊಂದಿಗೆ ಮಾತನಾಡಿ",
    supportText: "ನಿರ್ಧಾರದ ಬಗ್ಗೆ ಮತ್ತು ಮುಂದೆ ನೀವು ಏನು ಮಾಡಬಹುದು ಎಂದು ನಾವು ವಿವರಿಸುತ್ತೇವೆ.",
    call: "{phone} ಗೆ ಕರೆ ಮಾಡಿ",
    email: "{email} ಗೆ ಇಮೇಲ್ ಮಾಡಿ",
    sessionEnded: "ನಿಮ್ಮ ಸೈನ್ ಇನ್ ಮುಗಿದಿದೆ. ಅರ್ಜಿ ನೋಡಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.",
    refreshFailed: "ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಮತ್ತೆ ತೋರಿಸಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    unverified: "ನಿಮ್ಮ ಅರ್ಜಿಯ ಸ್ಥಿತಿಯನ್ನು ಖಚಿತಪಡಿಸಲು ಆಗಲಿಲ್ಲ.",
    submittedUnknown: "ಈ ಅರ್ಜಿ ಕಳುಹಿಸಲಾಗಿದೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    savedUnverified: "ಉಳಿಸಿದ ನಿಮ್ಮ ಅರ್ಜಿಯ ಸ್ಥಿತಿಯನ್ನು ಖಚಿತಪಡಿಸಲು ಆಗಲಿಲ್ಲ.",
    unavailable: "ಅರ್ಜಿಯ ಸ್ಥಿತಿ ಈಗ ಲಭ್ಯವಿಲ್ಲ.",
    switchCustomer: "ಗ್ರಾಹಕ ಆ್ಯಪ್‌ಗೆ ಬದಲಿಸಿ",
    tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    openKitchen: "ನಿಮ್ಮ ಅಡುಗೆಮನೆ ತೆರೆಯಿರಿ",
    continueApp: "ಅರ್ಜಿ ಮುಂದುವರಿಸಿ",
    update: "ಅರ್ಜಿ ಬದಲಾಯಿಸಿ",
    contactSupport: "Craves ಸಹಾಯ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ",
    checkingStatus: "ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…",
    refresh: "ಸ್ಥಿತಿ ಮತ್ತೆ ನೋಡಿ",
    checkingText: "ನಿಮ್ಮ ಅರ್ಜಿಯ ಇತ್ತೀಚಿನ ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ.",
    checkingAria: "ನಿಮ್ಮ ಅರ್ಜಿ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ",
    signIn: "ಸೈನ್ ಇನ್",
  },
});

/** The three truthful next steps shared by the confirmation and the pending status. */
export function WhatHappensNext() {
  const text = useText(TEXT);
  return (
    <Card title={text.whatNext}>
      <div className="cob-next">
        <div className="cob-next-item">
          <span className="cob-icon-well cob-icon-well--neutral cob-icon-well--round">
            <Search size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>{text.reviewTitle}</strong>
            <p>{text.reviewText}</p>
          </div>
        </div>
        <div className="cob-next-item">
          <span className="cob-icon-well cob-icon-well--neutral cob-icon-well--round">
            <Bell size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>{text.updateTitle}</strong>
            <p>{text.updateText}</p>
          </div>
        </div>
        <div className="cob-next-item">
          <span className="cob-icon-well cob-icon-well--neutral cob-icon-well--round">
            <ChefHat size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>{text.kitchenTitle}</strong>
            <p>{text.kitchenText}</p>
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
  application: Pick<ChefApplication, "id" | "submittedAt" | "reviewedAt" | "referenceCode">;
  phase: ChefApplicationPhase;
}) {
  const text = useText(TEXT);
  const rows: ["reference" | "id" | "submitted" | "reviewed", string, ReactNode][] = [
    application.referenceCode
      ? ["reference", text.reference, application.referenceCode]
      : ["id", text.applicationId, application.id],
    ["submitted", text.submittedOn, phase === "DRAFT" ? null : formatDate(application.submittedAt)],
    ["reviewed", text.lastReviewed, formatDate(application.reviewedAt)],
  ];
  const visible = rows.filter(([, , value]) => value);
  if (!visible.length) return null;
  return (
    <dl className="cob-rows">
      {visible.map(([key, label, value]) => (
        <div key={key} className="cob-row">
          <dt>{label}</dt>
          <dd className={key === "reference" ? "cob-mono" : undefined} style={{ fontSize: key === "id" ? 13 : undefined }}>{value}</dd>
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
  /** Sections the reviewer named; document rejections add their own sections. */
  sections?: string[];
  supportPhone?: string;
  supportEmail?: string;
};

/** Status content for every application phase. Operational tools are never linked before approval. */
export function ChefStatusView({
  phase,
  application,
  reason,
  documents = [],
  sections: requested = [],
  supportPhone,
  supportEmail,
}: StatusInput) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const copy = applicationPhaseCopy(phase, language);
  const needsUpdate = documents.filter((document) => document.status === "REJECTED");
  const flagged = new Set([
    ...requested,
    ...needsUpdate.map((document) => sectionForDocument(document.documentType)),
  ]);
  const sections = CHEF_SECTIONS.filter((section) => flagged.has(section));
  const explanation = reason ?? application.rejectionReason;
  return (
    <div className="cob-stack">
      <Card>
        <div className="cob-status-line">
          <span className="cob-icon-well cob-icon-well--neutral">{PHASE_ICON[phase]}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <small>{text.applicationStatus}</small>
            <strong>{copy.label}</strong>
          </div>
        </div>
        <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.55 }}>
          {copy.message}{" "}
          <span style={{ color: "#6B6B6B" }}>
            {phase === "SUBMITTED" || phase === "UNDER_REVIEW"
              ? text.toolsOpen
              : phase === "APPROVED"
                ? text.approvedNext
                : phase === "MORE_INFORMATION_REQUIRED"
                  ? text.moreInfoNext
                  : phase === "DRAFT"
                    ? text.draftNext
                    : text.rejectedNext}
          </span>
        </p>
        {phase === "REJECTED" && explanation ? (
          <div className="cob-reason" style={{ marginTop: 14 }}>
            <strong>{text.reason}</strong>
            {explanation}
          </div>
        ) : null}
        <div className="cob-divider" style={{ margin: "16px 0" }} />
        <ApplicationFacts application={application} phase={phase} />
      </Card>

      {phase === "MORE_INFORMATION_REQUIRED" ? (
        <Card icon={<AlertCircle size={20} aria-hidden="true" />} title={text.needsUpdating}>
          <div className="cob-fields" style={{ gap: 12 }}>
            {explanation ? (
              <div className="cob-reason">
                <strong>{text.note}</strong>
                {explanation}
              </div>
            ) : null}
            {sections.length ? (
              <div className="cob-list">
                {sections.map((section) => (
                  // Each flagged section opens straight on its own step.
                  <Link
                    key={section}
                    href={`/chef/application?step=${section}`}
                    className="cob-list-row"
                    style={{ minHeight: 0, color: "inherit", textDecoration: "none" }}
                  >
                    <span className="cob-list-label">
                      {chefSectionLabel(section, language)}
                      {needsUpdate
                        .filter((document) => sectionForDocument(document.documentType) === section)
                        .map((document) => (
                          <small key={document.id}>
                            {document.reviewReason ?? text.uploadNew}
                          </small>
                        ))}
                    </span>
                    <StatusChip tone="attention">{text.needsAttention}</StatusChip>
                    <ChevronRight size={18} aria-hidden="true" style={{ flexShrink: 0, color: "#6B6B6B" }} />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {phase === "REJECTED" ? (
        <SupportCard phone={supportPhone} email={supportEmail} applicationId={application.id} />
      ) : null}

      {phase === "SUBMITTED" || phase === "UNDER_REVIEW" ? (
        <>
          <WhatHappensNext />
          <Note tone="neutral" icon={<Clock3 size={18} aria-hidden="true" />}>
            {text.inOrder}
          </Note>
        </>
      ) : null}

      {phase === "APPROVED" ? (
        <Note tone="neutral" icon={<ChefHat size={18} aria-hidden="true" />}>
          {text.kitchenReady}
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
  const text = useText(TEXT);
  if (!phone && !email) return null;
  const subject = encodeURIComponent(`Chef application ${applicationId ?? ""}`.trim());
  return (
    <Card title={text.supportTitle} subtitle={text.supportText}>
      <div className="cob-fields" style={{ gap: 10 }}>
        {phone ? (
          <a className="cob-secondary" href={`tel:${phone}`}>
            <Phone size={18} aria-hidden="true" />
            {format(text.call, { phone: formatPhone(phone) })}
          </a>
        ) : null}
        {email ? (
          <a className="cob-secondary" href={`mailto:${email}?subject=${subject}`}>
            <Mail size={18} aria-hidden="true" />
            {format(text.email, { email })}
          </a>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * /chef/application/status: the applicant's home in Chef Mode, shown as a page inside the chef shell
 * so the account menu stays in reach. Pending applicants are never offered the kitchen.
 */
export function ChefApplicationStatus({ draftsEnabled }: { draftsEnabled: boolean }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
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
      const response = await sessionFetch("/api/chef/application", {
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 401) setSignedOut(true);
        throw response.status === 401
          ? new ChefError(text.sessionEnded, "SESSION_EXPIRED", 401)
          : chefApiError(response, await response.json().catch(() => null), text.refreshFailed);
      }
      const next = parseChefApplication(await response.json());
      if (!next) throw new Error(text.unverified);
      let saved: OnboardingState | null = null;
      if (draftsEnabled && next.status !== "APPROVED") {
        const draft = await sessionFetch("/api/chef/onboarding", {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!draft.ok)
          throw new ChefError(
            text.submittedUnknown,
            chefApiError(draft, await draft.json().catch(() => null), "").ref,
            draft.status,
          );
        saved = parseOnboardingState(await draft.json());
        if (!saved) throw new Error(text.savedUnverified);
      }
      if (generation.current === request && isSessionContextCurrent(owner.current)) {
        setApplication(next);
        setOnboarding(saved);
        setSignedOut(false);
      }
    } catch (failure) {
      if (generation.current === request && isSessionContextCurrent(owner.current))
        setError(chefErrorText(failure, text.unavailable));
    } finally {
      if (generation.current === request && isSessionContextCurrent(owner.current)) setBusy(false);
    }
    // A new language reads the status again, so a shown error is in the new language too.
  }, [draftsEnabled, text]);
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
  // Changes requested: open the first section the reviewer flagged.
  const correction = onboarding ? correctionSections(onboarding)[0] : undefined;
  const switchToCustomer = (
    <button type="button" className="cob-link cob-link--ink cob-link--center" onClick={switchToCustomerApp}>
      {text.switchCustomer}
    </button>
  );
  const footer = !phase ? (
    error ? (
      <button type="button" className="cob-primary" disabled={busy} onClick={() => void load()}>
        {busy ? <Spinner /> : <RefreshCw size={18} aria-hidden="true" />}
        {text.tryAgain}
      </button>
    ) : null
  ) : phase === "APPROVED" ? (
    <Link href="/chef" className="cob-primary">
      {text.openKitchen}
    </Link>
  ) : phase === "DRAFT" ? (
    <Link href="/chef/application" className="cob-primary">
      {text.continueApp}
    </Link>
  ) : phase === "MORE_INFORMATION_REQUIRED" ? (
    <Link href={correction ? `/chef/application?step=${correction}` : "/chef/application"} className="cob-primary">
      {text.update}
    </Link>
  ) : phase === "REJECTED" ? (
    <>
      <Link href="/contact" className="cob-primary">
        {text.contactSupport}
      </Link>
      {switchToCustomer}
    </>
  ) : (
    <>
      <button type="button" className="cob-primary" disabled={busy} onClick={() => void load()}>
        {busy ? <Spinner /> : null}
        {busy ? text.checkingStatus : text.refresh}
      </button>
      {switchToCustomer}
    </>
  );
  return (
    <section className="cob rounded-[20px] bg-[#F1F3F5] px-4 py-6 sm:p-8" aria-busy={busy}>
      <div className="cob-heading">
        <h1>{chefSectionTitle("status", language)}</h1>
        <p>{phase ? chefSectionDescription("status", language) : text.checkingText}</p>
      </div>
      {application && phase ? (
        <ChefStatusView
          phase={phase}
          application={application}
          reason={onboarding?.progress?.reason}
          documents={onboarding?.documents}
          sections={onboarding?.progress?.sections}
          supportPhone={onboarding?.supportPhone}
          supportEmail={onboarding?.supportEmail}
        />
      ) : busy ? (
        <div className="cob-stack" role="status" aria-label={text.checkingAria}>
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
                <Link href="/chef/sign-in?returnTo=%2Fchef%2Fapplication%2Fstatus" className="cob-link">
                  {text.signIn}
                </Link>
              </>
            ) : null}
          </Note>
        </div>
      ) : null}
      {footer ? <div className="cob-page-actions">{footer}</div> : null}
    </section>
  );
}
