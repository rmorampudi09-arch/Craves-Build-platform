"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  parseCustomerProfile,
  type CustomerProfile,
} from "@/lib/profile-contract";
import { captureSessionContext, isSessionContextCurrent, setSessionProfile } from "@/services/auth/cravesAuth";
import { EmailVerificationPanel } from "@/components/auth/EmailVerificationPanel";
import { Sheet, secondaryActionClass } from "@/components/ui/overlays/overlay";

interface EditProfileModalProps {
  open: boolean;
  profile: CustomerProfile | null;
  initialEmail?: string;
  onClose: () => void;
  onSaved: (profile: CustomerProfile) => void;
}

export function EditProfileModal({
  open,
  profile,
  initialEmail = "",
  onClose,
  onSaved,
}: EditProfileModalProps) {
  const fieldPrefix = useId();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState(false);
  const saveGeneration = useRef(0);
  useEffect(() => { saveGeneration.current += 1; setBusy(false); }, [open]);
  useEffect(() => () => { saveGeneration.current += 1; }, []);

  useEffect(() => {
    if (!open) return;
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
    setError("");
    setTyped(false);
  }, [open, profile]);

  async function save() {
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    if (cleanFirstName.length < 2) {
      setError("Enter your first name using at least two characters.");
      return;
    }
    if (!cleanLastName) {
      setError("Enter your last name.");
      return;
    }

    setBusy(true);
    setError("");
    const context = captureSessionContext();
    const attempt = ++saveGeneration.current;
    const current = () => attempt === saveGeneration.current && isSessionContextCurrent(context);
    try {
      const response = await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          firstName: cleanFirstName,
          lastName: cleanLastName,
        }),
      });
      const raw = await response.json().catch(() => null);
      if (!current()) return;
      if (!response.ok) {
        const message =
          raw &&
          typeof raw === "object" &&
          "message" in raw &&
          typeof raw.message === "string"
            ? raw.message
            : "We couldn’t save your changes. Please try again.";
        throw new Error(message);
      }
      const savedProfile = parseCustomerProfile(raw);
      if (!savedProfile)
        throw new Error("We couldn’t save your changes. Please try again.");
      setSessionProfile(savedProfile, context);
      onSaved(savedProfile);
      onClose();
    } catch (caught) {
      if (!current()) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn’t save your changes. Please try again.",
      );
    } finally {
      if (current()) setBusy(false);
    }
  }

  const fieldClass =
    "mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-base text-[#1A1A1A] placeholder:text-[#6B6B6B] focus:!border-[#1A1A1A] disabled:bg-[#F1F3F5]";

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      busy={busy}
      closeOnOutsideTap={!typed}
      title="Edit profile"
      closeLabel="Close profile editor"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={secondaryActionClass}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void save()}
            className="craves-primary-action w-full sm:w-auto"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      {/* Any keystroke (names or email code) stops a stray outside tap from discarding it. */}
      <div onInputCapture={() => setTyped(true)} className="overscroll-contain">
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label
            htmlFor={`${fieldPrefix}-first-name`}
            className="text-sm font-semibold text-[#1A1A1A]"
          >
            First name
            <input
              id={`${fieldPrefix}-first-name`}
              value={firstName}
              maxLength={100}
              autoComplete="given-name"
              onChange={(event) => setFirstName(event.target.value)}
              className={fieldClass}
              disabled={busy}
              required
            />
          </label>
          <label
            htmlFor={`${fieldPrefix}-last-name`}
            className="text-sm font-semibold text-[#1A1A1A]"
          >
            Last name
            <input
              id={`${fieldPrefix}-last-name`}
              value={lastName}
              maxLength={100}
              autoComplete="family-name"
              onChange={(event) => setLastName(event.target.value)}
              className={fieldClass}
              disabled={busy}
              required
            />
          </label>
        </div>

        <label
          htmlFor={`${fieldPrefix}-phone`}
          className="mt-4 block text-sm font-semibold text-[#1A1A1A]"
        >
          Phone number
          <input
            id={`${fieldPrefix}-phone`}
            value={(profile?.registeredPhoneNumber ?? "").replace(/^\+91[\s-]?/, "")}
            readOnly
            autoComplete="tel"
            className="mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F1F3F5] px-3 text-base text-[#1A1A1A] outline-none"
          />
        </label>

        <div className="mt-5">
          <EmailVerificationPanel initialEmail={initialEmail} compact />
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

export default EditProfileModal;
