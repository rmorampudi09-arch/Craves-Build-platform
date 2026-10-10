"use client";

import { CHEF_ERROR_MESSAGES, chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import Link from "next/link";
import { Button } from "@/components/ui/buttons/button";
import { AddressMapPicker } from "@/components/location/AddressMapPicker";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ChefApplicationDocumentPanel } from "@/components/chef-application-document-panel";
import type { CustomerAddress } from "@/lib/address-contract";
import { selectActiveDeliveryAddress } from "@/lib/address-selection";
import { parseChefApplication, type ChefApplication } from "@/lib/chef-application-contract";
import type { CustomerProfile } from "@/lib/profile-contract";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";
import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";
import { chefEmailEligible, type EmailVerificationState } from "@/lib/email-verification-contract";

type FormState = {
  email: string;
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: string;
  longitude: string;
};

type ApplicationStep =
  | "welcome"
  | "account"
  | "kitchen"
  | "kitchen-photos"
  | "fssai"
  | "about"
  | "address"
  | "review"
  | "documents-intro"
  | "documents"
  | "waiting"
  | "approved";

const EMPTY: FormState = {
  email: "",
  firstName: "",
  lastName: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: "",
  longitude: "",
};

const PENDING_UPDATE_LABEL = "Update pending application";
const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10 disabled:bg-[#F1F3F5]";

function fromApplication(application: ChefApplication): FormState {
  return {
    email: application.email ?? "",
    firstName: application.firstName ?? "",
    lastName: application.lastName ?? "",
    addressLine1: application.addressLine1 ?? "",
    addressLine2: application.addressLine2 ?? "",
    landmark: application.landmark ?? "",
    city: application.city ?? "",
    state: application.state ?? "",
    postalCode: application.postalCode ?? "",
    latitude: application.latitude === null ? "" : String(application.latitude),
    longitude: application.longitude === null ? "" : String(application.longitude),
  };
}

function prefillNewApplication(
  application: ChefApplication,
  profile: CustomerProfile | null,
  addresses: CustomerAddress[],
): FormState {
  const form = fromApplication(application);
  const address = selectActiveDeliveryAddress(addresses);
  return {
    ...form,
    email: "",
    firstName: form.firstName || profile?.firstName || "",
    lastName: form.lastName || profile?.lastName || "",
    addressLine1: form.addressLine1 || address?.addressLine1 || "",
    addressLine2: form.addressLine2 || address?.addressLine2 || "",
    landmark: form.landmark || address?.landmark || "",
    city: form.city || address?.city || "",
    state: form.state || address?.state || "",
    postalCode: form.postalCode || address?.postalCode || "",
    latitude:
      form.latitude ||
      (typeof address?.latitude === "number" ? String(address.latitude) : ""),
    longitude:
      form.longitude ||
      (typeof address?.longitude === "number" ? String(address.longitude) : ""),
  };
}

function needsPhotoCorrection(application: ChefApplication): boolean {
  return (
    application.status === "REJECTED" &&
    /photo|image|id|aadhaar|pan|document|proof/i.test(application.rejectionReason ?? "")
  );
}

function hasRequiredEvidence(application: ChefApplication): boolean {
  const types = new Set(application.documents.filter(document => document.status === "UPLOADED" || document.status === "APPROVED").map((document) => document.documentType));
  const modernEvidence = [
    "APPLICANT_PHOTO",
    "GOVERNMENT_ID_FRONT",
    "GOVERNMENT_ID_BACK",
    "TAX_ID_CARD",
  ].every((type) => types.has(type as never));
  return modernEvidence;
}

function addressSummary(form: FormState): string {
  return [
    form.addressLine1,
    form.addressLine2,
    form.landmark,
    form.city,
    form.state,
    form.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function StepHeader({
  part,
  label,
  onBack,
}: {
  part: number;
  label: string;
  onBack?: () => void;
}) {
  return (
    <div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F1F3F5]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>
        ) : (
          <span />
        )}
        <p className="text-sm font-semibold text-[#6B6B6B]">Step {part} of 8 · {label}</p>
      </div>
      <div className="mt-2 grid grid-cols-8 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
          <span
            key={value}
            className={`h-1.5 rounded-full ${value <= part ? "bg-[#F62E18]" : "bg-[#E5E7EB]"}`}
          />
        ))}
      </div>
    </div>
  );
}

function IconCircle({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
      {children}
    </span>
  );
}

export function ChefApplicationWorkspace() {
  const [application, setApplication] = useState<ChefApplication | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [emailVerification, setEmailVerification] = useState<EmailVerificationState | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<ApplicationStep>("welcome");
  const [message, setMessage] = useState("Loading your application…");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [invalidField, setInvalidField] = useState<keyof FormState | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const locationRequest = useRef(0);

  useEffect(() => {
    if (!invalidField) return;
    const input = document.getElementById(`chef-${invalidField}`);
    input?.focus({ preventScroll: true });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    if (!reduced) input?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 240, iterations: 1 });
  }, [invalidField, validationAttempt, step]);

  function invalidate(name: keyof FormState, reason: string) {
    setInvalidField(name);
    setValidationAttempt(value => value + 1);
    setMessage(reason);
  }
  function inputProps(name: keyof FormState) {
    return { id: `chef-${name}`, name, "aria-invalid": invalidField === name, "aria-describedby": invalidField === name ? "chef-field-error" : undefined };
  }
  async function moveKitchenPin(next: { latitude: number; longitude: number }) {
    const version = ++locationRequest.current;
    setForm(current => ({ ...current, latitude: String(next.latitude), longitude: String(next.longitude) }));
    setLocating(true);
    try {
      const address = await reverseGeocodeCurrentLocation(next.latitude, next.longitude);
      if (version !== locationRequest.current) return;
      setForm(current => ({ ...current, addressLine1: address.houseNumber || address.formattedAddress, addressLine2: [address.street, address.area].filter(Boolean).join(", "), city: address.city || current.city, state: address.state || current.state, postalCode: address.postalCode || current.postalCode }));
      setMessage("Pin updated. Check your house and address details below.");
    } catch {
      if (version === locationRequest.current) setMessage("Pin updated. Please enter the address details below.");
    } finally { if (version === locationRequest.current) setLocating(false); }
  }
  async function openReview() {
    setBusy(true);
    try { await load(); setStep("review"); }
    catch { setMessage("We couldn’t refresh your application. Please try again."); }
    finally { setBusy(false); }
  }

  async function load() {
    setLoadFailed(false);
    const signal = AbortSignal.timeout(45_000);
    const [applicationResult, profileResult, addressesResult] = await Promise.allSettled([
      fetch("/api/chef/application", { cache: "no-store", signal }),
      fetch("/api/customer/profile", { cache: "no-store", signal }),
      fetch("/api/customer/addresses", { cache: "no-store", signal }),
    ]);
    if (applicationResult.status === "rejected") throw applicationResult.reason;
    const applicationResponse = applicationResult.value;
    const rawApplication = await applicationResponse.json().catch(() => null);
    const applicationBody = parseChefApplication(rawApplication);
    if (!applicationResponse.ok || !applicationBody) {
      throw applicationResponse.status === 401
        ? new ChefError("Sign in to continue your chef application.", "SESSION_EXPIRED", 401)
        : applicationResponse.ok
          ? new ChefError(CHEF_ERROR_MESSAGES.UNEXPECTED_RESPONSE, "INVALID_CHEF_APPLICATION_RESPONSE", applicationResponse.status)
          : chefApiError(applicationResponse, rawApplication, "We couldn’t load your application right now.");
    }

    const nextProfile = profileResult.status === "fulfilled" && profileResult.value.ok
      ? ((await profileResult.value.json().catch(() => null)) as CustomerProfile | null)
      : null;
    const addresses = addressesResult.status === "fulfilled" && addressesResult.value.ok
      ? ((await addressesResult.value.json().catch(() => [])) as CustomerAddress[])
      : [];

    setApplication(applicationBody);
    setProfile(nextProfile);
    if (applicationBody.status === "NOT_SUBMITTED") {
      setForm(prefillNewApplication(applicationBody, nextProfile, Array.isArray(addresses) ? addresses : []));
      setStep("welcome");
    } else {
      setForm(fromApplication(applicationBody));
      if (applicationBody.status === "APPROVED") setStep("approved");
      else if (needsPhotoCorrection(applicationBody) && !hasRequiredEvidence(applicationBody)) setStep("documents-intro");
      else if (applicationBody.status === "REJECTED") setStep("review");
      else if (hasRequiredEvidence(applicationBody)) setStep("waiting");
      else setStep("documents-intro");
    }
    setMessage("");
  }

  useEffect(() => {
    void load().catch((error) => {
      setLoadFailed(true);
      setMessage(
        chefErrorText(error, "We couldn’t load your application right now."),
      );
    });
  }, []);

  function field<K extends keyof FormState>(name: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [name]: value }));
    if (invalidField === name) { setInvalidField(null); setMessage(""); }
  }

  function go(next: ApplicationStep) {
    setMessage("");
    setInvalidField(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function continueAbout() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      invalidate(!form.firstName.trim() ? "firstName" : "lastName", !form.firstName.trim() ? "First name is required." : "Last name is required.");
      return;
    }
    go("account");
  }

  function continueAddress() {
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      invalidate(!form.addressLine1.trim() ? "addressLine1" : !form.city.trim() ? "city" : "state", !form.addressLine1.trim() ? "House or building is required." : !form.city.trim() ? "City is required." : "State is required.");
      return;
    }
    go("kitchen-photos");
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("This browser can’t use your current location. You can type the address below instead.");
      return;
    }
    setLocating(true);
    setMessage("Finding your kitchen address…");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));
        try {
          const detected = await reverseGeocodeCurrentLocation(latitude, longitude);
          const areaDetails = [detected.street, detected.area, detected.district]
            .filter(Boolean)
            .join(", ");
          setForm((current) => ({
            ...current,
            addressLine1: detected.houseNumber || detected.formattedAddress,
            addressLine2: detected.houseNumber ? areaDetails : current.addressLine2,
            city: detected.city || current.city,
            state: detected.state || current.state,
            postalCode: detected.postalCode || current.postalCode,
            latitude: String(latitude),
            longitude: String(longitude),
          }));
          setMessage(
            detected.preciseHouseNumber
              ? "We found your neighborhood. Please check the address below."
              : "We found the area. Please add or check your house or building details below.",
          );
        } catch {
          setForm((current) => ({
            ...current,
            latitude: String(latitude),
            longitude: String(longitude),
          }));
          setMessage("We found your location, but not the full written address. Please type the missing details below.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setMessage("Location wasn’t shared. That’s okay — type your kitchen address below.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const locked = application?.status === "APPROVED";
    if (locked || loadFailed || busy || !application) return;
    if (!chefEmailEligible(emailVerification)) {
      setStep("account");
      setMessage("Verify your email before submitting your chef application.");
      return;
    }
    if (!emailVerification?.email || !form.firstName.trim() || !form.lastName.trim()) {
      setStep(!form.firstName.trim() || !form.lastName.trim() ? "about" : "account");
      invalidate(!form.firstName.trim() ? "firstName" : !form.lastName.trim() ? "lastName" : "email", "Complete your required contact details.");
      return;
    }
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      setStep("address");
      invalidate(!form.addressLine1.trim() ? "addressLine1" : !form.city.trim() ? "city" : "state", !form.addressLine1.trim() ? "House or building is required." : !form.city.trim() ? "City is required." : "State is required.");
      return;
    }

    const updating = application?.status === "PENDING";
    setBusy(true);
    setMessage(updating ? "Saving your changes…" : "Saving your details…");
    try {
      const response = await fetch("/api/chef/application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: emailVerification?.email,
          addressLine2: form.addressLine2 || null,
          landmark: form.landmark || null,
          postalCode: form.postalCode || null,
          latitude: form.latitude === "" ? null : Number(form.latitude),
          longitude: form.longitude === "" ? null : Number(form.longitude),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const raw = await response.json().catch(() => null);
      const body = parseChefApplication(raw);
      if (!response.ok || !body) {
        throw response.ok
          ? new ChefError("We couldn’t confirm your details were saved. Check your application status before trying again.", "INVALID_CHEF_APPLICATION_RESPONSE", response.status)
          : chefApiError(response, raw, "We couldn’t save your details. Please try again.");
      }
      setApplication(body);
      setForm(fromApplication(body));
      setMessage("");
      if (body.status === "APPROVED") setStep("approved");
      else if (hasRequiredEvidence(body)) setStep("review");
      else setStep("documents-intro");
    } catch (error) {
      setMessage(error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? chefErrorText(new ChefError("Saving took too long. Check your application status before trying again.", "TIMEOUT", 0), "")
        : chefErrorText(error, "We couldn’t save your details. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    setBusy(true);
    setMessage("Checking your application status…");
    try {
      await load();
    } catch (error) {
      setMessage(chefErrorText(error, "We couldn’t check your status right now."));
    } finally {
      setBusy(false);
    }
  }

  const locked = !application || loadFailed || application.status === "APPROVED";


  if (message.startsWith("Loading") && !application) {
    return <div className="h-72 animate-pulse rounded-3xl bg-[#F1F3F5]" aria-label="Loading your application" />;
  }

  if (!application && message) {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
        <p className="text-sm text-[#6B6B6B]">{message}</p>
        <button type="button" disabled={busy} onClick={() => void refreshStatus()} className="mt-5 rounded-full bg-[#F62E18] px-6 py-3 font-semibold text-white">{busy ? "Checking…" : "Try again"}</button>
      </section>
    );
  }

  if (step === "welcome") {
    return <section className="chef-step overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[var(--shadow-card)]">
      <img src="/home/cravings/craves-home-banner.webp" alt="Homemade food prepared for sharing" className="aspect-[16/7] w-full object-cover object-right" fetchPriority="high" />
      <div className="p-6 md:p-9"><p className="text-sm font-semibold text-primary">Become a Craves Chef</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Share your homemade food with thousands of customers</h1>
        <div className="mt-6 space-y-3 text-sm">{["Earn from your cooking", "Reach nearby customers", "Manage your kitchen easily"].map(item => <p key={item} className="flex items-center gap-3"><Check className="h-5 w-5 text-primary" aria-hidden="true" />{item}</p>)}</div>
        <Button className="mt-7 w-full" onClick={() => go("about")}>Become a Chef <ChevronRight className="h-4 w-4" /></Button>
        <Button asChild variant="ghost" className="mt-2 w-full"><Link href="/sign-in?returnTo=/chef">Already a Chef? Login</Link></Button>
      </div>
    </section>;
  }

  if (step === "account") {
    return <section className="chef-step rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
      <StepHeader part={2} label="Your account" onBack={() => go("about")} />
      <h1 className="mt-7 text-3xl font-bold">Let’s get to know you</h1>
      <p className="mt-3 text-sm text-[#6B6B6B]">Use your existing Craves phone sign-in and verify the email for your Chef application.</p>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#F1F3F5] p-4"><Phone className="h-5 w-5 text-primary" /><span className="text-sm">{profile?.registeredPhoneNumber ? `Signed in with ${profile.registeredPhoneNumber}` : "Your signed-in Craves account is connected."}</span></div>
      <div className="mt-5"><EmailVerificationPanel required onStateChange={state => { setEmailVerification(state); if (state?.email) field("email", state.email); }} /></div>
      <Button className="mt-6 w-full" disabled={!chefEmailEligible(emailVerification)} onClick={() => go("kitchen")}>Continue</Button>
    </section>;
  }

  if (step === "kitchen" || step === "kitchen-photos" || step === "fssai") {
    const kitchenStep = step === "kitchen";
    const photoStep = step === "kitchen-photos";
    return <form onSubmit={submit} className="chef-step rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
      <StepHeader part={kitchenStep ? 3 : photoStep ? 5 : 6} label={kitchenStep ? "Kitchen details" : photoStep ? "Kitchen photos" : "Food safety"} onBack={() => go(kitchenStep ? "account" : photoStep ? "address" : "kitchen-photos")} />
      <h1 className="mt-7 text-3xl font-bold">{kitchenStep ? "Tell customers about your kitchen" : photoStep ? "Show your kitchen" : "Food Safety Details"}</h1>
      <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{kitchenStep ? "You can save your kitchen name, description and contact details after your Chef application is approved." : photoStep ? "Kitchen-photo verification is not available yet. Photos cannot be submitted in this step." : "FSSAI submission and application assistance are not available yet. Identity approval does not verify food-business compliance."}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">{(kitchenStep ? ["Kitchen name & description", "Kitchen contact details"] : photoStep ? ["Cooking area", "Storage area", "Hygiene area", "Kitchen overview"] : ["Already have FSSAI", "Need help applying"]).map(item => <div key={item} className="rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5] p-5"><p className="font-semibold">{item}</p><p className="mt-2 text-xs text-[#6B6B6B]">{kitchenStep ? "Available after approval" : "Not available yet"}</p></div>)}</div>
      {message ? <p role="alert" className="mt-4 text-sm">{message}</p> : null}
      {kitchenStep || photoStep ? <Button type="button" className="mt-7 w-full" onClick={() => go(kitchenStep ? "address" : "fssai")}>Continue</Button> : <><p className="mt-5 text-sm text-[#6B6B6B]">Save your verified contact and location details to open secure identity uploads.</p><Button type="submit" aria-label={application?.status === "PENDING" ? PENDING_UPDATE_LABEL : undefined} className="mt-5 w-full" disabled={busy || locked || !chefEmailEligible(emailVerification)}>{busy ? "Saving…" : "Save details and continue"}</Button>{!chefEmailEligible(emailVerification) ? <Button type="button" variant="outline" className="mt-3 w-full" onClick={() => go("account")}>Verify your email</Button> : null}</>}
    </form>;
  }

  if (step === "about") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={1} label="Personal details" onBack={() => go("welcome")} />
        <div className="mt-7"><IconCircle><UserRound className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">What’s your name?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Use the same name that appears on your ID. Both names are required.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A]">First name<input {...inputProps("firstName")} value={form.firstName} onChange={(event) => field("firstName", event.target.value)} className={INPUT_CLASS} autoComplete="given-name" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Last name<input {...inputProps("lastName")} value={form.lastName} onChange={(event) => field("lastName", event.target.value)} className={INPUT_CLASS} autoComplete="family-name" /></label>
        </div>
        {profile?.registeredPhoneNumber ? <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]"><Phone className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" /><span>Your Craves phone number is already saved: <strong className="text-[#1A1A1A]">{profile.registeredPhoneNumber}</strong></span></div> : null}
        {message ? <p id="chef-field-error" role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" onClick={continueAbout} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "address") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={4} label="Kitchen location" onBack={() => go("kitchen")} />
        <div className="mt-7"><IconCircle><MapPin className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Where is your kitchen located?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">This is the kitchen address used for food pickup. House or building, city and state are required; other fields are optional.</p>
        <button type="button" disabled={locating} onClick={useCurrentLocation} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 font-semibold text-[#F62E18] disabled:opacity-50"><MapPin className="h-4 w-4" aria-hidden="true" />{locating ? "Finding my address…" : "Use my current location"}</button>
        {message ? <p id="chef-field-error" role={invalidField ? "alert" : "status"} className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        {form.latitude !== "" && form.longitude !== "" ? <div className="mt-5"><AddressMapPicker latitude={Number(form.latitude)} longitude={Number(form.longitude)} onCenterChange={next => void moveKitchenPin(next)} onUseCurrentLocation={useCurrentLocation} locating={locating} disabled={locating} /></div> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Flat / House / Building<input {...inputProps("addressLine1")} value={form.addressLine1} onChange={(event) => field("addressLine1", event.target.value)} className={INPUT_CLASS} autoComplete="address-line1" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Street / Area <span className="font-normal text-[#6B6B6B]">(optional)</span><input {...inputProps("addressLine2")} value={form.addressLine2} onChange={(event) => field("addressLine2", event.target.value)} className={INPUT_CLASS} autoComplete="address-line2" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Landmark <span className="font-normal text-[#6B6B6B]">(optional)</span><input {...inputProps("landmark")} value={form.landmark} onChange={(event) => field("landmark", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">City<input {...inputProps("city")} value={form.city} onChange={(event) => field("city", event.target.value)} className={INPUT_CLASS} autoComplete="address-level2" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">State<input {...inputProps("state")} value={form.state} onChange={(event) => field("state", event.target.value)} className={INPUT_CLASS} autoComplete="address-level1" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Pincode <span className="font-normal text-[#6B6B6B]">(optional)</span><input {...inputProps("postalCode")} value={form.postalCode} onChange={(event) => field("postalCode", event.target.value)} className={INPUT_CLASS} inputMode="numeric" autoComplete="postal-code" /></label>
        </div>
        <button type="button" onClick={continueAddress} disabled={locating} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">Continue</button>
      </section>
    );
  }

  if (step === "review") {
    const required = ["APPLICANT_PHOTO", "GOVERNMENT_ID_FRONT", "GOVERNMENT_ID_BACK", "TAX_ID_CARD"];
    const documentsReady = required.every(type => application?.documents.some(document => document.documentType === type && (document.status === "UPLOADED" || document.status === "APPROVED")));
    const checklist = [
      { label: "Personal details", complete: Boolean(form.firstName && form.lastName), target: "about" as ApplicationStep },
      { label: "Verified email", complete: chefEmailEligible(emailVerification), target: "account" as ApplicationStep },
      { label: "Kitchen location", complete: Boolean(form.addressLine1 && form.city && form.state), target: "address" as ApplicationStep },
      { label: "Identity & address documents", complete: documentsReady, target: "documents" as ApplicationStep },
    ];
    const completion = Math.round(checklist.filter(item => item.complete).length / checklist.length * 100);
    return <form onSubmit={submit} className="chef-step rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
      <StepHeader part={8} label="Review your application" onBack={() => go("documents")} />
      <div className="mt-7 flex items-center gap-5"><div role="progressbar" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100} aria-label="Available application details complete" className="grid h-20 w-20 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-flame-red) ${completion}%, #e5e7eb 0)` }}><span className="grid h-16 w-16 place-items-center rounded-full bg-white text-lg font-bold">{completion}%</span></div><div><h1 className="text-3xl font-bold">Your Chef Profile</h1><p className="mt-2 text-sm text-[#6B6B6B]">Available application details complete</p></div></div>
      {application?.rejectionReason ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm">{application.rejectionReason}</p> : null}
      <div className="mt-5"><EmailVerificationPanel compact required onStateChange={setEmailVerification} /></div>
      <p className="mt-5 font-semibold">{form.firstName} {form.lastName}</p><p className="mt-1 text-sm text-[#6B6B6B]">{addressSummary(form)}</p>
      <div className="mt-6 space-y-2">{checklist.map(item => <button key={item.label} type="button" onClick={() => go(item.target)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 text-left text-sm"><Check className={`h-5 w-5 ${item.complete ? "text-primary" : "text-[#9CA3AF]"}`} /><span className="flex-1">{item.label}</span><span className="text-xs text-[#6B6B6B]">{item.complete ? "Saved" : "Needs attention"}</span><ChevronRight className="h-4 w-4" /></button>)}</div>
      <p className="mt-5 rounded-xl bg-[#F1F3F5] p-4 text-sm leading-6 text-[#6B6B6B]">Kitchen setup opens after approval. Kitchen photos and FSSAI are not included in this percentage because submission is not available yet. Each identity document is reviewed separately.</p>
      {message ? <p role="alert" className="mt-4 text-sm">{message}</p> : null}
      {application?.status === "REJECTED" ? <Button type="submit" className="mt-6 w-full" disabled={!documentsReady || busy || !chefEmailEligible(emailVerification)}>{busy ? "Resubmitting…" : "Resubmit for verification"}</Button> : <Button type="button" className="mt-6 w-full" disabled={!documentsReady || busy} onClick={() => void refreshStatus()}>View verification status</Button>}
    </form>;
  }

  if (step === "documents-intro") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={7} label="Identity documents" onBack={() => go("fssai")} />
        <div className="mt-7"><IconCircle><ShieldCheck className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Verify your identity</h1>
        <p className="mt-3 text-base leading-7 text-[#6B6B6B]">We ask every chef to provide these details so we know who is preparing your food. Your ID photos are kept private and secure.</p>
        <div className="mt-6 space-y-3 rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">{["A clear photo of you", "Front of your government ID", "Back of the same ID", "Your PAN card"].map((item) => <p key={item} className="flex items-center gap-3"><Camera className="h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" />{item}</p>)}</div>
        <button type="button" onClick={() => go("documents")} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "documents") {
    return <div className="chef-step space-y-5"><StepHeader part={7} label="Identity documents" onBack={() => go("documents-intro")} /><ChefApplicationDocumentPanel onComplete={() => void openReview()} />{message ? <p role="alert">{message}</p> : null}</div>;
  }

  if (step === "waiting") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] md:p-10">
        <IconCircle><Send className="h-7 w-7" aria-hidden="true" /></IconCircle>
        <p className="mt-6 text-sm font-semibold text-[#F62E18]">Application status</p>
        <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">Application under review</h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#6B6B6B]">Your details and photos are with Craves. There’s nothing else you need to do unless we ask for an update.</p>
        <span className="mt-5 inline-flex rounded-full bg-[#F1F3F5] px-4 py-2 text-sm font-semibold text-[#1A1A1A]">Under review</span>
        {message ? <p role="status" className="mx-auto mt-4 max-w-xl text-sm text-[#6B6B6B]">{message}</p> : null}
        <button type="button" onClick={() => void refreshStatus()} disabled={busy} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50 sm:w-auto">{busy ? "Checking…" : "Check status"}</button>
        <div className="mt-3">
          <Link href="/home" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#F1F3F5] px-5 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E5E7EB]">Switch to Customer Mode</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] md:p-10">
      <IconCircle><Check className="h-7 w-7" aria-hidden="true" /></IconCircle>
      <p className="mt-6 text-sm font-semibold text-[#F62E18]">You’re approved</p>
      <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">Congratulations! You’re now a Craves chef</h1>
      <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#6B6B6B]">Your Chef Mode is ready. Save your kitchen details, then add and publish your dishes.</p>
      <Link href="/chef" className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto">Continue Chef setup <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
    </section>
  );
}
