"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { captureSessionContext, isSessionContextCurrent } from "@/services/auth/cravesAuth";
import { bankStatusSchema, type BankStatus } from "@/lib/bank-onboarding-contract";
import { chefEmailEligible, type EmailVerificationState } from "@/lib/email-verification-contract";
import { parseCustomerProfile } from "@/lib/profile-contract";
import {
  EMPTY_ONBOARDING,
  parseOnboardingState,
  type OnboardingDetails,
  type OnboardingState,
} from "@/lib/chef-onboarding-v2-contract";
import {
  afterSectionSave,
  bankCanContinue,
  CHEF_SECTIONS,
  firstIncompleteSection,
  validateChefSection,
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
    throw new Error(
      response.status === 401
        ? "Your session expired. Sign in again to continue."
        : response.status === 409
          ? "Your saved application changed. Reload it before trying again."
          : (message ?? "We could not complete this request. Your saved progress is preserved."),
    );
  }
  return raw;
}
function verifiedState(raw: unknown): OnboardingState {
  const next = parseOnboardingState(raw);
  if (!next) throw new Error("We could not verify your saved application. Please retry.");
  return next;
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
  const [fieldError, setFieldError] = useState<ChefFieldError | null>(null),
    [notice, setNotice] = useState("");
  const [fromReview, setFromReview] = useState(false),
    [terms, setTerms] = useState(false),
    [callbackCase, setCallbackCase] = useState("");
  const currentState = useRef(state),
    currentDetails = useRef(details),
    inFlight = useRef(false),
    mounted = useRef(true);
  const owner = useRef(captureSessionContext()),
    upload = useRef<XMLHttpRequest | null>(null),
    helpKey = useRef<string | null>(null);
  const current = useCallback(() => mounted.current && isSessionContextCurrent(owner.current), []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      upload.current?.abort();
    };
  }, []);
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
      if (!response.ok) throw new Error("We could not load your saved application. Please retry.");
      const next = verifiedState(await response.json());
      const nextBank = await refreshBank();
      if (!current()) return;
      currentState.current = next;
      setState(next);
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
      setScreen(
        next.application.status === "APPROVED" ||
          next.application.status === "REJECTED" && next.progress?.nextAction !== "EDIT_APPLICATION" ||
          next.submitted ||
          (next.legacy && next.application.status === "PENDING")
          ? "status"
          : next.details
            ? "resume"
            : "personal",
      );
      if (next.details && firstIncompleteSection(next, nextBank) === "review")
        setNotice("Your saved details are ready to review.");
    } catch (failure) {
      if (current())
        setError(failure instanceof Error ? failure.message : "Your application is unavailable.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [current, refreshBank]);
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
    setFieldError(null);
    setError("");
    setNotice("");
  }
  function updateDetails(update: (previous: OnboardingDetails) => OnboardingDetails) {
    setDetails((previous) => {
      const next = update(previous);
      currentDetails.current = next;
      return next;
    });
    setDirty(true);
    setError("");
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
          failure instanceof Error
            ? failure.message
            : "This step could not be completed. Please retry.",
        );
    } finally {
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  function focusError(next: ChefFieldError) {
    setFieldError(next);
    requestAnimationFrame(() => {
      const element = document.getElementById(`chef-${next.field}`);
      element?.focus();
      element?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }
  async function saveSection(section: ChefFormSection) {
    const existing = currentState.current;
    if (!existing) return;
    const invalid = validateChefSection(
      section,
      currentDetails.current,
      existing,
      chefEmailEligible(email),
    );
    if (invalid) {
      focusError(invalid);
      return;
    }
    await work(async () => {
      await persist();
      setScreen(afterSectionSave(section, fromReview));
      setFromReview(false);
    });
  }
  function edit(section: ChefFormSection) {
    setFromReview(true);
    setScreen(section);
    setFieldError(null);
    setError("");
    setNotice("");
  }
  function back() {
    if (busy) return;
    if (fromReview) {
      setScreen("review");
      setFromReview(false);
      return;
    }
    const index = CHEF_SECTIONS.indexOf(screen as ChefFormSection);
    if (index > 0) setScreen(CHEF_SECTIONS[index - 1]!);
    else if (screen === "review") setScreen("bank");
    else router.push("/home");
  }
  function exit() {
    if (busy) return;
    if (screen === "status" || screen === "submitted" || !dirty) {
      router.push("/home");
      return;
    }
    void work(async () => {
      await persist(true);
      router.push("/home");
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
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await persist();
      const form = new FormData();
      form.set("documentType", type);
      form.set("file", file);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        upload.current = xhr;
        xhr.open("POST", "/api/chef/application/proof-files");
        xhr.timeout = 45000;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && current())
            progress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onerror = () => reject(new Error("The upload connection failed. Please retry."));
        xhr.ontimeout = () => reject(new Error("The upload timed out. Please retry."));
        xhr.onabort = () =>
          reject(new Error("Upload cancelled. Your saved application is preserved."));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }
          let message = "Upload failed. Please retry.";
          try {
            const raw: unknown = JSON.parse(xhr.responseText);
            if (
              raw &&
              typeof raw === "object" &&
              "message" in raw &&
              typeof raw.message === "string"
            )
              message = raw.message;
          } catch {
            /* Keep safe fallback. */
          }
          reject(new Error(message));
        };
        xhr.send(form);
      });
      const next = verifiedState(await chefOnboardingApi("/api/chef/onboarding"));
      if (
        !next.documents.some(
          (document) =>
            document.documentType === type &&
            document.originalFileName === file.name &&
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
      const result = await chefOnboardingApi("/api/chef/onboarding/help", "POST", {
        requestKey: helpKey.current,
        message: `FSSAI callback requested during chef onboarding (${saved.application.status}); preferred language: ${currentDetails.current.language}. Please help me apply for FSSAI registration.`,
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
      if (current()) setCallbackCase(result.caseNumber);
    });
  }
  function savedBank(next: BankStatus) {
    if (!current()) return;
    setBank(next);
    setBankUnavailable(false);
    if (bankCanContinue(next)) {
      setScreen(afterSectionSave("bank", fromReview));
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
        throw new Error("Complete this section before submitting your application.");
      }
      const next = verifiedState(
        await chefOnboardingApi("/api/chef/onboarding/submit", "POST", {
          expectedVersion: saved.version,
          termsAccepted: true,
          termsVersion: saved.progress?.termsVersion ?? "craves-chef-terms-20261008-v1",
        }),
      );
      if (!next.submitted || next.application.status !== "PENDING" || !next.application.id)
        throw new Error(
          "Submission could not be confirmed. Check your application status before trying again.",
        );
      if (current()) {
        accept(next);
        setScreen("submitted");
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
    notice,
    setNotice,
    fromReview,
    terms,
    setTerms,
    callbackCase,
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
    removeFile,
    requestCallback,
    savedBank,
    bankBusy,
    submit,
  };
}
export type ChefOnboardingFlow = ReturnType<typeof useChefOnboarding>;
