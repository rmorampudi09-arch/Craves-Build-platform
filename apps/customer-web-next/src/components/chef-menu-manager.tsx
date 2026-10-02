"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Plus, UtensilsCrossed } from "lucide-react";
import { FaPepperHot } from "react-icons/fa";
import { Button } from "@/components/ui/buttons/button";
import { Input } from "@/components/ui/forms/input";
import { Switch } from "@/components/ui/forms/switch";
import { Skeleton } from "@/components/ui/feedback/skeleton";
import {
  parseChefMenuItem,
  parseChefMenuItems,
  type ChefMenuItem,
  type ChefMenuItemInput,
  type FoodType,
  type MenuItemStatus,
  type SpiceLevel,
} from "@/lib/chef-menu-contract";

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
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FOOD_TYPES = [
  { value: "VEG", label: "Veg", color: "bg-[#2E7D32]" },
  { value: "NON_VEG", label: "Non-Veg", color: "bg-[#F62E18]" },
  { value: "EGG", label: "Egg", color: "bg-[#D99A00]" },
] as const;
const SECTION = "rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6";
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
function primaryImage(item?: ChefMenuItem) {
  return (
    item?.images.find((image) => image.primary)?.publicUrl ?? item?.images[0]?.publicUrl ?? null
  );
}
function apiError(response: Response, body: unknown, fallback: string) {
  const code =
    body &&
    typeof body === "object" &&
    "code" in body &&
    typeof body.code === "string" &&
    /^[A-Z_]{3,80}$/.test(body.code)
      ? body.code
      : "";
  const reason =
    response.status === 401
      ? "Your session has expired. Sign in again to continue."
      : response.status === 403
        ? "Your account or kitchen is not eligible for this action. Check Chef approval, kitchen setup and payout readiness."
        : response.status === 404
          ? "This dish or kitchen could not be found. Reload your menu."
          : response.status === 400
            ? "The service could not accept these details. Check the highlighted fields and packed weight."
            : response.status === 413
              ? "The photo is too large. Choose a photo of 8 MB or less."
              : response.status === 429
                ? "Too many requests. Please wait a moment and try again."
                : fallback;
  return `${reason} (${code || `HTTP ${response.status}`})`;
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
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [uncertainSave, setUncertainSave] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async (initial = false): Promise<boolean> => {
    if (initial) setLoading(true);
    try {
      const response = await fetch("/api/chef/menu", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(apiError(response, body, "Your menu could not be loaded. Please retry."));
      const next = parseChefMenuItems(body);
      if (!next)
        throw new Error("The menu response was incomplete. Please retry. (INVALID_MENU_RESPONSE)");
      setItems(next);
      setLoadError("");
      return true;
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not connect to your menu. Please retry.",
      );
      return false;
    } finally {
      if (initial) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(true);
  }, [load]);
  useEffect(() => {
    if (!imageFile) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  function start(item?: ChefMenuItem) {
    setForm(item ? toForm(item) : EMPTY);
    setImageFile(null);
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
    if (!form.foodType) next.foodType = "Please select Veg, Non-Veg, or Egg.";
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
    if (errors.photo) next.photo = errors.photo;
    setErrors(next);
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
        confirmedRejection = response.status >= 400 && response.status < 500;
        throw new Error(
          apiError(
            response,
            body,
            "The service did not confirm the save. Reload your menu before trying again.",
          ),
        );
      }
      saved = parseChefMenuItem(body);
      if (!saved)
        throw new Error(
          "The service returned an incomplete save response. Reload your menu to check the result. (INVALID_MENU_RESPONSE)",
        );
      upsert(saved);
      setForm(toForm(saved));
      if (imageFile) {
        const data = new FormData();
        data.set("file", imageFile);
        data.set("primary", "true");
        const upload = await fetch(`/api/chef/menu/${saved.id}/images`, {
          method: "POST",
          body: data,
        });
        const imageBody: unknown = await upload.json().catch(() => null);
        if (!upload.ok)
          throw new Error(
            apiError(upload, imageBody, "The photo could not be uploaded. Please retry."),
          );
        if (
          !imageBody ||
          typeof imageBody !== "object" ||
          !("uploaded" in imageBody) ||
          imageBody.uploaded !== true
        )
          throw new Error(
            "The photo upload was not confirmed. Please reload your menu to check it.",
          );
        setImageFile(null);
      }
      setEditing(false);
      setNotice(creating ? "Dish added successfully" : "Dish updated successfully");
      await load();
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Connection interrupted. Please reload your menu to check the result.";
      if (saved) setMessage(`Dish details saved, but the photo was not confirmed. ${detail}`);
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
      if (!response.ok)
        throw new Error(
          apiError(response, body, "Availability was not confirmed. Reload the menu to check it."),
        );
      const updated = parseChefMenuItem(body);
      if (!updated)
        throw new Error(
          "Availability returned an incomplete response. Reload the menu to check it.",
        );
      upsert(updated);
      setNotice(updated.available ? "Dish is now available" : "Dish is now unavailable");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Availability could not be confirmed. Reload the menu to check it.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const displayedPhoto = preview || primaryImage(items.find((item) => item.id === form.id));
  const feedback = (
    <>
      {notice ? (
        <p role="status" className="rounded-xl border border-border bg-white p-4 text-sm shadow-sm">
          {notice}
        </p>
      ) : null}
      {message ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {message}
        </p>
      ) : null}
    </>
  );

  if (!editing)
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Your menu</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage dishes, prices and availability.
            </p>
          </div>
          <Button onClick={() => start()} disabled={loading || busy || !!loadError}>
            <Plus className="size-4" /> Add Dish
          </Button>
        </div>
        {feedback}
        {loadError ? (
          <div role="alert" className={SECTION}>
            <p>{loadError}</p>
            <Button
              className="mt-4"
              variant="outline"
              disabled={busy || loading}
              onClick={() => void load(true)}
            >
              Reload menu
            </Button>
          </div>
        ) : null}
        {loading ? (
          <div
            aria-label="Loading menu"
            role="status"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[1, 2, 3].map((key) => (
              <div key={key} className={SECTION}>
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="mt-4 h-6 w-2/3" />
                <Skeleton className="mt-3 h-5 w-1/2" />
              </div>
            ))}
          </div>
        ) : !loadError && items.length === 0 ? (
          <div className={`${SECTION} py-12 text-center`}>
            <UtensilsCrossed className="mx-auto size-10 text-muted-foreground" />
            <h3 className="mt-4 text-xl font-semibold">Your first dish starts here</h3>
            <p className="mt-2 text-muted-foreground">Share something you love to cook.</p>
            <Button className="mt-5" onClick={() => start()}>
              Add your first dish
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm"
              >
                <div className="flex aspect-[16/10] items-center justify-center bg-muted">
                  {primaryImage(item) ? (
                    <img
                      src={primaryImage(item)!}
                      alt={item.itemName}
                      className="size-full object-cover"
                    />
                  ) : (
                    <UtensilsCrossed className="size-10 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{item.itemName}</h3>
                    <span className="shrink-0 font-semibold">
                      {item.currency === "INR" ? "₹" : `${item.currency} `}
                      {item.price.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FoodIndicator type={item.foodType} />
                    <span className="text-xs text-muted-foreground">
                      {item.status === "DRAFT"
                        ? "Draft"
                        : item.available
                          ? "Available"
                          : "Unavailable"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      aria-label={`Edit ${item.itemName}`}
                      onClick={() => start(item)}
                      disabled={busy}
                    >
                      Edit<span className="sr-only"> {item.itemName}</span>
                    </Button>
                    <label className="flex min-h-12 items-center gap-2 text-sm">
                      <span>Available</span>
                      <Switch
                        aria-label={`Availability for ${item.itemName}`}
                        checked={item.available && item.status === "ACTIVE"}
                        disabled={busy || item.status !== "ACTIVE"}
                        onCheckedChange={(value) => void setAvailability(item, value)}
                      />
                    </label>
                  </div>
                  {item.status !== "ACTIVE" ? (
                    <p className="text-xs text-muted-foreground">
                      Edit this dish and turn on Currently Available to publish it.
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );

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
                Dish photo{" "}
                <span className="text-sm font-normal text-muted-foreground">Optional</span>
              </label>
              <p className="mt-1 text-sm text-muted-foreground">
                JPEG, PNG or WebP, up to 8 MB. A photo helps customers choose your dish.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {displayedPhoto ? (
                  <img
                    src={displayedPhoto}
                    alt="Dish preview"
                    className="size-28 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex size-28 items-center justify-center rounded-xl bg-muted">
                    <ImagePlus className="size-8 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Input
                    {...fieldProps("photo")}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={`${CONTROL} pt-3`}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (
                        !IMAGE_TYPES.has(file.type) ||
                        file.size === 0 ||
                        file.size > MAX_IMAGE_BYTES
                      ) {
                        setErrors((current) => ({
                          ...current,
                          photo: "Choose a JPEG, PNG or WebP photo up to 8 MB.",
                        }));
                        event.target.value = "";
                        return;
                      }
                      setErrors((current) => ({ ...current, photo: undefined }));
                      setImageFile(file);
                    }}
                  />
                  {imageFile ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-1"
                      onClick={() => {
                        setImageFile(null);
                        const input = document.getElementById(
                          "dish-photo",
                        ) as HTMLInputElement | null;
                        if (input) input.value = "";
                      }}
                    >
                      Remove selected photo
                    </Button>
                  ) : displayedPhoto ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Choose a new photo to replace the primary photo.
                    </p>
                  ) : null}
                </div>
              </div>
              {errorText("photo")}
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
                    className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 focus-within:ring-2 focus-within:ring-[var(--color-flame-red)]/30 ${form.foodType === food.value ? "border-[var(--color-flame-red)] bg-[var(--color-flame-red)]/5" : "border-border"} ${errors.foodType ? "border-destructive" : ""}`}
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
                Enable if this dish needs insulated delivery.
              </span>
            </span>
            <Switch
              checked={form.thermoboxRequired}
              onCheckedChange={(value) => update("thermoboxRequired", value)}
            />
          </label>
          <label className="mt-4 flex min-h-12 items-center justify-between gap-4 border-t border-border pt-4">
            <span>
              <span className="block font-medium">Currently Available</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {form.available
                  ? "Publish this dish and make it available to order."
                  : form.status === "DRAFT"
                    ? "Save as a draft until you are ready to serve."
                    : "Customers cannot order this dish while unavailable."}
              </span>
            </span>
            <Switch
              checked={form.available}
              onCheckedChange={(value) => {
                update("available", value);
                update("status", value ? "ACTIVE" : form.status);
              }}
            />
          </label>
        </section>
        <div className="flex flex-wrap gap-3 pb-4">
          <Button type="submit" className="flex-1" disabled={busy || uncertainSave}>
            {busy ? "Saving…" : "Save Dish"}
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
