"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ImagePlus,
  Plus,
  UtensilsCrossed,
} from "lucide-react";
import type {
  ChefMenuItem,
  ChefMenuItemInput,
  FoodType,
  MenuItemStatus,
  SpiceLevel,
} from "@/lib/chef-menu-contract";

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

type DishStep = "list" | "about" | "price" | "prep" | "photo" | "review" | "success";

const EMPTY: FormState = {
  id: null,
  itemName: "",
  description: "",
  category: "",
  foodType: "VEG",
  price: "",
  currency: "INR",
  servesCount: "",
  preparationTimeMinutes: "30",
  spiceLevel: "",
  unitPackageWeightGrams: "",
  thermoboxRequired: false,
  available: false,
  status: "DRAFT",
};

const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#1A1A1A] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#F62E18] focus:ring-2 focus:ring-[#F62E18]/10";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PREP_CHOICES = [15, 30, 45, 60] as const;

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
    preparationTimeMinutes:
      item.preparationTimeMinutes === null ? "30" : String(item.preparationTimeMinutes),
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
    preparationTimeMinutes: form.preparationTimeMinutes
      ? Number(form.preparationTimeMinutes)
      : null,
    spiceLevel: form.spiceLevel || null,
    unitPackageWeightGrams: Number(form.unitPackageWeightGrams),
    thermoboxRequired: form.thermoboxRequired,
    available: form.available,
    status: form.status,
  };
}

function primaryImage(item: ChefMenuItem) {
  return item.images.find((image) => image.primary) ?? item.images[0] ?? null;
}

function formatPrice(item: ChefMenuItem) {
  return item.currency === "INR"
    ? `₹${item.price.toFixed(2)}`
    : `${item.currency} ${item.price.toFixed(2)}`;
}

function StepHeader({
  label,
  onBack,
}: {
  label: string;
  onBack: () => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#F1F3F5]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>
      <p className="text-sm font-semibold text-[#6B6B6B]">Add a dish · {label}</p>
    </div>
  );
}

function FoodTypeChoice({
  value,
  selected,
  onSelect,
}: {
  value: FoodType;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = value === "NON_VEG" ? "Non-veg" : value === "EGG" ? "Egg" : "Veg";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`min-h-12 rounded-2xl border px-4 text-sm font-semibold transition ${
        selected
          ? "border-[#F62E18] bg-[#F62E18]/5 text-[#F62E18] ring-2 ring-[#F62E18]/10"
          : "border-[#E5E7EB] bg-white text-[#1A1A1A]"
      }`}
    >
      {label}
    </button>
  );
}

export function ChefMenuManager() {
  const [items, setItems] = useState<ChefMenuItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<DishStep>("list");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedDishName, setSavedDishName] = useState("");
  const [savedAvailable, setSavedAvailable] = useState(false);

  const load = useCallback(async (): Promise<ChefMenuItem[] | null> => {
    setLoading(true);
    try {
      const response = await fetch("/api/chef/menu", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Finish setting up your approved kitchen before adding dishes."
            : "We couldn’t load your menu right now.",
        );
      }
      const next = Array.isArray(body) ? (body as ChefMenuItem[]) : [];
      setItems(next);
      return next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn’t load your menu right now.");
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
    setForm((current) => ({ ...current, [name]: value }));
  }

  function go(next: DishStep) {
    setMessage("");
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startNewDish() {
    setForm(EMPTY);
    setImageFile(null);
    setSavedDishName("");
    go("about");
  }

  function editDish(item: ChefMenuItem) {
    setForm(toForm(item));
    setImageFile(null);
    setSavedDishName("");
    go("about");
  }

  function validateImage() {
    if (!imageFile) return null;
    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      return "Please choose a JPG, PNG, or WebP dish photo.";
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return "This photo is too large. Please choose one under 10 MB.";
    }
    return null;
  }

  function continueAbout() {
    if (!form.itemName.trim()) {
      setMessage("What is this dish called?");
      return;
    }
    if (!form.category.trim()) {
      setMessage("Please choose or type a simple category for this dish.");
      return;
    }
    go("price");
  }

  function continuePrice() {
    const price = Number(form.price);
    const serves = form.servesCount ? Number(form.servesCount) : null;
    if (!Number.isFinite(price) || price <= 0) {
      setMessage("Please enter the price customers should pay for this dish.");
      return;
    }
    if (serves !== null && (!Number.isInteger(serves) || serves <= 0)) {
      setMessage("If you add a serves count, use a whole number like 1 or 2.");
      return;
    }
    go("prep");
  }

  function continuePrep() {
    const prep = Number(form.preparationTimeMinutes);
    const weight = Number(form.unitPackageWeightGrams);
    if (!Number.isInteger(prep) || prep < 1 || prep > 1_440) {
      setMessage("Please choose how many minutes you usually need to prepare this dish.");
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setMessage("Please add the approximate packed weight in grams. This helps pickup handling.");
      return;
    }
    go("photo");
  }

  function selectImage(file: File | null) {
    setImageFile(file);
    setMessage("");
    if (!file) return;
    const error = !ALLOWED_IMAGE_TYPES.has(file.type)
      ? "Please choose a JPG, PNG, or WebP dish photo."
      : file.size > MAX_IMAGE_BYTES
        ? "This photo is too large. Please choose one under 10 MB."
        : "";
    if (error) setMessage(error);
  }

  async function uploadSelectedImage(menuItemId: string): Promise<string | null> {
    if (!imageFile) return null;
    try {
      const data = new FormData();
      data.set("file", imageFile);
      data.set("primary", "true");
      const response = await fetch(`/api/chef/menu/${menuItemId}/images`, {
        method: "POST",
        body: data,
      });
      if (!response.ok) {
        return "The dish was saved, but the photo did not upload. Open the dish and try the photo again.";
      }
      return null;
    } catch {
      return "The dish was saved, but the photo did not upload. Open the dish and try the photo again.";
    }
  }

  function setAvailableNow(next: boolean) {
    setForm((current) => ({
      ...current,
      available: next,
      status: next
        ? "ACTIVE"
        : current.id && current.status === "ACTIVE"
          ? "INACTIVE"
          : current.status,
    }));
  }

  async function save() {
    const imageError = validateImage();
    if (imageError) {
      setMessage(imageError);
      return;
    }
    if (
      !form.itemName.trim() ||
      !form.category.trim() ||
      !form.price.trim() ||
      !form.currency.trim() ||
      !form.unitPackageWeightGrams.trim()
    ) {
      setMessage("One dish detail is still missing. Go back and check the steps above.");
      return;
    }

    setBusy(true);
    setMessage("Saving your dish…");
    try {
      const editing = Boolean(form.id);
      const response = await fetch(form.id ? `/api/chef/menu/${form.id}` : "/api/chef/menu", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toInput(form)),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 400
            ? "Please check the dish details and try again."
            : "We couldn’t save this dish. Please try again.",
        );
      }
      const saved = body as ChefMenuItem;
      const uploadError = await uploadSelectedImage(saved.id);
      await load();
      setSavedDishName(saved.itemName);
      setSavedAvailable(saved.available && saved.status === "ACTIVE");
      setImageFile(null);
      setMessage(uploadError ?? (editing ? "Your changes are saved." : "Your dish is saved."));
      setStep("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn’t save this dish. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedItem = form.id ? items.find((item) => item.id === form.id) ?? null : null;
  const existingImage = selectedItem ? primaryImage(selectedItem) : null;
  const displayImageUrl = imagePreviewUrl || existingImage?.publicUrl || "";

  if (step === "list") {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-[#F62E18]">Your menu</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#1A1A1A]">What are you cooking?</h1>
          <p className="mt-2 text-sm text-[#6B6B6B]">Keep your dishes simple and easy for customers to understand.</p>
        </div>
        {message ? <p role="status" className="rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
        {loading ? (
          <div className="h-48 animate-pulse rounded-3xl bg-[#F1F3F5]" />
        ) : items.length === 0 ? (
          <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><UtensilsCrossed className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
            <h2 className="mt-5 text-2xl font-bold text-[#1A1A1A]">Add your first dish</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B6B6B]">Start with one dish you’re comfortable making. We’ll ask only the details customers need.</p>
            <button type="button" onClick={startNewDish} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white sm:w-auto"><Plus className="h-4 w-4" aria-hidden="true" /> Add a dish</button>
          </section>
        ) : (
          <section className="rounded-3xl border border-[#E5E7EB] bg-white p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-xl font-bold text-[#1A1A1A]">Your dishes</h2><p className="mt-1 text-sm text-[#6B6B6B]">Tap a dish to change it.</p></div>
              <button type="button" onClick={startNewDish} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#F62E18] px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" aria-hidden="true" /> Add dish</button>
            </div>
            <div className="mt-5 space-y-3">
              {items.map((item) => {
                const image = primaryImage(item);
                return (
                  <button key={item.id} type="button" onClick={() => editDish(item)} className="w-full rounded-2xl border border-[#E5E7EB] bg-white p-3 text-left transition hover:border-[#F62E18]/50">
                    <div className="flex items-center gap-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-[#F1F3F5]">
                        {image?.publicUrl ? <img src={image.publicUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <div className="flex h-full w-full items-center justify-center"><ImagePlus className="h-5 w-5 text-[#F62E18]" aria-hidden="true" /></div>}
                      </div>
                      <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold text-[#1A1A1A]">{item.itemName}</p><p className="mt-1 text-sm text-[#6B6B6B]">{item.category} · {item.foodType === "NON_VEG" ? "Non-veg" : item.foodType === "EGG" ? "Egg" : "Veg"}</p></div><span className="shrink-0 font-bold text-[#1A1A1A]">{formatPrice(item)}</span></div><p className="mt-3 text-xs font-semibold text-[#6B6B6B]">{item.available && item.status === "ACTIVE" ? "Customers can order this" : "Not available right now"}</p></div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  if (step === "about") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader label="About it" onBack={() => go("list")} />
        <span className="mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><UtensilsCrossed className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
        <h1 className="mt-5 text-3xl font-bold text-[#1A1A1A]">What are you cooking?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Use the name a customer would naturally use for this food.</p>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-[#1A1A1A]">Dish name<input value={form.itemName} onChange={(event) => update("itemName", event.target.value)} className={INPUT_CLASS} placeholder="Example: Vegetable biryani" /></label>
          <label className="block text-sm font-semibold text-[#1A1A1A]">Category<input list="chef-dish-categories" value={form.category} onChange={(event) => update("category", event.target.value)} className={INPUT_CLASS} placeholder="Rice, Curry, Snack…" /><datalist id="chef-dish-categories"><option value="Rice" /><option value="Bread" /><option value="Curry" /><option value="Snack" /><option value="Sweet" /></datalist></label>
          <div><p className="text-sm font-semibold text-[#1A1A1A]">Food type</p><div className="mt-2 grid grid-cols-3 gap-2">{(["VEG", "NON_VEG", "EGG"] as FoodType[]).map((value) => <FoodTypeChoice key={value} value={value} selected={form.foodType === value} onSelect={() => update("foodType", value)} />)}</div></div>
          <label className="block text-sm font-semibold text-[#1A1A1A]">Short description <span className="font-normal text-[#6B6B6B]">(optional)</span><textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={3} className={INPUT_CLASS} placeholder="What makes this dish special?" /></label>
        </div>
        {message ? <p role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" onClick={continueAbout} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "price") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader label="Price" onBack={() => go("about")} />
        <h1 className="mt-7 text-3xl font-bold text-[#1A1A1A]">How much should it cost?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Enter the price for one order. You can also tell customers how many people it usually serves.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-[#1A1A1A]">Price ({form.currency})<input inputMode="decimal" value={form.price} onChange={(event) => update("price", event.target.value)} className={INPUT_CLASS} placeholder="180" /></label>
          <label className="text-sm font-semibold text-[#1A1A1A]">Serves <span className="font-normal text-[#6B6B6B]">(optional)</span><input inputMode="numeric" value={form.servesCount} onChange={(event) => update("servesCount", event.target.value)} className={INPUT_CLASS} placeholder="2" /></label>
        </div>
        {form.price ? <p className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#1A1A1A]">Customers will see: <strong>{form.currency === "INR" ? "₹" : `${form.currency} `}{form.price}{form.servesCount ? ` · serves ${form.servesCount}` : ""}</strong></p> : null}
        <details className="mt-4 rounded-2xl bg-[#F1F3F5] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">Currency</summary><label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Currency code<input value={form.currency} onChange={(event) => update("currency", event.target.value.toUpperCase())} maxLength={3} className={INPUT_CLASS} /></label></details>
        {message ? <p role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" onClick={continuePrice} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "prep") {
    const prepNumber = Number(form.preparationTimeMinutes);
    const standardPrep = PREP_CHOICES.includes(prepNumber as (typeof PREP_CHOICES)[number]);
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader label="Cooking time" onBack={() => go("price")} />
        <h1 className="mt-7 text-3xl font-bold text-[#1A1A1A]">How long does it usually take?</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">Choose the time you can comfortably prepare and pack this dish.</p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{PREP_CHOICES.map((minutes) => <button key={minutes} type="button" onClick={() => update("preparationTimeMinutes", String(minutes))} className={`min-h-16 rounded-2xl border text-lg font-bold ${prepNumber === minutes ? "border-[#F62E18] text-[#F62E18] ring-2 ring-[#F62E18]/10" : "border-[#E5E7EB] text-[#1A1A1A]"}`}>{minutes} min</button>)}</div>
        <label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Another time <span className="font-normal text-[#6B6B6B]">(minutes)</span><input inputMode="numeric" value={standardPrep ? "" : form.preparationTimeMinutes} onChange={(event) => update("preparationTimeMinutes", event.target.value)} className={INPUT_CLASS} placeholder="Example: 20" /></label>
        <details className="mt-5 rounded-2xl bg-[#F1F3F5] p-4" open={!form.unitPackageWeightGrams}>
          <summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">Packing details</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[#1A1A1A]">Approx. packed weight (grams)<input inputMode="numeric" value={form.unitPackageWeightGrams} onChange={(event) => update("unitPackageWeightGrams", event.target.value)} className={INPUT_CLASS} placeholder="500" /></label>
            <label className="text-sm font-semibold text-[#1A1A1A]">Spice level <span className="font-normal text-[#6B6B6B]">(optional)</span><select value={form.spiceLevel} onChange={(event) => update("spiceLevel", event.target.value as SpiceLevel | "")} className={INPUT_CLASS}><option value="">Not specified</option><option value="MILD">Mild</option><option value="MEDIUM">Medium</option><option value="SPICY">Spicy</option></select></label>
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-white p-4"><span><span className="block text-sm font-semibold text-[#1A1A1A]">Thermobox needed</span><span className="block text-xs text-[#6B6B6B]">Keep this on only when this dish needs a thermobox for pickup.</span></span><input type="checkbox" checked={form.thermoboxRequired} onChange={(event) => update("thermoboxRequired", event.target.checked)} className="h-5 w-5 accent-[#F62E18]" /></label>
        </details>
        {message ? <p role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" onClick={continuePrep} className="mt-7 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white">Continue</button>
      </section>
    );
  }

  if (step === "photo") {
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader label="Photo" onBack={() => go("prep")} />
        <h1 className="mt-7 text-3xl font-bold text-[#1A1A1A]">Show customers your dish</h1>
        <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">A clear phone photo in good lighting helps customers know what to expect.</p>
        <div className="mt-6 overflow-hidden rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F1F3F5]">
          {displayImageUrl ? <img src={displayImageUrl} alt="Dish preview" className="h-64 w-full object-contain bg-white" referrerPolicy="no-referrer" /> : <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center px-6 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-white"><ImagePlus className="h-6 w-6 text-[#F62E18]" aria-hidden="true" /></span><p className="mt-3 font-semibold text-[#1A1A1A]">Choose a dish photo</p><p className="mt-1 text-sm text-[#6B6B6B]">JPG, PNG or WebP · under 10 MB</p><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} className="sr-only" /></label>}
        </div>
        {displayImageUrl ? <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[#F62E18]">Choose a different photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImage(event.target.files?.[0] ?? null)} className="sr-only" /></label> : null}
        {message ? <p role="alert" className="mt-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" disabled={Boolean(message)} onClick={() => go("review")} className="mt-6 min-h-12 w-full rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">{displayImageUrl ? "Use this photo" : "Skip for now"}</button>
      </section>
    );
  }

  if (step === "review") {
    const availableNow = form.available && form.status === "ACTIVE";
    return (
      <section className="rounded-3xl border border-[#E5E7EB] bg-white p-6 md:p-9">
        <StepHeader label="Check your dish" onBack={() => go("photo")} />
        <h1 className="mt-7 text-3xl font-bold text-[#1A1A1A]">Ready to put this on your menu?</h1>
        <div className="mt-6 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          {displayImageUrl ? <img src={displayImageUrl} alt="Dish preview" className="h-56 w-full object-cover" referrerPolicy="no-referrer" /> : <div className="flex h-40 items-center justify-center bg-[#F1F3F5]"><ImagePlus className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></div>}
          <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-[#1A1A1A]">{form.itemName}</h2><p className="mt-1 text-sm text-[#6B6B6B]">{form.category} · {form.foodType === "NON_VEG" ? "Non-veg" : form.foodType === "EGG" ? "Egg" : "Veg"}</p></div><p className="font-bold text-[#1A1A1A]">{form.currency === "INR" ? "₹" : `${form.currency} `}{form.price}</p></div>{form.description ? <p className="mt-3 text-sm leading-6 text-[#6B6B6B]">{form.description}</p> : null}<p className="mt-3 text-xs font-semibold text-[#6B6B6B]">Ready in about {form.preparationTimeMinutes} min{form.servesCount ? ` · serves ${form.servesCount}` : ""}</p></div>
        </div>
        <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-[#F1F3F5] p-5"><span><span className="block font-semibold text-[#1A1A1A]">Let customers order this now</span><span className="mt-1 block text-sm text-[#6B6B6B]">Turn this off if you only want to save the dish for later.</span></span><input type="checkbox" checked={availableNow} onChange={(event) => setAvailableNow(event.target.checked)} className="h-5 w-5 accent-[#F62E18]" /></label>
        <details className="mt-4 rounded-2xl bg-[#F1F3F5] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#1A1A1A]">More publishing options</summary><label className="mt-4 block text-sm font-semibold text-[#1A1A1A]">Saved state<select value={form.status} onChange={(event) => update("status", event.target.value as MenuItemStatus)} className={INPUT_CLASS}><option value="DRAFT">Save for later</option><option value="ACTIVE">Active</option><option value="INACTIVE">Not active</option></select></label></details>
        {message ? <p role="alert" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm font-medium text-[#F62E18]">{message}</p> : null}
        <button type="button" disabled={busy} onClick={() => void save()} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#F62E18] px-6 font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : form.id ? "Save changes" : availableNow ? "Put dish on my menu" : "Save dish for later"}{!busy ? <Check className="h-4 w-4" aria-hidden="true" /> : null}</button>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-[#E5E7EB] bg-white p-7 text-center md:p-10">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F3F5]"><Check className="h-7 w-7 text-[#F62E18]" aria-hidden="true" /></span>
      <p className="mt-6 text-sm font-semibold text-[#F62E18]">Dish saved</p>
      <h1 className="mt-1 text-3xl font-bold text-[#1A1A1A]">{savedDishName || "Your dish"} is on your menu</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#6B6B6B]">{savedAvailable ? "Customers can order it while your kitchen is open." : "It is saved and will stay unavailable until you turn it on."}</p>
      {message && !message.includes("saved") ? <p role="status" className="mt-4 rounded-2xl bg-[#F1F3F5] p-4 text-sm text-[#6B6B6B]">{message}</p> : null}
      <div className="mt-7 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => go("list")} className="min-h-12 rounded-full border border-[#F62E18] bg-white px-5 font-semibold text-[#F62E18]">Back to my menu</button><Link href="/chef" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#F62E18] px-5 font-semibold text-white">Go to my home <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></div>
    </section>
  );
}
