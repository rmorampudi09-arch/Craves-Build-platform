"use client";

import { chefErrorText } from "@/lib/chef-errors";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { z } from "zod";
import { bankConsentVersion, bankStatusSchema, bankSubmissionSchema, type BankStatus } from "@/lib/bank-onboarding-contract";
import { captureSessionContext, isSessionReady, loadSession, subscribeSession } from "@/services/auth/cravesAuth";
import { ChevronDown, Info, Landmark, RefreshCw } from "lucide-react";
import { ChefNotice, ChefSection, ChefSkeleton } from "@/components/chef-ui";
import { RequiredMark } from "@/components/ui/forms/required-mark";

const applicantSchema = z.object({firstName: z.string().nullable().optional(), lastName: z.string().nullable().optional(), status: z.string()});
const inputClass = "mt-2 block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-[#1A1A1A]";

function bankOwnerScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverBankScope = () => "server";

// Chef-facing words for the bank enrollment states (never the raw enum).
const BANK_STATE_LABEL: Record<string, string> = {
  NOT_SUBMITTED: "Not added yet",
  QUEUED: "Saved",
  SUBMITTING: "Verifying",
  VALIDATING: "Verifying",
  UNKNOWN: "Checking with the bank",
  WAITING_APPROVAL: "Verified, waiting for approval",
  VERIFIED: "Verified",
  VALIDATION_FAILED: "Couldn’t verify",
  NAME_MISMATCH: "Name doesn’t match",
  APPLICANT_ACTION_REQUIRED: "Needs your attention",
  SUPERSEDED: "Replaced",
};

export function ChefBankOnboardingPanel() {
  const scope = useSyncExternalStore(subscribeSession, bankOwnerScope, serverBankScope);
  // The application page also hosts this panel before CHEF role approval.
  // Establish Auth ownership without treating business approval as bank approval.
  useEffect(() => { void loadSession().catch(() => null); }, []);
  if (!isSessionReady()) return <ChefSection title="Bank account"><p role="status" className="text-[0.9375rem] text-[#6B6B6B]">Sign in to view or update your payout bank account.</p></ChefSection>;
  return <ChefBankOnboardingContent key={scope} />;
}

function ChefBankOnboardingContent() {
  const [bank, setBank] = useState<BankStatus | null>(null);
  const [name, setName] = useState("");
  const [registered, setRegistered] = useState(false);
  const [account, setAccount] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [availabilityError, setAvailabilityError] = useState(false);
  const pending = useRef<z.infer<typeof bankSubmissionSchema> | null>(null);
  const mounted = useRef(true);
  const loading = useRef(false);
  const bankRef = useRef<BankStatus | null>(null);
  useEffect(() => {
    bankRef.current = bank;
  }, [bank]);
  // A background check (every 15 s or on focus) never wipes the form or a message the chef is
  // reading: it keeps the last known status when it fails and leaves messages alone.
  const refresh = useCallback(async (quiet = false) => {
    if (loading.current) return;
    loading.current = true;
    try {
      const [profileResponse, bankResponse] = await Promise.all([
        fetch("/api/chef/application", {cache: "no-store"}), fetch("/api/chef-onboarding/bank", {cache: "no-store"}),
      ]);
      if (!profileResponse.ok || !bankResponse.ok) throw new Error("Bank account setup isn’t available yet. Your application hasn’t changed.");
      const profile = applicantSchema.parse(await profileResponse.json());
      const status = bankStatusSchema.parse(await bankResponse.json());
      if (mounted.current) {
        setName([profile.firstName, profile.lastName].filter(Boolean).join(" "));
        setRegistered(["PENDING", "APPROVED"].includes(profile.status)); setBank(status);setAvailabilityError(false);if (!quiet) setMessage("");
      }
    } catch (error) {
      if (!mounted.current || (quiet && bankRef.current)) return;
      setBank(null);setAvailabilityError(true);setMessage(chefErrorText(error, "Bank profile unavailable"));
    }
    finally {loading.current = false;}
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh();
    const quietly = () => void refresh(true);
    const timer = setInterval(() => {if (document.visibilityState === "visible") quietly();}, 15000);
    window.addEventListener("focus", quietly);
    return () => {mounted.current = false;clearInterval(timer);window.removeEventListener("focus", quietly);};
  }, [refresh]);
  function edit(action: () => void) {pending.current = null; action();}
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !registered || !bank?.automaticActivation) return;
    const value = pending.current || {requestKey: crypto.randomUUID(), expectedCurrentId: bank.id,
      accountHolderName: name, accountNumber: account, accountNumberConfirmation: confirmation, ifsc,
      consent, consentVersion: bankConsentVersion};
    const parsed = bankSubmissionSchema.safeParse(value);
    if (!parsed.success) {setMessage("Check that both account numbers match, the IFSC has 11 characters, and the consent box is ticked.");return;}
    pending.current = parsed.data; setBusy(true);setMessage("");
    try {
      const response = await fetch("/api/chef-onboarding/bank", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(pending.current)});
      if (!response.ok) throw new Error(response.status === 409
        ? "Your bank details changed or a payout is in progress. Refresh before changing them; a payout already on its way can’t be redirected."
        : response.status === 429 ? "You’ve changed your bank account too often today. Try again after 24 hours."
        : "We couldn’t confirm your bank details were saved. Keep this page open and tap Refresh status. Trying again won’t create a duplicate.");
      const result = bankStatusSchema.parse(await response.json());
      setBank(result); setAccount("");setConfirmation("");setIfsc("");setConsent(false);pending.current = null;
      setMessage("Bank details saved securely. The status above shows what happens next.");
    } catch (error) {setMessage(chefErrorText(error, "Bank submission not confirmed"));}
    finally {setBusy(false);}
  }
  const intro = bank?.automaticActivation ? "Add your own bank account to receive payouts." : bank ? "Adding a bank account here isn’t available right now. Your balance shows how payouts are sent." : availabilityError ? "We couldn’t check bank account setup." : "Checking bank account setup…";
  return <ChefSection title="Bank account" note={intro} labelledBy="chef-bank" action={<button type="button" onClick={() => void refresh()} disabled={busy} className="chef-btn is-small"><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh status</button>}>
    <div className="grid gap-4">
      {message ? <ChefNotice icon={Info} role="status">{message}</ChefNotice> : null}
      {bank?.automaticActivation ? <div className="flex items-center gap-3 rounded-xl bg-[#F1F3F5] p-4">
        <span className="chef-row-icon !bg-white"><Landmark className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0"><p className="font-semibold">{BANK_STATE_LABEL[bank.state] ?? "Bank account"}{bank.lastFour ? ` · account ending ${bank.lastFour}` : ""}</p>{bank.message ? <p className="mt-0.5 text-[0.875rem] text-[#6B6B6B]">{bank.message}</p> : null}</div>
      </div> : null}
      {!bank ? (availabilityError ? <p className="text-[0.875rem] text-[#6B6B6B]">Tap Refresh status to check again. You can’t add an account until it’s confirmed.</p> : <ChefSkeleton className="h-16" />)
      : !bank.automaticActivation ? null
      : !registered ? <p className="text-[0.875rem] text-[#6B6B6B]">Submit your chef application first. This section updates by itself while the page is open.</p>
      : <details className="group" open={!bank.lastFour}>
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-[#1A1A1A] [&::-webkit-details-marker]:hidden">{bank.lastFour ? "Change bank account" : "Add bank account"}<ChevronDown className="h-4 w-4 text-[#6B6B6B] transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <form onSubmit={save} className="mt-3 grid gap-4" autoComplete="off">
            <label className="block text-sm font-semibold">Account holder<input className={`${inputClass} bg-[#F7F8FA]`} value={name} readOnly aria-readonly="true" /><span className="mt-1.5 block text-[0.8125rem] font-normal leading-5 text-[#6B6B6B]">Taken from your chef application. Use your own account in this name; joint accounts, business names or different initials aren’t approved automatically.</span></label>
            <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">Account number<RequiredMark /><input className={inputClass} inputMode="numeric" type="password" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore="true" data-form-type="other" maxLength={24} value={account} disabled={busy} onChange={event => edit(() => setAccount(event.target.value))} required /></label>
              <label className="text-sm font-semibold">Confirm account number<RequiredMark /><input className={inputClass} inputMode="numeric" autoComplete="off" maxLength={24} value={confirmation} disabled={busy} onChange={event => edit(() => setConfirmation(event.target.value))} required /></label></div>
            <label className="block text-sm font-semibold">IFSC<RequiredMark /><input className={`${inputClass} uppercase`} maxLength={11} value={ifsc} disabled={busy} onChange={event => edit(() => setIfsc(event.target.value.toUpperCase()))} required /></label>
            <label className="flex items-start gap-3 text-[0.875rem] leading-6"><input className="mt-1 h-5 w-5 shrink-0 accent-[#1A1A1A]" type="checkbox" checked={consent} disabled={busy} onChange={event => edit(() => setConsent(event.target.checked))} required /><span>I confirm this is my bank account and consent to Craves sharing these details and my saved contact information with Razorpay for account validation and eligible chef payouts.</span></label>
            <button type="submit" aria-busy={busy} disabled={busy || !bank?.automaticActivation} className="chef-btn is-primary is-block">{busy ? "Saving securely…" : "Save bank details"}</button>
          </form>
        </details>}
      <p className="text-[0.8125rem] leading-5 text-[#6B6B6B]">Account numbers are never stored in your browser. Changing your account creates a new version, and payouts go only to an account that passed verification.</p>
    </div>
  </ChefSection>;
}
