"use client";

import { useEffect, useState } from "react";
import type { ChefApplication } from "@/lib/chef-application-contract";
import type {
  ChefKitchen,
  ChefKitchenInput,
  EditableKitchenStatus,
} from "@/lib/chef-kitchen-types";

type FormState = Record<
  keyof Omit<ChefKitchenInput, "latitude" | "longitude" | "status">,
  string
> & {
  latitude: string;
  longitude: string;
  status: EditableKitchenStatus;
};

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
    displayName: [application.firstName, application.lastName]
      .filter(Boolean)
      .join(" "),
    email: application.email ?? "",
    addressLine1: application.addressLine1 ?? "",
    addressLine2: application.addressLine2 ?? "",
    landmark: application.landmark ?? "",
    city: application.city ?? "",
    state: application.state ?? "",
    postalCode: application.postalCode ?? "",
    latitude:
      application.latitude === null ? "" : String(application.latitude),
    longitude:
      application.longitude === null ? "" : String(application.longitude),
  };
}

export function ChefKitchenForm() {
  const [kitchen, setKitchen] = useState<ChefKitchen | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [message, setMessage] = useState("Loading your kitchen profile…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/chef/kitchen", { cache: "no-store" }),
      fetch("/api/chef/application", { cache: "no-store" }),
    ])
      .then(async ([kitchenResponse, applicationResponse]) => {
        const kitchenBody = await kitchenResponse.json().catch(() => null);
        const applicationBody = applicationResponse.ok
          ? ((await applicationResponse
              .json()
              .catch(() => null)) as ChefApplication | null)
          : null;
        if (!active) return;
        if (!kitchenResponse.ok) {
          throw new Error(
            kitchenResponse.status === 403
              ? "An approved chef role is required. Sign out and sign in again after approval."
              : "Kitchen profile is temporarily unavailable.",
          );
        }
        const nextKitchen = kitchenBody as ChefKitchen | null;
        setKitchen(nextKitchen);
        setForm(
          nextKitchen
            ? fromKitchen(nextKitchen)
            : fromApplication(applicationBody),
        );
        setMessage(
          nextKitchen
            ? ""
            : "Approved application details have been prefilled. Add a kitchen name and review the location before saving.",
        );
      })
      .catch((error) => {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Kitchen profile is temporarily unavailable.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function setField(name: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("This browser cannot provide a location.");
      return;
    }
    setMessage("Requesting the kitchen location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(7),
          longitude: position.coords.longitude.toFixed(7),
        }));
        setMessage("Kitchen coordinates added. Review the address before saving.");
      },
      () => setMessage("Location permission was not granted."),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function save() {
    if (
      form.status === "ACTIVE" &&
      (!form.latitude.trim() || !form.longitude.trim())
    ) {
      setMessage(
        "Add valid kitchen coordinates before activating it. Active kitchens without coordinates cannot appear in discovery.",
      );
      return;
    }
    setBusy(true);
    setMessage("Saving kitchen profile…");
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
      const result = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof result?.message === "string"
            ? result.message
            : response.status === 400
              ? "Complete the required kitchen fields using valid values."
              : "Kitchen profile could not be saved.",
        );
      }
      setKitchen(result as unknown as ChefKitchen);
      setForm(fromKitchen(result as unknown as ChefKitchen));
      setMessage("Kitchen profile saved by Catalog Service.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Kitchen profile could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  const suspended = kitchen?.status === "SUSPENDED";
  const discoverable =
    form.status === "ACTIVE" &&
    Boolean(form.latitude.trim()) &&
    Boolean(form.longitude.trim());
  const fields: Array<[keyof FormState, string, boolean]> = [
    ["kitchenName", "Kitchen name", true],
    ["displayName", "Display name", false],
    ["description", "Description", false],
    ["phoneNumber", "Kitchen phone", false],
    ["email", "Kitchen email", false],
    ["addressLine1", "Address line 1", true],
    ["addressLine2", "Address line 2", false],
    ["landmark", "Landmark", false],
    ["areaName", "Area", false],
    ["city", "City", true],
    ["state", "State", true],
    ["postalCode", "Postal code", false],
    ["latitude", "Latitude", false],
    ["longitude", "Longitude", false],
  ];

  return (
    <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">
            Catalog kitchen
          </p>
          <h2 className="mt-2 text-3xl font-bold">
            {kitchen?.displayName ?? kitchen?.kitchenName ?? "Create kitchen"}
          </h2>
        </div>
        {kitchen && (
          <span className="rounded-full bg-white px-4 py-2 text-sm font-bold">
            {kitchen.status}
          </span>
        )}
      </div>
      {suspended && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          This kitchen is suspended. Profile changes remain blocked until the
          backend/admin state changes.
        </p>
      )}
      <div
        className={`mt-4 rounded-2xl p-4 text-sm ${discoverable ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"}`}
      >
        {discoverable
          ? "Kitchen profile is eligible for location discovery after it has at least one ACTIVE and available menu item."
          : "To appear to customers, set the kitchen ACTIVE and save valid latitude and longitude coordinates."}
      </div>
      <p role="status" className="mt-4 text-sm text-slate-600">
        {message}
      </p>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={suspended || busy}
          onClick={useCurrentLocation}
          className="rounded-full border border-[#6930CA] px-4 py-2 text-sm font-bold text-[#6930CA] disabled:opacity-50"
        >
          Use current location
        </button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {fields.map(([name, label, required]) => (
          <label key={name} className="text-sm font-semibold">
            {label}
            {required ? " *" : ""}
            {name === "description" ? (
              <textarea
                disabled={suspended || busy}
                value={form[name]}
                onChange={(event) => setField(name, event.target.value)}
                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-100"
              />
            ) : (
              <input
                disabled={suspended || busy}
                inputMode={
                  name === "latitude" || name === "longitude"
                    ? "decimal"
                    : undefined
                }
                value={form[name]}
                onChange={(event) => setField(name, event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-100"
              />
            )}
          </label>
        ))}
      </div>
      <label className="mt-4 block text-sm font-semibold">
        Kitchen status
        <select
          disabled={suspended || busy}
          value={form.status}
          onChange={(event) => setField("status", event.target.value)}
          className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 md:max-w-xs"
        >
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </label>
      <button
        type="button"
        disabled={suspended || busy}
        onClick={() => void save()}
        className="mt-6 rounded-full bg-[#6930CA] px-6 py-3 font-bold text-white disabled:opacity-50"
      >
        Save kitchen profile
      </button>
    </section>
  );
}
