"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  changePassword,
  passwordUser,
  validatePasswordChange,
  PASSWORD_CHANGE_FAILED,
  type PasswordChange,
} from "@/shared/lib/password-change";
import { Sheet, secondaryActionClass } from "@/shared/ui/overlays/overlay";

const EMPTY: PasswordChange = { currentPassword: "", newPassword: "", confirmPassword: "" };
const FIELDS = [
  { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Confirm new password", autoComplete: "new-password" },
] as const;
const ALL_TOUCHED = { currentPassword: true, newPassword: true, confirmPassword: true };

/** True when this account signs in with email and password on this browser; phone-only accounts never see Change password. */
export function useHasPassword(phoneNumber: string | undefined): boolean {
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (phoneNumber) void passwordUser(phoneNumber).then((user) => { if (active) setOwner(user ? phoneNumber : null); });
    return () => { active = false; };
  }, [phoneNumber]);
  return Boolean(phoneNumber) && owner === phoneNumber;
}

/** Change password: current password (re-authentication), new password and confirmation. bodyClassName carries Chef Mode's theme into the portal. */
export function ChangePasswordSheet({ open, onClose, phoneNumber, bodyClassName = "" }: {
  open: boolean;
  onClose: () => void;
  phoneNumber: string;
  bodyClassName?: string;
}) {
  const id = useId();
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof PasswordChange, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const pending = useRef(false);
  const errors = validatePasswordChange(values);
  const typed = Object.values(values).some(Boolean);

  useEffect(() => {
    if (!open) return;
    setValues(EMPTY);
    setTouched({});
    setError("");
    setDone(false);
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const invalid = FIELDS.find((field) => errors[field.name]);
    if (invalid) {
      setTouched(ALL_TOUCHED);
      document.getElementById(`${id}-${invalid.name}`)?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await changePassword(phoneNumber, values.currentPassword, values.newPassword);
      setValues(EMPTY);
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : PASSWORD_CHANGE_FAILED);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      busy={busy}
      closeOnOutsideTap={!typed}
      unsavedChanges={typed}
      title={done ? "Password changed" : "Change password"}
      description={done ? undefined : "Choose a new password"}
      closeLabel="Close change password"
      footer={done ? (
        // Focus moves here from Update password, which this replaced, and reads the confirmation with it.
        <button type="button" className="craves-primary-action w-full sm:w-auto" autoFocus aria-describedby={`${id}-done`} onClick={onClose}>
          Done
        </button>
      ) : (
        <>
          <button type="button" className={secondaryActionClass} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={`${id}-form`} className="craves-primary-action w-full sm:w-auto" disabled={busy} aria-busy={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </>
      )}
    >
      <div className={bodyClassName}>
        {done ? (
          <p id={`${id}-done`} role="status" className="mt-5 text-base text-[#1A1A1A]">Your new password is saved.</p>
        ) : (
          <form id={`${id}-form`} noValidate onSubmit={(event) => void submit(event)} className="mt-5 grid gap-4">
            {FIELDS.map(({ name, label, autoComplete }) => {
              const problem = touched[name] ? errors[name] : undefined;
              return (
                <div key={name}>
                  <label htmlFor={`${id}-${name}`} className="text-sm font-semibold text-[#1A1A1A]">{label}</label>
                  <input
                    id={`${id}-${name}`}
                    type="password"
                    autoComplete={autoComplete}
                    value={values[name]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setValues((current) => ({ ...current, [name]: value }));
                      setError("");
                    }}
                    onBlur={() => setTouched((current) => ({ ...current, [name]: true }))}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${id}-${name}-error` : undefined}
                    disabled={busy}
                    className="mt-2 min-h-12 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-base text-[#1A1A1A] focus:!border-[#1A1A1A] disabled:bg-[#F1F3F5] aria-[invalid=true]:border-[#C4200F]"
                  />
                  {problem ? <p id={`${id}-${name}-error`} className="mt-1.5 text-sm font-medium text-[#C4200F]">{problem}</p> : null}
                </div>
              );
            })}
            {error ? <p role="alert" className="rounded-xl bg-[#F1F3F5] p-3 text-sm font-medium text-[#C4200F]">{error}</p> : null}
          </form>
        )}
      </div>
    </Sheet>
  );
}
