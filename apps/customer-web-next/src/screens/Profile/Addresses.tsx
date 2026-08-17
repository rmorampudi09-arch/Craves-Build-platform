"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Crosshair,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  isDeliveryReadyAddress,
  parseAddressInput,
  type AddressLabel,
  type CustomerAddress,
  type CustomerAddressInput,
} from "@/lib/address-contract";
import { loadSession } from "@/services/auth/cravesAuth";
import { reverseGeocodeCurrentLocation } from "@/services/location/reverseGeocode";

type AddressDraft = Omit<CustomerAddressInput, "latitude" | "longitude"> & {
  latitude: string;
  longitude: string;
};

const blank: AddressDraft = {
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

function recipientLine(address: CustomerAddress): string {
  return [address.recipientName, address.contactPhoneNumber]
    .filter(Boolean)
    .join(" · ");
}

export default function AddressesPage() {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [draft, setDraft] = useState<AddressDraft>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("Loading saved addresses…");

  async function load() {
    const response = await fetch("/api/customer/addresses", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(body?.message || "Addresses could not be loaded.");
    setAddresses(body);
    const incomplete = body.filter(
      (address: CustomerAddress) => !isDeliveryReadyAddress(address),
    ).length;
    setMessage(
      incomplete > 0
        ? `${body.length} saved address${body.length === 1 ? "" : "es"}; ${incomplete} need${incomplete === 1 ? "s" : ""} completion before checkout.`
        : body.length
          ? `${body.length} saved address${body.length === 1 ? "" : "es"}.`
          : "No addresses saved yet.",
    );
  }

  useEffect(() => {
    void (async () => {
      if (!(await loadSession())) {
        navigate({ to: "/" });
        return;
      }
      await load();
    })().catch((error) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "Addresses could not be loaded.",
      ),
    );
  }, [navigate]);

  function update<K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function beginCreate() {
    setEditingId(null);
    setDraft(blank);
    setOpen(true);
    setMessage("Use current location and Craves will fill the address for you.");
  }

  function beginEdit(address: CustomerAddress) {
    setEditingId(address.id);
    setDraft(draftFrom(address));
    setOpen(true);
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setMessage("This browser does not support location access.");
      return;
    }
    setLocating(true);
    setMessage("Detecting your current delivery address…");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(position.coords.latitude.toFixed(7));
        const longitude = Number(position.coords.longitude.toFixed(7));
        try {
          const detected = await reverseGeocodeCurrentLocation(
            latitude,
            longitude,
          );
          setDraft((current) => ({
            ...current,
            addressLine1: detected.houseNumber || detected.formattedAddress,
            addressLine2: detected.street || current.addressLine2,
            areaName: detected.area || detected.city || current.areaName,
            districtName:
              detected.district || detected.city || current.districtName,
            city: detected.city || current.city,
            state: detected.state || current.state,
            postalCode: detected.postalCode || current.postalCode,
            latitude: String(latitude),
            longitude: String(longitude),
          }));
          setMessage(
            detected.preciseHouseNumber
              ? "Address detected and filled automatically. Confirm or correct the flat/house/building before saving."
              : "Location detected and available address fields were filled. Please confirm or correct the flat/house/building.",
          );
        } catch (error) {
          setDraft((current) => ({
            ...current,
            latitude: String(latitude),
            longitude: String(longitude),
          }));
          setMessage(
            error instanceof Error
              ? `${error.message} You can still complete the written address manually.`
              : "Location captured but the written address could not be identified.",
          );
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setMessage(
          "Location permission was not granted. You can enter the written address manually.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  async function save() {
    const input = parseAddressInput({
      ...draft,
      addressLine2: draft.addressLine2?.trim() || null,
      landmark: draft.landmark?.trim() || null,
      latitude: draft.latitude.trim(),
      longitude: draft.longitude.trim(),
    });
    if (!input) {
      setMessage(
        "Complete the recipient, phone and written address, then use current location so Craves can map the drop-off point.",
      );
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        editingId
          ? `/api/customer/addresses/${editingId}`
          : "/api/customer/addresses",
        {
          method: editingId ? "PUT" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || "Address could not be saved.");
      setOpen(false);
      setEditingId(null);
      setDraft(blank);
      await load();
      setMessage("Address saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Address could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(address: CustomerAddress) {
    if (!window.confirm(`Delete ${address.addressLabel.toLowerCase()} address?`))
      return;
    setBusy(true);
    try {
      const response = await fetch(`/api/customer/addresses/${address.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Address could not be deleted.");
      }
      await load();
      setMessage("Address deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Address could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-5 md:px-6 md:py-6">
          <Link
            to="/profile"
            aria-label="Back to profile"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white transition-colors hover:border-[#F62E18] hover:bg-[#F1F3F5]"
          >
            <ArrowLeft className="h-6 w-6 text-[#1A1A1A]" strokeWidth={2.25} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#F62E18] md:text-base">
              Your places
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-[#1A1A1A] md:text-[2rem] md:leading-tight">
              Delivery addresses
            </h1>
          </div>
          <button
            type="button"
            onClick={beginCreate}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-white px-5 py-3 text-sm font-semibold !text-[#1A1A1A] shadow-none hover:!border-[#F62E18] hover:!bg-[#F62E18] hover:!text-white md:px-6 md:text-base"
          >
            <Plus className="h-5 w-5" strokeWidth={2.25} />
            Add
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-8 md:px-6 md:pt-10">
        <div className="space-y-5">
          {addresses.map((address) => {
            const ready = isDeliveryReadyAddress(address);
            return (
              <article
                key={address.id}
                className="rounded-[24px] border border-[#E5E7EB] bg-white px-5 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.07)] md:px-8 md:py-7"
              >
                <div className="flex items-start gap-4 md:gap-5">
                  <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F1F3F5] md:h-16 md:w-16">
                    <MapPin
                      className="h-7 w-7 fill-[#F62E18] text-[#F62E18] md:h-8 md:w-8"
                      strokeWidth={2.15}
                      aria-hidden="true"
                    />
                    <span className="pointer-events-none absolute left-1/2 top-[43%] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white md:h-2 md:w-2" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-display text-xl font-bold text-[#1A1A1A] md:text-2xl">
                        {address.addressLabel}
                      </h2>
                      {address.isDefault && (
                        <span className="inline-flex items-center rounded-full bg-[#F62E18]/10 px-3 py-1 text-[11px] font-bold text-[#F62E18] md:text-xs">
                          <Check className="mr-1.5 h-3.5 w-3.5" strokeWidth={2.5} />
                          DEFAULT
                        </span>
                      )}
                      {!ready && (
                        <span className="rounded-full bg-[#F1F3F5] px-3 py-1 text-[11px] font-bold text-[#F62E18] md:text-xs">
                          UPDATE REQUIRED
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#1A1A1A] md:text-base">
                      {recipientLine(address)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#6B6B6B] md:text-base md:leading-7">
                      {addressLine(address)}
                    </p>
                    {!ready && (
                      <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#F1F3F5] p-3 text-xs leading-5 text-[#6B6B6B]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F62E18]" />
                        This older saved address needs missing delivery details before checkout.
                      </p>
                    )}
                  </div>

                  <div className="ml-1 flex shrink-0 gap-1 md:gap-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(address)}
                      className="rounded-full !bg-transparent p-2.5 !text-[#1A1A1A] hover:!bg-[#F1F3F5] hover:!text-[#F62E18]"
                      aria-label="Edit address"
                    >
                      <Pencil className="h-5 w-5 md:h-5.5 md:w-5.5" strokeWidth={2.25} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(address)}
                      className="rounded-full !bg-transparent p-2.5 !text-[#1A1A1A] hover:!bg-[#F1F3F5] hover:!text-[#F62E18] disabled:opacity-50"
                      aria-label="Delete address"
                    >
                      <Trash2 className="h-5 w-5 md:h-5.5 md:w-5.5" strokeWidth={2.25} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <p role="status" className="mt-7 px-1 text-sm text-[#6B6B6B] md:text-base">
          {message}
        </p>
      </main>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 md:rounded-3xl md:border md:border-[#E5E7EB] md:shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[#1A1A1A]">
                {editingId ? "Edit address" : "Add address"}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full !bg-transparent p-2 !text-[#1A1A1A] hover:!bg-[#F1F3F5]"
                aria-label="Close address form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={captureLocation}
              disabled={locating || busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl !border !border-[#F62E18]/30 !bg-[#F62E18]/5 p-3 text-sm font-bold !text-[#F62E18] hover:!border-[#F62E18] hover:!bg-[#F62E18] hover:!text-white disabled:opacity-50"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              {locating ? "Detecting your address…" : "Use my current location"}
            </button>
            <p className="mt-2 text-center text-[11px] leading-4 text-[#6B6B6B]">
              Craves fills the available house/building, street, area, district, city, state and pincode automatically. You can edit every written field.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-[#1A1A1A]">
                Label
                <select
                  value={draft.addressLabel}
                  onChange={(event) =>
                    update("addressLabel", event.target.value as AddressLabel)
                  }
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                >
                  <option value="HOME">Home</option>
                  <option value="WORK">Work</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A]">
                Recipient
                <input
                  value={draft.recipientName}
                  onChange={(event) => update("recipientName", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A]">
                Phone
                <input
                  value={draft.contactPhoneNumber}
                  onChange={(event) =>
                    update("contactPhoneNumber", event.target.value)
                  }
                  placeholder="+919876543210"
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A]">
                Pincode
                <input
                  value={draft.postalCode}
                  onChange={(event) => update("postalCode", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A] sm:col-span-2">
                Flat / House / Building
                <input
                  value={draft.addressLine1}
                  onChange={(event) => update("addressLine1", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A] sm:col-span-2">
                Street / Road
                <input
                  value={draft.addressLine2 ?? ""}
                  onChange={(event) =>
                    update("addressLine2", event.target.value || null)
                  }
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A]">
                Area
                <input
                  value={draft.areaName}
                  onChange={(event) => update("areaName", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A]">
                District
                <input
                  value={draft.districtName}
                  onChange={(event) => update("districtName", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A]">
                City
                <input
                  value={draft.city}
                  onChange={(event) => update("city", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A]">
                State
                <input
                  value={draft.state}
                  onChange={(event) => update("state", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-[#1A1A1A] sm:col-span-2">
                Landmark (optional)
                <input
                  value={draft.landmark ?? ""}
                  onChange={(event) =>
                    update("landmark", event.target.value || null)
                  }
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-[#1A1A1A] sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.isDefault}
                  onChange={(event) => update("isDefault", event.target.checked)}
                />
                Make this my default address
              </label>
            </div>

            <p className="mt-3 text-xs leading-5 text-[#6B6B6B]">
              The exact map point is stored securely in the background for discovery and delivery. Latitude and longitude are intentionally hidden.
            </p>
            <button
              type="button"
              disabled={busy || locating}
              onClick={() => void save()}
              className="mt-6 w-full justify-center rounded-xl !bg-[#F62E18] px-5 py-3 text-sm font-bold !text-white hover:!bg-[#C92716] disabled:opacity-50"
            >
              {busy ? "Saving…" : editingId ? "Update address" : "Save address"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
