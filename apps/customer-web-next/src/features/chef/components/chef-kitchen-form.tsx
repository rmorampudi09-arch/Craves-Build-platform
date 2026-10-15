"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { ChefFlash, ChefNotice, ChefPageHead, ChefPill, ChefSection } from "@/features/chef/components/chef-ui";
import Link from "next/link";
import { AddressMapPicker } from "@/features/addresses/components/AddressMapPicker";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createSupportCase, SupportCaseError } from "@/shared/lib/support-cases-client";
import { SUPPORT_MESSAGE_MAX } from "@/shared/lib/support-cases-contract";
import { ComingSoon } from "@/shared/ui/feedback/ComingSoon";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  ImageIcon,
  MapPin,
  Store,
} from "lucide-react";
import { ChefKitchenError, readChefKitchen, saveChefAvatar, uploadKitchenPhoto } from "@/features/chef/api/chef-kitchen";
import { shrinkPhoto } from "@/features/chef/lib/shrink-photo";
import { ChefAvatarGrid } from "@/features/chef/components/chef-avatar";
import { ChefFace } from "@/shared/ui/data-display/ChefFace";
import { FEATURE_NOT_AVAILABLE } from "@/shared/lib/feature-availability";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";
import { parseOnboardingState } from "@/features/chef-onboarding/lib/chef-onboarding-v2-contract";
import type { ChefApplication } from "@/features/chef-onboarding/lib/chef-application-contract";
import {
  CHEF_KITCHEN_FIELD_LIMITS,
  CHEF_KITCHEN_TAG_LIMITS,
  SOCIAL_LINK_FIELDS,
  SOCIAL_LINK_MAX,
  chefAvatarIdFromUrl,
  isSocialLink,
  kitchenPhotoSlots,
  missingKitchenPickupField,
} from "@/features/chef/lib/chef-kitchen-contract";
import type {
  ChefKitchen,
  ChefKitchenInput,
  EditableKitchenStatus,
} from "@/features/chef/lib/chef-kitchen-types";
import { reverseGeocodeCurrentLocation } from "@/features/addresses/api/reverseGeocode";
import { captureSessionContext, getSession, isSessionContextCurrent } from "@/features/auth/api/cravesAuth";
import { RequiredMark } from "@/shared/ui/forms/required-mark";
import { ChefLoading } from "@/features/chef/components/chef-loading";

type FormState = Record<
  keyof Omit<ChefKitchenInput, "latitude" | "longitude" | "status" | "cuisines" | "serviceAreas" | "socialLinks">,
  string
> & {
  latitude: string;
  longitude: string;
  status: EditableKitchenStatus;
  // Only when the server sent them: each field shows only then.
  cuisines?: string[];
  serviceAreas?: string[];
  socialLinks?: Record<SocialLinkField, string>;
};
type SocialLinkField = (typeof SOCIAL_LINK_FIELDS)[number];

const SOCIAL_LINK_LABELS: Record<SocialLinkField, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", website: "Website" };
const SUGGESTED_CUISINES = ["Andhra", "Telangana", "Biryani", "Tiffins", "North Indian", "South Indian", "Chinese", "Snacks", "Sweets", "Desserts"];
// Matches the app: once saved, a kitchen's area, city, PIN code, state and map pin move only through Craves support.
// An empty one can still be filled in, so an unfinished kitchen can still open.
const LOCKED_ADDRESS = ["areaName", "city", "state", "postalCode"] as const;
function savedAddress(kitchen: ChefKitchen | null): Partial<FormState> {
  return Object.fromEntries(LOCKED_ADDRESS.filter((field) => kitchen?.[field]).map((field) => [field, kitchen?.[field]]));
}

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

const PHOTO_TILE =
  "relative flex h-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-dashed border-[#D0D5DB] bg-white px-1 text-center text-[0.8125rem] font-semibold text-[#6B6B6B] disabled:cursor-not-allowed";

const PHOTOS_LOCKED = "Kitchen photos can’t be changed. To change one, contact Craves support.";
const PHOTO_ERRORS: Record<string, string> = {
  KITCHEN_PHOTOS_LOCKED: PHOTOS_LOCKED,
  [FEATURE_NOT_AVAILABLE]: "Photos are coming soon.",
  INVALID_KITCHEN_PHOTO: "Choose a JPEG or PNG photo of 8 MB or less.",
};
const PHOTO_SOURCE = `${secondaryActionClass} gap-2 sm:w-full`;

const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:ring-2 focus:ring-[#1A1A1A]/10 disabled:bg-[#F1F3F5] read-only:bg-[#F1F3F5] read-only:text-[#6B6B6B]";

function fromKitchen(kitchen: ChefKitchen | null, registeredPhone = ""): FormState {
  if (!kitchen) return EMPTY;
  return {
    kitchenName: kitchen.kitchenName,
    displayName: kitchen.displayName ?? "",
    description: kitchen.description ?? "",
    phoneNumber: kitchen.phoneNumber?.trim() || registeredPhone,
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
    ...(kitchen.cuisines ? { cuisines: kitchen.cuisines } : {}),
    ...(kitchen.serviceAreas ? { serviceAreas: kitchen.serviceAreas } : {}),
    ...(kitchen.socialLinks
      ? { socialLinks: { instagram: kitchen.socialLinks.instagram ?? "", facebook: kitchen.socialLinks.facebook ?? "", youtube: kitchen.socialLinks.youtube ?? "", website: kitchen.socialLinks.website ?? "" } }
      : {}),
  };
}

function fromApplication(application: ChefApplication | null, registeredPhone = ""): FormState {
  if (!application || application.status !== "APPROVED") return EMPTY;
  return {
    ...EMPTY,
    displayName: [application.firstName, application.lastName].filter(Boolean).join(" "),
    phoneNumber: registeredPhone,
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

// The way out of the page, apart from each setup step's own Back.
const PAGE_BACK = { href: "/chef/profile", label: "More" } as const;
function PageBack() {
  return (
    <Link href={PAGE_BACK.href} className="chef-back-link">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {PAGE_BACK.label}
    </Link>
  );
}

/** Chips to switch on and off, with "+ Add" for one of the chef's own (up to 10 in all, 40 characters each). */
function ChipPicker({ label, options, selected, onChange, addLabel, addFieldLabel }: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange(next: string[]): void;
  addLabel: string;
  addFieldLabel: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const chips = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const full = selected.length >= CHEF_KITCHEN_TAG_LIMITS.count;
  useEffect(() => {
    if (adding || !closing.current) return;
    closing.current = false;
    // Back to "+ Add", or to the newest chip once ten are chosen and "+ Add" is off.
    Array.from(chips.current?.querySelectorAll<HTMLButtonElement>("button:enabled") ?? []).at(-1)?.focus();
  }, [adding]);
  function close() {
    closing.current = true;
    setAdding(false);
  }
  function add() {
    const word = draft.trim();
    if (word && !selected.some((item) => item.toLowerCase() === word.toLowerCase())) onChange([...selected, word]);
    setDraft("");
    close();
  }
  return (
    <fieldset className="mt-5 grid gap-2">
      <legend className="mb-2 text-sm font-semibold text-[#1A1A1A]">{label}</legend>
      <div ref={chips} className="chef-chips is-wrap">
        {[...new Set([...options, ...selected])].map((item) => {
          const on = selected.includes(item);
          return (
            <button key={item} type="button" aria-pressed={on} disabled={!on && full} onClick={() => onChange(on ? selected.filter((other) => other !== item) : [...selected, item])} className="chef-chip max-w-full !whitespace-normal text-left wrap-anywhere disabled:opacity-60">
              {item}
            </button>
          );
        })}
        {adding ? null : <button type="button" disabled={full} onClick={() => setAdding(true)} className="chef-chip disabled:opacity-60">{addLabel}</button>}
      </div>
      {adding ? (
        <div className="flex gap-2">
          <input
            aria-label={addFieldLabel}
            autoFocus
            value={draft}
            maxLength={CHEF_KITCHEN_TAG_LIMITS.length}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              } else if (event.key === "Escape") close();
            }}
            className={`${INPUT_CLASS} !mt-0`}
          />
          <button type="button" disabled={!draft.trim()} onClick={add} className="chef-btn">Add</button>
        </div>
      ) : null}
    </fieldset>
  );
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
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoSaving, setPhotoSaving] = useState<"CHEF" | "KITCHEN" | null>(null);
  // A new key each time, so a repeated message is read out again.
  const [photoNote, setPhotoNote] = useState({ text: "", key: 0 });
  const [faceSheet, setFaceSheet] = useState(false);
  const [faceDraft, setFaceDraft] = useState<string | null>(null);
  const [moveSheet, setMoveSheet] = useState(false);
  const [moveDraft, setMoveDraft] = useState("");
  const [moveState, setMoveState] = useState<"idle" | "sending" | "sent" | "failed" | "unavailable">("idle");
  const [photoSheet, setPhotoSheet] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<File | null>(null);
  const photoPreview = useMemo(() => (photoDraft ? URL.createObjectURL(photoDraft) : null), [photoDraft]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  const [invalidField, setInvalidField] = useState<keyof FormState | SocialLinkField | null>(null);
  const [validationAttempt, setValidationAttempt] = useState(0);
  useEffect(() => {
    if (!invalidField) return;
    const input = document.getElementById(`kitchen-${invalidField}`);
    const details = input?.closest("details");
    if (details) details.open = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    if (!reduced) input?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 240, iterations: 1 });
  }, [invalidField, validationAttempt]);
  function invalidate(name: keyof FormState | SocialLinkField, reason: string) { setInvalidField(name); setValidationAttempt(value => value + 1); setMessage(reason); }
  function inputProps(name: keyof FormState | SocialLinkField) { return { id: `kitchen-${name}`, "aria-invalid": invalidField === name, "aria-describedby": invalidField === name ? "kitchen-field-error" : undefined }; }
  function checkFieldLengths(fields: (keyof typeof CHEF_KITCHEN_FIELD_LIMITS)[]): boolean {
    const labels = { kitchenName: "Kitchen name", displayName: "Chef name", city: "City", state: "State", postalCode: "Pincode" };
    for (const field of fields) {
      const limit = CHEF_KITCHEN_FIELD_LIMITS[field];
      if (form[field].trim().length > limit) {
        setStep(field === "kitchenName" || field === "displayName" ? "name" : "address");
        invalidate(field, `${labels[field]} must be ${limit} characters or fewer.`);
        return false;
      }
    }
    return true;
  }
  async function moveKitchenPin(next: { latitude: number; longitude: number }) {
    const version = ++locationRequest.current;
    setForm(current => ({ ...current, latitude: String(next.latitude), longitude: String(next.longitude) }));
    setLocating(true);
    try {
      const address = await reverseGeocodeCurrentLocation(next.latitude, next.longitude);
      if (version !== locationRequest.current) return;
      setForm(current => ({ ...current, addressLine1: address.houseNumber || address.formattedAddress, addressLine2: address.street || "", areaName: address.area || "", city: address.city || current.city, state: address.state || current.state, postalCode: address.postalCode || current.postalCode, ...savedAddress(kitchen) }));
      setMessage("Pin updated. Check your house and address details below.");
    } catch { if (version === locationRequest.current) setMessage("Pin updated. Please check your address details below."); }
    finally { if (version === locationRequest.current) setLocating(false); }
  }

  useEffect(() => {
    let active = true;
    const sessionContext = captureSessionContext();
    void Promise.all([
      sessionFetch("/api/chef/kitchen", { cache: "no-store" }),
      sessionFetch("/api/chef/application", { cache: "no-store" }),
      sessionFetch("/api/chef/onboarding", { cache: "no-store" }).catch(() => null),
    ])
      .then(async ([kitchenResponse, applicationResponse, onboardingResponse]) => {
        const kitchenBody = await kitchenResponse.json().catch(() => null);
        const applicationBody = applicationResponse.ok
          ? ((await applicationResponse.json().catch(() => null)) as ChefApplication | null)
          : null;
        if (!active || !isSessionContextCurrent(sessionContext)) return;
        if (!kitchenResponse.ok) {
          throw kitchenResponse.status === 403
            ? new ChefError("Your chef approval needs to finish before you can set up a kitchen.", "CHEF_ACCESS_REQUIRED", 403)
            : chefApiError(kitchenResponse, kitchenBody, "We couldn’t load your kitchen right now.");
        }
        const onboardingBody = onboardingResponse?.ok ? parseOnboardingState(await onboardingResponse.json().catch(() => null)) : null;
        if (!active || !isSessionContextCurrent(sessionContext)) return;
        const nextKitchen = kitchenBody as ChefKitchen | null;
        setKitchen(nextKitchen);
        const registeredPhone = getSession()?.phoneNumber ?? "";
        const initial = nextKitchen ? fromKitchen(nextKitchen, registeredPhone) : fromApplication(applicationBody, registeredPhone);
        // Whatever the approved application already says about the kitchen is filled in, never asked again.
        if (!nextKitchen && applicationBody?.status === "APPROVED" && onboardingBody && applicationBody.id && onboardingBody.application.id === applicationBody.id && onboardingBody.details) {
          initial.kitchenName = onboardingBody.details.kitchenName;
          initial.description = onboardingBody.details.kitchenDescription;
          initial.addressLine1 = onboardingBody.details.addressLine1;
          initial.addressLine2 = onboardingBody.details.addressLine2;
          initial.landmark = onboardingBody.details.landmark;
          initial.city = onboardingBody.details.city;
          initial.state = onboardingBody.details.state;
          initial.postalCode = onboardingBody.details.postalCode;
          initial.latitude = String(onboardingBody.details.latitude ?? "");
          initial.longitude = String(onboardingBody.details.longitude ?? "");
        }
        setForm(initial);
        setStep(nextKitchen ? "summary" : "name");
        setMessage("");
        setLoaded(true);
      })
      .catch((error) => {
        if (active && isSessionContextCurrent(sessionContext)) {
          setMessage(chefErrorText(error, "We couldn’t load your kitchen right now."));
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function setField<K extends keyof FormState>(name: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [name]: value }));
    if (invalidField === name) { setInvalidField(null); setMessage(""); }
  }

  function setLink(field: SocialLinkField, value: string) {
    setForm((current) => (current.socialLinks ? { ...current, socialLinks: { ...current.socialLinks, [field]: value } } : current));
    if (invalidField === field) { setInvalidField(null); setMessage(""); }
  }

  function checkLinks(): boolean {
    const bad = SOCIAL_LINK_FIELDS.find((field) => form.socialLinks && !isSocialLink(form.socialLinks[field]));
    if (!bad) return true;
    setStep("name");
    invalidate(bad, `${SOCIAL_LINK_LABELS[bad]} link must start with https://`);
    return false;
  }

  async function sendMove() {
    const text = moveDraft.trim();
    if (!text || moveState === "sending") return;
    setMoveState("sending");
    try {
      await createSupportCase({ contextRole: "CHEF", subject: "Move my kitchen", message: text });
      setMoveDraft("");
      setMoveState("sent");
    } catch (error) {
      setMoveState(error instanceof SupportCaseError && error.code === FEATURE_NOT_AVAILABLE ? "unavailable" : "failed");
    }
  }

  function go(next: SetupStep) {
    setMessage("");
    setNotice("");
    setInvalidField(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function continueName() {
    if (!form.kitchenName.trim()) {
      invalidate("kitchenName", "Please give your kitchen a name customers can recognize.");
      return;
    }
    if (!checkFieldLengths(["kitchenName", "displayName"]) || !checkLinks()) return;
    go("address");
  }

  function continueAddress() {
    const missing = (
      [
        ["addressLine1", "flat, house or building"],
        ["city", "city"],
        ["state", "state"],
      ] as const
    ).filter(([field]) => !form[field].trim());
    if (missing.length) {
      // Name what is missing and go to the first one.
      invalidate(missing[0][0], `Add your ${new Intl.ListFormat("en-IN", { type: "conjunction" }).format(missing.map(([, label]) => label))} to continue.`);
      return;
    }
    if (!checkFieldLengths(["city", "state", "postalCode"])) return;
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
            ...savedAddress(kitchen),
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
      const missing = !form.kitchenName.trim() ? "kitchenName" : !form.addressLine1.trim() ? "addressLine1" : !form.city.trim() ? "city" : "state";
      setStep(missing === "kitchenName" ? "name" : "address");
      invalidate(missing, "Please check your kitchen name and address before saving.");
      return;
    }
    if (!checkFieldLengths(["kitchenName", "displayName", "city", "state", "postalCode"]) || !checkLinks()) return;
    const missingPickup = form.status === "ACTIVE" ? missingKitchenPickupField(form) : null;
    if (missingPickup) {
      setStep(missingPickup === "phoneNumber" ? "name" : "address");
      const labels = { phoneNumber: "a kitchen phone", areaName: "the pickup area", postalCode: "the pickup pincode" };
      invalidate(missingPickup, `Complete ${labels[missingPickup]} before opening your kitchen. Pickup partners need this to collect orders.`);
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
        // A socialLinks object replaces all four links on the server, so it always carries all four.
        socialLinks: form.socialLinks && Object.fromEntries(SOCIAL_LINK_FIELDS.map((field) => [field, form.socialLinks?.[field].trim() || null])),
      };
      const response = await sessionFetch("/api/chef/kitchen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { message?: unknown } | null;
      if (!response.ok) throw chefApiError(response, result, "Please check the kitchen details and try again.");
      if (!result) throw new ChefError("We couldn’t confirm your kitchen was saved. Reload to check it.", "INVALID_KITCHEN_RESPONSE", response.status);
      const nextKitchen = result as unknown as ChefKitchen;
      setKitchen(nextKitchen);
      setForm(fromKitchen(nextKitchen));
      setMessage("");
      setNotice("Kitchen saved");
      setStep("summary");
    } catch (error) {
      setMessage(chefErrorText(error, "We couldn’t save your kitchen. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function notePhoto(text: string) {
    setPhotoNote((current) => ({ text, key: current.key + 1 }));
  }

  /** Photos save apart from the form, one at a time. */
  async function savePhoto(kind: "CHEF" | "KITCHEN", work: () => Promise<ChefKitchen>, done: string) {
    if (photoSaving) return;
    setPhotoSaving(kind);
    notePhoto("");
    try {
      setKitchen(await work());
      setNotice(done);
    } catch (error) {
      const code = error instanceof ChefKitchenError ? error.code : "";
      // The tiles were out of date (photos arrived from the application or another device): show what Craves holds.
      if (code === "KITCHEN_PHOTOS_LOCKED") void readChefKitchen().then((latest) => latest && setKitchen(latest), () => undefined);
      notePhoto(PHOTO_ERRORS[code] ?? (kind === "CHEF" ? "We couldn’t save your picture. Please try again." : "We couldn’t save that photo. Please try again."));
    } finally {
      setPhotoSaving(null);
    }
  }

  function saveFace() {
    const avatarId = faceDraft;
    if (!avatarId) return;
    setFaceSheet(false);
    void savePhoto("CHEF", () => saveChefAvatar(avatarId), "Picture saved");
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    // Photos lock once added, so the chef sees the 4:3 crop and confirms it first, as with the app's crop step.
    if (file) void shrinkPhoto(file, 4 / 3).then((photo) => { setPhotoDraft(photo); setPhotoSheet(true); });
  }

  function showPhotoSheet(open: boolean) {
    setPhotoSheet(open);
    if (!open) setPhotoDraft(null);
  }

  function confirmPhoto() {
    const photo = photoDraft;
    if (!photo) return;
    showPhotoSheet(false);
    void savePhoto("KITCHEN", () => uploadKitchenPhoto(photo), "Photo saved");
  }

  function pickPhoto(input: HTMLInputElement | null) {
    setPhotoSheet(false);
    input?.click();
  }

  const suspended = kitchen?.status === "SUSPENDED";
  const locked = savedAddress(kitchen);
  const pinLocked = kitchen?.latitude != null && kitchen.longitude != null;
  const photoSlots: (string | null | undefined)[] = kitchen ? kitchenPhotoSlots(kitchen) ?? [undefined, undefined] : [];
  const nextPhotoSlot = photoSlots.indexOf(null);
  const mapped = Boolean(form.latitude.trim()) && Boolean(form.longitude.trim());

  if (!loaded) {
    return <ChefLoading shape="kitchen" label="Loading your kitchen" />;
  }

  if (!kitchen && message && !form.kitchenName && !form.addressLine1) {
    return (
      <>
        <PageBack />
        <section className="mt-2 rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center">
          <p className="text-sm text-[#6B6B6B]">{message}</p>
        </section>
      </>
    );
  }

  if (step === "summary") {
    const open = kitchen?.status === "ACTIVE";
    return (
      <div>
        <ChefPageHead title="Kitchen details" subtitle="How customers see your kitchen, and where riders pick up." back={PAGE_BACK} />
        <div className="chef-stack">
          <ChefSection>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#1A1A1A]">{form.kitchenName || "My kitchen"}</h2>
              <ChefPill tone={suspended ? "danger" : open ? "success" : "muted"}>{suspended ? "Paused by Craves" : open ? "Open" : "Closed for now"}</ChefPill>
            </div>
            {form.description ? <p className="mt-2 text-[0.9375rem] leading-6 text-[#6B6B6B]">{form.description}</p> : null}
            <div className="mt-5 flex gap-3 border-t border-[#E3E6EA] pt-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#6B6B6B]" aria-hidden="true" />
              <div><p className="text-[0.8125rem] font-semibold text-[#6B6B6B]">Pickup address</p><p className="mt-0.5 text-[0.9375rem] leading-6 text-[#1A1A1A]">{addressSummary(form)}</p></div>
            </div>
            {suspended ? <div className="mt-4"><ChefNotice icon={Store}>Craves has paused this kitchen for now. Your saved details are still here.</ChefNotice></div> : null}
            {message ? <p id="kitchen-field-error" role={invalidField ? "alert" : "status"} className="mt-4 text-[0.9375rem] text-[#6B6B6B]">{message}</p> : null}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" disabled={suspended} onClick={() => go("name")} className="chef-btn">Edit kitchen details</button>
              <Link href="/chef/menu" className="chef-btn">Go to my menu <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          </ChefSection>
          {kitchen ? (
            <ChefSection title="Photos" labelledBy="kitchen-photos-title">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={PHOTO_TILE}
                  disabled={kitchen.chefPhotoUrl === undefined || photoSaving !== null}
                  aria-busy={photoSaving === "CHEF"}
                  onClick={() => {
                    setFaceDraft(chefAvatarIdFromUrl(kitchen.chefPhotoUrl));
                    setFaceSheet(true);
                  }}
                >
                  <ChefFace photoUrl={kitchen.chefPhotoUrl} name={form.displayName} size={44} />
                  Your picture
                  {kitchen.chefPhotoUrl === undefined ? <ChefPill>Coming soon</ChefPill> : null}
                  {photoSaving === "CHEF" ? <span className="absolute top-1 text-xs">Saving…</span> : null}
                </button>
                {photoSlots.map((url, slot) => {
                  const saving = photoSaving === "KITCHEN" && slot === nextPhotoSlot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={PHOTO_TILE}
                      disabled={url === undefined || photoSaving !== null}
                      aria-busy={saving}
                      onClick={() => {
                        if (url || slot !== nextPhotoSlot) notePhoto(url ? PHOTOS_LOCKED : "Add the overall kitchen photo first.");
                        else setPhotoSheet(true);
                      }}
                    >
                      {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <Store className="h-6 w-6" aria-hidden="true" />}
                      <span className={url ? "absolute inset-x-0 bottom-0 bg-white py-0.5 text-[#1A1A1A]" : undefined}>
                        {slot === 0 ? "Overall kitchen" : "Cooking setup"}
                        {url ? <span className="sr-only">: photo added</span> : null}
                      </span>
                      {url === undefined ? <ChefPill>Coming soon</ChefPill> : null}
                      {saving ? <span className="absolute top-1 text-xs">Saving…</span> : null}
                    </button>
                  );
                })}
              </div>
              <input ref={cameraInput} type="file" accept="image/jpeg,image/png" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={choosePhoto} />
              <input ref={galleryInput} type="file" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={choosePhoto} />
              <p aria-live="polite" className="mt-3 text-sm text-[#6B6B6B] empty:mt-0">{photoNote.text ? <span key={photoNote.key}>{photoNote.text}</span> : null}</p>
            </ChefSection>
          ) : null}
        </div>
        <Sheet
          open={faceSheet}
          onOpenChange={setFaceSheet}
          title="Change your picture"
          footer={
            <>
              <button type="button" className={secondaryActionClass} onClick={() => setFaceSheet(false)}>Cancel</button>
              <button type="button" className="craves-primary-action w-full sm:w-auto" disabled={!faceDraft} onClick={saveFace}>Save</button>
            </>
          }
        >
          <div className="mt-5">
            <ChefAvatarGrid selectedId={faceDraft} onSelect={setFaceDraft} />
          </div>
        </Sheet>
        <Sheet
          open={photoSheet}
          onOpenChange={showPhotoSheet}
          title="Kitchen photo"
          description="Photos can’t be changed once added."
          footer={photoPreview ? (
            <>
              <button type="button" className={secondaryActionClass} onClick={() => setPhotoDraft(null)}>Choose another</button>
              <button type="button" className="craves-primary-action w-full sm:w-auto" onClick={confirmPhoto}>Use this photo</button>
            </>
          ) : undefined}
        >
          {photoPreview ? (
            <img src={photoPreview} alt="Your kitchen photo" className="mt-5 aspect-[4/3] w-full rounded-2xl object-cover" />
          ) : (
            <div className="mt-5 grid gap-2">
              <button type="button" className={PHOTO_SOURCE} onClick={() => pickPhoto(cameraInput.current)}><Camera className="h-5 w-5" aria-hidden="true" />Take a photo</button>
              <button type="button" className={PHOTO_SOURCE} onClick={() => pickPhoto(galleryInput.current)}><ImageIcon className="h-5 w-5" aria-hidden="true" />Choose from gallery</button>
            </div>
          )}
        </Sheet>
        <ChefFlash message={notice} onClose={() => setNotice("")} />
      </div>
    );
  }

  if (step === "name") {
    return (
      <>
      <PageBack />
      <section className="chef-section mt-2 p-5 md:p-7">
        <StepHeader label="Name" onBack={kitchen ? () => go("summary") : undefined} />
        <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Store className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">What should customers call your kitchen?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Choose a simple name you’ll be happy to see next to your food.</p>
        <label className="mt-6 block text-sm font-semibold text-[#1A1A1A]">Kitchen name<RequiredMark /><input {...inputProps("kitchenName")} aria-required="true" value={form.kitchenName} onChange={(event) => setField("kitchenName", event.target.value)} className={INPUT_CLASS} maxLength={CHEF_KITCHEN_FIELD_LIMITS.kitchenName} /></label>
        <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Tell customers what you cook <span className="font-normal text-[#6B6B6B]">(optional)</span><textarea value={form.description} onChange={(event) => setField("description", event.target.value)} className={`${INPUT_CLASS} min-h-28`} maxLength={1000} /></label>
        {form.cuisines ? <ChipPicker label="What you cook" options={SUGGESTED_CUISINES} selected={form.cuisines} onChange={(next) => setField("cuisines", next)} addLabel="+ Add" addFieldLabel="Add a cuisine" /> : null}
        <details className="mt-5 rounded-2xl bg-[#F1F3F5] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">More kitchen details</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[#1A1A1A]">Chef name customers see <span className="font-normal text-[#6B6B6B]">(optional)</span><input {...inputProps("displayName")} value={form.displayName} onChange={(event) => setField("displayName", event.target.value)} className={INPUT_CLASS} maxLength={CHEF_KITCHEN_FIELD_LIMITS.displayName} /></label>
            <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Kitchen email <span className="font-normal text-[#6B6B6B]">(optional)</span><input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} className={INPUT_CLASS} /></label>
            {form.socialLinks ? <p className="text-sm text-[#6B6B6B] sm:col-span-2">Social links start with https://</p> : null}
            {form.socialLinks ? SOCIAL_LINK_FIELDS.map((field) => (
              <label key={field} className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">{SOCIAL_LINK_LABELS[field]} <span className="font-normal text-[#6B6B6B]">(optional)</span><input {...inputProps(field)} type="url" inputMode="url" placeholder="https://" value={form.socialLinks?.[field]} onChange={(event) => setLink(field, event.target.value)} className={INPUT_CLASS} maxLength={SOCIAL_LINK_MAX} /></label>
            )) : null}
          </div>
        </details>
        <label className="mt-5 block text-sm font-semibold text-[#1A1A1A]">Kitchen phone <span className="font-normal text-[#6B6B6B]">(required to accept orders)</span><input {...inputProps("phoneNumber")} value={form.phoneNumber} onChange={(event) => setField("phoneNumber", event.target.value)} className={INPUT_CLASS} inputMode="tel" maxLength={24} /></label>
        {message ? <p id="kitchen-field-error" role="alert" className="chef-field-error mt-4">{message}</p> : null}
        <button type="button" onClick={continueName} className="chef-btn is-primary is-block mt-7">Continue</button>
      </section>
      </>
    );
  }

  if (step === "address") {
    return (
      <>
      <PageBack />
      <section className="chef-section mt-2 p-5 md:p-7">
        <StepHeader label="Pickup address" onBack={() => go("name")} />
        <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><MapPin className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Is this where you cook?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Pickup partners use this location when food is ready.</p>
        {pinLocked ? null : <button type="button" disabled={locating} onClick={useCurrentLocation} className="chef-btn is-block mt-6"><MapPin className="h-4 w-4" aria-hidden="true" />{locating ? "Finding my address…" : mapped ? "Refresh current location" : "Use my current location"}</button>}
        {message ? <p id="kitchen-field-error" role={invalidField ? "alert" : "status"} className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        {!pinLocked && form.latitude !== "" && form.longitude !== "" ? <div className="mt-5"><AddressMapPicker latitude={Number(form.latitude)} longitude={Number(form.longitude)} onCenterChange={next => void moveKitchenPin(next)} onUseCurrentLocation={useCurrentLocation} locating={locating} disabled={locating} /></div> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Flat / House / Building<RequiredMark /><input {...inputProps("addressLine1")} aria-required="true" value={form.addressLine1} onChange={(event) => setField("addressLine1", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A] sm:col-span-2">Street / Road <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.addressLine2} onChange={(event) => setField("addressLine2", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Area <span className="font-normal text-[#6B6B6B]">(required to accept orders)</span><input {...inputProps("areaName")} readOnly={"areaName" in locked} value={form.areaName} onChange={(event) => setField("areaName", event.target.value)} className={INPUT_CLASS} maxLength={120} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Landmark <span className="font-normal text-[#6B6B6B]">(optional)</span><input value={form.landmark} onChange={(event) => setField("landmark", event.target.value)} className={INPUT_CLASS} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">City<RequiredMark /><input {...inputProps("city")} aria-required="true" readOnly={"city" in locked} value={form.city} onChange={(event) => setField("city", event.target.value)} className={INPUT_CLASS} maxLength={CHEF_KITCHEN_FIELD_LIMITS.city} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">State<RequiredMark /><input {...inputProps("state")} aria-required="true" readOnly={"state" in locked} value={form.state} onChange={(event) => setField("state", event.target.value)} className={INPUT_CLASS} maxLength={CHEF_KITCHEN_FIELD_LIMITS.state} /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Pincode <span className="font-normal text-[#6B6B6B]">(required to accept orders)</span><input {...inputProps("postalCode")} readOnly={"postalCode" in locked} value={form.postalCode} onChange={(event) => setField("postalCode", event.target.value)} className={INPUT_CLASS} inputMode="numeric" maxLength={CHEF_KITCHEN_FIELD_LIMITS.postalCode} /></label>
        </div>
        {form.serviceAreas ? <ChipPicker label="Delivery areas" options={form.areaName.trim() ? [form.areaName.trim()] : []} selected={form.serviceAreas} onChange={(next) => setField("serviceAreas", next)} addLabel="+ Add area" addFieldLabel="Add a delivery area" /> : null}
        {kitchen ? (
          <div className="mt-5 rounded-2xl bg-[#F1F3F5] p-4">
            <p className="text-sm leading-6 text-[#6B6B6B]">Your saved area, city, PIN code, state and map pin stay as they are. To move your kitchen, contact Craves support.</p>
            <button type="button" onClick={() => { if (moveState === "sent") setMoveState("idle"); setMoveSheet(true); }} className="chef-btn is-small mt-3">Move my kitchen</button>
          </div>
        ) : null}
        <button type="button" onClick={continueAddress} disabled={locating} className="chef-btn is-primary is-block mt-7">Yes, this is right</button>
        <Sheet
          open={moveSheet}
          onOpenChange={setMoveSheet}
          title="Move my kitchen"
          description="Tell Craves support the new address. They move your kitchen and its map pin for you."
          busy={moveState === "sending"}
          unsavedChanges={moveState !== "sent" && Boolean(moveDraft.trim())}
          footer={moveState === "sent" ? (
            <>
              <Link href="/chef/support" className={secondaryActionClass}>Open Help & support</Link>
              <button type="button" className="craves-primary-action w-full sm:w-auto" onClick={() => setMoveSheet(false)}>Done</button>
            </>
          ) : (
            <>
              <button type="button" className={secondaryActionClass} onClick={() => setMoveSheet(false)}>Cancel</button>
              <button type="button" className="craves-primary-action w-full sm:w-auto" disabled={!moveDraft.trim() || moveState === "sending" || moveState === "unavailable"} aria-busy={moveState === "sending"} onClick={() => void sendMove()}>{moveState === "sending" ? "Sending…" : "Send"}</button>
            </>
          )}
        >
          {moveState === "sent" ? (
            <p role="status" className="mt-5 text-[0.9375rem] leading-6 text-[#1A1A1A]">Sent. Craves support will reply in Help & support.</p>
          ) : (
            <>
              {moveState === "unavailable" ? <div className="mt-5"><ComingSoon title="Chat is on its way" message="You will be able to write to Craves support here soon." /></div> : null}
              <label className="mt-5 block text-sm font-semibold text-[#1A1A1A]">Your new kitchen address<textarea value={moveDraft} onChange={(event) => setMoveDraft(event.target.value)} className={`${INPUT_CLASS} min-h-28`} maxLength={SUPPORT_MESSAGE_MAX} /></label>
              {moveState === "failed" ? <p role="alert" className="mt-3 text-sm font-medium text-[#C4200F]">We couldn’t send that. Your message is still here.</p> : null}
            </>
          )}
        </Sheet>
      </section>
      </>
    );
  }

  const openSelected = form.status === "ACTIVE";
  return (
    <>
    <PageBack />
    <section className="chef-section mt-2 p-5 md:p-7">
      <StepHeader label="Ready for orders" onBack={() => go("address")} />
      <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Check className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
      <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">Should your kitchen be ready when your first dish goes live?</h1>
      <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">You can close your kitchen anytime. Customers still won’t see food until you add an available dish.</p>
      <div className="mt-6 grid gap-3">
        <button type="button" onClick={() => chooseOpen(true)} className={`rounded-2xl border p-5 text-left transition ${openSelected ? "!border-[#1A1A1A] shadow-[inset_0_0_0_1px_#1A1A1A]" : "border-[#E5E7EB]"}`}>
          <p className="font-semibold text-[#1A1A1A]">Yes, get my kitchen ready</p>
          <p className="mt-1 text-sm text-[#6B6B6B]">It can open as soon as an available dish is on your menu.</p>
        </button>
        <button type="button" onClick={() => chooseOpen(false)} className={`rounded-2xl border p-5 text-left transition ${!openSelected ? "!border-[#1A1A1A] shadow-[inset_0_0_0_1px_#1A1A1A]" : "border-[#E5E7EB]"}`}>
          <p className="font-semibold text-[#1A1A1A]">Not yet</p>
          <p className="mt-1 text-sm text-[#6B6B6B]">Save everything and keep the kitchen closed for now.</p>
        </button>
      </div>
      {message ? <p id="kitchen-field-error" role="alert" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#C4200F]">{message}</p> : null}
      <button type="button" disabled={busy || locating || suspended} onClick={() => void save()} className="chef-btn is-primary is-block mt-7">{busy ? "Saving…" : "Save my kitchen"}</button>
    </section>
    </>
  );
}
