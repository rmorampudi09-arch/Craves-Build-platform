"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { AddressLabel, CustomerAddress, CustomerAddressInput, LocationRecommendation } from "@/lib/address-contract";

const empty: CustomerAddressInput = {
  addressLabel: "HOME",
  recipientName: "",
  contactPhoneNumber: "",
  addressLine1: "",
  addressLine2: null,
  landmark: null,
  areaName: "",
  city: "",
  state: "",
  postalCode: "",
  latitude: 0,
  longitude: 0,
  isDefault: false
};

export function CustomerAddresses() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [form, setForm] = useState<CustomerAddressInput>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading saved addresses…");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/customer/addresses", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.message || "Addresses could not be loaded.");
    setAddresses(body);
    setMessage(body.length ? `${body.length} saved address${body.length === 1 ? "" : "es"}.` : "No saved addresses yet.");
  }, []);

  useEffect(() => { load().catch(error => setMessage(error instanceof Error ? error.message : "Addresses could not be loaded.")); }, [load]);

  function setField<K extends keyof CustomerAddressInput>(key: K, value: CustomerAddressInput[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  function useLocation() {
    if (!navigator.geolocation) return setMessage("Browser location is unavailable. Enter coordinates manually.");
    setMessage("Requesting location…");
    navigator.geolocation.getCurrentPosition(async position => {
      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      setForm(previous => ({ ...previous, latitude, longitude }));
      try {
        const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), matchRadiusMeters: "100" });
        const response = await fetch(`/api/customer/addresses/recommendation?${query}`, { cache: "no-store" });
        const body = await response.json() as LocationRecommendation & { message?: string };
        if (!response.ok) throw new Error(body.message || "Location recommendation failed.");
        setMessage(body.selectedSavedAddress ? `This location is near your saved ${body.selectedSavedAddress.addressLabel.toLowerCase()} address.` : "Location captured. Complete the postal address before saving.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Location captured. Complete the address.");
      }
    }, () => setMessage("Location permission was not granted."), { timeout: 10_000, maximumAge: 60_000 });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(editingId ? "Updating address…" : "Saving address…");
    try {
      const response = await fetch(editingId ? `/api/customer/addresses/${editingId}` : "/api/customer/addresses", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || "Address could not be saved.");
      setForm(empty);
      setEditingId(null);
      await load();
      setMessage("Address saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Address could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function edit(address: CustomerAddress) {
    setEditingId(address.id);
    setForm({
      addressLabel: address.addressLabel,
      recipientName: address.recipientName,
      contactPhoneNumber: address.contactPhoneNumber,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      landmark: address.landmark,
      areaName: address.areaName,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      latitude: address.latitude,
      longitude: address.longitude,
      isDefault: address.isDefault
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(addressId: string) {
    if (!window.confirm("Delete this saved address?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/customer/addresses/${addressId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message || "Address could not be deleted.");
      }
      await load();
      setMessage("Address deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Address could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <form onSubmit={submit} className="rounded-[30px] bg-[#FFF8EC] p-6 text-slate-950 shadow-2xl shadow-black/20 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">{editingId ? "Edit address" : "Add address"}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Label<select className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3" value={form.addressLabel} onChange={event => setField("addressLabel", event.target.value as AddressLabel)}>{["HOME", "WORK", "OTHER"].map(label => <option key={label}>{label}</option>)}</select></label>
          <label className="text-sm font-semibold">Recipient name<input required maxLength={160} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.recipientName} onChange={event => setField("recipientName", event.target.value)} /></label>
          <label className="text-sm font-semibold">Contact phone<input required inputMode="tel" maxLength={16} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.contactPhoneNumber} onChange={event => setField("contactPhoneNumber", event.target.value)} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Address line 1<input required maxLength={250} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.addressLine1} onChange={event => setField("addressLine1", event.target.value)} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Address line 2<input maxLength={250} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.addressLine2 ?? ""} onChange={event => setField("addressLine2", event.target.value || null)} /></label>
          <label className="text-sm font-semibold">Landmark<input maxLength={160} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.landmark ?? ""} onChange={event => setField("landmark", event.target.value || null)} /></label>
          <label className="text-sm font-semibold">Area<input required maxLength={120} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.areaName} onChange={event => setField("areaName", event.target.value)} /></label>
          <label className="text-sm font-semibold">City<input required maxLength={120} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.city} onChange={event => setField("city", event.target.value)} /></label>
          <label className="text-sm font-semibold">State<input required maxLength={120} className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.state} onChange={event => setField("state", event.target.value)} /></label>
          <label className="text-sm font-semibold">Postal code<input required maxLength={20} inputMode="numeric" className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.postalCode} onChange={event => setField("postalCode", event.target.value)} /></label>
          <label className="text-sm font-semibold">Latitude<input required inputMode="decimal" className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.latitude} onChange={event => setField("latitude", Number(event.target.value))} /></label>
          <label className="text-sm font-semibold">Longitude<input required inputMode="decimal" className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3" value={form.longitude} onChange={event => setField("longitude", Number(event.target.value))} /></label>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={form.isDefault} onChange={event => setField("isDefault", event.target.checked)} />Use as default address</label>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={useLocation} className="rounded-full border border-[#6930CA] px-5 py-3 text-sm font-bold text-[#6930CA]">Use current location</button>
          <button disabled={busy} className="rounded-full bg-[#6930CA] px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{editingId ? "Update address" : "Save address"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(empty); }} className="rounded-full px-5 py-3 text-sm font-bold text-slate-600">Cancel</button>}
        </div>
        <p role="status" className="mt-4 text-sm text-slate-600">{message}</p>
      </form>

      <section className="space-y-4">
        {addresses.map(address => (
          <article key={address.id} className="rounded-[28px] bg-white p-6 text-slate-950 shadow-xl shadow-black/15">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[#6930CA]">{address.addressLabel}{address.isDefault ? " · DEFAULT" : ""}</p><h2 className="mt-2 text-xl font-bold">{address.recipientName}</h2></div><span className="text-sm text-slate-500">{address.contactPhoneNumber}</span></div>
            <p className="mt-4 text-sm leading-6 text-slate-700">{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}{address.landmark ? `, ${address.landmark}` : ""}, {address.areaName}, {address.city}, {address.state} {address.postalCode}</p>
            <div className="mt-5 flex gap-3"><button type="button" onClick={() => edit(address)} className="rounded-full border border-[#6930CA] px-4 py-2 text-sm font-bold text-[#6930CA]">Edit</button><button type="button" onClick={() => void remove(address.id)} disabled={busy} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50">Delete</button></div>
          </article>
        ))}
      </section>
    </div>
  );
}
