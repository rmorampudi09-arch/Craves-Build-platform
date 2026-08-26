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
import { clearDishDiscoveryCache } from "@/services/api/dishes";
import { clearKitchenDiscoveryCache } from "@/services/api/kitchens";
import {
  invalidateSelectedAddress,
  loadSession,
} from "@/services/auth/cravesAuth";
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

function invalidateHomeDeliveryContext(): void {
  invalidateSelectedAddress();
  clearDishDiscoveryCache();
  clearKitchenDiscoveryCache();
}

const addressLabels: Array<{ value: AddressLabel; label: string }> = [
  { value: "HOME", label: "Home" },
  { value: "WORK", label: "Work" },
  { value: "OTHER", label: "Other" },
];

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
    setMessage("Add the delivery details below. You can use current location to fill the address faster.");
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
      invalidateHomeDeliveryContext();
      setOpen(false);
      setEditingId(null);
      setDraft(blank);
      await load();
      setMessage(
        body?.isDefault
          ? "Address saved and set as your default delivery address."
          : "Address saved. Select it as default from your saved addresses when you want Home to use it.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Address could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectDefault(address: CustomerAddress) {
    if (address.isDefault || busy) return;

    const input = parseAddressInput({
      ...draftFrom(address),
      isDefault: true,
    });
    if (!input) {
      beginEdit(address);
      setMessage("Complete this address before selecting it as your default delivery address.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/customer/addresses/${address.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || "Default address could not be updated.");
      invalidateHomeDeliveryContext();
      await load();
      setMessage(`${address.addressLabel} is now your default delivery address.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Default address could not be updated.",
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
      invalidateHomeDeliveryContext();
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

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm text-[#1A1A1A] outline-none transition-colors placeholder:text-[#9A9A9A] focus:border-[#F62E18]";

  return (
    <div className="min-h-screen bg-white pb-12 text-[#1A1A1A]">
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5 md:px-6 md:py-6">
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
            className="inline-flex min-h-12 items-center gap-2 rounded-xl !border !border-[#E5E7EB] !bg-white px-4 py-3 text-sm font-bold !text-[#1A1A1A] shadow-none hover:!border-[#F62E18] hover:!bg-[#F62E18] hover:!text-white md:px-5"
          >
            <Plus className="h-5 w-5" strokeWidth={2.25} />
            <span className="hidden sm:inline">Add New Address</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-7 md:px-6 md:pt-9">
        <div className="mb-6 flex items-start gap-3 rounded-2xl bg-[#F1F3F5] px-4 py-4 md:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#F62E18]">
            <MapPin className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black text-[#1A1A1A]">Choose your default delivery address here</p>
            <p className="mt-1 text-xs font-medium leading-5 text-[#6B6B6B] md:text-sm">
              Craves Home discovery and delivery availability use the address you select as default.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {addresses.map((address) => {
            const ready = isDeliveryReadyAddress(address);
            return (
              <article
                key={address.id}
                className={`rounded-[24px] border bg-white px-5 py-5 shadow-[0_4px_18px_rgba(26,26,26,0.06)] transition-shadow md:px-6 md:py-6 ${
                  address.isDefault
                    ? "border-[#F62E18]/35 shadow-[0_8px_28px_rgba(246,46,24,0.08)]"
                    : "border-[#E5E7EB] hover:shadow-[0_10px_30px_rgba(26,26,26,0.09)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1F3F5] text-[#F62E18] md:h-14 md:w-14">
                    <MapPin className="h-6 w-6 fill-[#F62E18] text-[#F62E18]" strokeWidth={2.1} aria-hidden="true" />
                    <span className="pointer-events-none absolute left-1/2 top-[43%] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-black text-[#1A1A1A] md:text-xl">
                        {address.addressLabel}
                      </h2>
                      {address.isDefault ? (
                        <span className="inline-flex items-center rounded-full bg-[#F62E18]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#F62E18] md:text-[11px]">
                          <Check className="mr-1 h-3.5 w-3.5" strokeWidth={2.7} />
                          Default
                        </span>
                      ) : null}
                      {!ready ? (
                        <span className="rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] text-[#F62E18] md:text-[11px]">
                          UPDATE REQUIRED
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-bold text-[#1A1A1A]">
                      {recipientLine(address)}
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-[#6B6B6B]">
                      {addressLine(address)}
                    </p>
                    {!ready ? (
                      <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#F1F3F5] p-3 text-xs leading-5 text-[#6B6B6B]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F62E18]" />
                        This older saved address needs missing delivery details before checkout.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#F1F3F5] pt-4">
                  <button
                    type="button"
                    disabled={busy || address.isDefault || !ready}
                    onClick={() => void selectDefault(address)}
                    className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-colors sm:flex-none sm:text-sm ${
                      address.isDefault
                        ? "!bg-[#F1F3F5] !text-[#6B6B6B]"
                        : "!border !border-[#F62E18]/30 !bg-white !text-[#F62E18] hover:!border-[#F62E18] hover:!bg-[#F62E18] hover:!text-white"
                    } disabled:cursor-not-allowed disabled:opacity-55`}
                  >
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    {address.isDefault
                      ? "Default address"
                      : ready
                        ? "Select as default"
                        : "Complete to select"}
                  </button>
                  <button
                    type="button"
                    onClick={() => beginEdit(address)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl !bg-[#F1F3F5] px-3.5 py-2 text-xs font-black !text-[#1A1A1A] hover:!text-[#F62E18] sm:text-sm"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={2.25} />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(address)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl !bg-transparent px-3 py-2 text-xs font-black !text-[#6B6B6B] hover:!bg-[#F1F3F5] hover:!text-[#F62E18] disabled:opacity-50 sm:text-sm"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {addresses.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#D7DADF] bg-white px-6 py-10 text-center">
            <MapPin className="mx-auto h-8 w-8 text-[#F62E18]" />
            <h2 className="mt-3 font-display text-xl font-black">No saved addresses yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B6B6B]">
              Add your first delivery address, then select it as default for nearby dishes and kitchens.
            </p>
            <button
              type="button"
              onClick={beginCreate}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl !bg-[#F62E18] px-5 py-2.5 text-sm font-black !text-white"
            >
              <Plus className="h-4.5 w-4.5" />
              Add New Address
            </button>
          </div>
        ) : null}

        <p role="status" className="mt-6 px-1 text-sm text-[#6B6B6B]">
          {message}
        </p>
      </main>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 backdrop-blur-[2px] md:items-center md:p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="address-form-title"
            className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-[0_30px_90px_rgba(26,26,26,0.25)] md:max-h-[90vh] md:rounded-[2rem] md:border md:border-[#E5E7EB]"
          >
            <div className="flex items-start justify-between border-b border-[#F1F3F5] px-5 py-5 md:px-7 md:py-6">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#F62E18]">
                  Delivery address
                </p>
                <h2 id="address-form-title" className="mt-1 font-display text-2xl font-black tracking-[-0.03em] text-[#1A1A1A]">
                  {editingId ? "Edit address" : "Add new address"}
                </h2>
                <p className="mt-1 text-xs font-medium text-[#6B6B6B] md:text-sm">
                  Keep the written address clear. You can select the default address after saving.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#1A1A1A] hover:!text-[#F62E18] disabled:opacity-50"
                aria-label="Close address form"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5 md:px-7 md:py-6">
              <button
                type="button"
                onClick={captureLocation}
                disabled={locating || busy}
                className="flex w-full items-center gap-3 rounded-2xl !border !border-[#E5E7EB] !bg-[#F1F3F5] p-3.5 text-left !text-[#1A1A1A] hover:!border-[#F62E18]/30 hover:!bg-white disabled:opacity-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#F62E18]">
                  {locating ? (
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <Crosshair className="h-4.5 w-4.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black">
                    {locating ? "Detecting your address…" : "Use my current location"}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium leading-5 text-[#6B6B6B]">
                    Fill the available address fields automatically, then review them before saving.
                  </span>
                </span>
              </button>

              <div className="mt-6">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-[#6B6B6B]">Address label</p>
                <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl bg-[#F1F3F5] p-1.5">
                  {addressLabels.map((option) => {
                    const selected = draft.addressLabel === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => update("addressLabel", option.value)}
                        className={`min-h-10 rounded-xl px-3 py-2 text-sm font-black transition-all ${
                          selected
                            ? "!bg-white !text-[#F62E18] shadow-[0_3px_10px_rgba(26,26,26,0.08)]"
                            : "!bg-transparent !text-[#6B6B6B] hover:!text-[#1A1A1A]"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-7">
                <div className="mb-3">
                  <h3 className="text-sm font-black text-[#1A1A1A]">Contact details</h3>
                  <p className="mt-0.5 text-xs text-[#6B6B6B]">Who should receive this delivery?</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-[#1A1A1A]">
                    Recipient name
                    <input
                      value={draft.recipientName}
                      onChange={(event) => update("recipientName", event.target.value)}
                      placeholder="Full name"
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#1A1A1A]">
                    Phone number
                    <input
                      value={draft.contactPhoneNumber}
                      onChange={(event) => update("contactPhoneNumber", event.target.value)}
                      placeholder="+919876543210"
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-7">
                <div className="mb-3">
                  <h3 className="text-sm font-black text-[#1A1A1A]">Address details</h3>
                  <p className="mt-0.5 text-xs text-[#6B6B6B]">Make it easy for the chef and delivery partner to find you.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-[#1A1A1A] sm:col-span-2">
                    Flat / House / Building
                    <input
                      value={draft.addressLine1}
                      onChange={(event) => update("addressLine1", event.target.value)}
                      placeholder="House number, apartment, building"
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#1A1A1A] sm:col-span-2">
                    Street / Road
                    <input
                      value={draft.addressLine2 ?? ""}
                      onChange={(event) => update("addressLine2", event.target.value || null)}
                      placeholder="Street or road"
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#1A1A1A]">
                    Area
                    <input
                      value={draft.areaName}
                      onChange={(event) => update("areaName", event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#1A1A1A]">
                    District
                    <input
                      value={draft.districtName}
                      onChange={(event) => update("districtName", event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#1A1A1A]">
                    City
                    <input
                      value={draft.city}
                      onChange={(event) => update("city", event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#1A1A1A]">
                    State
                    <input
                      value={draft.state}
                      onChange={(event) => update("state", event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#1A1A1A]">
                    Pincode
                    <input
                      value={draft.postalCode}
                      onChange={(event) => update("postalCode", event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-bold text-[#1A1A1A]">
                    Landmark <span className="font-medium text-[#9A9A9A]">(optional)</span>
                    <input
                      value={draft.landmark ?? ""}
                      onChange={(event) => update("landmark", event.target.value || null)}
                      className={fieldClass}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-[#F1F3F5] px-4 py-3 text-xs font-medium leading-5 text-[#6B6B6B]">
                The exact map point is stored securely in the background for discovery and delivery. Latitude and longitude stay hidden.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-[#F1F3F5] bg-white px-5 py-4 md:px-7">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy || locating}
                className="min-h-12 rounded-xl !border !border-[#E5E7EB] !bg-white px-4 text-sm font-black !text-[#1A1A1A] hover:!bg-[#F1F3F5] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || locating}
                onClick={() => void save()}
                className="min-h-12 rounded-xl !bg-[#F62E18] px-4 text-sm font-black !text-white hover:!bg-[#C92716] disabled:opacity-50"
              >
                {busy ? "Saving…" : editingId ? "Update address" : "Save address"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
