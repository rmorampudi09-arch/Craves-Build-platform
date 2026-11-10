"use client";

import { useEffect, useState } from "react";
import { messages } from "@/shared/i18n/language";
import { useLanguage, useText } from "@/shared/i18n/language-context";
import { Sheet } from "@/shared/ui/overlays/overlay";
import { chefErrorText } from "@/features/chef/lib/chef-errors";
import { ChefFssaiDetails, type FssaiFlow } from "@/features/chef-onboarding/components/chef-onboarding-sections";
import { Note, Spinner } from "@/features/chef-onboarding/components/chef-onboarding-ui";
import { chefOnboardingApi, draftable } from "@/features/chef-onboarding/components/use-chef-onboarding";
import { fssaiGuideText } from "@/features/chef-onboarding/lib/chef-onboarding-flow";
import {
  EMPTY_ONBOARDING,
  fssaiVerified,
  parseOnboardingState,
  type CallbackRequest,
  type OnboardingState,
} from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import "@/features/chef-onboarding/styles/chef-onboarding.css";

const TEXT = messages({
  en: {
    title: "Add your FSSAI number",
    description: "Your dishes can go live to customers once Craves has verified your FSSAI number. The government requires it for every food business.",
    save: "Save number", saving: "Saving…", done: "Done",
    checking: "We are verifying your FSSAI number. You can make your dishes live once it is verified. If the number is wrong, correct it here.",
    verified: "Craves has verified your FSSAI number. You can make your dishes live now.", loading: "Loading…", tryAgain: "Try again",
    loadFailed: "We couldn’t load your FSSAI details.",
    invalid: "Enter your 14-digit FSSAI registration number.",
    saveFailed: "We couldn’t save your FSSAI number. Try again.",
    callbackFailed: "We couldn’t send your request. Try again.",
  },
  te: {
    title: "మీ FSSAI నంబర్ జోడించండి",
    description: "Craves మీ FSSAI నంబర్ ధృవీకరించాక మీ వంటకాలు కస్టమర్లకు కనిపిస్తాయి. ప్రతి ఆహార వ్యాపారానికి ఇది ప్రభుత్వ నిబంధన.",
    save: "నంబర్ సేవ్ చేయండి", saving: "సేవ్ అవుతోంది…", done: "సరే",
    checking: "మీ FSSAI నంబర్ ధృవీకరిస్తున్నాం. ధృవీకరణ అయ్యాక మీ వంటకాలు మెనూలో పెట్టవచ్చు. నంబర్ తప్పుగా ఉంటే ఇక్కడ సరిచేయండి.",
    verified: "Craves మీ FSSAI నంబర్ ధృవీకరించింది. ఇప్పుడు మీ వంటకాలు మెనూలో పెట్టవచ్చు.", loading: "లోడ్ అవుతోంది…", tryAgain: "మళ్లీ ప్రయత్నించండి",
    loadFailed: "మీ FSSAI వివరాలు తెరవలేకపోయాం.",
    invalid: "మీ 14 అంకెల FSSAI రిజిస్ట్రేషన్ నంబర్ ఇవ్వండి.",
    saveFailed: "మీ FSSAI నంబర్ సేవ్ చేయలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    callbackFailed: "మీ అభ్యర్థన పంపలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
  },
  kn: {
    title: "ನಿಮ್ಮ FSSAI ಸಂಖ್ಯೆ ಸೇರಿಸಿ",
    description: "Craves ನಿಮ್ಮ FSSAI ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಿದ ನಂತರ ನಿಮ್ಮ ತಿನಿಸುಗಳು ಗ್ರಾಹಕರಿಗೆ ಕಾಣುತ್ತವೆ. ಪ್ರತಿ ಆಹಾರ ವ್ಯಾಪಾರಕ್ಕೂ ಇದು ಸರ್ಕಾರದ ನಿಯಮ.",
    save: "ಸಂಖ್ಯೆ ಉಳಿಸಿ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", done: "ಸರಿ",
    checking: "ನಿಮ್ಮ FSSAI ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸುತ್ತಿದ್ದೇವೆ. ಪರಿಶೀಲನೆ ಆದ ನಂತರ ನಿಮ್ಮ ತಿನಿಸುಗಳನ್ನು ಮೆನುಗೆ ಸೇರಿಸಬಹುದು. ಸಂಖ್ಯೆ ತಪ್ಪಿದ್ದರೆ ಇಲ್ಲಿ ಸರಿಪಡಿಸಿ.",
    verified: "Craves ನಿಮ್ಮ FSSAI ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಿದೆ. ಈಗ ನಿಮ್ಮ ತಿನಿಸುಗಳನ್ನು ಮೆನುಗೆ ಸೇರಿಸಬಹುದು.", loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    loadFailed: "ನಿಮ್ಮ FSSAI ವಿವರಗಳನ್ನು ತೆರೆಯಲಾಗಲಿಲ್ಲ.",
    invalid: "ನಿಮ್ಮ 14 ಅಂಕಿಯ FSSAI ನೋಂದಣಿ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ.",
    saveFailed: "ನಿಮ್ಮ FSSAI ಸಂಖ್ಯೆ ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    callbackFailed: "ನಿಮ್ಮ ವಿನಂತಿ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
});

/**
 * The signup FSSAI screen, asked when an approved chef first puts a dish live. The chef saves the
 * number here; the dish can go live only after Craves has verified it, so nothing is published from here.
 */
export function ChefFssaiPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const text = useText(TEXT);
  const { language } = useLanguage();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [number, setNumber] = useState("");
  const [videoLanguage, setVideoLanguage] = useState("en");
  const [guide, setGuide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [callback, setCallback] = useState<CallbackRequest | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** One key per popup, so a retried callback request is the same request. */
  const [helpKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    let current = true;
    setState(null);
    setGuide(false);
    setError("");
    setFieldError("");
    chefOnboardingApi("/api/chef/onboarding")
      .then((raw) => {
        const next = parseOnboardingState(raw);
        if (!next) throw new Error(text.loadFailed);
        if (!current) return;
        setState(next);
        setNumber(next.details?.fssaiNumber ?? "");
        setVideoLanguage(next.details?.language || "en");
        setCallback(next.callbackRequest ?? null);
      })
      .catch((failure) => {
        if (current) setError(chefErrorText(failure, text.loadFailed));
      });
    return () => {
      current = false;
    };
  }, [open, attempt, text]);

  async function save() {
    if (!state || busy) return;
    if (!/^[0-9]{14}$/.test(number)) {
      setGuide(false);
      setFieldError(text.invalid);
      return;
    }
    setBusy(true);
    setError("");
    try {
      // The application is already submitted, so the service changes only the FSSAI number.
      const next = parseOnboardingState(
        await chefOnboardingApi("/api/chef/onboarding", "PATCH", {
          expectedVersion: state.version,
          details: draftable({ ...(state.details ?? EMPTY_ONBOARDING), fssaiNumber: number }),
        }),
      );
      if (!next) throw new Error(text.saveFailed);
      setState(next);
    } catch (failure) {
      setError(chefErrorText(failure, text.saveFailed));
    } finally {
      setBusy(false);
    }
  }

  async function requestCallback() {
    if (!state || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await chefOnboardingApi("/api/chef/onboarding/help", "POST", {
        requestKey: helpKey,
        message: [
          "Category: FSSAI application callback",
          "Request: Please call me on my verified mobile number to help me apply for FSSAI registration.",
          `Application: ${state.application.id ?? "Not created yet"} (${state.application.status})`,
          "Stage: Approved chef, adding FSSAI before going live",
          `Verified mobile: ${state.phoneNumber || "On file"}`,
          `Preferred language: ${videoLanguage}`,
        ].join("\n"),
      });
      if (!result || typeof result !== "object" || !("caseNumber" in result) || typeof result.caseNumber !== "string" || !result.caseNumber)
        throw new Error(text.callbackFailed);
      setCallback({ caseNumber: result.caseNumber, status: "OPEN", requestedAt: new Date().toISOString() });
    } catch (failure) {
      setError(chefErrorText(failure, text.callbackFailed));
    } finally {
      setBusy(false);
    }
  }

  const flow: FssaiFlow | null = state && {
    fssaiGuide: guide,
    setFssaiGuide: (next) => {
      setGuide(next);
      setError("");
      setFieldError("");
    },
    details: { ...(state.details ?? EMPTY_ONBOARDING), fssaiNumber: number, language: videoLanguage },
    field: (name, value) => {
      if (name === "fssaiNumber") {
        setNumber(String(value));
        setFieldError("");
      } else if (name === "language") setVideoLanguage(String(value));
    },
    fieldErrors: fieldError ? [{ field: "fssaiNumber", message: fieldError }] : [],
    state,
    busy,
    callbackCase: callback && callback.status !== "RESOLVED" ? callback.caseNumber : "",
    callback,
    requestCallback,
  };
  const heading = guide ? fssaiGuideText(language) : text;
  const saved = state?.details?.fssaiNumber ?? "";
  // Saved and unchanged: nothing to save, the chef waits for Craves (or is already verified).
  const waiting = /^[0-9]{14}$/.test(saved) && saved === number;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      busy={busy}
      closeOnOutsideTap={false}
      title={heading.title}
      description={heading.description}
      footer={
        flow && !guide ? (
          <button
            type="button"
            className="craves-primary-action w-full sm:w-auto"
            aria-busy={busy || undefined}
            disabled={busy}
            onClick={() => (waiting ? onClose() : void save())}
          >
            {waiting ? text.done : busy ? text.saving : text.save}
          </button>
        ) : null
      }
    >
      <div className="cob mt-4">
        <div className="cob-stack">
          {flow && waiting && !guide ? (
            <Note role="status">{state && fssaiVerified(state) ? text.verified : text.checking}</Note>
          ) : null}
          {flow ? (
            <ChefFssaiDetails flow={flow} />
          ) : error ? null : (
            <p role="status" className="cob-helper">
              <Spinner /> {text.loading}
            </p>
          )}
          {error ? (
            <Note tone="error" role="alert">
              {error}{" "}
              {flow ? null : (
                <button type="button" className="cob-link" onClick={() => setAttempt((value) => value + 1)}>
                  {text.tryAgain}
                </button>
              )}
            </Note>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
