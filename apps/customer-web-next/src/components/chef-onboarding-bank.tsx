"use client";

import { chefApiError, ChefError, chefErrorText } from "@/lib/chef-errors";
import { useEffect, useRef, useState } from "react";
import { Building2, CheckCircle2, Eye, EyeOff, Landmark, Lock, RefreshCw } from "lucide-react";
import {
  bankConsentVersion,
  bankStatusSchema,
  bankSubmissionSchema,
  type BankStatus,
} from "@/lib/bank-onboarding-contract";
import { bankCanContinue, sameChefBankName } from "@/lib/chef-onboarding-flow";
import {
  Card,
  FieldError,
  FieldShell,
  LockedInput,
  Note,
  Spinner,
  StatusChip,
} from "@/components/chef-onboarding-ui";

type Props = {
  name: string;
  bank: BankStatus | null;
  unavailable: boolean;
  busy: boolean;
  onSaved: (bank: BankStatus) => void;
  onBusy: (busy: boolean) => void;
  onRefresh: () => void;
  /** Lets the popup footer label follow the step: entering, confirming or keeping a saved account. */
  onModeChange?: (mode: BankFormMode) => void;
};
export type BankFormMode = "entry" | "confirm" | "saved";
type FieldKey = "account" | "confirmation" | "ifsc" | "consent" | "form";

export function ChefOnboardingBank({
  name,
  bank,
  unavailable,
  busy,
  onSaved,
  onBusy,
  onRefresh,
  onModeChange,
}: Props) {
  const [account, setAccount] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [ifsc, setIfsc] = useState("");
  const [consent, setConsent] = useState(false),
    [confirming, setConfirmingState] = useState(false),
    [error, setError] = useState<{ field: FieldKey; message: string } | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [changing, setChanging] = useState(false);
  const request = useRef<ReturnType<typeof bankSubmissionSchema.parse> | null>(null);
  const inFlight = useRef(false);
  const confirmPanel = useRef<HTMLDivElement>(null);
  const [branch, setBranch] = useState<{
    ifsc: string;
    bankName: string;
    branchName: string;
  } | null>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "failed">("idle");
  const [lookupError, setLookupError] = useState("");
  const [lookupRetry, setLookupRetry] = useState(0);
  function setConfirming(value: boolean) {
    setConfirmingState(value);
  }
  useEffect(() => {
    setBranch(null);
    setLookupError("");
    setLookup("idle");
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return;
    const controller = new AbortController();
    setLookup("loading");
    void fetch(`/api/chef-onboarding/bank/ifsc/${ifsc}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          ifsc?: string;
          bankName?: string;
          branchName?: string;
          message?: string;
        };
        if (!response.ok || data.ifsc !== ifsc || !data.bankName || !data.branchName)
          throw new Error(data.message ?? "We couldn’t find this IFSC. Check it and try again.");
        if (!controller.signal.aborted) {
          setBranch({ ifsc, bankName: data.bankName, branchName: data.branchName });
          setLookup("idle");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setLookup("failed");
          setLookupError(chefErrorText(failure, "Bank branch lookup failed."));
        }
      });
    return () => controller.abort();
  }, [ifsc, lookupRetry]);
  useEffect(() => {
    if (confirming) confirmPanel.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [confirming]);
  function changed() {
    request.current = null;
    setError(null);
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
      const next: { field: FieldKey; message: string } = !/^[0-9]{6,24}$/.test(account)
        ? { field: "account", message: "Enter a bank account number with 6 to 24 digits." }
        : account !== confirmation
          ? { field: "confirmation", message: "The account numbers don’t match." }
          : !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)
            ? { field: "ifsc", message: "Enter a valid 11-character IFSC code." }
            : !consent
              ? { field: "consent", message: "Confirm this is your account to continue." }
              : { field: "form", message: "Check your account holder name in Basic details." };
      setError(next);
      document.getElementById(`chef-bank-${next.field}`)?.focus();
      return;
    }
    if (!branch || branch.ifsc !== ifsc) {
      setError({
        field: "ifsc",
        message: "Wait for the bank name and branch to load from your IFSC.",
      });
      document.getElementById("chef-bank-ifsc")?.focus();
      return;
    }
    request.current = result.data;
    setConfirming(true);
    setError(null);
  }
  async function save() {
    if (!request.current || busy || inFlight.current || !bank?.automaticActivation) return;
    inFlight.current = true;
    onBusy(true);
    setError(null);
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
        throw new ChefError(
          response.status === 401
            ? "Your session expired. Sign in again to save your bank details."
            : response.status === 409
              ? "Your bank details changed or a payout is pending. Refresh bank status before trying again."
              : response.status === 429
                ? "The bank-change limit has been reached. Try again after the current limit resets."
                : "We could not confirm your bank submission. Retry uses the same request, so it will not create a duplicate.",
          chefApiError(response, raw, "").ref,
          response.status,
        );
      const result = bankStatusSchema.parse(raw);
      onSaved(result);
      if (!bankCanContinue(result)) {
        setError({ field: "form", message: result.message });
        return;
      }
      request.current = null;
      setAccount("");
      setConfirmation("");
      setIfsc("");
      setConsent(false);
      setConfirming(false);
      setChanging(false);
    } catch (failure) {
      setError({
        field: "form",
        message: chefErrorText(failure, "Bank details could not be saved."),
      });
    } finally {
      inFlight.current = false;
      onBusy(false);
    }
  }
  const editable = Boolean(bank?.automaticActivation);
  const saved = bankCanContinue(bank) && sameChefBankName(bank?.accountHolderName, name);
  const mode: BankFormMode = confirming
    ? "confirm"
    : saved && !changing && !account && !confirmation && !ifsc
      ? "saved"
      : "entry";
  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);
  const showFields = editable && (!bank?.id || changing || !saved);
  const errorFor = (field: FieldKey) => (error?.field === field ? error.message : null);
  const matches = account.length >= 6 && confirmation === account;
  return (
    <form
      id="chef-bank-form"
      className="cob-stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || inFlight.current) return;
        if (saved && !account && !confirmation && !ifsc) {
          onSaved(bank!);
          return;
        }
        if (confirming) void save();
        else confirm();
      }}
    >
      {bank?.id ? (
        <Card
          icon={<Landmark size={20} aria-hidden="true" />}
          title="Saved account"
          subtitle={bank.message}
        >
          <dl className="cob-rows">
            <div className="cob-row">
              <dt>Account</dt>
              <dd className="cob-mono">•••• {bank.lastFour}</dd>
            </div>
            {bank.bankName ? (
              <div className="cob-row">
                <dt>Bank</dt>
                <dd>
                  {bank.bankName}
                  {bank.branchName ? `, ${bank.branchName}` : ""}
                </dd>
              </div>
            ) : null}
            <div className="cob-row">
              <dt>Status</dt>
              <dd>
                {bankCanContinue(bank) ? (
                  <StatusChip tone="complete">Saved</StatusChip>
                ) : (
                  <StatusChip tone="attention">Needs attention</StatusChip>
                )}
              </dd>
            </div>
          </dl>
          {editable && saved && !changing ? (
            <button
              type="button"
              className="cob-link"
              style={{ marginTop: 6 }}
              onClick={() => setChanging(true)}
            >
              Use a different account
            </button>
          ) : null}
        </Card>
      ) : null}

      {unavailable || !editable ? (
        <Note tone="neutral" role="status">
          {unavailable
            ? "We couldn’t load your bank details. Your application is still saved."
            : "Bank setup isn’t available right now. You can save your application and come back later."}
          <br />
          <button type="button" className="cob-link" disabled={busy} onClick={onRefresh}>
            <RefreshCw size={15} aria-hidden="true" />
            Refresh bank status
          </button>
        </Note>
      ) : null}

      {showFields ? (
        <Card
          icon={<Building2 size={20} aria-hidden="true" />}
          title="Account details"
          subtitle="Where we send your earnings."
        >
          <div className="cob-fields">
            <LockedInput
              id="chef-bank-holder"
              label="Account holder name"
              value={name}
              helper="From your basic details."
            />
            <FieldShell
              id="chef-bank-account"
              label="Bank account number"
              error={errorFor("account")}
            >
              <div className="cob-control">
                <input
                  id="chef-bank-account"
                  aria-label="Bank account number"
                  className="cob-input cob-input--with-trailing-icon cob-mono"
                  autoComplete="off"
                  type={showAccount ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={24}
                  value={account}
                  disabled={busy || confirming}
                  aria-invalid={Boolean(errorFor("account")) || undefined}
                  onChange={(event) => {
                    changed();
                    setAccount(event.target.value.replace(/\D/g, ""));
                  }}
                />
                <button
                  type="button"
                  className="cob-trailing-button"
                  aria-label={showAccount ? "Hide account number" : "Show account number"}
                  onClick={() => setShowAccount((value) => !value)}
                >
                  {showAccount ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
            </FieldShell>
            <FieldShell
              id="chef-bank-confirmation"
              label="Confirm bank account number"
              error={errorFor("confirmation")}
              after={
                matches && !errorFor("confirmation") ? (
                  <span className="cob-success-line">
                    <CheckCircle2 size={16} aria-hidden="true" />
                    Account numbers match
                  </span>
                ) : null
              }
            >
              <input
                id="chef-bank-confirmation"
                aria-label="Confirm bank account number"
                className="cob-input cob-mono"
                autoComplete="off"
                inputMode="numeric"
                maxLength={24}
                value={confirmation}
                disabled={busy || confirming}
                aria-invalid={Boolean(errorFor("confirmation")) || undefined}
                onPaste={(event) => event.preventDefault()}
                onChange={(event) => {
                  changed();
                  setConfirmation(event.target.value.replace(/\D/g, ""));
                }}
              />
            </FieldShell>
            <FieldShell
              id="chef-bank-ifsc"
              label="IFSC code"
              helper={
                lookup === "loading"
                  ? "Finding your bank…"
                  : "Bank name and branch fill in from your IFSC."
              }
              error={errorFor("ifsc") ?? (lookup === "failed" ? lookupError : null)}
              after={
                lookup === "failed" ? (
                  <button
                    type="button"
                    className="cob-link"
                    onClick={() => setLookupRetry((value) => value + 1)}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    Retry branch lookup
                  </button>
                ) : null
              }
            >
              <div className="cob-control">
                <input
                  id="chef-bank-ifsc"
                  aria-label="IFSC code"
                  className="cob-input cob-mono cob-input--with-trailing-icon"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="For example, HDFC0001234"
                  maxLength={11}
                  value={ifsc}
                  disabled={busy || confirming}
                  aria-invalid={Boolean(errorFor("ifsc")) || undefined}
                  onChange={(event) => {
                    changed();
                    setIfsc(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                  }}
                />
                {lookup === "loading" ? (
                  <span className="cob-lock">
                    <Spinner red />
                  </span>
                ) : null}
              </div>
            </FieldShell>
            <LockedInput id="chef-bank-name" label="Bank name" value={branch?.bankName ?? ""} />
            <LockedInput id="chef-bank-branch" label="Branch" value={branch?.branchName ?? ""} />
            {branch ? (
              <span role="status" className="sr-only">
                {branch.bankName} · {branch.branchName}
              </span>
            ) : null}
            <div className="cob-field">
              <label className="cob-check">
                <input
                  id="chef-bank-consent"
                  aria-label="Consent to bank verification"
                  type="checkbox"
                  checked={consent}
                  disabled={busy || confirming}
                  onChange={(event) => {
                    changed();
                    setConsent(event.target.checked);
                  }}
                />
                <span>
                  This is my bank account. I agree that Craves may share these details and my
                  contact information with Razorpay to validate the account and pay my earnings.
                </span>
              </label>
              {errorFor("consent") ? <FieldError>{errorFor("consent")}</FieldError> : null}
            </div>
          </div>
        </Card>
      ) : null}

      {confirming ? (
        <div ref={confirmPanel}>
          <Card icon={<Lock size={20} aria-hidden="true" />} title="Confirm your bank details">
            <dl className="cob-rows">
              <div className="cob-row">
                <dt>Account holder</dt>
                <dd>{name}</dd>
              </div>
              <div className="cob-row">
                <dt>Account number</dt>
                <dd className="cob-mono">•••• {account.slice(-4)}</dd>
              </div>
              <div className="cob-row">
                <dt>IFSC</dt>
                <dd className="cob-mono">{ifsc}</dd>
              </div>
              <div className="cob-row">
                <dt>Bank name</dt>
                <dd>{branch?.bankName}</dd>
              </div>
              <div className="cob-row">
                <dt>Branch</dt>
                <dd>{branch?.branchName}</dd>
              </div>
            </dl>
            <p className="cob-helper" style={{ marginTop: 14 }}>
              Please check these details carefully. Your earnings will be transferred to this bank
              account.
            </p>
            <button
              type="button"
              className="cob-secondary"
              style={{ marginTop: 16 }}
              disabled={busy}
              onClick={() => {
                request.current = null;
                setConfirming(false);
                window.setTimeout(() => document.getElementById("chef-bank-account")?.focus(), 0);
              }}
            >
              Re-enter bank details
            </button>
          </Card>
        </div>
      ) : null}

      {errorFor("form") ? (
        <Note tone="error" role="alert">
          {errorFor("form")}
        </Note>
      ) : null}
    </form>
  );
}
