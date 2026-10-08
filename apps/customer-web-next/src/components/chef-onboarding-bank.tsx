"use client";

import { useEffect, useRef, useState } from "react";
import {
  bankConsentVersion,
  bankStatusSchema,
  bankSubmissionSchema,
  type BankStatus,
} from "@/lib/bank-onboarding-contract";
import { bankCanContinue } from "@/lib/chef-onboarding-flow";

type Props = {
  name: string;
  bank: BankStatus | null;
  unavailable: boolean;
  busy: boolean;
  onSaved: (bank: BankStatus) => void;
  onBusy: (busy: boolean) => void;
  onRefresh: () => void;
};
export function ChefOnboardingBank({
  name,
  bank,
  unavailable,
  busy,
  onSaved,
  onBusy,
  onRefresh,
}: Props) {
  const [account, setAccount] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [ifsc, setIfsc] = useState("");
  const [consent, setConsent] = useState(false),
    [confirming, setConfirming] = useState(false),
    [error, setError] = useState("");
  const request = useRef<ReturnType<typeof bankSubmissionSchema.parse> | null>(null);
  const inFlight = useRef(false);
  const [branch,setBranch]=useState<{ifsc:string;bankName:string;branchName:string}|null>(null);
  const [lookupError,setLookupError]=useState("");
  const [lookupRetry,setLookupRetry]=useState(0);
  useEffect(()=>{
    setBranch(null);setLookupError("");
    if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return;
    const controller=new AbortController();
    void fetch(`/api/chef-onboarding/bank/ifsc/${ifsc}`,{cache:"no-store",credentials:"same-origin",signal:controller.signal}).then(async response=>{
      const data=await response.json() as {ifsc?:string;bankName?:string;branchName?:string;message?:string};
      if(!response.ok || data.ifsc!==ifsc || !data.bankName || !data.branchName) throw new Error(data.message??"Bank branch lookup is unavailable. Retry.");
      if(!controller.signal.aborted) setBranch({ifsc,bankName:data.bankName,branchName:data.branchName});
    }).catch(failure=>{if(!controller.signal.aborted) setLookupError(failure instanceof Error?failure.message:"Bank branch lookup failed.");});
    return ()=>controller.abort();
  },[ifsc,lookupRetry]);
  function changed() {
    request.current = null;
    setError("");
  }
  function confirm() {
    const result = bankSubmissionSchema.safeParse({
      requestKey: crypto.randomUUID(),
      expectedCurrentId: bank?.id ?? null,
      accountHolderName: name,
      accountNumber: account,
      accountNumberConfirmation: confirmation,
      ifsc,
      consent,
      consentVersion: bankConsentVersion,
    });
    if (!result.success) {
      setError(
        account !== confirmation
          ? "The bank account numbers do not match."
          : !/^[0-9]{6,24}$/.test(account)
            ? "Enter a bank account number with 6 to 24 digits."
            : !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)
              ? "Enter a valid 11-character IFSC code."
              : "Confirm that this is your account and consent to bank verification.",
      );
      return;
    }
    if(!branch || branch.ifsc!==ifsc) {setError("Confirm the bank name and branch after the IFSC lookup completes.");return;}
    request.current = result.data;
    setConfirming(true);
    setError("");
  }
  async function save() {
    if (!request.current || busy || inFlight.current || !bank?.automaticActivation) return;
    inFlight.current = true;
    onBusy(true);
    setError("");
    try {
      const response = await fetch("/api/chef-onboarding/bank", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.current),
        signal: AbortSignal.timeout(45000),
      });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Your session expired. Sign in again to save your bank details."
            : response.status === 409
              ? "Your bank details changed or a payout is pending. Refresh bank status before trying again."
              : response.status === 429
                ? "The bank-change limit has been reached. Try again after the current limit resets."
                : "We could not confirm your bank submission. Retry uses the same request, so it will not create a duplicate.",
        );
      const result = bankStatusSchema.parse(raw);
      onSaved(result);
      if (!bankCanContinue(result)) {
        setError(result.message);
        return;
      }
      request.current = null;
      setAccount("");
      setConfirmation("");
      setIfsc("");
      setConsent(false);
      setConfirming(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Bank details could not be saved.");
    } finally {
      inFlight.current = false;
      onBusy(false);
    }
  }
  const editable = Boolean(bank?.automaticActivation);
  return (
    <form
      id="chef-bank-form"
      className="chef-onboarding-group"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || inFlight.current) return;
        if (bankCanContinue(bank) && bank?.accountHolderName === name && !account && !confirmation && !ifsc) {
          onSaved(bank!);
          return;
        }
        if (confirming) void save();
        else confirm();
      }}
    >
      <label className="chef-onboarding-field">
        Account holder name
        <input
          aria-label="Account holder name"
          className="chef-onboarding-input"
          value={name}
          readOnly
        />
        <span className="chef-onboarding-helper">From your saved Basic details.</span>
      </label>
      {bank?.id ? (
        <div className="chef-onboarding-notice">
          <div>
            <p className="font-semibold">Account ending {bank.lastFour}</p>
            <p className="mt-1">{bank.message}</p>
            {bank.bankName ? <p className="mt-1">{bank.bankName} · {bank.branchName}</p> : null}
          </div>
        </div>
      ) : null}
      {unavailable || !editable ? (
        <div className="chef-onboarding-notice">
          <div>
            <p>
              {unavailable
                ? "We could not load bank enrollment. Your saved application is still available."
                : "Bank enrollment is currently unavailable. You can save your application and return later."}
            </p>
            <button
              type="button"
              className="chef-onboarding-text-action mt-2"
              disabled={busy}
              onClick={onRefresh}
            >
              Refresh bank status
            </button>
          </div>
        </div>
      ) : null}
      {editable && !confirming ? (
        <>
          <label className="chef-onboarding-field">
            Bank account number
            <input
              aria-label="Bank account number"
              className="chef-onboarding-input"
              autoComplete="off"
              type="password"
              inputMode="numeric"
              maxLength={24}
              value={account}
              disabled={busy}
              onChange={(event) => {
                changed();
                setAccount(event.target.value.replace(/\D/g, ""));
              }}
            />
          </label>
          <label className="chef-onboarding-field">
            Confirm bank account number
            <input
              aria-label="Confirm bank account number"
              className="chef-onboarding-input"
              autoComplete="off"
              inputMode="numeric"
              maxLength={24}
              value={confirmation}
              disabled={busy}
              onChange={(event) => {
                changed();
                setConfirmation(event.target.value.replace(/\D/g, ""));
              }}
            />
          </label>
          <label className="chef-onboarding-field">
            IFSC code
            <input
              aria-label="IFSC code"
              className="chef-onboarding-input"
              autoComplete="off"
              maxLength={11}
              value={ifsc}
              disabled={busy}
              onChange={(event) => {
                changed();
                setIfsc(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
              }}
            />
          </label>
          {branch ? <div role="status" className="chef-onboarding-notice"><p>{branch.bankName} · {branch.branchName}</p></div> : null}
          {lookupError ? <div role="alert"><p>{lookupError}</p><button type="button" className="chef-onboarding-text-action" onClick={()=>setLookupRetry(value=>value+1)}>Retry branch lookup</button></div> : null}
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              aria-label="Consent to bank verification"
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-[#C4200F]"
              checked={consent}
              disabled={busy}
              onChange={(event) => {
                changed();
                setConsent(event.target.checked);
              }}
            />
            <span>
              I confirm this is my bank account and consent to Craves sharing these details and my
              saved contact information with Razorpay for account validation and eligible chef
              payouts.
            </span>
          </label>
        </>
      ) : confirming ? (
        <div className="chef-onboarding-review-block">
          <h2 className="mb-4">Confirm your bank details</h2>
          <dl>
            <dt>Account holder</dt>
            <dd>{name}</dd>
            <dt>Account</dt>
            <dd>•••• {account.slice(-4)}</dd>
            <dt>Bank / branch</dt><dd>{branch?.bankName} · {branch?.branchName}</dd>
            <dt>IFSC</dt>
            <dd>{ifsc}</dd>
          </dl>
          <p className="chef-onboarding-helper mt-4">
            Please check these details carefully. Your earnings will be transferred to this bank
            account.
          </p>
          <div className="mt-4">
            <button
              type="button"
              className="chef-onboarding-text-action"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Re-enter bank details
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="chef-onboarding-notice chef-onboarding-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
