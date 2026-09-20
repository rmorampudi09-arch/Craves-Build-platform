"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Crosshair,
  Home,
  Loader2,
  MapPin,
  Save,
  Tag,
  X,
} from "lucide-react";

import { AddressMapPicker } from "@/components/location/AddressMapPicker";
import {
  parseAddressInput,
  type AddressLabel,
  type CustomerAddress,
  type CustomerAddressInput,
} from "@/lib/address-contract";
import type { ReverseGeocodedAddress } from "@/lib/location-contract";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";

type Step = "locate" | "details";

type AddressDraft = Omit<CustomerAddressInput, "latitude" | "longitude"> & {
  latitude: string;
  longitude: string;
};

type ProfileDefaults = {
  recipientName: string;
  contactPhoneNumber: string;
};

type FieldKey =
  | "addressName"
  | "addressLine1"
  | "areaName"
  | "landmark"
  | "recipientName"
  | "contactPhoneNumber"
  | "districtName"
  | "city"
  | "state"
  | "postalCode";

type FieldErrors = Partial<Record<FieldKey, string>>;

interface AddressEditorFlowProps {
  open: boolean;
  initialAddress: CustomerAddress | null;
  profileDefaults: ProfileDefaults;
  onClose: () => void;
  onSaved: (saved: CustomerAddress | null) => Promise<void> | void;
}

const EMPTY_DRAFT: AddressDraft = {
  addressLabel: "HOME",
  addressName: null,
  recipientName: "",
  contactPhoneNumber: "",
  addressLine1: "",
  addressLine2: null,
  landmark: null,
  areaName: "",
  districtName: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  isDefault: false,
};

const LABELS: Array<{
  value: AddressLabel;
  label: string;
  icon: typeof Home;
}> = [
  { value: "HOME", label: "Home", icon: Home },
  { value: "WORK", label: "Work", icon: BriefcaseBusiness },
  { value: "OTHER", label: "Other", icon: Tag },
];

const PHONE = /^\+?[0-9]{10,15}$/;

function draftFrom(address: CustomerAddress): AddressDraft {
  return {
    addressLabel: address.addressLabel,
    addressName: address.addressName ?? null,
    recipientName: address.recipientName ?? "",
    contactPhoneNumber: address.contactPhoneNumber,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    landmark: address.landmark,
    areaName: address.areaName ?? "",
    districtName: address.districtName ?? "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode ?? "",
    latitude: address.latitude == null ? "" : String(address.latitude),
    longitude: address.longitude == null ? "" : String(address.longitude),
    isDefault: address.isDefault,
  };
}

function addressLine(address: CustomerAddress): string {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.areaName,
    address.districtName,
    address.city,
    address.state,
    address.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

function hasCoordinates(draft: AddressDraft): boolean {
  const latitude = Number(draft.latitude);
  const longitude = Number(draft.longitude);
  return (
    draft.latitude.trim() !== "" &&
    draft.longitude.trim() !== "" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function currentPoint(draft: AddressDraft) {
  return hasCoordinates(draft)
    ? {
        latitude: Number(draft.latitude),
        longitude: Number(draft.longitude),
      }
    : null;
}

function withDetectedAddress(
  current: AddressDraft,
  detected: ReverseGeocodedAddress,
  latitude: number,
  longitude: number,
): AddressDraft {
  return {
    ...current,
    addressLine1: current.addressLine1.trim() || detected.houseNumber || "",
    addressLine2: detected.street || current.addressLine2,
    areaName: detected.area || detected.city || current.areaName,
    districtName:
      detected.district || detected.city || current.districtName,
    city: detected.city || current.city,
    state: detected.state || current.state,
    postalCode: detected.postalCode || current.postalCode,
    latitude: String(latitude),
    longitude: String(longitude),
  };
}

function getBrowserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location access."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
        }),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED
              ? "Location permission was not granted. Enable location access and try again."
              : "Craves could not read your current location. Try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

function validateDraft(draft: AddressDraft): FieldErrors {
  const errors: FieldErrors = {};

  if (draft.addressLabel === "OTHER" && !draft.addressName?.trim()) {
    errors.addressName = "Enter a name for this address.";
  }
  if (!draft.addressLine1.trim()) {
    errors.addressLine1 = "Enter your flat, house, building or floor.";
  }
  if (!draft.areaName.trim()) {
    errors.areaName = "Enter your area or neighbourhood.";
  }
  if (!draft.landmark?.trim()) {
    errors.landmark = "Enter a nearby landmark.";
  }
  if (!draft.recipientName.trim()) {
    errors.recipientName = "Enter the receiver's name.";
  }
  if (!draft.contactPhoneNumber.trim()) {
    errors.contactPhoneNumber = "Enter the receiver's phone number.";
  } else if (!PHONE.test(draft.contactPhoneNumber.trim())) {
    errors.contactPhoneNumber = "Enter a valid 10–15 digit phone number.";
  }
  if (!draft.districtName.trim()) {
    errors.districtName = "Enter the district.";
  }
  if (!draft.city.trim()) {
    errors.city = "Enter the city.";
  }
  if (!draft.state.trim()) {
    errors.state = "Enter the state.";
  }
  if (!draft.postalCode.trim()) {
    errors.postalCode = "Enter the pincode.";
  }

  return errors;
}

export function AddressEditorFlow({
  open,
  initialAddress,
  profileDefaults,
  onClose,
  onSaved,
}: AddressEditorFlowProps) {
  const [step, setStep] = useState<Step>("locate");
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT);
  const [targetAddressId, setTargetAddressId] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [mapResolving, setMapResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const reverseRequestRef = useRef(0);

  useEffect(() => {
    if (!open) return;

    const nextDraft = initialAddress
      ? draftFrom(initialAddress)
      : {
          ...EMPTY_DRAFT,
          recipientName: profileDefaults.recipientName,
          contactPhoneNumber: profileDefaults.contactPhoneNumber,
        };

    setDraft(nextDraft);
    setTargetAddressId(initialAddress?.id ?? null);
    setResolvedAddress(initialAddress ? addressLine(initialAddress) : "");
    setMessage(null);
    setFieldErrors({});
    setStep(initialAddress && hasCoordinates(nextDraft) ? "details" : "locate");
  }, [
    initialAddress,
    open,
    profileDefaults.contactPhoneNumber,
    profileDefaults.recipientName,
  ]);

  const update = <K extends keyof AddressDraft>(
    key: K,
    value: AddressDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key in fieldErrors) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[key as FieldKey];
        return next;
      });
    }
  };

  const resolvePoint = async (latitude: number, longitude: number) => {
    const requestId = reverseRequestRef.current + 1;
    reverseRequestRef.current = requestId;
    setMapResolving(true);
    setMessage(null);

    try {
      const detected = await reverseGeocodeCurrentLocation(latitude, longitude);
      if (requestId !== reverseRequestRef.current) return;
      setDraft((current) =>
        withDetectedAddress(current, detected, latitude, longitude),
      );
      setResolvedAddress(detected.formattedAddress);
      setStep("details");
    } catch (error) {
      if (requestId !== reverseRequestRef.current) return;
      setDraft((current) => ({
        ...current,
        latitude: String(latitude),
        longitude: String(longitude),
      }));
      setResolvedAddress("");
      setStep("details");
      setMessage(
        error instanceof Error
          ? error.message
          : "Craves could not identify this map point. Complete the location fields below.",
      );
    } finally {
      if (requestId === reverseRequestRef.current) {
        setMapResolving(false);
      }
    }
  };

  const handleUseCurrentLocation = async () => {
    if (locating || busy) return;
    setLocating(true);
    setMessage(null);

    try {
      const point = await getBrowserLocation();
      await resolvePoint(point.latitude, point.longitude);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Craves could not read your current location. Try again.",
      );
    } finally {
      setLocating(false);
    }
  };

  const handleMapCenterChange = (next: {
    latitude: number;
    longitude: number;
  }) => {
    setDraft((current) => ({
      ...current,
      latitude: String(next.latitude),
      longitude: String(next.longitude),
    }));
    void resolvePoint(next.latitude, next.longitude);
  };

  const save = async () => {
    const errors = validateDraft(draft);
    const point = currentPoint(draft);

    if (!point) {
      setMessage("Choose your delivery location before saving.");
      setStep("locate");
      return;
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setMessage("Please complete the highlighted fields.");
      const firstField = Object.keys(errors)[0];
      window.requestAnimationFrame(() => {
        document
          .getElementById("address-" + firstField)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    const input = parseAddressInput({
      ...draft,
      addressLine1: draft.addressLine1.trim(),
      addressLine2: draft.addressLine2?.trim() || null,
      landmark: draft.landmark?.trim() || null,
      areaName: draft.areaName.trim(),
      districtName: draft.districtName.trim(),
      city: draft.city.trim(),
      state: draft.state.trim(),
      postalCode: draft.postalCode.trim(),
      latitude: draft.latitude.trim(),
      longitude: draft.longitude.trim(),
    });

    if (!input) {
      setMessage("Please review the address details and try again.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(
        targetAddressId
          ? "/api/customer/addresses/" + targetAddressId
          : "/api/customer/addresses",
        {
          method: targetAddressId ? "PUT" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Address could not be saved.");
      }
      await onSaved(
        body && typeof body === "object" ? (body as CustomerAddress) : null,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Address could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const point = currentPoint(draft);
  const missingLocationFields = [
    ["districtName", "District"],
    ["city", "City"],
    ["state", "State"],
    ["postalCode", "Pincode"],
  ] as const;
  const unresolvedRequired = missingLocationFields.filter(
    ([key]) => !draft[key].trim(),
  );
  const title =
    step === "locate"
      ? targetAddressId
        ? "Update delivery location"
        : "Add new address"
      : targetAddressId
        ? "Edit address"
        : "Add address details";

  const inputClass = (key: FieldKey) =>
    "mt-1.5 w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-[#1A1A1A] outline-none transition-[border-color,box-shadow] placeholder:text-[#9A9A9A] focus:ring-2 " +
    (fieldErrors[key]
      ? "border-[#F62E18] focus:border-[#F62E18] focus:ring-[#F62E18]/10"
      : "border-[#E5E7EB] focus:border-[#1A1A1A] focus:ring-[#1A1A1A]/10");

  const actionClass =
    "transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:!bg-white hover:shadow-[0_7px_18px_rgba(26,26,26,0.10)] active:translate-y-0 motion-reduce:transform-none";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-labelledby="address-flow-title"
          className="fixed bottom-0 left-1/2 z-[91] flex max-h-[96svh] w-full max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-[0_30px_90px_rgba(26,26,26,0.25)] outline-none md:bottom-auto md:top-1/2 md:max-h-[92vh] md:-translate-y-1/2 md:rounded-[2rem] md:border md:border-[#E5E7EB]"
        >
          <div
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#D7DADF] md:hidden"
            aria-hidden="true"
          />

          <div className="flex items-start gap-3 border-b border-[#F1F3F5] px-5 py-5 md:px-7 md:py-6">
            {step === "details" ? (
              <button
                type="button"
                onClick={() => setStep("locate")}
                disabled={busy}
                className={
                  "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] " +
                  actionClass +
                  " disabled:opacity-50"
                }
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : null}

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#F62E18]">
                Delivery address
              </p>
              <Dialog.Title
                id="address-flow-title"
                className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-[#1A1A1A]"
              >
                {title}
              </Dialog.Title>
              <Dialog.Description
                className={
                  step === "locate"
                    ? "mt-1 text-xs font-medium leading-5 text-[#6B6B6B] md:text-sm"
                    : "sr-only"
                }
              >
                {step === "locate"
                  ? "Use your current location to place the delivery pin."
                  : "Confirm the pin and complete the required address details."}
              </Dialog.Description>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] " +
                actionClass +
                " disabled:opacity-50"
              }
              aria-label="Close address flow"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5 md:px-7 md:py-6">
            <AnimatePresence mode="wait" initial={false}>
              {step === "locate" ? (
                <motion.div
                  key="locate"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, ease: [0.23, 0.88, 0.26, 0.92] }}
                >
                  <button
                    type="button"
                    onClick={() => void handleUseCurrentLocation()}
                    disabled={locating || busy}
                    className={
                      "flex w-full items-center gap-4 rounded-2xl border border-[#E5E7EB] !bg-[#F1F3F5] p-4 text-left !text-[#1A1A1A] " +
                      actionClass +
                      " disabled:opacity-50"
                    }
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
                      {locating ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Crosshair className="h-5 w-5" />
                      )}
                    </span>
                    <span>
                      <span className="block text-sm font-black">
                        {locating ? "Finding your location…" : "Use current location"}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-[#6B6B6B]">
                        {targetAddressId
                          ? "Update the map pin using GPS"
                          : "Start with your current GPS position"}
                      </span>
                    </span>
                  </button>

                  {message ? (
                    <p
                      role="status"
                      className="mt-4 rounded-xl bg-[#F1F3F5] px-3.5 py-3 text-xs font-semibold leading-5 text-[#6B6B6B]"
                    >
                      {message}
                    </p>
                  ) : null}
                </motion.div>
              ) : (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2, ease: [0.23, 0.88, 0.26, 0.92] }}
                >
                  {point ? (
                    <AddressMapPicker
                      latitude={point.latitude}
                      longitude={point.longitude}
                      locating={locating}
                      disabled={busy || mapResolving}
                      onCenterChange={handleMapCenterChange}
                      onUseCurrentLocation={() => void handleUseCurrentLocation()}
                    />
                  ) : null}

                  <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#F1F3F5] p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
                      {mapResolving ? (
                        <Loader2 className="h-4.5 w-4.5 animate-spin" />
                      ) : (
                        <MapPin className="h-4.5 w-4.5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase tracking-[0.1em] text-[#6B6B6B]">
                        Delivery location
                      </p>
                      <p className="mt-1 text-sm font-bold leading-6 text-[#1A1A1A]">
                        {resolvedAddress || "Complete the location details below."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4">
                    <label
                      id="address-addressLine1"
                      className="text-xs font-bold text-[#1A1A1A]"
                    >
                      Flat / house / floor
                      <input
                        value={draft.addressLine1}
                        onChange={(event) =>
                          update("addressLine1", event.target.value)
                        }
                        placeholder="Flat, house or building number"
                        maxLength={250}
                        className={inputClass("addressLine1")}
                        aria-invalid={Boolean(fieldErrors.addressLine1)}
                      />
                      {fieldErrors.addressLine1 ? (
                        <span className="mt-1.5 block text-[11px] font-semibold text-[#F62E18]">
                          {fieldErrors.addressLine1}
                        </span>
                      ) : null}
                    </label>

                    <label
                      id="address-areaName"
                      className="text-xs font-bold text-[#1A1A1A]"
                    >
                      Area
                      <input
                        value={draft.areaName}
                        onChange={(event) =>
                          update("areaName", event.target.value)
                        }
                        placeholder="Area or neighbourhood"
                        maxLength={120}
                        className={inputClass("areaName")}
                        aria-invalid={Boolean(fieldErrors.areaName)}
                      />
                      {fieldErrors.areaName ? (
                        <span className="mt-1.5 block text-[11px] font-semibold text-[#F62E18]">
                          {fieldErrors.areaName}
                        </span>
                      ) : null}
                    </label>

                    <label
                      id="address-landmark"
                      className="text-xs font-bold text-[#1A1A1A]"
                    >
                      Landmark
                      <input
                        value={draft.landmark ?? ""}
                        onChange={(event) =>
                          update("landmark", event.target.value || null)
                        }
                        placeholder="Nearby landmark"
                        maxLength={160}
                        className={inputClass("landmark")}
                        aria-invalid={Boolean(fieldErrors.landmark)}
                      />
                      {fieldErrors.landmark ? (
                        <span className="mt-1.5 block text-[11px] font-semibold text-[#F62E18]">
                          {fieldErrors.landmark}
                        </span>
                      ) : null}
                    </label>

                    {unresolvedRequired.length > 0 ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {unresolvedRequired.map(([key, label]) => (
                          <label
                            key={key}
                            id={"address-" + key}
                            className="text-xs font-bold text-[#1A1A1A]"
                          >
                            {label}
                            <input
                              value={draft[key]}
                              onChange={(event) => update(key, event.target.value)}
                              inputMode={key === "postalCode" ? "numeric" : "text"}
                              className={inputClass(key)}
                              aria-invalid={Boolean(fieldErrors[key])}
                            />
                            {fieldErrors[key] ? (
                              <span className="mt-1.5 block text-[11px] font-semibold text-[#F62E18]">
                                {fieldErrors[key]}
                              </span>
                            ) : null}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-7">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-[#6B6B6B]">
                      Address type
                    </p>
                    <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl bg-[#F1F3F5] p-1.5">
                      {LABELS.map((option) => {
                        const Icon = option.icon;
                        const selected = draft.addressLabel === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              update("addressLabel", option.value);
                              if (option.value !== "OTHER") {
                                update("addressName", null);
                              }
                            }}
                            className={
                              "flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-black transition-[background-color,box-shadow,transform] duration-200 ease-out " +
                              (selected
                                ? "bg-white text-[#1A1A1A] shadow-[0_3px_10px_rgba(26,26,26,0.08)]"
                                : "text-[#6B6B6B] hover:-translate-y-0.5 hover:bg-white hover:text-[#1A1A1A] hover:shadow-[0_5px_14px_rgba(26,26,26,0.08)]") +
                              " motion-reduce:transform-none"
                            }
                          >
                            <Icon
                              className={
                                "h-4 w-4 " +
                                (selected ? "text-[#F62E18]" : "text-current")
                              }
                            />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {draft.addressLabel === "OTHER" ? (
                      <label
                        id="address-addressName"
                        className="mt-3 block text-xs font-bold text-[#1A1A1A]"
                      >
                        Name this address
                        <input
                          autoFocus
                          value={draft.addressName ?? ""}
                          onChange={(event) =>
                            update("addressName", event.target.value || null)
                          }
                          placeholder="e.g. Mom's home, Studio"
                          maxLength={80}
                          className={inputClass("addressName")}
                          aria-invalid={Boolean(fieldErrors.addressName)}
                        />
                        {fieldErrors.addressName ? (
                          <span className="mt-1.5 block text-[11px] font-semibold text-[#F62E18]">
                            {fieldErrors.addressName}
                          </span>
                        ) : null}
                      </label>
                    ) : null}
                  </div>

                  <div className="mt-7 grid gap-4 sm:grid-cols-2">
                    <label
                      id="address-recipientName"
                      className="text-xs font-bold text-[#1A1A1A]"
                    >
                      Receiver name
                      <input
                        value={draft.recipientName}
                        onChange={(event) =>
                          update("recipientName", event.target.value)
                        }
                        placeholder="Full name"
                        maxLength={160}
                        className={inputClass("recipientName")}
                        aria-invalid={Boolean(fieldErrors.recipientName)}
                      />
                      {fieldErrors.recipientName ? (
                        <span className="mt-1.5 block text-[11px] font-semibold text-[#F62E18]">
                          {fieldErrors.recipientName}
                        </span>
                      ) : null}
                    </label>

                    <label
                      id="address-contactPhoneNumber"
                      className="text-xs font-bold text-[#1A1A1A]"
                    >
                      Receiver&apos;s phone
                      <input
                        value={draft.contactPhoneNumber}
                        onChange={(event) =>
                          update("contactPhoneNumber", event.target.value)
                        }
                        placeholder="+919876543210"
                        inputMode="tel"
                        maxLength={16}
                        className={inputClass("contactPhoneNumber")}
                        aria-invalid={Boolean(fieldErrors.contactPhoneNumber)}
                      />
                      {fieldErrors.contactPhoneNumber ? (
                        <span className="mt-1.5 block text-[11px] font-semibold text-[#F62E18]">
                          {fieldErrors.contactPhoneNumber}
                        </span>
                      ) : null}
                    </label>
                  </div>

                  {message ? (
                    <p
                      role="status"
                      className="mt-5 rounded-xl bg-[#F1F3F5] px-3.5 py-3 text-xs font-semibold leading-5 text-[#6B6B6B]"
                    >
                      {message}
                    </p>
                  ) : null}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {step === "details" ? (
            <div className="grid grid-cols-[0.7fr_1.3fr] gap-3 border-t border-[#F1F3F5] bg-white px-5 py-4 md:px-7">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className={
                  "min-h-12 rounded-xl !border !border-[#E5E7EB] !bg-white px-3 text-sm font-black !text-[#1A1A1A] " +
                  actionClass +
                  " disabled:opacity-50"
                }
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || mapResolving}
                className={
                  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-[#F1F3F5] px-3 text-sm font-black !text-[#1A1A1A] " +
                  actionClass +
                  " disabled:cursor-not-allowed disabled:opacity-50"
                }
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#F62E18]" />
                ) : (
                  <Save className="h-4 w-4 text-[#F62E18]" />
                )}
                {busy ? "Saving…" : "Save and use this address"}
              </button>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
