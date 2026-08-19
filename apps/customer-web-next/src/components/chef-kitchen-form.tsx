"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  MapPin,
  Store,
} from "lucide-react";
import type { ChefApplication } from "@/lib/chef-application-contract";
import type {
  ChefKitchen,
  ChefKitchenInput,
  EditableKitchenStatus,
} from "@/lib/chef-kitchen-types";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";

type FormState = Record<
  keyof Omit<ChefKitchenInput, "latitude" | "longitude" | "status">,
  string
> & {
  latitude: string;
  longitude: string;
  status: EditableKitchenStatus;
};

type SetupStep = "name" | "address" | "ready" | "summary";

const EMPTY: FormState = {
  kitchenName: "",
  displayName: "",
  description: "",
  phoneNumber: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  areaName: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  status: "DRAFT",
};

const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10 disabled:bg-[#F1F3F5]";

function fromKitchen(kitchen: ChefKitchen | null): FormState {
  if (!kitchen) return EMPTY;
  return {
    kitchenName: kitchen.kitchenName,
    displayName: kitchen.displayName ?? "",
    description: kitchen.description ?? "",
    phoneNumber: kitchen.phoneNumber ?? "",
    email: kitchen.email ?? "",
    addressLine1: kitchen.addressLine1,
    addressLine2: kitchen.addressLine2 ?? "",
    landmark: kitchen.landmark ?? "",
    areaName: kitchen.areaName ?? "",
    city: kitchen.city,
    state: kitchen.state,
    postalCode: kitchen.postalCode ?? "",
    latitude: kitchen.latitude === null ? "" : String(kitchen.latitude),
    longitude: kitchen.longitude === null ? "" : String(kitchen.longitude),
    status: kitchen.status === "SUSPENDED" ? "INACTIVE" : kitchen.status,
  };
}

function fromApplication(application: ChefApplication | null): FormState {
  if (!application || application.status !== "APPROVED") return EMPTY;
  return {
    ...EMPTY,
    displayName: [application.firstName, application.lastName].filter(Boolean).join(" "),
    email: application.email ?? "",
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

function addressSummary(form: FormState): string {
  return [
    form.addressLine1,
    form.addressLine2,
    form.landmark,
    form.areaName,
    form.city,
    form.state,
    form.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function StepHeader({
  label,
  onBack,
}: {
  label: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F1F3F5]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>
      ) : <span />}
      <p className="text-sm font-semibold text-[#6B6B6B]">Set up your kitchen · {label}</p>
    </div>
  );
}

export function ChefKitchenForm() {
  const [kitchen, setKitchen] = useState<ChefKitchen | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<SetupStep>("name");
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("Loading your kitchen…");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/chef/kitchen", { cache: "no-store" }),
      fetch("/api/chef/application", { cache: "no-store" }),
    ])
      .then(async ([kitchenResponse, applicationResponse]) => {
        const kitchenBody = await kitchenResponse.json().catch(() => null);
        const applicationBody = applicationResponse.ok
          ? ((await applicationResponse.json().catch(() => null)) as ChefApplication | null)
          : null;
        if (!active) return;
        if (!kitchenResponse.ok) {
          throw new Error(
            kitchenResponse.status === 403
              ? "Your chef approval needs to finish before you can set up a kitchen."
              : "We couldn’t load your kitchen right now.",
          );
        }
        const nextKitchen = kitchenBody as ChefKitchen | null;
        setKitchen(nextKitchen);
        setForm(nextKitchen ? fromKitchen(nextKitchen) : fromApplication(applicationBody));
        setStep(nextKitchen ? "summary" : "name");
        setMessage("");
        setLoaded(true);
      })
      .catch((error) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "We couldn’t load your kitchen right now.");
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function setField<K extends keyof FormState>(name: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function go(next: SetupStep) {
    setMessage("");
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function continueName() {
    if (!form.kitchenName.trim()) {
      setMessage("Please give your kitchen a name customers can recognize.");
      return;
    }
    go("address");
  }

  function continueAddress() {
    if (!form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      setMessage("Please check your house or building, city, and state before continuing.");
      return;
    }
    go("ready");
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
          setForm((current) => ({
            ...current,
            addressLine1: detected.houseNumber || detected.formattedAddress,
            addressLine2: detected.street || current.addressLine2,
            areaName: detected.area || detected.city || current.areaName,
            city: detected.city || current.city,
            state: detected.state || current.state,
            postalCode: detected.postalCode || current.postalCode,
            latitude: String(latitude),
            longitude: String(longitude),
          }));
          setMessage(
            detected.preciseHouseNumber
              ? "We found your kitchen. Please check the address below."
              : "We found the area. Please check your house or building details below.",
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

  function chooseOpen(open: boolean) {
    setForm((current) => ({
      ...current,
      status: open ? "ACTIVE" : kitchen ? "INACTIVE" : "DRAFT",
    }));
    setMessage("");
  }

  async function save() {
    if (!form.kitchenName.trim() || !form.addressLine1.trim() || !form.city.trim() || !form.state.trim()) {
      setMessage("Please check your kitchen name and address before saving.");
      return;
    }
    if (form.status === "ACTIVE" && (!form.latitude.trim() || !form.longitude.trim())) {
      setMessage(
        "Use current location before activating this kitchen. We need the pickup point before your kitchen can open.",
      );
      return;
    }
    setBusy(true);
    setMessage("Saving your kitchen…");
    try {
      const body = {
        ...form,
        displayName: form.displayName || null,
        description: form.description || null,
        phoneNumber: form.phoneNumber || null,
        email: form.email || null,
        addressLine2: form.addressLine2 || null,
        landmark: form.landmark || null,
        areaName: form.areaName || null,
        postalCode: form.postalCode || null,
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
      };
      const response = await fetch("/api/chef/kitchen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { message?: unknown } | null;
      if (!response.ok || !result) {
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : response.status === 400
              ? "Please check the kitchen details and try again."
              : "We couldn’t save your kitchen. Please try again.",
        );
      }
      const nextKitchen = result as unknown as ChefKitchen;
      setKitchen(nextKitchen);
      setForm(fromKitchen(nextKitchen));
      setMessage("");
      setStep("summary");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn’t save your kitchen. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const suspended = kitchen?.status === "SUSPENDED";
  const mapped = Boolean(form.latitude.trim()) && Boolean(form.longitude.trim());

  if (!loaded) {
    return <div className="h-72 animate-pulse rounded-3xl bg-[#F1F3F5]" aria-label="Loading your kitchen" />;
  }

  if (!kitchen && message && !form.kitchenName && !form.addressLine1) {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
        <p className="text-sm text-[#6B6B6B]">{message}</p>
      </section>
    );
  }

  if (step === "summary") {
    const open = kitchen?.status === "ACTIVE";
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Store className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
          <span className="rounded-full bg-[#F1F3F5] px-3 py-1.5 text-sm font-semibold text-[#1A1A1A]">{suspended ? "Paused by Craves" : open ? "Open" : "Closed for now"}</span>
        </div>
        <p className="mt-6 text-sm font-semibold text-[#F62E18]">Your kitchen</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">{form.kitchenName || "My kitchen"}</h1>
        {form.description ? <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{form.description}</p> : null}
        <div className="mt-6 rounded-2xl bg-[#F1F3F5] p-5">
          <p className="text-xs font-semibold text-[#6B6B6B]">Pickup address</p>
          <p className="mt-1 text-sm leading-6 text-[#1A1A1A]">{addressSummary(form)}</p>
        </div>
        {suspended ? (
          <p className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">Craves has paused this kitchen for now. Your saved details are still here.</p>
        ) : null}
        {message ? <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={suspended} onClick={() => go("name")} className="min-h-12 rounded-full border border-[#F62E18] bg-white px-5 font-semibold text-[#F62E18] disabled:opacity-50">Change kitchen details</button>
          <Link href="/chef/menu" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#F62E18] px-5 font-semibold text-white">Go to my menu <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </section>
    );
  }

  if (step === "name") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader label="Name" onBack={kitchen ? () => go("summary") : undefined} />
        <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Store className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">What should customers call your kitchen?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Choose a simple name you’ll be happy to see next to your food.</p>
        <label className="mt-6 block text-sm font-semibold text-[#1A1A1A]">Kitchen name<input value={form.kitchenName} onChange={(event) => setField("kitchenName", event.target.value)} className={INPUT_CLASS} maxLength={180} /></label>
        <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Tell customers what you cook <span className="font-normal text-[#6B6B6B]">(optional)</span><textarea value={form.description} onChange={(event) => setField("description", event.target.value)} className={`${INPUT_CLASS} min-h-28`} maxLength={1000} /></label>
        <details className="mt-5 rounded-2xl bg-[#F1F3F5] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">More kitchen details</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[#1A1A1A]">Chef name customers see <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.displayName} onChange={(event) => setField("displayName", event.target.value)} className={INPUT_CLASS} /></label>
            <label className="text-sm font-semibold text-[#1A1A1A]">Kitchen phone <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.phoneNumber} onChange={(event) => setField("phoneNumber", event.target.value)} className={INPUT_CLASS} inputMode="tel" /></label>
            <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Kitchen email <span className="font-normal text-[#6B6B6B]">(optional)</span><input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} className={INPUT_CLASS} /></label>
          </div>
        </details>
        {message ? <p role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" onClick={continueName} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "address") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader label="Pickup address" onBack={() => go("name")} />
        <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><MapPin className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Is this where you cook?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Pickup partners use this location when food is ready.</p>
        <button type="button" disabled={locating} onClick={useCurrentLocation} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[#F62E18] bg-white px-5 font-semibold text-[#F62E18] disabled:opacity-50"><MapPin className="h-4 w-4" aria-hidden="true" />{locating ? "Finding my address…" : mapped ? "Refresh current location" : "Use my current location"}</button>
        {message ? <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Flat / House / Building<input value={form.addressLine1} onChange={(event) => setField("addressLine1", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Street / Road <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.addressLine2} onChange={(event) => setField("addressLine2", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Area <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.areaName} onChange={(event) => setField("areaName", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Landmark <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.landmark} onChange={(event) => setField("landmark", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">City<input value={form.city} onChange={(event) => setField("city", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">State<input value={form.state} onChange={(event) => setField("state", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Pincode <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.postalCode} onChange={(event) => setField("postalCode", event.target.value)} className={INPUT_CLASS} inputMode="numeric" /></label>
        </div>
        <button type="button" onClick={continueAddress} disabled={locating} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">Yes, this is right</button>
      </section>
    );
  }

  const openSelected = form.status === "ACTIVE";
  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
      <StepHeader label="Ready for orders" onBack={() => go("address")} />
      <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Check className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
      <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Should your kitchen be ready when your first dish goes live?</h1>
      <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">You can close your kitchen anytime. Customers still won’t see food until you add an available dish.</p>
      <div className="mt-6 grid gap-3">
        <button type="button" onClick={() => chooseOpen(true)} className={`rounded-2xl border p-5 text-left transition ${openSelected ? "border-[#F62E18] ring-2 ring-[#F62E18]/10" : "border-[#E5E7EB]"}`}>
          <p className="font-semibold text-[#1A1A1A]">Yes, get my kitchen ready</p>
          <p className="mt-1 text-sm text-[#6B6B6B]">It can open as soon as an available dish is on your menu.</p>
        </button>
        <button type="button" onClick={() => chooseOpen(false)} className={`rounded-2xl border p-5 text-left transition ${!openSelected ? "border-[#F62E18] ring-2 ring-[#F62E18]/10" : "border-[#E5E7EB]"}`}>
          <p className="font-semibold text-[#1A1A1A]">Not yet</p>
          <p className="mt-1 text-sm text-[#6B6B6B]">Save everything and keep the kitchen closed for now.</p>
        </button>
      </div>
      {message ? <p role="alert" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
      <button type="button" disabled={busy || locating || suspended} onClick={() => void save()} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save my kitchen"}</button>
    </section>
  );
}
