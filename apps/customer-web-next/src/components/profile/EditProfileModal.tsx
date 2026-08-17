"use client";

import { useEffect, useId, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import {
  parseCustomerProfile,
  type CustomerProfile,
} from "@/lib/profile-contract";
import { setSessionProfile } from "@/services/auth/cravesAuth";

interface EditProfileModalProps {
  open: boolean;
  profile: CustomerProfile | null;
  onClose: () => void;
  onSaved: (profile: CustomerProfile) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EditProfileModal({
  open,
  profile,
  onClose,
  onSaved,
}: EditProfileModalProps) {
  const fieldPrefix = useId();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
    setEmail(profile?.email ?? "");
    setError("");
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  async function save() {
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanEmail = email.trim();

    if (cleanFirstName.length < 2) {
      setError("Enter your first name using at least two characters.");
      return;
    }
    if (!cleanLastName) {
      setError("Enter your last name.");
      return;
    }
    if (cleanEmail && !EMAIL_PATTERN.test(cleanEmail)) {
      setError("Enter a valid email address or leave it blank.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          firstName: cleanFirstName,
          lastName: cleanLastName,
          email: cleanEmail || null,
        }),
      });
      const raw = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          raw &&
          typeof raw === "object" &&
          "message" in raw &&
          typeof raw.message === "string"
            ? raw.message
            : "Profile could not be saved.";
        throw new Error(message);
      }
      const savedProfile = parseCustomerProfile(raw);
      if (!savedProfile)
        throw new Error("Craves returned an invalid profile response.");
      setSessionProfile(savedProfile);
      onSaved(savedProfile);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Profile could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 md:items-center md:px-4"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldPrefix}-title`}
        className="w-full max-w-lg rounded-t-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_12px_36px_rgba(0,0,0,0.14)] md:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">
              Account details
            </p>
            <h2
              id={`${fieldPrefix}-title`}
              className="mt-1.5 text-2xl font-semibold text-[#1A1A1A]"
            >
              Edit profile
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6B6B6B]">
              These details are used in checkout, order history and support.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full !bg-[#F1F3F5] !text-[#F62E18]"
            aria-label="Close profile editor"
          >
            <FaXmark className="text-lg" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label
            htmlFor={`${fieldPrefix}-first-name`}
            className="text-sm font-semibold text-[#1A1A1A]"
          >
            First name <span className="text-[#F62E18]">*</span>
            <input
              id={`${fieldPrefix}-first-name`}
              value={firstName}
              maxLength={100}
              autoComplete="given-name"
              onChange={(event) => setFirstName(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-base text-[#1A1A1A] placeholder:text-[#9CA3AF] focus:!border-[#F62E18]"
              disabled={busy}
              required
            />
          </label>
          <label
            htmlFor={`${fieldPrefix}-last-name`}
            className="text-sm font-semibold text-[#1A1A1A]"
          >
            Last name <span className="text-[#F62E18]">*</span>
            <input
              id={`${fieldPrefix}-last-name`}
              value={lastName}
              maxLength={100}
              autoComplete="family-name"
              onChange={(event) => setLastName(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-base text-[#1A1A1A] placeholder:text-[#9CA3AF] focus:!border-[#F62E18]"
              disabled={busy}
              required
            />
          </label>
        </div>

        <label
          htmlFor={`${fieldPrefix}-email`}
          className="mt-4 block text-sm font-semibold text-[#1A1A1A]"
        >
          Email <span className="font-normal text-[#6B6B6B]">(optional)</span>
          <input
            id={`${fieldPrefix}-email`}
            type="email"
            value={email}
            maxLength={320}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-base text-[#1A1A1A] placeholder:text-[#9CA3AF] focus:!border-[#F62E18]"
            disabled={busy}
          />
        </label>

        {profile && (
          <p className="mt-4 rounded-xl bg-[#F1F3F5] p-3 text-sm text-[#6B6B6B]">
            Verified phone: {profile.registeredPhoneNumber}. Phone changes require
            a new Firebase verification flow.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-[#F62E18]/20 bg-[#F62E18]/5 p-3 text-sm font-medium text-[#C92716]"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-xl !border-[#E5E7EB] !bg-white px-5 text-sm font-semibold !text-[#1A1A1A] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="min-h-11 min-w-36 rounded-xl !bg-[#F62E18] px-5 text-sm font-semibold !text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default EditProfileModal;
