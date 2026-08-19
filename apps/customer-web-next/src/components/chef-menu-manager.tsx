"use client";

import { ImagePlus, Plus, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChefMenuItem, ChefMenuItemInput, FoodType, MenuItemStatus, SpiceLevel } from "@/lib/chef-menu-contract";

type FormState = {
  id: string | null;
  itemName: string;
  description: string;
  category: string;
  foodType: FoodType;
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

type MenuFilter = "ALL" | "AVAILABLE" | "UNAVAILABLE";

const EMPTY: FormState = {
  id: null,
  itemName: "",
  description: "",
  category: "",
  foodType: "VEG",
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

const INPUT_CLASS = "mt-2 w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1A1A1A] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function toForm(item: ChefMenuItem): FormState {
  return {
    id: item.id,
    itemName: item.itemName,
    description: item.description ?? "",
    category: item.category,
    foodType: item.foodType,
    price: String(item.price),
    currency: item.currency,
    servesCount: item.servesCount === null ? "" : String(item.servesCount),
    preparationTimeMinutes: item.preparationTimeMinutes === null ? "" : String(item.preparationTimeMinutes),
    spiceLevel: item.spiceLevel ?? "",
    unitPackageWeightGrams: String(item.unitPackageWeightGrams),
    thermoboxRequired: item.thermoboxRequired,
    available: item.available,
    status: item.status,
  };
}

function toInput(form: FormState): ChefMenuItemInput {
  return {
    itemName: form.itemName,
    description: form.description || null,
    category: form.category,
    foodType: form.foodType,
    price: Number(form.price),
    currency: form.currency,
    servesCount: form.servesCount ? Number(form.servesCount) : null,
    preparationTimeMinutes: form.preparationTimeMinutes ? Number(form.preparationTimeMinutes) : null,
    spiceLevel: form.spiceLevel || null,
    unitPackageWeightGrams: Number(form.unitPackageWeightGrams),
    thermoboxRequired: form.thermoboxRequired,
    available: form.available,
    status: form.status,
  };
}

function primaryImage(item: ChefMenuItem) {
  return item.images.find(image => image.primary) ?? item.images[0] ?? null;
}

function formatPrice(item: ChefMenuItem) {
  return item.currency === "INR" ? `₹${item.price.toFixed(2)}` : `${item.currency} ${item.price.toFixed(2)}`;
}

export function ChefMenuManager() {
  const [items, setItems] = useState<ChefMenuItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [filter, setFilter] = useState<MenuFilter>("ALL");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<ChefMenuItem[] | null> => {
    setLoading(true);
    try {
      const response = await fetch("/api/chef/menu", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(response.status === 403 ? "An approved chef kitchen is required." : "Menu is temporarily unavailable.");
      }
      const next = Array.isArray(body) ? (body as ChefMenuItem[]) : [];
      setItems(next);
      return next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Menu is temporarily unavailable.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  function update<K extends keyof FormState>(name: K, value: FormState[K]) {
    setForm(current => ({ ...current, [name]: value }));
  }

  function startNewDish() {
    setForm(EMPTY);
    setImageFile(null);
    setMessage("");
  }

  function editDish(item: ChefMenuItem) {
    setForm(toForm(item));
    setImageFile(null);
    setMessage("");
  }

  function validateImage() {
    if (!imageFile) return null;
    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) return "Use a JPG, PNG or WebP dish image.";
    if (imageFile.size > MAX_IMAGE_BYTES) return "Dish images must be under 10 MB.";
    return null;
  }

  async function uploadSelectedImage(menuItemId: string): Promise<string | null> {
    if (!imageFile) return null;

    try {
      const data = new FormData();
      data.set("file", imageFile);
      data.set("primary", "true");
      const response = await fetch(`/api/chef/menu/${menuItemId}/images`, { method: "POST", body: data });
      if (!response.ok) return "Image upload failed. Use JPG, PNG or WebP under 10 MB.";
      return null;
    } catch {
      return "Image upload failed. Please try attaching the image again.";
    }
  }

  async function save() {
    const imageError = validateImage();
    if (imageError) {
      setMessage(imageError);
      return;
    }

    if (!form.itemName.trim() || !form.category.trim() || !form.price.trim() || !form.currency.trim() || !form.unitPackageWeightGrams.trim()) {
      setMessage("Complete the required dish fields before saving.");
      return;
    }

    setBusy(true);
    setMessage(form.id ? "Saving dish changes…" : "Adding dish…");

    try {
      const editing = Boolean(form.id);
      const response = await fetch(form.id ? `/api/chef/menu/${form.id}` : "/api/chef/menu", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toInput(form)),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(response.status === 400 ? "Complete the required dish fields using valid values." : "Menu item could not be saved.");
      }

      const saved = body as ChefMenuItem;
      const uploadError = await uploadSelectedImage(saved.id);
      const refreshedItems = await load();
      const refreshed = refreshedItems?.find(item => item.id === saved.id) ?? saved;
      setForm(toForm(refreshed));
      setImageFile(null);
      setMessage(uploadError ?? (editing ? "Dish changes saved." : "Dish added to your menu."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Menu item could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const selectedItem = form.id ? items.find(item => item.id === form.id) ?? null : null;
  const existingImage = selectedItem ? primaryImage(selectedItem) : null;
  const displayImageUrl = imagePreviewUrl || existingImage?.publicUrl || "";

  const filteredItems = useMemo(() => {
    if (filter === "AVAILABLE") return items.filter(item => item.available);
    if (filter === "UNAVAILABLE") return items.filter(item => !item.available);
    return items;
  }, [filter, items]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[28px] border border-[#E5E7EB] bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#F62E18]">Your dishes</p>
            <h2 className="mt-1 text-2xl font-black text-[#1A1A1A]">Menu</h2>
            <p className="mt-1 text-sm text-[#6B6B6B]">{items.length} {items.length === 1 ? "dish" : "dishes"}</p>
          </div>
          <button
            type="button"
            onClick={startNewDish}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F62E18] px-4 py-2 text-sm font-black text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add dish
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-[#F1F3F5] p-1">
          {([
            ["ALL", "All"],
            ["AVAILABLE", "Available"],
            ["UNAVAILABLE", "Unavailable"],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${filter === value ? "bg-white text-[#F62E18] shadow-sm" : "text-[#6B6B6B] hover:text-[#1A1A1A]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {message ? (
          <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] px-4 py-3 text-sm font-semibold text-[#6B6B6B]">
            {message}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {loading ? <p className="py-8 text-center text-sm text-[#6B6B6B]">Loading menu…</p> : null}
          {!loading && filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E5E7EB] px-5 py-10 text-center">
              <UtensilsCrossed className="mx-auto h-6 w-6 text-[#F62E18]" aria-hidden="true" />
              <p className="mt-3 font-bold text-[#1A1A1A]">No dishes here yet</p>
              <p className="mt-1 text-sm text-[#6B6B6B]">Add a dish or choose another availability filter.</p>
            </div>
          ) : null}

          {filteredItems.map(item => {
            const image = primaryImage(item);
            const selected = form.id === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => editDish(item)}
                className={`w-full rounded-2xl border bg-white p-3 text-left transition ${selected ? "border-[#F62E18] ring-2 ring-[#F62E18]/10" : "border-[#E5E7EB] hover:border-[#F62E18]/50"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#F1F3F5]">
                    {image?.publicUrl ? (
                      <img src={image.publicUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImagePlus className="h-5 w-5 text-[#F62E18]" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-[#1A1A1A]">{item.itemName}</p>
                        <p className="mt-1 text-sm text-[#6B6B6B]">{item.category} · {item.foodType.replace("_", "-")}</p>
                      </div>
                      <span className="shrink-0 text-sm font-black text-[#1A1A1A]">{formatPrice(item)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className={`rounded-full px-2.5 py-1 ${item.available ? "bg-[#F62E18]/10 text-[#F62E18]" : "bg-[#F1F3F5] text-[#6B6B6B]"}`}>
                        {item.available ? "Available" : "Unavailable"}
                      </span>
                      <span className="rounded-full bg-[#F1F3F5] px-2.5 py-1 text-[#6B6B6B]">{item.status}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[28px] border border-[#E5E7EB] bg-white p-5 md:p-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#F62E18]">{form.id ? "Edit dish" : "Add dish"}</p>
          <h2 className="mt-1 text-2xl font-black text-[#1A1A1A]">{form.id ? form.itemName || "Dish details" : "Create a new dish"}</h2>
          <p className="mt-1 text-sm text-[#6B6B6B]">Keep the dish details and customer-facing image together.</p>
        </div>

        <div className="mt-5 rounded-2xl border border-dashed border-[#D1D5DB] bg-[#F1F3F5] p-4">
          <div className="overflow-hidden rounded-2xl bg-white">
            {displayImageUrl ? (
              <img src={displayImageUrl} alt="Dish preview" className="h-48 w-full object-cover md:h-56" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center px-6 text-center md:h-56">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F5]">
                  <ImagePlus className="h-6 w-6 text-[#F62E18]" aria-hidden="true" />
                </div>
                <p className="mt-3 font-black text-[#1A1A1A]">Attach a dish image</p>
                <p className="mt-1 text-sm text-[#6B6B6B]">JPG, PNG or WebP · maximum 10 MB</p>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1A1A1A]">Dish image</p>
              <p className="truncate text-xs text-[#6B6B6B]">{imageFile?.name ?? (existingImage ? "Current primary image" : "No image attached")}</p>
            </div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-black text-[#1A1A1A] transition hover:border-[#F62E18] hover:text-[#F62E18]">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {existingImage || imageFile ? "Replace image" : "Upload image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => setImageFile(event.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-[#1A1A1A]">
            Dish name *
            <input value={form.itemName} onChange={event => update("itemName", event.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Category *
            <input value={form.category} onChange={event => update("category", event.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="text-sm font-bold text-[#1A1A1A] md:col-span-2">
            Description
            <textarea value={form.description} onChange={event => update("description", event.target.value)} rows={4} className={INPUT_CLASS} />
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Food type
            <select value={form.foodType} onChange={event => update("foodType", event.target.value as FoodType)} className={INPUT_CLASS}>
              <option value="VEG">Veg</option>
              <option value="NON_VEG">Non-veg</option>
              <option value="EGG">Egg</option>
            </select>
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Spice level
            <select value={form.spiceLevel} onChange={event => update("spiceLevel", event.target.value as SpiceLevel | "")} className={INPUT_CLASS}>
              <option value="">Not specified</option>
              <option value="MILD">Mild</option>
              <option value="MEDIUM">Medium</option>
              <option value="SPICY">Spicy</option>
            </select>
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Price *
            <input inputMode="decimal" value={form.price} onChange={event => update("price", event.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Currency *
            <input value={form.currency} onChange={event => update("currency", event.target.value.toUpperCase())} maxLength={3} className={INPUT_CLASS} />
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Serves count
            <input inputMode="numeric" value={form.servesCount} onChange={event => update("servesCount", event.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Preparation minutes
            <input inputMode="numeric" value={form.preparationTimeMinutes} onChange={event => update("preparationTimeMinutes", event.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Package weight grams *
            <input inputMode="numeric" value={form.unitPackageWeightGrams} onChange={event => update("unitPackageWeightGrams", event.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="text-sm font-bold text-[#1A1A1A]">
            Status
            <select value={form.status} onChange={event => update("status", event.target.value as MenuItemStatus)} className={INPUT_CLASS}>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] px-4 py-3">
            <span>
              <span className="block text-sm font-black text-[#1A1A1A]">Available now</span>
              <span className="block text-xs text-[#6B6B6B]">Customers can order this dish.</span>
            </span>
            <input type="checkbox" checked={form.available} onChange={event => update("available", event.target.checked)} className="h-5 w-5 accent-[#F62E18]" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] px-4 py-3">
            <span>
              <span className="block text-sm font-black text-[#1A1A1A]">Thermobox required</span>
              <span className="block text-xs text-[#6B6B6B]">Keep the existing packaging requirement.</span>
            </span>
            <input type="checkbox" checked={form.thermoboxRequired} onChange={event => update("thermoboxRequired", event.target.checked)} className="h-5 w-5 accent-[#F62E18]" />
          </label>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#F62E18] px-6 py-3 font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : form.id ? "Save changes" : "Add dish"}
        </button>
      </section>
    </div>
  );
}
