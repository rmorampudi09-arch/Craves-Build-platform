"use client";

import { useEffect, useState } from "react";
import type { ChefKitchen, ChefKitchenInput, EditableKitchenStatus } from "@/lib/chef-kitchen-types";

type FormState = Record<keyof Omit<ChefKitchenInput, "latitude" | "longitude" | "status">, string> & { latitude: string; longitude: string; status: EditableKitchenStatus };
const EMPTY: FormState = { kitchenName: "", displayName: "", description: "", phoneNumber: "", email: "", addressLine1: "", addressLine2: "", landmark: "", areaName: "", city: "", state: "", postalCode: "", latitude: "", longitude: "", status: "DRAFT" };

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
    status: kitchen.status === "SUSPENDED" ? "INACTIVE" : kitchen.status
  };
}

export function ChefKitchenForm() {
  const [kitchen, setKitchen] = useState<ChefKitchen | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [message, setMessage] = useState("Loading your kitchen profile…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/chef/kitchen", { cache: "no-store" })
      .then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok) throw new Error(response.status === 403 ? "An approved chef role is required." : "Kitchen profile is temporarily unavailable.");
        setKitchen(body as ChefKitchen | null);
        setForm(fromKitchen(body as ChefKitchen | null));
        setMessage(body ? "" : "Create the kitchen profile owned by your approved chef identity.");
      })
      .catch(error => active && setMessage(error instanceof Error ? error.message : "Kitchen profile is temporarily unavailable."));
    return () => { active = false; };
  }, []);

  function setField(name: keyof FormState, value: string) { setForm(current => ({ ...current, [name]: value })); }

  async function save() {
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
        longitude: form.longitude === "" ? null : Number(form.longitude)
      };
      const response = await fetch("/api/chef/kitchen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 400 ? "Complete the required kitchen fields using valid values." : "Kitchen profile could not be saved.");
      setKitchen(result as ChefKitchen);
      setForm(fromKitchen(result as ChefKitchen));
      setMessage("Kitchen profile saved by Catalog Service.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kitchen profile could not be saved.");
    } finally { setBusy(false); }
  }

  const suspended = kitchen?.status === "SUSPENDED";
  const fields: Array<[keyof FormState, string, boolean]> = [
    ["kitchenName", "Kitchen name", true], ["displayName", "Display name", false], ["description", "Description", false],
    ["phoneNumber", "Kitchen phone", false], ["email", "Kitchen email", false], ["addressLine1", "Address line 1", true],
    ["addressLine2", "Address line 2", false], ["landmark", "Landmark", false], ["areaName", "Area", false],
    ["city", "City", true], ["state", "State", true], ["postalCode", "Postal code", false], ["latitude", "Latitude", false], ["longitude", "Longitude", false]
  ];

  return <section className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">Catalog kitchen</p><h2 className="mt-2 text-3xl font-bold">{kitchen?.displayName ?? kitchen?.kitchenName ?? "Create kitchen"}</h2></div>{kitchen && <span className="rounded-full bg-white px-4 py-2 text-sm font-bold">{kitchen.status}</span>}</div>
    {suspended && <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">This kitchen is suspended. Profile changes remain blocked until the backend/admin state changes.</p>}
    <p role="status" className="mt-4 text-sm text-slate-600">{message}</p>
    <div className="mt-6 grid gap-4 md:grid-cols-2">{fields.map(([name,label,required]) => <label key={name} className="text-sm font-semibold">{label}{required ? " *" : ""}{name === "description" ? <textarea disabled={suspended || busy} value={form[name]} onChange={event => setField(name, event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-100" /> : <input disabled={suspended || busy} value={form[name]} onChange={event => setField(name, event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-100" />}</label>)}</div>
    <label className="mt-4 block text-sm font-semibold">Kitchen status<select disabled={suspended || busy} value={form.status} onChange={event => setField("status", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 md:max-w-xs"><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
    <button type="button" disabled={suspended || busy} onClick={() => void save()} className="mt-6 rounded-full bg-[#6930CA] px-6 py-3 font-bold text-white disabled:opacity-50">Save kitchen profile</button>
  </section>;
}
