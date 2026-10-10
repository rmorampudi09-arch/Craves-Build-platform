"use client";

import { chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureSessionContext, isSessionContextCurrent } from "@/services/auth/cravesAuth";
import { useStepHistory } from "@/components/use-step-history";
import { bankStatusSchema, type BankStatus } from "@/lib/bank-onboarding-contract";
import { chefEmailEligible, type EmailVerificationState } from "@/lib/email-verification-contract";
import { parseCustomerProfile } from "@/lib/profile-contract";
import {
  EMPTY_ONBOARDING,
  parseOnboardingState,
  type CallbackRequest,
  type OnboardingDetails,
  type OnboardingState,
} from "@/lib/chef-onboarding-v2-contract";
import {
  afterSectionSave,
  bankCanContinue,
  activeChefSections,
  correctionSections,
  firstIncompleteSection,
  listInWords,
  missingKitchenFields,
  validateChefSectionAll,
  type ChefFieldError,
  type ChefFormScreen,
  type ChefFormSection,
} from "@/lib/chef-onboarding-flow";

export async function chefOnboardingApi(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      raw && typeof raw === "object" && "message" in raw && typeof raw.message === "string"
        ? raw.message
        : null;
    throw new ChefError(
      response.status === 401
        ? "Your session expired. Sign in again to continue."
        : response.status === 409
          ? (message ?? "Your saved application changed. Reload it before trying again.")
          : (message ?? "We could not complete this request. Your saved progress is preserved."),
      chefApiError(response, raw, "").ref,
      response.status,
    );
  }
  return raw;
}
const INCOMPLETE_MESSAGES: Record<ChefFormSection, string> = {
  personal: "Complete your basic details before submitting your application.",
  kitchen: "Complete your kitchen details and add both kitchen photos before submitting.",
  fssai:
    "Add your 14-digit FSSAI registration number before submitting. If you don’t have one yet, use “Don’t have FSSAI?” for help.",
  documents: "Upload your identity document before submitting your application.",
  bank: "Confirm your bank details before submitting your application.",
};
function verifiedState(raw: unknown): OnboardingState {
  const next = parseOnboardingState(raw);
  if (!next) throw new Error("We could not verify your saved application. Please retry.");
  return next;
}
/** The applicant's home inside Chef Mode; leaving the form always lands here, never on customer screens. */
const APPLICATION_HUB = "/chef/application/status";
/** The applicant may change the saved application, so a ?step= in the URL can open a section. */
function editable(state: OnboardingState): boolean {
  return (
    state.enabled &&
    !state.submitted &&
    !state.legacy &&
    state.application.status !== "APPROVED" &&
    !(state.application.status === "REJECTED" && state.progress?.nextAction !== "EDIT_APPLICATION")
  );
}
/** A URL step this application can show; anything else opens the first incomplete step. */
function stepFor(state: OnboardingState, bank: BankStatus | null, step: string): ChefFormScreen {
  return step === "review" || (activeChefSections(state) as readonly string[]).includes(step)
    ? (step as ChefFormScreen)
    : firstIncompleteSection(state, bank);
}

export function useChefOnboarding() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [details, setDetails] = useState<OnboardingDetails>({ ...EMPTY_ONBOARDING });
  const [screen, setScreen] = useState<ChefFormScreen>("personal");
  const [bank, setBank] = useState<BankStatus | null>(null),
    [bankUnavailable, setBankUnavailable] = useState(false);
  const [email, setEmail] = useState<EmailVerificationState | null>(null);
  const [loading, setLoading] = useState(true),
    [unavailable, setUnavailable] = useState(false),
    [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  // Every field problem on the screen, in screen order; the first one gets focus.
  const [fieldErrors, setFieldErrors] = useState<ChefFieldError[]>([]),
    [notice, setNotice] = useState("");
  const fieldError = fieldErrors[0] ?? null;
  const [fromReview, setFromReview] = useState(false),
    [terms, setTerms] = useState(false),
    [callback, setCallback] = useState<CallbackRequest | null>(null);
  // An open or contacted request blocks a duplicate; a resolved one lets the applicant ask again.
  const callbackCase = callback && callback.status !== "RESOLVED" ? callback.caseNumber : "";
  const [fssaiGuide, setFssaiGuideState] = useState(false);
  const currentState = useRef(state),
    currentDetails = useRef(details),
    inFlight = useRef(false),
    mounted = useRef(true);
  const owner = useRef(captureSessionContext()),
    upload = useRef<XMLHttpRequest | null>(null),
    helpKey = useRef<string | null>(null);
  const current = useCallback(() => mounted.current && isSessionContextCurrent(owner.current), []);
  // The screen behind the bare /chef/application URL, chosen from the saved draft on load.
  const entry = useRef<ChefFormScreen>("personal");
  const { urlStep, showStep } = useStepHistory(browserStep);
  const requestedStep = useRef(urlStep);
  useEffect(() => {
    requestedStep.current = urlStep;
  }, [urlStep]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      upload.current?.abort();
    };
  }, []);
  useEffect(() => {
    // Only a form the hook knows is unsaved warns before the page unloads.
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function accept(next: OnboardingState, preserveDetails = false) {
    if (!current()) return;
    currentState.current = next;
    setState(next);
    if (!preserveDetails) {
      const saved = next.details ?? { ...EMPTY_ONBOARDING };
      currentDetails.current = saved;
      setDetails(saved);
      setDirty(false);
    }
  }
  const refreshBank = useCallback(async () => {
    try {
      const next = bankStatusSchema.parse(await chefOnboardingApi("/api/chef-onboarding/bank"));
      if (current()) {
        setBank(next);
        setBankUnavailable(false);
      }
      return next;
    } catch {
      if (current()) setBankUnavailable(true);
      return null;
    }
  }, [current]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chef/onboarding", {
        cache: "no-store",
        credentials: "same-origin",
        signal: AbortSignal.timeout(45000),
      });
      if (!current()) return;
      if (response.status === 401) {
        setSignedOut(true);
        return;
      }
      if (response.status === 404) {
        setUnavailable(true);
        return;
      }
      if (!response.ok) throw new ChefError("We could not load your saved application. Please retry.", chefApiError(response, await response.json().catch(() => null), "").ref, response.status);
      const next = verifiedState(await response.json());
      const nextBank = next.bankEnrollmentRequired === false ? null : await refreshBank();
      if (!current()) return;
      if (next.bankEnrollmentRequired === false) {
        setBank(null);
        setBankUnavailable(false);
      }
      currentState.current = next;
      setState(next);
      setCallback(next.callbackRequest ?? null);
      setSignedOut(false);
      setUnavailable(false);
      let nextDetails = next.details ?? { ...EMPTY_ONBOARDING };
      if (!next.details && !next.legacy && next.enabled) {
        try {
          const profile = parseCustomerProfile(await chefOnboardingApi("/api/customer/profile"));
          if (profile)
            nextDetails = {
              ...nextDetails,
              firstName: profile.firstName,
              lastName: profile.lastName,
              email: profile.email ?? "",
            };
        } catch {
          /* Optional profile hydration must not block a phone-authenticated applicant. */
        }
      }
      if (!current()) return;
      currentDetails.current = nextDetails;
      setDetails(nextDetails);
      setDirty(false);
      setFromReview(false);
      setFssaiGuideState(false);
      const destination: ChefFormScreen =
        next.application.status === "APPROVED" && next.legacy ||
          next.application.status === "REJECTED" && next.progress?.nextAction !== "EDIT_APPLICATION" ||
          next.progress?.status === "MORE_INFORMATION_REQUIRED" ||
          next.submitted ||
          (next.legacy && next.application.status === "PENDING")
          ? "status"
          : next.details
            ? "resume"
            : "personal";
      entry.current = destination;
      const requested = requestedStep.current;
      if (requested && editable(next)) {
        const step = stepFor(next, nextBank, requested);
        setScreen(step);
        if (step !== requested) showStep(step, true);
        return;
      }
      // A step that can no longer be edited (for example after submission) falls back to the bare URL.
      if (requested) showStep(null, true);
      setScreen(destination);
      if (destination === "resume" && firstIncompleteSection(next, nextBank) === "review")
        setNotice("Your saved details are ready to review.");
    } catch (failure) {
      if (current())
        setError(chefErrorText(failure, "Your application is unavailable."));
    } finally {
      if (current()) setLoading(false);
    }
  }, [current, refreshBank, showStep]);
  useEffect(() => {
    void load();
  }, [load]);

  function field<K extends keyof OnboardingDetails>(key: K, value: OnboardingDetails[K]) {
    setDetails((previous) => {
      const next = { ...previous, [key]: value };
      currentDetails.current = next;
      return next;
    });
    setDirty(true);
    setFieldErrors((errors) => errors.filter((item) => item.field !== key));
    setError("");
    setNotice("");
  }
  function updateDetails(update: (previous: OnboardingDetails) => OnboardingDetails) {
    // Clear the errors this change fixes: the pin feeds "location", first and last name "fullName".
    const before = currentDetails.current;
    const after = update(before);
    const fixed = new Set<string>(
      (Object.keys(after) as (keyof OnboardingDetails)[])
        .filter((key) => after[key] !== before[key])
        .map((key) =>
          key === "latitude" || key === "longitude"
            ? "location"
            : key === "firstName" || key === "lastName"
              ? "fullName"
              : key,
        ),
    );
    setDetails((previous) => {
      const next = update(previous);
      currentDetails.current = next;
      return next;
    });
    setDirty(true);
    setError("");
    if (fixed.size) setFieldErrors((errors) => errors.filter((item) => !fixed.has(item.field)));
  }
  const onEmail = useCallback((next: EmailVerificationState | null) => {
    setEmail(next);
    if (next?.email && currentDetails.current.email !== next.email) {
      const updated = { ...currentDetails.current, email: next.email };
      currentDetails.current = updated;
      setDetails(updated);
      setDirty(true);
    }
  }, []);
  async function persist(partial = false): Promise<OnboardingState> {
    const existing = currentState.current;
    if (!existing || !current()) throw new Error("Sign in again to continue.");
    if (existing.submitted || existing.legacy)
      throw new Error(
        "This application is already submitted. Check its status before making changes.",
      );
    const next = verifiedState(
      await chefOnboardingApi("/api/chef/onboarding", partial ? "PATCH" : "PUT", {
        expectedVersion: existing.version,
        details: {...currentDetails.current,dateOfBirth:currentDetails.current.dateOfBirth || null},
      }),
    );
    if (!current())
      throw new Error("Your session changed. Open your current application to continue.");
    accept(next);
    return next;
  }
  async function work(action: () => Promise<void>) {
    if (inFlight.current || !current()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      if (current())
        setError(
          chefErrorText(failure, "This step could not be completed. Please retry."),
        );
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  /** Shows every error at its field and moves to the first one. */
  function focusError(next: ChefFieldError | ChefFieldError[]) {
    const errors = Array.isArray(next) ? next : [next];
    if (!errors.length) return;
    setFieldErrors(errors);
    requestAnimationFrame(() => {
      const element = document.getElementById(`chef-${errors[0]!.field}`);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }
  /** Jumps to a required kitchen field from the photo checklist and says what it needs. */
  function goToField(field: string) {
    const missing = missingKitchenFields(currentDetails.current).find((item) => item.field === field);
    if (missing)
      setFieldErrors((errors) =>
        errors.some((item) => item.field === field) ? errors : [...errors, { field, message: missing.message }],
      );
    requestAnimationFrame(() => {
      const element = document.getElementById(`chef-${field}`);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }
  /**
   * Photos are saved to the application record, which the server creates only once the
   * kitchen details are complete. Before a photo is picked, show what is missing and go there.
   */
  function kitchenReadyForPhotos(): boolean {
    const missing = missingKitchenFields(currentDetails.current);
    if (!missing.length) return true;
    focusError(missing.map(({ field, message }) => ({ field, message })));
    return false;
  }
  /** Shows a screen and clears transient messages from the previous one. */
  function show(next: ChefFormScreen) {
    setScreen(next);
    setFssaiGuideState(false);
    setFieldErrors([]);
    setError("");
    setNotice("");
  }
  /** Moves between screens; each form step gets its own history entry (?step=<id>). */
  function go(next: ChefFormScreen) {
    show(next);
    if (next !== "submitted" && next !== "status") showStep(next === entry.current ? null : next);
  }
  /** Browser Back/Forward changed ?step=: follow it without adding another history entry. */
  function browserStep(step: string | null) {
    const saved = currentState.current;
    if (!saved || busy) return;
    if (step === null) show(entry.current);
    else if (editable(saved)) show(stepFor(saved, bank, step));
  }
  function toHub() {
    router.push(APPLICATION_HUB);
  }
  async function saveSection(section: ChefFormSection) {
    const existing = currentState.current;
    if (!existing) return;
    const invalid = validateChefSectionAll(
      section,
      currentDetails.current,
      existing,
      chefEmailEligible(email),
    );
    if (invalid.length) {
      focusError(invalid);
      return;
    }
    await work(async () => {
      const saved = await persist();
      go(afterSectionSave(section, fromReview, saved));
      setFromReview(false);
    });
  }
  /** Saves the FSSAI help view as a draft and lets the applicant finish the other sections. */
  async function continueWithoutFssai() {
    const value = currentDetails.current.fssaiNumber.trim();
    if (value && !/^[0-9]{14}$/.test(value)) {
      setFssaiGuideState(false);
      focusError({
        field: "fssaiNumber",
        message: "Finish your 14-digit FSSAI number, or clear it to continue without one for now.",
      });
      return;
    }
    await work(async () => {
      const saved = await persist();
      go(afterSectionSave("fssai", fromReview, saved));
      setFromReview(false);
    });
  }
  function setFssaiGuide(open: boolean) {
    setFssaiGuideState(open);
    setFieldErrors([]);
    setError("");
    setNotice("");
  }
  /** The first section a reviewer flagged, otherwise the first incomplete one. */
  function nextCorrection(): ChefFormSection | "review" {
    const saved = currentState.current;
    if (!saved) return "personal";
    return correctionSections(saved)[0] ?? firstIncompleteSection(saved, bank);
  }
  function edit(section: ChefFormSection) {
    setFromReview(true);
    go(section);
  }
  /** Opens a section from the Welcome back list in the normal onboarding order. */
  function open(section: ChefFormSection | "review") {
    setFromReview(false);
    go(section);
  }
  function back() {
    if (busy) return;
    if (screen === "fssai" && fssaiGuide) {
      setFssaiGuide(false);
      return;
    }
    if (fromReview) {
      go("review");
      setFromReview(false);
      return;
    }
    const sections = activeChefSections(currentState.current);
    const index = sections.indexOf(screen as ChefFormSection);
    if (index > 0) go(sections[index - 1]!);
    else if (screen === "review") go(sections[sections.length - 1]!);
    else if (index === 0 && currentState.current?.details) go("resume");
    else if (!dirty || window.confirm("Leave without saving? Your latest changes are not saved yet.")) toHub();
  }
  function cancelUpload() {
    upload.current?.abort();
  }
  function exit() {
    if (busy) return;
    if (screen === "status" || screen === "submitted" || !dirty) {
      toHub();
      return;
    }
    void work(async () => {
      await persist(true);
      toHub();
    });
  }
  async function removeFile(id:string) {
    await work(async () => {
      const saved=currentState.current;
      if(!saved) throw new Error("Reload your saved application.");
      accept(verifiedState(await chefOnboardingApi(`/api/chef/onboarding/documents/${id}`,"DELETE",{expectedVersion:saved.version})),true);
    });
  }
  async function uploadFile(type: string, file: File, progress: (value: number) => void) {
    if (inFlight.current || !current()) throw new Error("Wait for the current save to finish.");
    if (type.startsWith("KITCHEN_PHOTO") && !kitchenReadyForPhotos())
      throw new ChefError(
        `Add your ${listInWords(missingKitchenFields(currentDetails.current).map((item) => item.noun))} first. Photos are saved with your kitchen address.`,
        "KITCHEN_DETAILS_REQUIRED",
        0,
      );
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await persist();
      const form = new FormData();
      form.set("documentType", type);
      form.set("file", file);
      const uploadedId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        upload.current = xhr;
        xhr.open("POST", "/api/chef/application/proof-files");
        xhr.timeout = 45000;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && current())
            progress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onerror = () => reject(new ChefError("The upload connection failed. Check your internet connection and retry.", "NETWORK_ERROR", 0));
        xhr.ontimeout = () => reject(new ChefError("The upload timed out. Please retry.", "TIMEOUT", 0));
        xhr.onabort = () =>
          reject(new ChefError("Upload cancelled. Your saved application is preserved.", "UPLOAD_CANCELLED", 0));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            let id = "";
            try {
              const raw: unknown = JSON.parse(xhr.responseText);
              if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string") id = raw.id;
            } catch {
              /* An unreadable receipt fails the confirmation below. */
            }
            resolve(id);
            return;
          }
          let raw: unknown = null;
          try {
            raw = JSON.parse(xhr.responseText);
          } catch {
            /* Keep safe fallback. */
          }
          reject(chefApiError({ status: xhr.status }, raw, "Upload failed. Please retry."));
        };
        xhr.send(form);
      });
      const next = verifiedState(await chefOnboardingApi("/api/chef/onboarding"));
      // Confirm by id: the server renames files (spaces and symbols become "-"), so names never match.
      if (
        !next.documents.some(
          (document) =>
            document.id === uploadedId &&
            document.documentType === type &&
            document.status !== "REJECTED",
        )
      )
        throw new Error(
          "The upload response could not be confirmed. Reload saved uploads before retrying.",
        );
      accept(next);
      progress(100);
    } finally {
      upload.current = null;
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  async function requestCallback() {
    if (callbackCase) return;
    await work(async () => {
      const saved = await persist();
      helpKey.current ??= crypto.randomUUID();
      const fssai = currentDetails.current.fssaiNumber;
      const result = await chefOnboardingApi("/api/chef/onboarding/help", "POST", {
        requestKey: helpKey.current,
        message: [
          "Category: FSSAI application callback",
          "Request: Please call me on my verified mobile number to help me apply for FSSAI registration.",
          `Application: ${saved.application.id ?? "Not created yet"} (${saved.application.status})`,
          "Onboarding stage: FSSAI details",
          `FSSAI status: ${/^[0-9]{14}$/.test(fssai) ? "Number added" : "No FSSAI number yet"}`,
          `Verified mobile: ${saved.phoneNumber || "On file"}`,
          `Preferred language: ${currentDetails.current.language}`,
        ].join("\n"),
      });
      if (
        !result ||
        typeof result !== "object" ||
        !("id" in result) ||
        typeof result.id !== "string" ||
        !("caseNumber" in result) ||
        typeof result.caseNumber !== "string" ||
        !result.caseNumber
      )
        throw new Error(
          "Your callback request could not be confirmed. Retry to check the same request.",
        );
      if (current())
        setCallback({ caseNumber: result.caseNumber, status: "OPEN", requestedAt: new Date().toISOString() });
    });
  }
  function savedBank(next: BankStatus) {
    if (!current()) return;
    setBank(next);
    setBankUnavailable(false);
    if (bankCanContinue(next)) {
      go(afterSectionSave("bank", fromReview));
      setFromReview(false);
    }
  }
  function bankBusy(value: boolean) {
    inFlight.current = value;
    if (current()) setBusy(value);
  }
  async function submit() {
    await work(async () => {
      if (!terms) throw new Error("Accept the terms before submitting your application.");
      const saved = await persist();
      if (!saved) throw new Error("Reload your saved application.");
      const incomplete = firstIncompleteSection(saved, bank);
      if (incomplete !== "review") {
        edit(incomplete);
        throw new Error(INCOMPLETE_MESSAGES[incomplete]);
      }
      const next = verifiedState(
        await chefOnboardingApi("/api/chef/onboarding/submit", "POST", {
          expectedVersion: saved.version,
          termsAccepted: true,
          termsVersion: saved.progress?.termsVersion ?? "craves-chef-terms-20261008-v1",
        }),
      );
      if (!next.submitted || !["PENDING", ...(saved.application.status === "APPROVED" ? ["APPROVED"] : [])].includes(next.application.status) || !next.application.id)
        throw new Error(
          "Submission could not be confirmed. Check your application status before trying again.",
        );
      if (current()) {
        accept(next);
        go("submitted");
        // Replace, so Back from the status page can never reopen the submitted form.
        router.replace(APPLICATION_HUB);
      }
    });
  }
  return {
    state,
    details,
    screen,
    setScreen,
    bank,
    bankUnavailable,
    email,
    onEmail,
    loading,
    unavailable,
    signedOut,
    busy,
    dirty,
    error,
    fieldError,
    fieldErrors,
    notice,
    setNotice,
    fromReview,
    terms,
    setTerms,
    callbackCase,
    callback,
    nextCorrection,
    fssaiGuide,
    setFssaiGuide,
    continueWithoutFssai,
    open,
    go,
    cancelUpload,
    load,
    refreshBank,
    field,
    updateDetails,
    work,
    persist,
    saveSection,
    edit,
    back,
    exit,
    uploadFile,
    kitchenReadyForPhotos,
    goToField,
    removeFile,
    requestCallback,
    savedBank,
    bankBusy,
    submit,
  };
}
export type ChefOnboardingFlow = ReturnType<typeof useChefOnboarding>;

