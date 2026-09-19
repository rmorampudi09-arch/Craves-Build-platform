"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  Crosshair,
  Home,
  Loader2,
  MapPin,
  Search,
  Tag,
  X,
} from "lucide-react";

import { AddressMapPicker } from "@/components/location/AddressMapPicker";
import {
  parseAddressInput,
  parseLocationRecommendation,
  type AddressLabel,
  type CustomerAddress,
  type CustomerAddressInput,
} from "@/lib/address-contract";
import type { ReverseGeocodedAddress } from "@/lib/location-contract";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";
import {
  searchLocations,
  type LocationSearchResult,
} from "@/services/location/searchLocation";

type Step = "choose" | "map" | "details";

type AddressDraft = Omit<CustomerAddressInput, "latitude" | "longitude"> & {
  latitude: string;
  longitude: string;
};

type ProfileDefaults = {
  recipientName: string;
  contactPhoneNumber: string;
};

interface AddressEditorFlowProps {
  open: boolean;
  initialAddress: CustomerAddress | null;
  addresses: CustomerAddress[];
  profileDefaults: ProfileDefaults;
  onClose: () => void;
  onSaved: (saved: CustomerAddress | null) => Promise<void> | void;
}

const EMPTY_DRAFT: AddressDraft = {
  addressLabel: "HOME",
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

function draftFrom(address: CustomerAddress): AddressDraft {
  return {
    addressLabel: address.addressLabel,
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

function withDetectedAddress(
  current: AddressDraft,
  detected: ReverseGeocodedAddress,
  latitude: number,
  longitude: number,
): AddressDraft {
  return {
    ...current,
    addressLine1:
      current.addressLine1.trim() || detected.houseNumber || "",
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

function withSearchResult(
  current: AddressDraft,
  result: LocationSearchResult,
): AddressDraft {
  return {
    ...current,
    addressLine1:
      current.addressLine1.trim() || result.houseNumber || "",
    addressLine2: result.street || current.addressLine2,
    areaName: result.area || result.city || current.areaName,
    districtName: result.district || result.city || current.districtName,
    city: result.city || current.city,
    state: result.state || current.state,
    postalCode: result.postalCode || current.postalCode,
    latitude: String(result.latitude),
    longitude: String(result.longitude),
  };
}

function currentPoint(draft: AddressDraft) {
  return hasCoordinates(draft)
    ? {
        latitude: Number(draft.latitude),
        longitude: Number(draft.longitude),
      }
    : null;
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
              ? "Location permission was not granted. Search for your area or street instead."
              : "Craves could not read your current location. Search for your area or street instead.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

export function AddressEditorFlow({
  open,
  initialAddress,
  addresses,
  profileDefaults,
  onClose,
  onSaved,
}: AddressEditorFlowProps) {
  const [step, setStep] = useState<Step>("choose");
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_DRAFT);
  const [targetAddressId, setTargetAddressId] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapResolving, setMapResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
    setSearchTerm("");
    setSearchResults([]);
    setMessage(
      initialAddress && !hasCoordinates(nextDraft)
        ? "This saved address needs a delivery location. Search or use GPS to continue."
        : null,
    );
    setStep(initialAddress && hasCoordinates(nextDraft) ? "map" : "choose");
  }, [initialAddress, open, profileDefaults.contactPhoneNumber, profileDefaults.recipientName]);

  useEffect(() => {
    if (!open || step !== "choose") return;
    const query = searchTerm.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      setMessage(null);
      void searchLocations(query, currentPoint(draft))
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
            if (results.length === 0) {
              setMessage("No matching locations found. Try an area, street, landmark, or pincode.");
            }
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setSearchResults([]);
            setMessage(
              error instanceof Error
                ? error.message
                : "Address search is unavailable right now.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [draft, open, searchTerm, step]);

  const update = <K extends keyof AddressDraft>(
    key: K,
    value: AddressDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const selectSavedAddress = (address: CustomerAddress) => {
    const next = draftFrom(address);
    setTargetAddressId(address.id);
    setDraft(next);
    setResolvedAddress(addressLine(address));
    setSearchTerm("");
    setSearchResults([]);
    if (hasCoordinates(next)) {
      setStep("map");
      setMessage("Saved address selected. Confirm the pin position or adjust it before continuing.");
    } else {
      setMessage("This saved address needs a map location. Search or use current location to complete it.");
    }
  };

  const resolvePoint = async (
    latitude: number,
    longitude: number,
    fallback?: LocationSearchResult,
  ) => {
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
      setStep("map");
    } catch (error) {
      if (requestId !== reverseRequestRef.current) return;
      if (fallback) {
        setDraft((current) => withSearchResult(current, fallback));
        setResolvedAddress(fallback.formattedAddress);
        setStep("map");
        setMessage(
          "Craves selected this map point, but some address details may need confirmation before saving.",
        );
      } else {
        setDraft((current) => ({
          ...current,
          latitude: String(latitude),
          longitude: String(longitude),
        }));
        setMessage(
          error instanceof Error
            ? error.message
            : "Craves could not identify this map point.",
        );
      }
    } finally {
      if (requestId === reverseRequestRef.current) setMapResolving(false);
    }
  };

  const useCurrentLocation = async () => {
    if (locating || busy) return;
    setLocating(true);
    setMessage("Detecting your current delivery location…");
    try {
      const point = await getBrowserLocation();
      if (step === "choose") {
        const query = new URLSearchParams({
          latitude: String(point.latitude),
          longitude: String(point.longitude),
          matchRadiusMeters: "100",
        });
        const recommendationResponse = await fetch(
          `/api/customer/addresses/recommendation?${query}`,
          { cache: "no-store", credentials: "same-origin" },
        );
        const recommendation = recommendationResponse.ok
          ? parseLocationRecommendation(
              await recommendationResponse.json().catch(() => null),
            )
          : null;

        if (recommendation?.selectedSavedAddress) {
          selectSavedAddress(recommendation.selectedSavedAddress);
          setMessage(
            `You're near your saved ${recommendation.selectedSavedAddress.addressLabel.toLowerCase()} address. Confirm the saved pin or adjust it before continuing.`,
          );
          return;
        }
      }

      await resolvePoint(point.latitude, point.longitude);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Craves could not read your current location. Search for your area or street instead.",
      );
    } finally {
      setLocating(false);
    }
  };

  const selectSearchResult = async (result: LocationSearchResult) => {
    setDraft((current) => withSearchResult(current, result));
    setResolvedAddress(result.formattedAddress);
    setSearchTerm(result.formattedAddress);
    setSearchResults([]);
    await resolvePoint(result.latitude, result.longitude, result);
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
      setStep("details");
      setMessage(
        "Complete the required delivery/contact details before saving this address.",
      );
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        targetAddressId
          ? `/api/customer/addresses/${targetAddressId}`
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
      await onSaved(body && typeof body === "object" ? (body as CustomerAddress) : null);
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
  const contactComplete =
    draft.recipientName.trim() !== "" && draft.contactPhoneNumber.trim() !== "";
  const title =
    step === "choose"
      ? targetAddressId
        ? "Choose a location"
        : "Add new address"
      : step === "map"
        ? "Confirm delivery location"
        : targetAddressId
          ? "Edit address details"
          : "Add address details";

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm text-[#1A1A1A] outline-none transition-colors placeholder:text-[#9A9A9A] focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10";

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
        <div className="flex items-start gap-3 border-b border-[#F1F3F5] px-5 py-5 md:px-7 md:py-6">
          {step !== "choose" ? (
            <button
              type="button"
              onClick={() => setStep(step === "details" ? "map" : "choose")}
              disabled={busy}
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] hover:text-[#F62E18] disabled:opacity-50"
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
            <p className="mt-1 text-xs font-medium leading-5 text-[#6B6B6B] md:text-sm">
              {step === "choose"
                ? "Choose a delivery point first. Craves keeps the exact coordinates in the background."
                : step === "map"
                  ? "Move the map if needed, then confirm the exact delivery point."
                  : "Add only the details a map cannot reliably know."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#1A1A1A] hover:text-[#F62E18] disabled:opacity-50"
            aria-label="Close address flow"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 md:px-7 md:py-6">
          {step === "choose" ? (
            <div>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#F62E18]"
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search for area, street name..."
                  className="min-h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#F1F3F5] pl-12 pr-12 text-sm font-semibold text-[#1A1A1A] outline-none transition focus:border-[#F62E18] focus:bg-white focus:ring-2 focus:ring-[#F62E18]/10"
                  aria-label="Search for area or street"
                />
                {searching ? (
                  <Loader2 className="absolute right-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 animate-spin text-[#F62E18]" />
                ) : null}
              </div>

              {searchResults.length > 0 ? (
                <div className="mt-2 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => void selectSearchResult(result)}
                      className="flex w-full items-start gap-3 border-b border-[#F1F3F5] px-4 py-3.5 text-left last:border-b-0 hover:bg-[#F1F3F5]"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] text-[#F62E18]">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-[#1A1A1A]">
                          {result.area || result.city || "Selected location"}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-[#6B6B6B]">
                          {result.formattedAddress}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void useCurrentLocation()}
                disabled={locating || busy}
                className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left text-[#1A1A1A] transition hover:border-[#F62E18]/35 hover:bg-[#F1F3F5] disabled:opacity-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#F62E18]">
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
                    Using GPS
                  </span>
                </span>
              </button>

              {addresses.length > 0 ? (
                <div className="mt-7">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6B6B6B]">
                    Saved Addresses
                  </p>
                  <div className="mt-2 divide-y divide-[#F1F3F5] overflow-hidden rounded-2xl border border-[#E5E7EB]">
                    {addresses.map((address) => (
                      <button
                        key={address.id}
                        type="button"
                        onClick={() => selectSavedAddress(address)}
                        className="flex w-full items-start gap-3 bg-white px-4 py-4 text-left hover:bg-[#F1F3F5]"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#F62E18]">
                          <MapPin className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-black text-[#1A1A1A]">
                            {address.addressLabel}
                            {address.isDefault ? (
                              <span className="rounded-full bg-[#F62E18]/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#F62E18]">
                                Default
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-[#6B6B6B]">
                            {addressLine(address)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "map" && point ? (
            <div>
              <AddressMapPicker
                latitude={point.latitude}
                longitude={point.longitude}
                locating={locating}
                disabled={busy || mapResolving}
                onCenterChange={handleMapCenterChange}
                onUseCurrentLocation={() => void useCurrentLocation()}
              />

              <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5] text-[#F62E18]">
                    {mapResolving ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <MapPin className="h-4.5 w-4.5" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-[#6B6B6B]">
                      Selected delivery location
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6 text-[#1A1A1A]">
                      {resolvedAddress || "Resolving this map point…"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === "details" ? (
            <div>
              <div className="grid gap-4">
                <label className="text-xs font-bold text-[#1A1A1A]">
                  Door / Flat No.
                  <input
                    value={draft.addressLine1}
                    onChange={(event) => update("addressLine1", event.target.value)}
                    placeholder="Flat, house or building number"
                    maxLength={250}
                    className={fieldClass}
                  />
                </label>

                <label className="text-xs font-bold text-[#1A1A1A]">
                  Area
                  <input
                    value={draft.areaName}
                    onChange={(event) => update("areaName", event.target.value)}
                    placeholder="Area or neighborhood"
                    maxLength={120}
                    className={fieldClass}
                  />
                </label>

                <label className="text-xs font-bold text-[#1A1A1A]">
                  Landmark <span className="font-medium text-[#9A9A9A]">(optional)</span>
                  <input
                    value={draft.landmark ?? ""}
                    onChange={(event) =>
                      update("landmark", event.target.value || null)
                    }
                    placeholder="Nearby landmark"
                    maxLength={160}
                    className={fieldClass}
                  />
                </label>
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
                        onClick={() => update("addressLabel", option.value)}
                        className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-black transition ${selected ? "bg-white text-[#F62E18] shadow-[0_3px_10px_rgba(26,26,26,0.08)]" : "text-[#6B6B6B] hover:text-[#1A1A1A]"}`}
                      >
                        <Icon className="h-4 w-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {contactComplete ? (
                <div className="mt-7 rounded-2xl bg-[#F1F3F5] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[#6B6B6B]">
                    Delivery contact
                  </p>
                  <p className="mt-1.5 text-sm font-bold text-[#1A1A1A]">
                    {draft.recipientName} · {draft.contactPhoneNumber}
                  </p>
                </div>
              ) : (
                <div className="mt-7">
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-[#6B6B6B]">
                    Delivery contact
                  </p>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    {!draft.recipientName.trim() ? (
                      <label className="text-xs font-bold text-[#1A1A1A]">
                        Recipient name
                        <input
                          value={draft.recipientName}
                          onChange={(event) =>
                            update("recipientName", event.target.value)
                          }
                          placeholder="Full name"
                          maxLength={160}
                          className={fieldClass}
                        />
                      </label>
                    ) : null}
                    {!draft.contactPhoneNumber.trim() ? (
                      <label className="text-xs font-bold text-[#1A1A1A]">
                        Phone number
                        <input
                          value={draft.contactPhoneNumber}
                          onChange={(event) =>
                            update("contactPhoneNumber", event.target.value)
                          }
                          placeholder="+919876543210"
                          inputMode="tel"
                          maxLength={16}
                          className={fieldClass}
                        />
                      </label>
                    ) : null}
                  </div>
                </div>
              )}

              {unresolvedRequired.length > 0 ? (
                <div className="mt-7 rounded-2xl border border-[#F62E18]/20 bg-[#F1F3F5] p-4">
                  <p className="text-sm font-black text-[#1A1A1A]">
                    Complete location details
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">
                    The map provider could not determine these required details.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {unresolvedRequired.map(([key, label]) => (
                      <label key={key} className="text-xs font-bold text-[#1A1A1A]">
                        {label}
                        <input
                          value={draft[key]}
                          onChange={(event) => update(key, event.target.value)}
                          inputMode={key === "postalCode" ? "numeric" : "text"}
                          className={fieldClass}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex items-start gap-2.5 rounded-2xl bg-[#F1F3F5] px-4 py-3 text-xs font-medium leading-5 text-[#6B6B6B]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F62E18]" />
                Street, district, city, state, pincode and exact map coordinates are kept from the confirmed location in the background.
              </div>
            </div>
          ) : null}

          {message ? (
            <p
              role="status"
              className="mt-5 rounded-xl bg-[#F1F3F5] px-3.5 py-3 text-xs font-semibold leading-5 text-[#6B6B6B]"
            >
              {message}
            </p>
          ) : null}
        </div>

        {step === "map" ? (
          <div className="border-t border-[#F1F3F5] bg-white px-5 py-4 md:px-7">
            <button
              type="button"
              disabled={!point || busy || mapResolving}
              onClick={() => setStep("details")}
              className="min-h-12 w-full rounded-xl bg-[#F62E18] px-4 text-sm font-black text-white hover:bg-[#C92716] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mapResolving ? "UPDATING LOCATION…" : "ADD MORE DETAILS"}
            </button>
          </div>
        ) : null}

        {step === "details" ? (
          <div className="grid grid-cols-[0.7fr_1.3fr] gap-3 border-t border-[#F1F3F5] bg-white px-5 py-4 md:px-7">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="min-h-12 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-black text-[#1A1A1A] hover:bg-[#F1F3F5] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || mapResolving}
              className="min-h-12 rounded-xl bg-[#F62E18] px-3 text-sm font-black text-white hover:bg-[#C92716] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "SAVING…" : "SAVE ADDRESS & PROCEED"}
            </button>
          </div>
        ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
