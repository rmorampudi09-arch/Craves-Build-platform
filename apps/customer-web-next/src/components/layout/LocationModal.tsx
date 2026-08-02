import { useState } from "react";
import { X, MapPin, LocateFixed, Loader2 } from "lucide-react";
import { saveAddress, type CravesAddress } from "@/services/auth/cravesAuth";
interface LocationModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (addr: CravesAddress) => void;
}
export function LocationModal({ open, onClose, onSaved }: LocationModalProps) {
  const [form, setForm] = useState<CravesAddress>({
    hno: "",
    street: "",
    city: "",
    mandal: "",
    district: "",
    pincode: "",
  });
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  const set = (k: keyof CravesAddress) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const useLiveLocation = () => {
    setError(null);
    if (!("geolocation" in navigator)) {
      return setError("Geolocation is not supported by this browser.");
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setForm((current) => ({ ...current, lat: latitude, lng: longitude }));
        setError("Location captured. Confirm the address fields before saving.");
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(err.message || "Could not access your location.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.hno || !form.city || !form.mandal || !form.district) {
      return setError("Please fill H.No, City, Mandal and District.");
    }
    saveAddress(form);
    onSaved?.(form);
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <MapPin className="h-5 w-5 text-primary" /> Delivery Address
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink hover:bg-black/5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-6 py-6">
          <button
            type="button"
            onClick={useLiveLocation}
            disabled={locating}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
            {locating ? "Fetching your location…" : "Use my live location"}
          </button>
          <div className="relative flex items-center gap-3 py-1 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> OR ENTER MANUALLY{" "}
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="H.No / Flat" value={form.hno} onChange={set("hno")} required />
            <Field label="Street / Area" value={form.street ?? ""} onChange={set("street")} />
            <Field label="City" value={form.city} onChange={set("city")} required />
            <Field label="Mandal" value={form.mandal} onChange={set("mandal")} required />
            <Field label="District" value={form.district} onChange={set("district")} required />
            <Field
              label="Pincode"
              value={form.pincode ?? ""}
              onChange={set("pincode")}
              inputMode="numeric"
              maxLength={6}
            />
          </div>
          {form.lat && form.lng && (
            <p className="text-[11px] text-muted-foreground">
              📍 {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
            </p>
          )}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary w-full justify-center rounded-lg py-3 text-base"
          >
            Save Address
          </button>
        </form>
      </div>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  required,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  inputMode?: "numeric" | "text";
  maxLength?: number;
}) {
  return (
    <label className="text-xs font-medium text-ink">
      {label}
      {required && <span className="text-primary"> *</span>}
      <input
        type="text"
        value={value}
        onChange={onChange}
        inputMode={inputMode}
        maxLength={maxLength}
        className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    </label>
  );
}
