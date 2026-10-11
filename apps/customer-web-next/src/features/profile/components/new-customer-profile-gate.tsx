"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  captureSessionContext,
  getSession,
  isSessionContextCurrent,
  isSessionReady,
  setSessionProfile,
  subscribeSession,
} from "@/features/auth/api/cravesAuth";
import { parseCustomerProfile } from "@/features/profile/lib/profile-contract";
import { EmailVerificationPanel } from "@/features/sign-in/components/EmailVerificationPanel";
import { Sheet } from "@/shared/ui/overlays/overlay";

// Customer pages only: sign-in, Chef Mode, the admin portal and the legal pages never ask.
const SKIP = ["/sign-in", "/chef", "/admin", "/privacy", "/terms", "/security", "/refunds-cancellations", "/contact", "/products-pricing", "/pilot-launch"];
const FIELD =
  "mt-2 block min-h-12 w-full rounded-xl border border-[#D3D7DD] bg-white px-4 text-base text-[#1A1A1A] placeholder:text-[#8A8F98] focus:!border-[#1A1A1A] focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] aria-[invalid=true]:!border-[#C4200F] disabled:bg-[#F1F3F5]";

/**
 * A customer who has just signed in for the first time names themselves before going on:
 * first and last name are required (chefs see them on orders), email is optional.
 * The customer profile is the customer's own; nothing is copied from a chef application.
 */
export function NewCustomerProfileGate() {
  const pathname = usePathname() ?? "";
  const user = useSyncExternalStore(subscribeSession, getSession, () => null);
  const [missingFor, setMissingFor] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const id = useId();
  const skipped = SKIP.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const candidate =
    user && !user.profileComplete && user.status === "ACTIVE" && user.roles.some((role) => role.toUpperCase() === "CUSTOMER")
      ? user.id
      : null;

  useEffect(() => {
    if (!candidate || skipped || !isSessionReady()) return;
    let active = true;
    const context = captureSessionContext();
    void fetch("/api/customer/profile", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!active || !response.ok || !isSessionContextCurrent(context)) return;
        const raw: unknown = await response.json().catch(() => undefined);
        // The profile service answers null for an account that has no customer profile yet.
        if (raw === null) setMissingFor(candidate);
        else {
          const profile = parseCustomerProfile(raw);
          if (profile) setSessionProfile(profile, context);
        }
      })
      // An outage never blocks the page; the question comes back on the next visit.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [candidate, skipped, user]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const first = firstName.trim();
    const last = lastName.trim();
    const next = {
      ...(first.length < 2 ? { firstName: "Enter your first name (at least 2 letters)." } : {}),
      ...(!last ? { lastName: "Enter your last name." } : {}),
    };
    setErrors(next);
    if (next.firstName || next.lastName) {
      document.getElementById(next.firstName ? `${id}-first` : `${id}-last`)?.focus();
      return;
    }
    setBusy(true);
    const context = captureSessionContext();
    try {
      const response = await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ firstName: first, lastName: last }),
      });
      const profile = response.ok ? parseCustomerProfile(await response.json().catch(() => null)) : null;
      if (!profile) throw new Error("We couldn’t save your name. Check your connection and try again.");
      if (isSessionContextCurrent(context)) setSessionProfile(profile, context);
      setMissingFor(null);
    } catch (failure) {
      setErrors({ form: failure instanceof Error ? failure.message : "We couldn’t save your name. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const open = Boolean(candidate && missingFor === candidate && !skipped);
  return (
    <Sheet
      open={open}
      onOpenChange={() => undefined}
      dismissible={false}
      title="Welcome to Craves"
      description="Tell us your name. Chefs see it on your orders."
      footer={
        <button type="submit" form={`${id}-form`} className="craves-primary-action w-full" aria-busy={busy} disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
      }
    >
      <form id={`${id}-form`} noValidate onSubmit={(event) => void save(event)} className="mt-5 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-first`} className="text-sm font-semibold text-[#1A1A1A]">
              First name
            </label>
            <input
              id={`${id}-first`}
              value={firstName}
              autoComplete="given-name"
              maxLength={100}
              required
              disabled={busy}
              aria-invalid={Boolean(errors.firstName)}
              aria-describedby={errors.firstName ? `${id}-first-error` : undefined}
              onChange={(event) => {
                setFirstName(event.target.value);
                setErrors((current) => ({ ...current, firstName: undefined, form: undefined }));
              }}
              className={FIELD}
            />
            {errors.firstName ? (
              <p id={`${id}-first-error`} className="mt-1.5 text-sm font-medium text-[#C4200F]">
                {errors.firstName}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor={`${id}-last`} className="text-sm font-semibold text-[#1A1A1A]">
              Last name
            </label>
            <input
              id={`${id}-last`}
              value={lastName}
              autoComplete="family-name"
              maxLength={100}
              required
              disabled={busy}
              aria-invalid={Boolean(errors.lastName)}
              aria-describedby={errors.lastName ? `${id}-last-error` : undefined}
              onChange={(event) => {
                setLastName(event.target.value);
                setErrors((current) => ({ ...current, lastName: undefined, form: undefined }));
              }}
              className={FIELD}
            />
            {errors.lastName ? (
              <p id={`${id}-last-error`} className="mt-1.5 text-sm font-medium text-[#C4200F]">
                {errors.lastName}
              </p>
            ) : null}
          </div>
        </div>
        {errors.form ? (
          <p role="alert" className="text-sm font-medium text-[#C4200F]">
            {errors.form}
          </p>
        ) : null}
      </form>
      {/* The panel labels itself "Email (optional)". */}
      <div className="mt-5 border-t border-[#E3E6EA] pt-4">
        <EmailVerificationPanel compact />
      </div>
    </Sheet>
  );
}
