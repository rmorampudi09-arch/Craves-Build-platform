"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
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
import type { ChefApplication } from "@/lib/chef-application-contract";
import type { CustomerProfile } from "@/lib/profile-contract";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";

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

const DRAFT_KEY = "craves-chef-application-draft-v1";
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
    email: form.email || profile?.email || "",
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

function readDraft(): Partial<FormState> {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Partial<FormState>) : {};
  } catch {
    return {};
  }
}

function mergeDraft(base: FormState, draft: Partial<FormState>): FormState {
  const next = { ...base };
  for (const key of Object.keys(base) as Array<keyof FormState>) {
    if (typeof draft[key] === "string") next[key] = draft[key] as string;
  }
  return next;
}

function responseMessage(
  body: { message?: unknown } | null,
  fallback: string,
): string {
  return typeof body?.message === "string" && body.message.trim() ? body.message : fallback;
}

function needsPhotoCorrection(application: ChefApplication): boolean {
  return (
    application.status === "REJECTED" &&
    /photo|image|id|aadhaar|pan|document|proof/i.test(application.rejectionReason ?? "")
  );
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
  part: 1 | 2 | 3;
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
        <p className="text-sm font-semibold text-[#6B6B6B]">Part {part} of 3 · {label}</p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2" aria-hidden="true">
        {[1, 2, 3].map((value) => (
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
  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<ApplicationStep>("welcome");
  const [message, setMessage] = useState("Loading your application…");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  async function load() {
    const [applicationResponse, profileResponse, addressesResponse] = await Promise.all([
      fetch("/api/chef/application", { cache: "no-store" }),
      fetch("/api/customer/profile", { cache: "no-store" }),
      fetch("/api/customer/addresses", { cache: "no-store" }),
    ]);
    const applicationBody = (await applicationResponse.json().catch(() => null)) as ChefApplication | null;
    if (!applicationResponse.ok || !applicationBody) {
      throw new Error(
        applicationResponse.status === 401
          ? "Sign in to continue your chef application."
          : "We couldn’t load your application right now.",
      );
    }

    const nextProfile = profileResponse.ok
      ? ((await profileResponse.json().catch(() => null)) as CustomerProfile | null)
      : null;
    const addresses = addressesResponse.ok
      ? ((await addressesResponse.json().catch(() => [])) as CustomerAddress[])
      : [];

    setApplication(applicationBody);
    setProfile(nextProfile);
    if (applicationBody.status === "NOT_SUBMITTED") {
      setForm(mergeDraft(prefillNewApplication(applicationBody, nextProfile, addresses), readDraft()));
      setStep("welcome");
    } else {
      setForm(fromApplication(applicationBody));
      if (applicationBody.status === "APPROVED") setStep("approved");
      else if (needsPhotoCorrection(applicationBody)) setStep("documents-intro");
      else if (applicationBody.status === "REJECTED") setStep("review");
      else setStep("documents-intro");
    }
    setMessage("");
  }

  useEffect(() => {
    void load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "We couldn’t load your application right now."),
    );
  }, []);

  function field<K extends keyof FormState>(name: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function persistDraft() {
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // The application still works when browser storage is unavailable.
    }
  }

  function go(next: ApplicationStep) {
    persistDraft();
    setMessage("");
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function continueAbout() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setMessage("Please type your first and last name so we know who you are.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setMessage("Please check your email address so we know where to reach you.");
      return;
    }
    go("address");
  }

  function continueAddress() {
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      setMessage("Please add your house or building, city, and state so pickup can find your kitchen.");
      return;
    }
    go("review");
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
    if (locked) return;
    if (!form.email.trim() || !form.firstName.trim() || !form.lastName.trim()) {
      setMessage("Please check your name and email before continuing.");
      return;
    }
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      setMessage("Please check your kitchen address before continuing.");
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
          addressLine2: form.addressLine2 || null,
          landmark: form.landmark || null,
          postalCode: form.postalCode || null,
          latitude: form.latitude === "" ? null : Number(form.latitude),
          longitude: form.longitude === "" ? null : Number(form.longitude),
        }),
      });
      const body = (await response.json().catch(() => null)) as (ChefApplication & { message?: unknown }) | null;
      if (!response.ok || !body) {
        throw new Error(
          responseMessage(
            body,
            response.status === 400
              ? "Please check the highlighted details and try again."
              : "We couldn’t save your details. Please try again.",
          ),
        );
      }
      setApplication(body);
      setForm(fromApplication(body));
      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing else is required when storage is unavailable.
      }
      setMessage("");
      setStep(body.status === "APPROVED" ? "approved" : "documents-intro");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn’t save your details. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const locked = application?.status === "APPROVED";
  const calmCorrection = application?.status === "REJECTED" ? application.rejectionReason : null;

  if (message.startsWith("Loading") && !application) {
    return <div className="h-72 animate-pulse rounded-3xl bg-[#F1F3F5]" aria-label="Loading your application" />;
  }

  if (!application && message) {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
        <p className="text-sm text-[#6B6B6B]">{message}</p>
        <button type="button" onClick={() => void load()} className="mt-5 rounded-full bg-[#F62E18] px-6 py-3 font-semibold text-white">Try again</button>
      </section>
    );
  }

  if (step === "welcome") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <IconCircle><UserRound className="h-7 w-7" aria-hidden="true" /></IconCircle>
        <p className="mt-6 text-sm font-semibold text-[#F62E18]">Become a Craves chef</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">Cook from home. We’ll guide you.</h1>
        <p className="mt-4 text-base leading-7 text-[#6B6B6B]">
          Tell us about you and your kitchen, then share a few clear photos. You’ll only see one simple task at a time.
        </p>
        <div className="mt-6 space-y-3 rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">
          {["Your name and contact details", "Your kitchen address", "Your photo, ID and PAN card"].map((item) => (
            <p key={item} className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" />{item}</p>
          ))}
        </div>
        <button type="button" onClick={() => go("about")} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white">
          Start my application <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    );
  }

  if (step === "about") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={1} label="About you" onBack={() => go("welcome")} />
        <div className="mt-7"><IconCircle><UserRound className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">What’s your name?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Use the same name that appears on your ID.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A]">First name<input value={form.firstName} onChange={(event) => field("firstName", event.target.value)} className={INPUT_CLASS} autoComplete="given-name" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Last name<input value={form.lastName} onChange={(event) => field("lastName", event.target.value)} className={INPUT_CLASS} autoComplete="family-name" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Email<input type="email" value={form.email} onChange={(event) => field("email", event.target.value)} className={INPUT_CLASS} autoComplete="email" /></label>
        </div>
        {profile?.registeredPhoneNumber ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">
            <Phone className="h-5 w-5 shrink-0 text-[#F62E18]" aria-hidden="true" />
            <span>Your Craves phone number is already saved: <strong className="text-[#1A1A1A]">{profile.registeredPhoneNumber}</strong></span>
          </div>
        ) : null}
        {message ? <p role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" onClick={continueAbout} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "address") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={1} label="About you" onBack={() => go("about")} />
        <div className="mt-7"><IconCircle><MapPin className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Where do you cook?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">This is the kitchen address used for food pickup.</p>
        <button
          type="button"
          disabled={locating}
          onClick={useCurrentLocation}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 font-semibold text-[#F62E18] disabled:opacity-50"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {locating ? "Finding my address…" : "Use my current location"}
        </button>
        {message ? <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Flat / House / Building<input value={form.addressLine1} onChange={(event) => field("addressLine1", event.target.value)} className={INPUT_CLASS} autoComplete="address-line1" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Street / Area <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.addressLine2} onChange={(event) => field("addressLine2", event.target.value)} className={INPUT_CLASS} autoComplete="address-line2" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Landmark <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.landmark} onChange={(event) => field("landmark", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">City<input value={form.city} onChange={(event) => field("city", event.target.value)} className={INPUT_CLASS} autoComplete="address-level2" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">State<input value={form.state} onChange={(event) => field("state", event.target.value)} className={INPUT_CLASS} autoComplete="address-level1" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Pincode <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.postalCode} onChange={(event) => field("postalCode", event.target.value)} className={INPUT_CLASS} inputMode="numeric" autoComplete="postal-code" /></label>
        </div>
        <button type="button" onClick={continueAddress} disabled={locating} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">Continue</button>
      </section>
    );
  }

  if (step === "review") {
    return (
      <form onSubmit={submit} className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={1} label="Check your details" onBack={() => go("address")} />
        <div className="mt-7"><IconCircle><Check className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Does everything look right?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">If something is wrong, change just that part. You won’t lose the rest.</p>
        {calmCorrection ? (
          <div className="mt-5 rounded-2xl bg-[#F1F3F5] p-4">
            <p className="font-semibold text-[#1A1A1A]">We need one more thing</p>
            <p className="mt-1 text-sm leading-6 text-[#6B6B6B]">{calmCorrection}</p>
          </div>
        ) : null}
        <div className="mt-6 space-y-3">
          <div className="rounded-2xl bg-[#F1F3F5] p-5">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-[#6B6B6B]">Your name</p><p className="mt-1 font-semibold text-[#1A1A1A]">{form.firstName} {form.lastName}</p><p className="mt-1 text-sm text-[#6B6B6B]">{form.email}</p></div><button type="button" onClick={() => go("about")} className="text-sm font-semibold text-[#F62E18]">Change</button></div>
          </div>
          <div className="rounded-2xl bg-[#F1F3F5] p-5">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-[#6B6B6B]">Kitchen address</p><p className="mt-1 text-sm leading-6 text-[#1A1A1A]">{addressSummary(form) || "Address not added"}</p></div><button type="button" onClick={() => go("address")} className="text-sm font-semibold text-[#F62E18]">Change</button></div>
          </div>
        </div>
        {message ? <p role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button
          type="submit"
          disabled={busy || locked}
          aria-label={application?.status === "PENDING" ? PENDING_UPDATE_LABEL : undefined}
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save and continue"}
          {!busy ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
        </button>
        {application?.id ? (
          <button type="button" onClick={() => go("documents-intro")} className="mt-3 min-h-11 w-full text-sm font-semibold text-[#6B6B6B] hover:text-[#1A1A1A]">Go to my photos</button>
        ) : null}
      </form>
    );
  }

  if (step === "documents-intro") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader part={2} label="A few photos" onBack={() => go("review")} />
        <div className="mt-7"><IconCircle><ShieldCheck className="h-7 w-7" aria-hidden="true" /></IconCircle></div>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Next, we need a few photos</h1>
        <p className="mt-3 text-base leading-7 text-[#6B6B6B]">We ask every chef for these so we know who is preparing food. Your ID photos are kept private.</p>
        <div className="mt-6 space-y-3 rounded-2xl bg-[#F1F3F5] p-5 text-sm text-[#1A1A1A]">
          {["A clear photo of you", "Front of your government ID", "Back of the same ID", "Your PAN card"].map((item) => (
            <p key={item} className="flex items-center gap-3"><Camera className="h-4 w-4 shrink-0 text-[#F62E18]" aria-hidden="true" />{item}</p>
          ))}
        </div>
        <button type="button" onClick={() => go("documents")} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "documents") {
    return (
      <div>
        <ChefApplicationDocumentPanel onComplete={() => go("waiting")} />
      </div>
    );
  }

  if (step === "waiting") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
        <IconCircle><Send className="h-7 w-7" aria-hidden="true" /></IconCircle>
        <p className="mt-6 text-sm font-semibold text-[#F62E18]">Application sent</p>
        <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">You’re done for now</h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#6B6B6B]">We’re checking your details. When something changes, Chef Mode will show you the one next thing to do.</p>
        <Link href="/chef" className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto">Done for now</Link>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
      <IconCircle><Check className="h-7 w-7" aria-hidden="true" /></IconCircle>
      <p className="mt-6 text-sm font-semibold text-[#F62E18]">You’re approved</p>
      <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">Welcome to Chef Mode</h1>
      <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-[#6B6B6B]">Now give your kitchen a name so customers know who they’re ordering from.</p>
      <Link href="/chef/kitchen" className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto">Name my kitchen <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
    </section>
  );
}
