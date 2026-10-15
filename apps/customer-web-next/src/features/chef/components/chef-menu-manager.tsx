"use client";
import { sessionFetch } from "@/features/auth/api/sessionFetch";

import { ChefError, chefApiError, chefErrorText, isChefAccessText } from "@/features/chef/lib/chef-errors";
import { ChefAccessRetry } from "@/features/chef/components/chef-account-menu";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CopyPlus,
  Ellipsis,
  Minus,
  Plus,
  Store,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import {
  ChefChoiceChips,
  ChefEmpty,
  ChefFlash,
  ChefPageHead,
  ChefPill,
  ChefSection,
} from "@/features/chef/components/chef-ui";
import { ChefMenuSkeleton } from "@/features/chef/components/chef-loading";
import { ChefCategoryPicker } from "@/features/chef/components/chef-category-picker";
import { ChefMenuViews } from "@/features/chef/components/chef-menu-views";
import { AppleSwitch } from "@/shared/ui/AppleSwitch";
import { Dialog, secondaryActionClass, Sheet, useOverlayHistory } from "@/shared/ui/overlays/overlay";
import { isFeatureUnavailable } from "@/shared/lib/feature-availability";
import { parseChefKitchen } from "@/features/chef/lib/chef-kitchen-contract";
import { chefMenuFailure } from "@/features/chef/lib/chef-menu-errors";
import { DISH_CATEGORIES, knownCategory } from "@/features/chef/lib/dish-categories";
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
type Filter = "all" | "on" | "off";
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
  { value: "VEG", label: "Veg", color: "bg-[#2E7D32]", border: "border-[#2E7D32]" },
  { value: "NON_VEG", label: "Non-veg", color: "bg-[#D92D20]", border: "border-[#D92D20]" },
  { value: "EGG", label: "Egg", color: "bg-[#D99A00]", border: "border-[#D99A00]" },
] as const;
const SPICE_LEVELS = [
  { value: "", label: "Not set" },
  { value: "MILD", label: "Mild" },
  { value: "MEDIUM", label: "Medium" },
  { value: "SPICY", label: "Hot" },
] as const;
// One tap fills the usual answers; the box still takes any number.
const READY_IN = [15, 30, 45, 60] as const;
const PACKED_WEIGHTS = [250, 500, 750, 1000] as const;
const FIELD = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";
const STEP_BUTTON =
  "grid h-12 w-12 shrink-0 place-items-center rounded-xl !border !border-[#D3D7DD] !bg-white !text-[#1A1A1A] !shadow-none active:scale-[0.96] disabled:opacity-40";
const PHOTO_REMOVE =
  "absolute -right-1.5 -top-1.5 grid size-8 min-h-8! min-w-8! place-items-center rounded-full !border-2 !border-white !bg-[#1A1A1A] p-0! !text-white !shadow-none";

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
  return [...(item?.images ?? [])].sort(
    (a, b) => Number(b.primary) - Number(a.primary) || a.sortOrder - b.sortOrder,
  );
}
function primaryImage(item?: ChefMenuItem) {
  return (
    item?.images.find((image) => image.primary)?.publicUrl ?? item?.images[0]?.publicUrl ?? null
  );
}
function requiresKitchen(response: Response, body: unknown): boolean {
  return (
    response.status === 400 &&
    !!body &&
    typeof body === "object" &&
    "code" in body &&
    body.code === "KITCHEN_PROFILE_REQUIRED"
  );
}

function apiError(response: Response, body: unknown, fallback: string) {
  return chefApiError(response, body, fallback);
}
/** ₹180, or ₹180.50 when there are paise. */
function priceText(price: number, currency: string) {
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  return currency === "INR" ? `₹${amount}` : `${currency} ${amount}`;
}
function grams(value: number) {
  return value >= 1000 && value % 1000 === 0 ? `${value / 1000} kg` : `${value} g`;
}
/** Known categories in the order customers browse them, then the chef's own, A to Z. */
function categoryOrder(name: string) {
  const index = DISH_CATEGORIES.findIndex(
    (category) => category.name === knownCategory(name)?.name,
  );
  return index === -1 ? DISH_CATEGORIES.length : index;
}
function FoodIndicator({ type }: { type: FoodType }) {
  const food = FOOD_TYPES.find((option) => option.value === type)!;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`flex size-4 items-center justify-center rounded-[4px] border-[1.5px] ${food.border}`}
      >
        <span className={`size-2 rounded-full ${food.color}`} />
      </span>
      {food.label}
    </span>
  );
}
function MenuStatus({ item }: { item: ChefMenuItem }) {
  if (item.status === "DRAFT") return <ChefPill tone="warning">Draft · not on your menu</ChefPill>;
  if (item.status !== "ACTIVE") return <ChefPill tone="muted">Not on your menu</ChefPill>;
  return item.available ? (
    <ChefPill tone="success">On sale</ChefPill>
  ) : (
    <ChefPill tone="muted">Hidden from customers</ChefPill>
  );
}
function QuickPicks({
  label,
  options,
  value,
  onPick,
  unit,
}: {
  label: string;
  options: readonly number[];
  value: string;
  onPick: (value: string) => void;
  unit: (value: number) => string;
}) {
  return (
    // Four equal columns keep every pick on one row under the field at phone width.
    <div role="group" aria-label={label} className="mt-2 grid grid-cols-4 gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className="chef-chip justify-center !px-2"
          aria-pressed={value.trim() === String(option)}
          onClick={() => onPick(String(option))}
        >
          {unit(option)}
        </button>
      ))}
    </div>
  );
}
function SettingRow({
  title,
  text,
  children,
}: {
  title: ReactNode;
  text: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-semibold text-[#1A1A1A]">{title}</span>
        <span className="mt-0.5 block text-sm leading-5 text-[#6B6B6B]">{text}</span>
      </span>
      {children}
    </div>
  );
}

export function ChefMenuManager() {
  const [items, setItems] = useState<ChefMenuItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [baseline, setBaseline] = useState(JSON.stringify(EMPTY));
  const [editing, setEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  /** The dish Discard copies next, when Duplicate asked first; otherwise Discard closes the form. */
  const copyAfterDiscard = useRef<ChefMenuItem | null>(null);
  /** Dish options: the menu, or the delete question in its place. */
  const [options, setOptions] = useState<"menu" | "delete" | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
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
  const dirty = editing && (JSON.stringify(form) !== baseline || imageFiles.length > 0);

  const load = useCallback(async (initial = false): Promise<boolean> => {
    if (initial) setLoading(true);
    try {
      const kitchenResponse = await sessionFetch("/api/chef/kitchen", { cache: "no-store" });
      const kitchenBody: unknown = await kitchenResponse.json().catch(() => undefined);
      if (!kitchenResponse.ok)
        throw apiError(
          kitchenResponse,
          kitchenBody,
          "Your kitchen could not be checked. Please retry.",
        );
      if (kitchenBody === null) {
        setItems([]);
        setKitchenRequired(true);
        setLoadError("");
        return true;
      }
      if (!parseChefKitchen(kitchenBody))
        throw new ChefError(
          "Your kitchen could not be verified. Please retry.",
          "INVALID_KITCHEN_RESPONSE",
          0,
        );
      const response = await sessionFetch("/api/chef/menu", { cache: "no-store" });
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
        throw new ChefError(
          "The menu response was incomplete. Please retry.",
          "INVALID_MENU_RESPONSE",
          0,
        );
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

  function closeEditor() {
    setConfirmLeave(false);
    setEditing(false);
    setMessage("");
    if (uncertainSave) void load(true);
  }
  /** Cancel, the back link and phone Back: ask first when something would be lost. */
  function requestLeave(): boolean {
    if (busyRef.current) return false;
    if (dirty) {
      copyAfterDiscard.current = null;
      setConfirmLeave(true);
      return false;
    }
    closeEditor();
    return true;
  }
  // The dish form is its own screen to the phone: Back returns to the menu instead of leaving it.
  useOverlayHistory(editing, requestLeave);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  /** Opens the dish form; a copy is a new draft filled from the dish, saved with the normal create. */
  function start(item?: ChefMenuItem, copy = false) {
    const next = !item
      ? EMPTY
      : copy
        ? { ...toForm(item), id: null, itemName: `Copy of ${item.itemName}`.slice(0, 180), available: false, status: "DRAFT" as const }
        : toForm(item);
    setForm(next);
    setBaseline(JSON.stringify(next));
    setImageFiles([]);
    setErrors({});
    setMessage("");
    setNotice("");
    setUncertainSave(false);
    setEditing(true);
    try {
      window.scrollTo({ top: 0 });
    } catch {
      // Older browsers keep their scroll position.
    }
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
      <p id={`dish-${field}-error`} className="chef-field-error">
        {errors[field]}
      </p>
    ) : null;
  }
  function validate() {
    const next: Partial<Record<Field, string>> = {};
    if (!form.itemName.trim()) next.itemName = "Give your dish a name.";
    if (!form.category.trim()) next.category = "Choose a category, or type your own.";
    if (!form.foodType) next.foodType = "Choose Veg, Non-veg or Egg.";
    if (
      !/^\d+(\.\d{1,2})?$/.test(form.price.trim()) ||
      Number(form.price) < 0.01 ||
      Number(form.price) > 10000000
    )
      next.price = "Enter a price greater than zero, with up to two decimal places.";
    for (const [field, label, required] of [
      ["servesCount", "Serves", false],
      ["preparationTimeMinutes", "Ready in", false],
      ["unitPackageWeightGrams", "Packed weight", true],
    ] as const) {
      const value = form[field].trim();
      if (
        (required || value) &&
        (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000)
      )
        // Only the packed weight is required, so an empty value here is always the weight.
        next[field] = value ? `${label} must be a whole number from 1 to 100,000.` : "Enter the packed weight in grams.";
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
      const response = await sessionFetch(
        form.id ? `/api/chef/menu/${form.id}` : "/api/chef/menu",
        {
          method: creating ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        // Catalog checks selling eligibility before any menu write. Other 5xx
        // responses and interrupted requests still require a reload to avoid duplicates.
        confirmedRejection =
          (response.status >= 400 && response.status < 500) ||
          chefMenuFailure(response.status, body)?.code === "CATALOG_ELIGIBILITY_UNAVAILABLE";
        if (requiresKitchen(response, body)) {
          setItems([]);
          setKitchenRequired(true);
          setEditing(false);
        }
        throw apiError(
          response,
          body,
          "The service did not confirm the save. Reload your menu before trying again.",
        );
      }
      saved = parseChefMenuItem(body);
      if (!saved)
        throw new ChefError(
          "The service returned an incomplete save response. Reload your menu to check the result.",
          "INVALID_MENU_RESPONSE",
          0,
        );
      upsert(saved);
      setForm(toForm(saved));
      // Upload one at a time; each confirmed photo leaves the queue so a retry never duplicates it.
      const pending = [...imageFiles];
      for (const file of pending) {
        const data = new FormData();
        // Customers download photos at upload size: send a 1600 px copy, not the phone original.
        data.set("file", await shrinkDishPhoto(file));
        data.set("primary", "false");
        const upload = await sessionFetch(`/api/chef/menu/${saved.id}/images`, {
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
          throw new ChefError(
            "The photo upload was not confirmed. Please reload your menu to check it.",
            "INVALID_MENU_IMAGE_RESPONSE",
            0,
          );
        setImageFiles((current) => current.filter((entry) => entry !== file));
      }
      setEditing(false);
      setNotice(creating ? "Dish added" : "Changes saved");
      await load();
    } catch (error) {
      const detail = chefErrorText(
        error,
        "Connection interrupted. Please reload your menu to check the result.",
      );
      if (saved) {
        setMessage(
          `Dish details saved, but a photo was not confirmed. Photos still listed as New were not uploaded. ${detail}`,
        );
        // Show photos that did upload before the failure.
        await load();
      } else {
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
      const response = await sessionFetch(`/api/chef/menu/${item.id}/availability`, {
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
        throw apiError(
          response,
          body,
          "Availability was not confirmed. Reload the menu to check it.",
        );
      }
      const updated = parseChefMenuItem(body);
      if (!updated)
        throw new ChefError(
          "Availability returned an incomplete response. Reload the menu to check it.",
          "INVALID_MENU_RESPONSE",
          0,
        );
      upsert(updated);
      setNotice(updated.available ? "Dish turned on" : "Dish turned off");
    } catch (error) {
      setMessage(
        chefErrorText(error, "Availability could not be confirmed. Reload the menu to check it."),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function deleteDish() {
    const dish = items.find((item) => item.id === form.id);
    if (!dish || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    const refused = `We couldn’t delete ${dish.itemName}. If it’s in a meal plan, change the plan first.`;
    try {
      const response = await sessionFetch(`/api/chef/menu/${dish.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setOptions(null);
        if (isFeatureUnavailable(response.status, body)) setMessage("Deleting dishes is coming soon.");
        else setMessage(chefErrorText(apiError(response, body, refused), refused));
        return;
      }
      setItems((current) => current.filter((item) => item.id !== dish.id));
      setOptions(null);
      closeEditor();
      setNotice(`${dish.itemName} deleted`);
    } catch (error) {
      setOptions(null);
      setMessage(chefErrorText(error, refused));
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
      const response = await sessionFetch(`/api/chef/menu/${form.id}/images/${imageId}`, {
        method: action === "remove" ? "DELETE" : "PUT",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw apiError(
          response,
          body,
          "The photo change was not confirmed. Reload the menu to check it.",
        );
      const updated = parseChefMenuItem(body);
      if (!updated)
        throw new ChefError(
          "The photo change returned an incomplete response. Reload the menu to check it.",
          "INVALID_MENU_RESPONSE",
          0,
        );
      upsert(updated);
      setNotice(action === "remove" ? "Photo removed" : "Cover photo changed");
    } catch (error) {
      setMessage(
        chefErrorText(
          error,
          "The photo change could not be confirmed. Reload the menu to check it.",
        ),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const existingPhotos = savedImages(items.find((item) => item.id === form.id));
  const photoSlots = MAX_PHOTOS - existingPhotos.length - imageFiles.length;
  // They float above the tab bar (or the Save bar), so one pair serves the list and the dish form,
  // and "Dish added" is still read out when saving closes the form.
  const feedback = (
    <>
      <ChefFlash message={notice} onClose={() => setNotice("")} />
      <ChefFlash message={message} tone="danger" onClose={() => setMessage("")} />
    </>
  );

  const onSale = items.filter((item) => item.status === "ACTIVE" && item.available).length;
  // Dishes grouped the way customers browse: by category, in Home's order, then the chef's own.
  const groups = useMemo(() => {
    const byCategory = new Map<string, ChefMenuItem[]>();
    for (const item of items) {
      const live = item.status === "ACTIVE" && item.available;
      if (filter !== "all" && (filter === "on") !== live) continue;
      const name = knownCategory(item.category)?.name ?? item.category.trim();
      byCategory.set(name, [...(byCategory.get(name) ?? []), item]);
    }
    return [...byCategory].sort(
      ([a], [b]) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b),
    );
  }, [items, filter]);

  if (kitchenRequired && !loading && !loadError)
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ChefPageHead title="Menu" />
        <ChefSection>
          <ChefEmpty
            icon={Store}
            title="Set up your kitchen first"
            text="Save your kitchen name and pickup address, then add your dishes."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/chef/kitchen" className="chef-btn is-primary">
                  Set up my kitchen
                </Link>
                <button
                  type="button"
                  className="chef-btn"
                  disabled={busy || loading}
                  onClick={() => void load(true)}
                >
                  Check again
                </button>
              </div>
            }
          />
        </ChefSection>
      </div>
    );

  const coverPreview = existingPhotos[0]?.publicUrl ?? previews[0] ?? null;
  const food = FOOD_TYPES.find((option) => option.value === form.foodType);

  // The list comes back as it was; the dish form slides up as its own screen.
  return (
    <>
    {!editing ? (
    <div className="mx-auto w-full max-w-3xl">
      <ChefPageHead
        title="Menu"
        subtitle={
          loading
            ? "Loading your dishes…"
            : items.length
              ? `${items.length} dish${items.length === 1 ? "" : "es"} · ${onSale} on sale now`
              : "Dishes customers can order from your kitchen."
        }
        action={
          <button
            type="button"
            className="chef-btn is-primary"
            onClick={() => start()}
            disabled={loading || busy || !!loadError}
          >
            <Plus className="h-5 w-5" aria-hidden="true" /> Add dish
          </button>
        }
      />
      <div className="chef-stack">
        <ChefMenuViews current="dishes" counts={{ dishes: loading || loadError ? undefined : items.length }} />
        {loadError ? (
          <ChefSection>
            <ChefEmpty
              icon={AlertTriangle}
              title="Your menu couldn’t load"
              text={loadError}
              action={
                isChefAccessText(loadError) ? (
                  <ChefAccessRetry onRetry={() => void load(true)} />
                ) : (
                  <button
                    type="button"
                    className="chef-btn"
                    disabled={busy || loading}
                    onClick={() => void load(true)}
                  >
                    Reload menu
                  </button>
                )
              }
            />
          </ChefSection>
        ) : null}
        {loading ? (
          <div aria-label="Loading menu" role="status">
            <ChefMenuSkeleton />
          </div>
        ) : !loadError && items.length === 0 ? (
          <ChefSection>
            <ChefEmpty
              image={{
                src: "/landing-v20/images/story-grid/cook-fresh-pot.png",
                alt: "A home chef tipping chopped vegetables from a board into a pot on the stove",
                width: 1696,
                height: 954,
              }}
              title="Add your first dish"
              text="Start with something you cook often. A photo, a price and the packed weight are all customers need."
              action={
                <button type="button" className="chef-btn is-primary" onClick={() => start()}>
                  Add your first dish
                </button>
              }
            />
          </ChefSection>
        ) : items.length ? (
          <>
            {items.length > 4 && onSale > 0 && onSale < items.length ? (
              <div role="group" aria-label="Show dishes" className="chef-chips">
                {(
                  [
                    ["all", "All", items.length],
                    ["on", "On sale", onSale],
                    ["off", "Not on sale", items.length - onSale],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    className="chef-chip"
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label} <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {groups.map(([category, dishes]) => (
              <section
                key={category}
                aria-label={`${category}, ${dishes.length} dish${dishes.length === 1 ? "" : "es"}`}
                className="grid gap-2"
              >
                <h2 className="flex items-baseline gap-2 px-1 font-display text-[1.0625rem] font-bold tracking-tight text-[#1A1A1A]">
                  {category}
                  <span className="text-sm font-semibold text-[#6B6B6B]">{dishes.length}</span>
                </h2>
                <ul className="chef-section chef-list">
                  {dishes.map((item) => {
                    const live = item.status === "ACTIVE" && item.available;
                    const image = primaryImage(item);
                    return (
                      <li key={item.id} className="flex items-center gap-1 pr-3 md:pr-4">
                        <button
                          type="button"
                          className="chef-row min-w-0 flex-1 !border-0 !bg-transparent"
                          aria-label={`Edit ${item.itemName}`}
                          onClick={() => start(item)}
                          disabled={busy}
                        >
                          <span className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[14px] bg-[#F1F3F5]">
                            {image ? (
                              <img
                                src={image}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <UtensilsCrossed
                                className="absolute inset-0 m-auto h-6 w-6 text-[#8A8F98]"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <span className="chef-row-main">
                            <span className="chef-row-title line-clamp-2 block">
                              {item.itemName}
                            </span>
                            <span className="chef-row-meta flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <FoodIndicator type={item.foodType} />
                              <span className="chef-amount font-semibold text-[#1A1A1A]">
                                {priceText(item.price, item.currency)}
                              </span>
                              {item.servesCount ? <span>Serves {item.servesCount}</span> : null}
                            </span>
                            <span className="mt-1.5 block">
                              <MenuStatus item={item} />
                            </span>
                          </span>
                        </button>
                        <AppleSwitch
                          tone="go"
                          size="md"
                          aria-label={`${item.itemName} available to order`}
                          checked={live}
                          disabled={busy || item.status !== "ACTIVE"}
                          onCheckedChange={(value) => void setAvailability(item, value)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </>
        ) : null}
        {items.some((item) => item.status !== "ACTIVE") ? (
          <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">
            To put a draft dish on your menu, open it and turn on “Customers can order it”.
          </p>
        ) : null}
      </div>
    </div>
  ) : (
    <motion.form
      ref={formRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="chef-dish-editor"
    >
      <header className="mb-4">
        <button
          type="button"
          className="chef-back-link !border-0 !bg-transparent !shadow-none"
          disabled={busy}
          onClick={requestLeave}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Menu
        </button>
        <div className="flex items-start justify-between gap-3">
          <h1 className="chef-page-title">{form.id ? "Edit dish" : "Add a dish"}</h1>
          {form.id ? (
            <button
              type="button"
              className="chef-icon-button shrink-0 !border-0 !bg-transparent !p-0 !shadow-none"
              aria-label="Dish options"
              aria-haspopup="dialog"
              disabled={busy}
              onClick={() => setOptions("menu")}
            >
              <Ellipsis className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="chef-page-subtitle">
          {form.id
            ? "Customers see your changes as soon as you save."
            : "Fill in the basics. You can change any of this later."}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-6">
        <div className="chef-stack">
          <fieldset disabled={busy || uncertainSave} className="chef-stack min-w-0">
            <ChefSection title="Photos" note="The first photo is the one customers see. Up to 5.">
              <ul
                className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 pt-1.5"
                aria-label="Photo gallery"
              >
                {photoSlots > 0 ? (
                  <li className="shrink-0">
                    <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-dashed border-[#B9BEC5] bg-[#F7F8FA] text-center text-xs font-semibold text-[#1A1A1A] transition-[border-color,background-color] duration-150 focus-within:ring-2 focus-within:ring-[#1A1A1A] hover:border-[#1A1A1A] hover:bg-white">
                      <Camera className="size-6 text-[#6B6B6B]" aria-hidden="true" />
                      <span>
                        <span className="sr-only">Dish photos: </span>Add photo
                      </span>
                      <input
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
                            (file) =>
                              IMAGE_TYPES.has(file.type) &&
                              file.size > 0 &&
                              file.size <= MAX_IMAGE_BYTES,
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
                {existingPhotos.map((image, index) => (
                  <li key={image.id} className="relative h-24 w-24 shrink-0">
                    <img
                      src={image.publicUrl ?? ""}
                      alt={`Saved photo ${index + 1}`}
                      className="h-full w-full rounded-[14px] object-cover"
                    />
                    {image.primary ? (
                      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#1A1A1A] px-2 py-0.5 text-[0.6875rem] font-bold text-white">
                        Cover
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Make saved photo ${index + 1} the cover`}
                        className="absolute bottom-1.5 left-1.5 min-h-7! min-w-0! rounded-full !border-0 !bg-white/95 px-2 py-0.5 text-[0.6875rem] font-bold !text-[#1A1A1A] !shadow-[0_1px_4px_rgba(26,26,26,0.2)]"
                        onClick={() => void changeSavedPhoto(image.id, "cover")}
                      >
                        Make cover
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove saved photo ${index + 1}`}
                      className={PHOTO_REMOVE}
                      onClick={() => void changeSavedPhoto(image.id, "remove")}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {imageFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="relative h-24 w-24 shrink-0"
                  >
                    <img
                      src={previews[index]}
                      alt={
                        existingPhotos.length === 0 && index === 0
                          ? "Dish preview"
                          : `New photo ${file.name}`
                      }
                      className="h-full w-full rounded-[14px] object-cover"
                    />
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[0.6875rem] font-bold text-[#1A1A1A] shadow-[0_1px_4px_rgba(26,26,26,0.2)]">
                      {existingPhotos.length === 0 && index === 0 ? "Cover · New" : "New"}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      className={PHOTO_REMOVE}
                      onClick={() =>
                        setImageFiles((current) => current.filter((entry) => entry !== file))
                      }
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[#6B6B6B]">
                <span aria-live="polite">
                  {existingPhotos.length + imageFiles.length} of {MAX_PHOTOS} photos
                </span>
                {existingPhotos.length ? (
                  <span> · Removing a saved photo or changing the cover happens right away.</span>
                ) : null}
              </p>
              {errorText("photo")}
            </ChefSection>

            <ChefSection title="About the dish">
              <div className="grid gap-5">
                <div>
                  <label htmlFor="dish-itemName" className="chef-field-label">
                    Dish name
                  </label>
                  <input
                    {...fieldProps("itemName")}
                    required
                    maxLength={180}
                    autoComplete="off"
                    className={FIELD}
                    value={form.itemName}
                    onChange={(event) => update("itemName", event.target.value)}
                    placeholder="For example, Chicken dum biryani"
                  />
                  {errorText("itemName")}
                </div>
                <div>
                  <ChefCategoryPicker
                    id="dish-category"
                    value={form.category}
                    onChange={(category) => update("category", category)}
                    invalid={!!errors.category}
                    describedBy={errors.category ? "dish-category-error" : undefined}
                  />
                  {errorText("category")}
                </div>
                <fieldset>
                  <legend className="chef-field-label">Food type</legend>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {FOOD_TYPES.map((option, index) => (
                      <label
                        key={option.value}
                        className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border bg-white px-2 text-[0.9375rem] font-semibold transition-[border-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-[#1A1A1A] focus-within:ring-offset-1 ${
                          form.foodType === option.value
                            ? "border-[#1A1A1A] shadow-[inset_0_0_0_1px_#1A1A1A]"
                            : errors.foodType
                              ? "border-[#C4200F]"
                              : "border-[#D3D7DD] hover:border-[#1A1A1A]"
                        }`}
                      >
                        <input
                          {...(index === 0 ? fieldProps("foodType") : {})}
                          type="radio"
                          required
                          name="foodType"
                          value={option.value}
                          checked={form.foodType === option.value}
                          onChange={() => update("foodType", option.value)}
                          className="sr-only"
                        />
                        <FoodIndicator type={option.value} />
                      </label>
                    ))}
                  </div>
                  {errorText("foodType")}
                </fieldset>
                <div>
                  <label htmlFor="dish-description" className="chef-field-label">
                    Description <span className="font-normal text-[#6B6B6B]">(optional)</span>
                  </label>
                  <textarea
                    id="dish-description"
                    maxLength={2000}
                    rows={3}
                    className={`${FIELD} py-3 leading-6`}
                    value={form.description}
                    onChange={(event) => update("description", event.target.value)}
                    placeholder="What makes it special: the masala, the rice, how you cook it"
                  />
                </div>
              </div>
            </ChefSection>

            <ChefSection title="Price and portion">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="dish-price" className="chef-field-label">
                    Price
                  </label>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-4 mt-2 flex items-center text-base font-semibold text-[#6B6B6B]"
                    >
                      {form.currency === "INR" ? "₹" : form.currency}
                    </span>
                    <input
                      {...fieldProps("price")}
                      required
                      inputMode="decimal"
                      className={`${FIELD} pl-9 font-semibold tabular-nums`}
                      value={form.price}
                      onChange={(event) => update("price", event.target.value)}
                      placeholder="e.g. 180"
                    />
                  </div>
                  {errorText("price")}
                </div>
                <div>
                  <label htmlFor="dish-servesCount" className="chef-field-label">
                    Serves <span className="font-normal text-[#6B6B6B]">(people, optional)</span>
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="One person fewer"
                      className={STEP_BUTTON}
                      disabled={!form.servesCount || Number(form.servesCount) <= 1}
                      onClick={() =>
                        update(
                          "servesCount",
                          String(Math.max(1, (Number(form.servesCount) || 1) - 1)),
                        )
                      }
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <input
                      {...fieldProps("servesCount")}
                      inputMode="numeric"
                      className="block min-h-12 w-full min-w-0 rounded-xl border bg-white px-2 text-center text-base font-semibold tabular-nums text-[#1A1A1A]"
                      value={form.servesCount}
                      onChange={(event) => update("servesCount", event.target.value)}
                      placeholder="Not set"
                    />
                    <button
                      type="button"
                      aria-label="One person more"
                      className={STEP_BUTTON}
                      onClick={() =>
                        update(
                          "servesCount",
                          String(Math.min(100, (Number(form.servesCount) || 0) + 1)),
                        )
                      }
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  {errorText("servesCount")}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="dish-preparationTimeMinutes" className="chef-field-label">
                    Ready in <span className="font-normal text-[#6B6B6B]">(minutes, optional)</span>
                  </label>
                  <input
                    {...fieldProps("preparationTimeMinutes")}
                    inputMode="numeric"
                    className={`${FIELD} sm:max-w-[12rem]`}
                    value={form.preparationTimeMinutes}
                    onChange={(event) => update("preparationTimeMinutes", event.target.value)}
                    placeholder="e.g. 30"
                  />
                  <QuickPicks
                    label="Usual cooking times"
                    options={READY_IN}
                    value={form.preparationTimeMinutes}
                    onPick={(value) => update("preparationTimeMinutes", value)}
                    unit={(minutes) => (minutes === 60 ? "1 hour" : `${minutes} min`)}
                  />
                  {errorText("preparationTimeMinutes")}
                </div>
                <div className="sm:col-span-2">
                  <ChefChoiceChips
                    legend="Spice level"
                    name="spiceLevel"
                    options={SPICE_LEVELS}
                    value={form.spiceLevel}
                    onChange={(value) => update("spiceLevel", value)}
                  />
                </div>
              </div>
            </ChefSection>

            <ChefSection title="Packing for delivery">
              <div>
                <label htmlFor="dish-unitPackageWeightGrams" className="chef-field-label">
                  Packed weight (grams)
                </label>
                <p className="mt-1 text-sm leading-5 text-[#6B6B6B]">
                  One packed portion, with its box. The delivery partner needs this.
                </p>
                <input
                  {...fieldProps("unitPackageWeightGrams")}
                  required
                  inputMode="numeric"
                  className={`${FIELD} sm:max-w-[12rem]`}
                  value={form.unitPackageWeightGrams}
                  onChange={(event) => update("unitPackageWeightGrams", event.target.value)}
                  placeholder="e.g. 500"
                />
                <QuickPicks
                  label="Usual packed weights"
                  options={PACKED_WEIGHTS}
                  value={form.unitPackageWeightGrams}
                  onPick={(value) => update("unitPackageWeightGrams", value)}
                  unit={grams}
                />
                {errorText("unitPackageWeightGrams")}
              </div>
              <div className="mt-4 border-t border-[#E3E6EA] pt-3">
                <SettingRow
                  title="Needs a thermal box"
                  text="Turn on if this dish must stay hot or cold on the way."
                >
                  <AppleSwitch
                    tone="go"
                    size="md"
                    aria-label="Needs a thermal box"
                    checked={form.thermoboxRequired}
                    onCheckedChange={(value) => update("thermoboxRequired", value)}
                  />
                </SettingRow>
              </div>
            </ChefSection>

            <ChefSection>
              <SettingRow
                title="Customers can order it"
                text={
                  form.available
                    ? "This dish goes on your menu when you save."
                    : form.status === "DRAFT"
                      ? "Saved as a draft until you are ready to sell it."
                      : "Hidden from customers until you turn this on."
                }
              >
                <AppleSwitch
                  tone="go"
                  size="md"
                  aria-label="Customers can order it"
                  checked={form.available}
                  onCheckedChange={(value) => {
                    update("available", value);
                    update(
                      "status",
                      value
                        ? "ACTIVE"
                        : (items.find((item) => item.id === form.id)?.status ?? "DRAFT"),
                    );
                  }}
                />
              </SettingRow>
            </ChefSection>
          </fieldset>
          {uncertainSave ? (
            <button
              type="button"
              className="chef-btn"
              onClick={() => {
                setEditing(false);
                void load(true);
              }}
            >
              Reload menu to check the save
            </button>
          ) : null}
        </div>

        {/* What customers will see, while the chef fills it in. Wide screens only: phones keep one column. */}
        <aside aria-label="How customers see it" className="hidden lg:sticky lg:top-24 lg:block">
          <p className="mb-2 px-1 text-sm font-semibold text-[#6B6B6B]">How customers see it</p>
          <div className="overflow-hidden rounded-[18px] border border-[#E3E6EA] bg-white shadow-[0_12px_32px_rgba(26,26,26,0.08)]">
            <div className="relative aspect-[4/3] bg-[#F1F3F5]">
              {coverPreview ? (
                <img src={coverPreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <UtensilsCrossed
                  className="absolute inset-0 m-auto h-8 w-8 text-[#8A8F98]"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="grid gap-1.5 p-4">
              <p className="line-clamp-2 font-display text-lg font-bold leading-snug tracking-tight text-[#1A1A1A]">
                {form.itemName.trim() || "Your dish name"}
              </p>
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-[#6B6B6B]">
                {food ? <FoodIndicator type={food.value} /> : null}
                {form.category.trim() ? <span>{form.category.trim()}</span> : null}
                {form.servesCount ? <span>Serves {form.servesCount}</span> : null}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-[#1A1A1A]">
                {Number(form.price) > 0 ? priceText(Number(form.price), form.currency) : "₹—"}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div className="chef-dish-actions">
        <button type="button" className="chef-btn" disabled={busy} onClick={requestLeave}>
          Cancel
        </button>
        <button
          type="submit"
          className="chef-btn is-primary flex-1"
          aria-busy={busy}
          disabled={busy || uncertainSave}
        >
          {busy ? "Saving…" : "Save dish"}
        </button>
      </div>

      <Sheet
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) setOptions(null);
        }}
        busy={busy}
        title={options === "delete" ? `Delete ${items.find((item) => item.id === form.id)?.itemName ?? "this dish"}?` : "Dish options"}
        description={options === "delete" ? "Customers won’t see it any more. If it’s in a meal plan, change the plan first." : undefined}
        footer={
          options === "delete" ? (
            <>
              <button type="button" className={secondaryActionClass} disabled={busy} onClick={() => setOptions(null)}>
                Cancel
              </button>
              <button type="button" className="craves-primary-action w-full sm:w-auto" aria-busy={busy} disabled={busy} onClick={() => void deleteDish()}>
                {busy ? "Deleting…" : "Delete dish"}
              </button>
            </>
          ) : undefined
        }
      >
        {options === "menu" ? (
          // Sheets open outside the chef page: the theme brings the chef colours along.
          <div className="chef-panel-theme chef-sheet-theme chef-list mt-4 overflow-hidden rounded-xl border border-[#E3E6EA]">
            <button
              type="button"
              className="chef-row w-full !rounded-none !border-0 !bg-transparent text-left"
              onClick={() => {
                const dish = items.find((item) => item.id === form.id);
                setOptions(null);
                if (!dish) return;
                if (!dirty) return start(dish, true);
                copyAfterDiscard.current = dish;
                setConfirmLeave(true);
              }}
            >
              <span className="chef-row-icon"><CopyPlus className="h-5 w-5" aria-hidden="true" /></span>
              <span className="chef-row-main">
                <span className="chef-row-title block">Duplicate dish</span>
                <span className="chef-row-meta block">A new draft with the same details</span>
              </span>
            </button>
            <button type="button" className="chef-row w-full !rounded-none !border-0 !bg-transparent text-left" onClick={() => setOptions("delete")}>
              <span className="chef-row-icon text-[#C4200F]"><Trash2 className="h-5 w-5" aria-hidden="true" /></span>
              <span className="chef-row-main"><span className="chef-row-title block text-[#C4200F]">Delete dish</span></span>
            </button>
          </div>
        ) : null}
      </Sheet>
      <Dialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={form.id ? "Discard your changes?" : "Discard this dish?"}
        description="What you added here will be lost."
        footer={
          <>
            <button
              type="button"
              className={secondaryActionClass}
              onClick={() => {
                const dish = copyAfterDiscard.current;
                if (dish) {
                  setConfirmLeave(false);
                  start(dish, true);
                } else closeEditor();
              }}
            >
              Discard
            </button>
            <button
              type="button"
              className="craves-primary-action w-full sm:w-auto"
              onClick={() => setConfirmLeave(false)}
            >
              Keep editing
            </button>
          </>
        }
      />
    </motion.form>
    )}
    {feedback}
    </>
  );
}
