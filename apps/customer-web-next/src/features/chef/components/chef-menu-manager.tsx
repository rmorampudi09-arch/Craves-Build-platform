"use client";

import { ChefError, chefApiError, chefErrorText } from "@/features/chef/lib/chef-errors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ImagePlus, Plus, Store, UtensilsCrossed } from "lucide-react";
import { ChefEmpty, ChefPageHead, ChefSection, ChefSkeleton } from "@/features/chef/components/chef-ui";
import { FaPepperHot } from "react-icons/fa";
import { Button } from "@/shared/ui/buttons/button";
import { Input } from "@/shared/ui/forms/input";
import { Switch } from "@/shared/ui/forms/switch";
// In Chef Mode "on" is green, like the Kitchen open switch: red reads as stop to most chefs.
const GO_SWITCH = "data-[state=checked]:border-[#17803D]! data-[state=checked]:bg-[#17803D]!";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import { chefMenuFailure } from "@/features/chef/lib/chef-menu-errors";
import {
  parseChefMenuItem,
  parseChefMenuItems,
  type ChefMenuItem,
  type ChefMenuItemInput,
  type FoodType,
  type MenuItemStatus,
  type SpiceLevel,
} from "@/features/chef/lib/chef-menu-contract";
import { shrinkDishPhoto } from "@/features/chef/lib/shrink-photo";

type FormState = {
  id: string | null;
  itemName: string;
  description: string;
  category: string;
  foodType: FoodType | "";
  price: string;
  currency: string;
  servesCount: string;
  preparationTimeMinutes: string;
  spiceLevel: SpiceLevel | "";
  unitPackageWeightGrams: string;
  thermoboxRequired: boolean;
  available: boolean;
  status: MenuItemStatus;
};
type Field = keyof FormState | "photo";
const EMPTY: FormState = {
  id: null,
  itemName: "",
  description: "",
  category: "",
  foodType: "",
  price: "",
  currency: "INR",
  servesCount: "",
  preparationTimeMinutes: "",
  spiceLevel: "",
  unitPackageWeightGrams: "",
  thermoboxRequired: false,
  available: false,
  status: "DRAFT",
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 5;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FOOD_TYPES = [
  { value: "VEG", label: "Veg", color: "bg-[#2E7D32]" },
  { value: "NON_VEG", label: "Non-veg", color: "bg-[#7B3F00]" },
  { value: "EGG", label: "Egg", color: "bg-[#D99A00]" },
] as const;
const SECTION = "chef-section p-4 md:p-5";
const CONTROL =
  "mt-2 min-h-12 w-full aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive";

function toForm(item: ChefMenuItem): FormState {
  return {
    ...item,
    price: String(item.price),
    description: item.description ?? "",
    servesCount: item.servesCount === null ? "" : String(item.servesCount),
    preparationTimeMinutes:
      item.preparationTimeMinutes === null ? "" : String(item.preparationTimeMinutes),
    spiceLevel: item.spiceLevel ?? "",
    unitPackageWeightGrams: String(item.unitPackageWeightGrams),
  };
}
/** Saved photos, cover first, in the order customers see them. */
function savedImages(item?: ChefMenuItem) {
  return [...(item?.images ?? [])].sort((a, b) => Number(b.primary) - Number(a.primary) || a.sortOrder - b.sortOrder);
}
function primaryImage(item?: ChefMenuItem) {
  return (
    item?.images.find((image) => image.primary)?.publicUrl ?? item?.images[0]?.publicUrl ?? null
  );
}
function requiresKitchen(response: Response, body: unknown): boolean {
  return response.status === 400 && !!body && typeof body === "object" &&
    "code" in body && body.code === "KITCHEN_PROFILE_REQUIRED";
}

function apiError(response: Response, body: unknown, fallback: string) {
  return chefApiError(response, body, fallback);
}
function FoodIndicator({ type }: { type: FoodType }) {
  const food = FOOD_TYPES.find((option) => option.value === type)!;
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className="flex size-4 items-center justify-center rounded-sm border border-current"
      >
        <span className={`size-2 rounded-full ${food.color}`} />
      </span>
      {food.label}
    </span>
  );
}

export function ChefMenuManager() {
  const [items, setItems] = useState<ChefMenuItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [kitchenRequired, setKitchenRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [uncertainSave, setUncertainSave] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const previews = useMemo(() => imageFiles.map((file) => URL.createObjectURL(file)), [imageFiles]);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async (initial = false): Promise<boolean> => {
    if (initial) setLoading(true);
    try {
      const kitchenResponse = await fetch("/api/chef/kitchen", { cache: "no-store" });
      const kitchenBody: unknown = await kitchenResponse.json().catch(() => undefined);
      if (!kitchenResponse.ok)
        throw apiError(kitchenResponse, kitchenBody, "Your kitchen could not be checked. Please retry.");
      if (kitchenBody === null) {
        setItems([]);
        setKitchenRequired(true);
        setLoadError("");
        return true;
      }
      if (!parseChefKitchen(kitchenBody))
        throw new ChefError("Your kitchen could not be verified. Please retry.", "INVALID_KITCHEN_RESPONSE", 0);
      const response = await fetch("/api/chef/menu", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (requiresKitchen(response, body)) {
        setItems([]);
        setKitchenRequired(true);
        setLoadError("");
        return true;
      }
      if (!response.ok)
        throw apiError(response, body, "Your menu could not be loaded. Please retry.");
      const next = parseChefMenuItems(body);
      if (!next)
        throw new ChefError("The menu response was incomplete. Please retry.", "INVALID_MENU_RESPONSE", 0);
      setItems(next);
      setKitchenRequired(false);
      setLoadError("");
      return true;
    } catch (error) {
      setLoadError(chefErrorText(error, "Could not connect to your menu. Please retry."));
      return false;
    } finally {
      if (initial) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(true);
  }, [load]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  function start(item?: ChefMenuItem) {
    setForm(item ? toForm(item) : EMPTY);
    setImageFiles([]);
    setErrors({});
    setMessage("");
    setNotice("");
    setUncertainSave(false);
    setEditing(true);
  }
  function focusField(field: Field) {
    requestAnimationFrame(() => {
      const input = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
      input?.scrollIntoView?.({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
      input?.focus({ preventScroll: true });
    });
  }
  function fieldProps(field: Field) {
    return {
      id: `dish-${field}`,
      "data-field": field,
      "aria-invalid": !!errors[field],
      "aria-describedby": errors[field] ? `dish-${field}-error` : undefined,
    };
  }
  function errorText(field: Field) {
    return errors[field] ? (
      <p id={`dish-${field}-error`} className="mt-2 text-sm text-destructive">
        {errors[field]}
      </p>
    ) : null;
  }
  function validate() {
    const next: Partial<Record<Field, string>> = {};
    if (!form.itemName.trim()) next.itemName = "Dish name is required.";
    if (!form.category.trim()) next.category = "Choose or enter a category.";
    if (!form.foodType) next.foodType = "Choose Veg, Non-veg or Egg.";
    if (
      !/^\d+(\.\d{1,2})?$/.test(form.price.trim()) ||
      Number(form.price) < 0.01 ||
      Number(form.price) > 10000000
    )
      next.price = "Enter a price greater than zero, with up to two decimal places.";
    for (const [field, label, required] of [
      ["preparationTimeMinutes", "Preparation time", false],
      ["servesCount", "Serving size", false],
      ["unitPackageWeightGrams", "Packed weight", true],
    ] as const) {
      const value = form[field].trim();
      if (
        (required || value) &&
        (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000)
      )
        next[field] = `${label} must be a whole number from 1 to 100,000.`;
    }
    // A rejected photo is never queued, so its message stays visible without blocking the save.
    setErrors(errors.photo ? { ...next, photo: errors.photo } : next);
    const first = Object.keys(next)[0] as Field | undefined;
    if (first) {
      focusField(first);
      return false;
    }
    return true;
  }
  function upsert(item: ChefMenuItem) {
    setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
  }
  async function save() {
    if (busyRef.current || uncertainSave || !validate()) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    const creating = !form.id;
    let saved: ChefMenuItem | null = null;
    let confirmedRejection = false;
    const payload: ChefMenuItemInput = {
      itemName: form.itemName.trim(),
      description: form.description.trim() || null,
      category: form.category.trim(),
      foodType: form.foodType as FoodType,
      price: Number(form.price),
      currency: form.currency,
      servesCount: form.servesCount ? Number(form.servesCount) : null,
      preparationTimeMinutes: form.preparationTimeMinutes
        ? Number(form.preparationTimeMinutes)
        : null,
      spiceLevel: form.spiceLevel || null,
      unitPackageWeightGrams: Number(form.unitPackageWeightGrams),
      thermoboxRequired: form.thermoboxRequired,
      available: form.available,
      status: form.status,
    };
    try {
      const response = await fetch(form.id ? `/api/chef/menu/${form.id}` : "/api/chef/menu", {
        method: creating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        // Catalog checks selling eligibility before any menu write. Other 5xx
        // responses and interrupted requests still require a reload to avoid duplicates.
        confirmedRejection = (response.status >= 400 && response.status < 500) ||
          chefMenuFailure(response.status, body)?.code === "CATALOG_ELIGIBILITY_UNAVAILABLE";
        if (requiresKitchen(response, body)) {
          setItems([]);
          setKitchenRequired(true);
          setEditing(false);
        }
        throw apiError(response, body, "The service did not confirm the save. Reload your menu before trying again.");
      }
      saved = parseChefMenuItem(body);
      if (!saved)
        throw new ChefError("The service returned an incomplete save response. Reload your menu to check the result.", "INVALID_MENU_RESPONSE", 0);
      upsert(saved);
      setForm(toForm(saved));
      // Upload one at a time; each confirmed photo leaves the queue so a retry never duplicates it.
      const pending = [...imageFiles];
      for (const file of pending) {
        const data = new FormData();
        // Customers download photos at upload size: send a 1600 px copy, not the phone original.
        data.set("file", await shrinkDishPhoto(file));
        data.set("primary", "false");
        const upload = await fetch(`/api/chef/menu/${saved.id}/images`, {
          method: "POST",
          body: data,
        });
        const imageBody: unknown = await upload.json().catch(() => null);
        if (!upload.ok)
          throw apiError(upload, imageBody, "The photo could not be uploaded. Please retry.");
        if (
          !imageBody ||
          typeof imageBody !== "object" ||
          !("uploaded" in imageBody) ||
          imageBody.uploaded !== true
        )
          throw new ChefError("The photo upload was not confirmed. Please reload your menu to check it.", "INVALID_MENU_IMAGE_RESPONSE", 0);
        setImageFiles((current) => current.filter((entry) => entry !== file));
      }
      setEditing(false);
      setNotice(creating ? "Dish added successfully" : "Dish updated successfully");
      await load();
    } catch (error) {
      const detail = chefErrorText(error, "Connection interrupted. Please reload your menu to check the result.");
      if (saved) {
        setMessage(`Dish details saved, but a photo was not confirmed. Photos still listed as New were not uploaded. ${detail}`);
        // Show photos that did upload before the failure.
        await load();
      }
      else {
        setMessage(detail);
        if (!confirmedRejection) setUncertainSave(true);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function setAvailability(item: ChefMenuItem, available: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      const response = await fetch(`/api/chef/menu/${item.id}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available, reason: null }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (requiresKitchen(response, body)) {
          setItems([]);
          setKitchenRequired(true);
        }
        throw apiError(response, body, "Availability was not confirmed. Reload the menu to check it.");
      }
      const updated = parseChefMenuItem(body);
      if (!updated)
        throw new ChefError("Availability returned an incomplete response. Reload the menu to check it.", "INVALID_MENU_RESPONSE", 0);
      upsert(updated);
      setNotice(updated.available ? "Dish is now available" : "Dish is now unavailable");
    } catch (error) {
      setMessage(chefErrorText(error, "Availability could not be confirmed. Reload the menu to check it."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  /** Saved photos change right away (not on Save Dish): remove one, or make it the cover. */
  async function changeSavedPhoto(imageId: string, action: "remove" | "cover") {
    if (busyRef.current || !form.id) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      const response = await fetch(`/api/chef/menu/${form.id}/images/${imageId}`, {
        method: action === "remove" ? "DELETE" : "PUT",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw apiError(response, body, "The photo change was not confirmed. Reload the menu to check it.");
      const updated = parseChefMenuItem(body);
      if (!updated) throw new ChefError("The photo change returned an incomplete response. Reload the menu to check it.", "INVALID_MENU_RESPONSE", 0);
      upsert(updated);
      setNotice(action === "remove" ? "Photo removed" : "Cover photo updated");
    } catch (error) {
      setMessage(chefErrorText(error, "The photo change could not be confirmed. Reload the menu to check it."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const existingPhotos = savedImages(items.find((item) => item.id === form.id));
  const photoSlots = MAX_PHOTOS - existingPhotos.length - imageFiles.length;
  const feedback = (
    <>
      {notice ? (
        <p role="status" className="chef-notice">
          {notice}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="chef-notice is-danger !text-[#C4200F]">
          {message}
        </p>
      ) : null}
    </>
  );

  if (kitchenRequired && !loading && !loadError)
    return <div>
      <ChefPageHead title="Menu" />
      <ChefSection>
        <ChefEmpty
          icon={Store}
          title="Set up your kitchen first"
          text="Save your kitchen name and pickup address, then add your dishes."
          action={<div className="flex flex-wrap justify-center gap-2"><Link href="/chef/kitchen" className="chef-btn is-primary">Set up my kitchen</Link><button type="button" className="chef-btn" disabled={busy || loading} onClick={() => void load(true)}>Check again</button></div>}
        />
      </ChefSection>
    </div>;

  if (!editing) {
    const availableCount = items.filter((item) => item.status === "ACTIVE" && item.available).length;
    return (
      <div>
        <ChefPageHead
          title="Menu"
          subtitle={loading ? "Loading your dishes…" : items.length ? `${items.length} dish${items.length === 1 ? "" : "es"} · ${availableCount} available to order` : "Dishes customers can order from your kitchen."}
          action={
            <button type="button" className="chef-btn is-primary" onClick={() => start()} disabled={loading || busy || !!loadError}>
              <Plus className="h-5 w-5" aria-hidden="true" /> Add dish
            </button>
          }
        />
        <div className="chef-stack">
          {feedback}
          {loadError ? (
            <ChefSection>
              <ChefEmpty icon={AlertTriangle} title="Your menu couldn’t load" text={loadError} action={<button type="button" className="chef-btn" disabled={busy || loading} onClick={() => void load(true)}>Reload menu</button>} />
            </ChefSection>
          ) : null}
          {loading ? (
            <div aria-label="Loading menu" role="status" className="chef-section chef-list">
              {[1, 2, 3, 4].map((key) => (
                <div key={key} className="chef-row">
                  <ChefSkeleton className="h-16 w-16 !rounded-xl" />
                  <div className="grid flex-1 gap-2"><ChefSkeleton className="h-4 w-2/3" /><ChefSkeleton className="h-3 w-1/3" /></div>
                </div>
              ))}
            </div>
          ) : !loadError && items.length === 0 ? (
            <ChefSection>
              <ChefEmpty
                icon={UtensilsCrossed}
                title="Add your first dish"
                text="Start with something you cook often. You can add photos, price and how many people it serves."
                action={<button type="button" className="chef-btn is-primary" onClick={() => start()}>Add your first dish</button>}
              />
            </ChefSection>
          ) : items.length ? (
            <ul className="chef-section chef-list">
              {items.map((item) => {
                const live = item.status === "ACTIVE" && item.available;
                const image = primaryImage(item);
                return (
                  <li key={item.id} className="flex items-center gap-1 pr-3 md:pr-4">
                    <button type="button" className="chef-row min-w-0 flex-1 !border-0 !bg-transparent" aria-label={`Edit ${item.itemName}`} onClick={() => start(item)} disabled={busy}>
                      <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F1F3F5]">
                        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <UtensilsCrossed className="absolute inset-0 m-auto h-6 w-6 text-[#8A8F98]" aria-hidden="true" />}
                      </span>
                      <span className="chef-row-main">
                        <span className="chef-row-title line-clamp-2 block">{item.itemName}</span>
                        <span className="chef-row-meta flex flex-wrap items-center gap-x-2 gap-y-1">
                          <FoodIndicator type={item.foodType} />
                          <span aria-hidden="true">·</span>
                          <span className="chef-amount font-semibold text-[#1A1A1A]">{item.currency === "INR" ? "₹" : `${item.currency} `}{item.price.toFixed(2)}</span>
                        </span>
                        <span className={`mt-1 block text-[0.8125rem] font-semibold ${live ? "text-[#0E6B4C]" : "text-[#6B6B6B]"}`}>
                          {item.status === "DRAFT" ? "Draft · not on your menu yet" : item.status !== "ACTIVE" ? "Not published" : item.available ? "Available to order" : "Hidden from customers"}
                        </span>
                      </span>
                    </button>
                    <Switch
                      className={GO_SWITCH}
                      aria-label={`${item.itemName} available to order`}
                      checked={live}
                      disabled={busy || item.status !== "ACTIVE"}
                      onCheckedChange={(value) => void setAvailability(item, value)}
                    />
                  </li>
                );
              })}
            </ul>
          ) : null}
          {items.some((item) => item.status !== "ACTIVE") ? (
            <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">To put a draft dish on your menu, open it and turn on “Customers can order it”.</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="mx-auto max-w-3xl space-y-5"
    >
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setMessage("");
            if (uncertainSave) void load(true);
          }}
        >
          <ArrowLeft className="size-4" /> Menu
        </Button>
        <span className="text-sm text-muted-foreground">
          {form.id ? "Edit dish" : "Add a dish"}
        </span>
      </div>
      <div>
        <h2 className="text-2xl font-semibold">
          {form.id ? "Edit your dish" : "What are you cooking?"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Fields marked Required must be completed. Your changes are saved when you select Save
          Dish.
        </p>
      </div>
      {feedback}
      <fieldset disabled={busy || uncertainSave} className="space-y-5">
        <section className={SECTION}>
          <h3 className="text-lg font-semibold">Dish information</h3>
          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor="dish-photo" className="font-medium">
                Dish photos{" "}
                <span className="text-sm font-normal text-muted-foreground">Optional</span>
              </label>
              <p className="mt-1 text-sm text-muted-foreground">
                Add up to {MAX_PHOTOS} photos. JPEG, PNG or WebP, up to 8 MB each. The cover is the photo customers see first.
                {existingPhotos.length ? " Removing a saved photo or changing the cover applies right away." : ""}
              </p>
              <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5" aria-label="Photo gallery">
                {existingPhotos.map((image, index) => (
                  <li key={image.id} className="relative">
                    <img
                      src={image.publicUrl ?? ""}
                      alt={`Saved photo ${index + 1}`}
                      className="aspect-square w-full rounded-xl border border-border object-cover"
                    />
                    {image.primary ? (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-[#F62E18] px-2 py-0.5 text-xs font-semibold text-white">
                        Cover
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Make saved photo ${index + 1} the cover`}
                        className="absolute bottom-1.5 left-1.5 min-h-8! min-w-0! rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-[#1A1A1A] shadow focus-visible:outline-2 focus-visible:outline-[#F62E18]"
                        onClick={() => void changeSavedPhoto(image.id, "cover")}
                      >
                        Make cover
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove saved photo ${index + 1}`}
                      className="absolute right-1.5 top-1.5 flex size-9 min-h-9! min-w-9! items-center justify-center rounded-full p-0! text-base font-bold text-[#1A1A1A] shadow focus-visible:outline-2 focus-visible:outline-[#F62E18]"
                      onClick={() => void changeSavedPhoto(image.id, "remove")}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {imageFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${file.lastModified}`} className="relative">
                    <img
                      src={previews[index]}
                      alt={existingPhotos.length === 0 && index === 0 ? "Dish preview" : `New photo ${file.name}`}
                      className="aspect-square w-full rounded-xl border border-dashed border-[#F62E18] object-cover"
                    />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-[#1A1A1A] shadow">
                      {existingPhotos.length === 0 && index === 0 ? "Cover · New" : "New"}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      className="absolute right-1.5 top-1.5 flex size-9 min-h-9! min-w-9! items-center justify-center rounded-full p-0! text-base font-bold text-[#1A1A1A] shadow focus-visible:outline-2 focus-visible:outline-[#F62E18]"
                      onClick={() => setImageFiles((current) => current.filter((entry) => entry !== file))}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {photoSlots > 0 ? (
                  <li>
                    <label className="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#C9CDD2] bg-muted text-center text-xs font-medium text-muted-foreground focus-within:ring-2 focus-within:ring-[#F62E18] hover:border-[#F62E18] hover:text-[#F62E18]">
                      <ImagePlus className="size-6" aria-hidden="true" />
                      Add photo
                      <Input
                        {...fieldProps("photo")}
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) => {
                          const chosen = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          if (!chosen.length) return;
                          const valid = chosen.filter(
                            (file) => IMAGE_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_IMAGE_BYTES,
                          );
                          const accepted = valid.slice(0, Math.max(0, photoSlots));
                          setImageFiles((current) => [...current, ...accepted]);
                          setErrors((current) => ({
                            ...current,
                            photo:
                              valid.length < chosen.length
                                ? "Choose a JPEG, PNG or WebP photo up to 8 MB."
                                : accepted.length < valid.length
                                  ? `You can add up to ${MAX_PHOTOS} photos per dish.`
                                  : undefined,
                          }));
                        }}
                      />
                    </label>
                  </li>
                ) : null}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                {existingPhotos.length + imageFiles.length} of {MAX_PHOTOS} photos
              </p>
              {errorText("photo")}
              {errors.photo ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-1"
                  onClick={() => setErrors((current) => ({ ...current, photo: undefined }))}
                >
                  Dismiss
                </Button>
              ) : null}
            </div>
            <div>
              <label htmlFor="dish-itemName" className="font-medium">
                Dish Name{" "}
                <span className="text-sm font-normal text-muted-foreground">Required</span>
              </label>
              <Input
                {...fieldProps("itemName")}
                required
                maxLength={180}
                className={CONTROL}
                value={form.itemName}
                onChange={(event) => update("itemName", event.target.value)}
                placeholder="e.g. Homestyle vegetable biryani"
              />
              {errorText("itemName")}
            </div>
            <div>
              <label htmlFor="dish-description" className="font-medium">
                Description{" "}
                <span className="text-sm font-normal text-muted-foreground">Optional</span>
              </label>
              <textarea
                id="dish-description"
                maxLength={2000}
                rows={3}
                className={`${CONTROL} rounded-md border border-input bg-transparent px-3 py-3 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
                placeholder="Tell customers what makes it special"
              />
            </div>
            <div>
              <label htmlFor="dish-category" className="font-medium">
                Category <span className="text-sm font-normal text-muted-foreground">Required</span>
              </label>
              <Input
                {...fieldProps("category")}
                required
                maxLength={80}
                list="dish-categories"
                className={CONTROL}
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                placeholder="Choose or enter a category"
              />
              <datalist id="dish-categories">
                {[
                  "Biryani",
                  "Tiffins",
                  "Curry",
                  "Meals",
                  "Snacks",
                  "Sweets",
                  "Desserts",
                  "Cake",
                  "Fast Food",
                  "Ice Cream",
                  "Pickles",
                ].map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              {errorText("category")}
            </div>
            <fieldset>
              <legend className="font-medium">
                Food type{" "}
                <span className="text-sm font-normal text-muted-foreground">Required</span>
              </legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {FOOD_TYPES.map((food, index) => (
                  <label
                    key={food.value}
                    className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 focus-within:ring-2 focus-within:ring-[#1A1A1A] ${form.foodType === food.value ? "border-[#1A1A1A] bg-white shadow-[inset_0_0_0_1px_#1A1A1A]" : "border-border"} ${errors.foodType ? "border-destructive" : ""}`}
                  >
                    <input
                      {...(index === 0 ? fieldProps("foodType") : {})}
                      type="radio"
                      required
                      name="foodType"
                      value={food.value}
                      checked={form.foodType === food.value}
                      onChange={() => update("foodType", food.value)}
                      className="sr-only"
                    />
                    <FoodIndicator type={food.value} />
                  </label>
                ))}
              </div>
              {errorText("foodType")}
            </fieldset>
          </div>
        </section>
        <section className={SECTION}>
          <h3 className="text-lg font-semibold">Price and preparation</h3>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="dish-price" className="font-medium">
                Price ({form.currency === "INR" ? "₹" : form.currency}){" "}
                <span className="text-sm font-normal text-muted-foreground">Required</span>
              </label>
              <Input
                {...fieldProps("price")}
                required
                inputMode="decimal"
                className={CONTROL}
                value={form.price}
                onChange={(event) => update("price", event.target.value)}
                placeholder="180.00"
              />
              {errorText("price")}
            </div>
            <div>
              <label htmlFor="dish-preparationTimeMinutes" className="font-medium">
                Preparation time (min){" "}
                <span className="text-sm font-normal text-muted-foreground">Optional</span>
              </label>
              <Input
                {...fieldProps("preparationTimeMinutes")}
                inputMode="numeric"
                className={CONTROL}
                value={form.preparationTimeMinutes}
                onChange={(event) => update("preparationTimeMinutes", event.target.value)}
                placeholder="30"
              />
              {errorText("preparationTimeMinutes")}
            </div>
            <div>
              <label htmlFor="dish-servesCount" className="font-medium">
                Serves (people){" "}
                <span className="text-sm font-normal text-muted-foreground">Optional</span>
              </label>
              <Input
                {...fieldProps("servesCount")}
                inputMode="numeric"
                className={CONTROL}
                value={form.servesCount}
                onChange={(event) => update("servesCount", event.target.value)}
                placeholder="1"
              />
              {errorText("servesCount")}
            </div>
            <div>
              <label htmlFor="dish-spiceLevel" className="font-medium">
                <FaPepperHot className="mr-2 inline size-4 text-[var(--color-flame-red)]" aria-hidden="true" /> Spice level{" "}
                <span className="text-sm font-normal text-muted-foreground">Optional</span>
              </label>
              <select
                id="dish-spiceLevel"
                className={`${CONTROL} rounded-md border border-input bg-white px-3 focus-visible:ring-1 focus-visible:ring-ring`}
                value={form.spiceLevel}
                onChange={(event) => update("spiceLevel", event.target.value as SpiceLevel | "")}
              >
                <option value="">Not specified</option>
                <option value="MILD">Mild</option>
                <option value="MEDIUM">Medium</option>
                <option value="SPICY">Hot</option>
              </select>
            </div>
          </div>
        </section>
        <section className={SECTION}>
          <h3 className="text-lg font-semibold">Packaging and availability</h3>
          <div className="mt-5">
            <label htmlFor="dish-unitPackageWeightGrams" className="font-medium">
              Packed weight (grams){" "}
              <span className="text-sm font-normal text-muted-foreground">Required</span>
            </label>
            <p className="mt-1 text-sm text-muted-foreground">
              The total weight of one packed portion, including its container. This is needed for
              delivery.
            </p>
            <Input
              {...fieldProps("unitPackageWeightGrams")}
              required
              inputMode="numeric"
              className={CONTROL}
              value={form.unitPackageWeightGrams}
              onChange={(event) => update("unitPackageWeightGrams", event.target.value)}
              placeholder="e.g. 500"
            />
            {errorText("unitPackageWeightGrams")}
          </div>
          <label className="mt-5 flex min-h-12 items-center justify-between gap-4">
            <span>
              <span className="block font-medium">Thermal box needed</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Turn on if this dish must stay hot or cold on the way.
              </span>
            </span>
            <Switch
              className={GO_SWITCH}
              checked={form.thermoboxRequired}
              onCheckedChange={(value) => update("thermoboxRequired", value)}
            />
          </label>
          <label className="mt-4 flex min-h-12 items-center justify-between gap-4 border-t border-border pt-4">
            <span>
              <span className="block font-medium">Customers can order it</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {form.available
                  ? "Publish this dish and make it available to order."
                  : form.status === "DRAFT"
                    ? "Save as a draft until you are ready to serve."
                    : "Customers cannot order this dish while unavailable."}
              </span>
            </span>
            <Switch
              className={GO_SWITCH}
              checked={form.available}
              onCheckedChange={(value) => {
                update("available", value);
                update("status", value ? "ACTIVE" : items.find(item => item.id === form.id)?.status ?? "DRAFT");
              }}
            />
          </label>
        </section>
        <div className="flex flex-wrap gap-3 pb-4">
          <Button type="submit" className="flex-1" disabled={busy || uncertainSave}>
            {busy ? "Saving…" : "Save dish"}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </fieldset>
      {uncertainSave ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEditing(false);
            void load(true);
          }}
        >
          Reload menu to check the save
        </Button>
      ) : null}
    </form>
  );
}
