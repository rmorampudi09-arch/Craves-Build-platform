"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { z } from "zod";
import { bankConsentVersion, bankStatusSchema, bankSubmissionSchema, type BankStatus } from "@/lib/bank-onboarding-contract";
import { captureSessionContext, isSessionReady, loadSession, subscribeSession } from "@/services/auth/cravesAuth";

const applicantSchema = z.object({firstName: z.string().nullable().optional(), lastName: z.string().nullable().optional(), status: z.string()});
const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950";

function bankOwnerScope(): string {
  const context = captureSessionContext();
  return JSON.stringify([context.generation, context.identityId, isSessionReady()]);
}
const serverBankScope = () => "server";

export function ChefBankOnboardingPanel() {
  const scope = useSyncExternalStore(subscribeSession, bankOwnerScope, serverBankScope);
  // The application page also hosts this panel before CHEF role approval.
  // Establish Auth ownership without treating business approval as bank approval.
  useEffect(() => { void loadSession().catch(() => null); }, []);
  if (!isSessionReady()) return <section className="rounded-2xl border border-slate-200 bg-white p-6"><p role="status">Sign in to view or update your payout bank account.</p></section>;
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
  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const [profileResponse, bankResponse] = await Promise.all([
        fetch("/api/chef/application", {cache: "no-store"}), fetch("/api/chef-onboarding/bank", {cache: "no-store"}),
      ]);
      if (!profileResponse.ok || !bankResponse.ok) throw new Error("Bank enrollment is not available yet. Your existing application has not been changed.");
      const profile = applicantSchema.parse(await profileResponse.json());
      const status = bankStatusSchema.parse(await bankResponse.json());
      if (mounted.current) {
        setName([profile.firstName, profile.lastName].filter(Boolean).join(" "));
        setRegistered(["PENDING", "APPROVED"].includes(profile.status)); setBank(status);setAvailabilityError(false);setMessage("");
      }
    } catch (error) {if (mounted.current) {setBank(null);setAvailabilityError(true);setMessage(error instanceof Error ? error.message : "Bank profile unavailable");}}
    finally {loading.current = false;}
  }, []);
  useEffect(() => {
    mounted.current = true; void refresh();
    const timer = setInterval(() => {if (document.visibilityState === "visible") void refresh();}, 15000);
    window.addEventListener("focus", refresh);
    return () => {mounted.current = false;clearInterval(timer);window.removeEventListener("focus", refresh);};
  }, [refresh]);
  function edit(action: () => void) {pending.current = null; action();}
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !registered || !bank?.automaticActivation) return;
    const value = pending.current || {requestKey: crypto.randomUUID(), expectedCurrentId: bank.id,
      accountHolderName: name, accountNumber: account, accountNumberConfirmation: confirmation, ifsc,
      consent, consentVersion: bankConsentVersion};
    const parsed = bankSubmissionSchema.safeParse(value);
    if (!parsed.success) {setMessage("Enter matching account numbers, a valid IFSC and consent to automatic Razorpay validation.");return;}
    pending.current = parsed.data; setBusy(true);setMessage("");
    try {
      const response = await fetch("/api/chef-onboarding/bank", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(pending.current)});
      if (!response.ok) throw new Error(response.status === 409
        ? "The bank profile changed or a payout is pending. Refresh before changing details; an existing payout cannot be redirected."
        : response.status === 429 ? "The bank-change limit has been reached. Retry after the stated 24-hour window."
        : "Bank submission was not confirmed. Keep this page open and refresh status; retry uses the same request identity.");
      const result = bankStatusSchema.parse(await response.json());
      setBank(result); setAccount("");setConfirmation("");setIfsc("");setConsent(false);pending.current = null;
      setMessage(result.automaticActivation ? "Bank details saved securely. Automatic Razorpay validation remains subject to the reported status." : "Bank details were saved. Automatic validation is currently unavailable; refresh status before taking further action.");
    } catch (error) {setMessage(error instanceof Error ? error.message : "Bank submission not confirmed");}
    finally {setBusy(false);}
  }
  return <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Payout onboarding</p><h2 className="mt-2 text-2xl font-bold">Your payout bank account</h2>
      <p className="mt-3 text-sm text-slate-600">{bank?.automaticActivation ? "Automatic bank enrollment is available. You can securely add your own bank account here." : bank ? "Automatic bank enrollment is currently unavailable. Your finance balance shows your current payout options." : availabilityError ? "Bank enrollment availability could not be confirmed." : "Checking bank enrollment availability…"}</p></div>
    {message && <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">{message}</p>}
    {bank?.automaticActivation && <div className="rounded-xl border p-4"><p className="font-semibold">{bank.state.replaceAll("_", " ")}{bank.lastFour ? ` · account ending ${bank.lastFour}` : ""}</p><p className="mt-2 text-sm">{bank.message}</p></div>}
    {!bank ? <p className="rounded-xl bg-slate-50 p-4 text-sm">{availabilityError ? "Refresh to confirm current bank enrollment availability. No submission can be made until it is confirmed." : "Checking current bank enrollment availability…"}</p> : !bank.automaticActivation ? <p className="rounded-xl bg-slate-50 p-4 text-sm">Automatic bank submission is unavailable. Check your finance balance for eligible payout options.</p> : !registered ? <p className="text-sm">Complete and submit the chef application first. This section refreshes automatically while the page is open.</p> : <form onSubmit={save} className="space-y-4" autoComplete="off">
      <label className="block text-sm font-medium">Account holder from your saved chef application<input className={inputClass} value={name} readOnly aria-readonly="true" /></label>
      <p className="text-xs text-slate-600">Use your own account with this name. Joint accounts, different business names or unmatched initials are not automatically approved by this personal-chef flow.</p>
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Account number<input className={inputClass} inputMode="numeric" type="password" autoComplete="new-password" maxLength={24} value={account} disabled={busy} onChange={event => edit(() => setAccount(event.target.value))} required /></label>
        <label className="text-sm font-medium">Confirm account number<input className={inputClass} inputMode="numeric" autoComplete="off" maxLength={24} value={confirmation} disabled={busy} onChange={event => edit(() => setConfirmation(event.target.value))} required /></label></div>
      <label className="block text-sm font-medium">IFSC<input className={inputClass} maxLength={11} value={ifsc} disabled={busy} onChange={event => edit(() => setIfsc(event.target.value.toUpperCase()))} required /></label>
      <label className="flex items-start gap-3 text-sm"><input className="mt-1 h-5 w-5" type="checkbox" checked={consent} disabled={busy} onChange={event => edit(() => setConsent(event.target.checked))} required /><span>I confirm this is my bank account and consent to Craves sharing these details and my saved contact information with Razorpay for account validation and eligible chef payouts.</span></label>
      <button type="submit" disabled={busy || !bank?.automaticActivation} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40">{busy ? "Saving securely…" : "Save and validate automatically"}</button>
    </form>}
    <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-xl border px-4 py-2 text-sm">Refresh bank status</button>
    <p className="text-xs text-slate-500">Account numbers are not saved in browser storage. Changing an account creates a new version. Failed, unmatched or uncertain validation cannot authorize a payout.</p>
  </section>;
}
