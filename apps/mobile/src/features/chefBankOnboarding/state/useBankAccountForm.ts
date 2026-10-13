import React from 'react';
import {uuid} from 'expo-modules-core';
import {toAppApiError} from '../../../core/http/apiError';
import {chefOnboardingApi} from '../../chefOnboarding/api/chefOnboardingApi';
import {
  buildChefBankSubmission,
  chefBankOnboardingApi,
  type ChefBankStatus,
  type ChefBankSubmission,
} from '../api/chefBankOnboardingApi';

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_PATTERN = /^[0-9]{6,24}$/;

function saveFailure(error: unknown): string {
  const {status} = toAppApiError(error);
  if (status === 409) return 'Your bank details changed or a payout is pending. Pull down to refresh, then try again.';
  if (status === 429) return "You've reached the limit for bank changes. Try again in 24 hours.";
  if (status) return "We couldn't save your bank account. Check the details and try again.";
  // No answer at all: pressing again sends the same request, so it never saves twice.
  return "We couldn't tell if it was saved. Press Verify and save again; it won't be saved twice.";
}

export interface BankAccountFormInput {
  /** The name on the application. Locked: the account has to be in this name. */
  holderName: string;
  /** The bank record this replaces (null for the first account), so the server can spot a stale screen. */
  currentId: string | null;
  onSaved: (bank: ChefBankStatus) => void;
}

/** The state of the bank form: account number twice, IFSC with its bank and branch, one tick, one save. */
export function useBankAccountForm({holderName, currentId, onSaved}: BankAccountFormInput) {
  const [account, setAccount] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [ifsc, setIfsc] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [showAccount, setShowAccount] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [branch, setBranch] = React.useState<{ifsc: string; bankName: string; branchName: string} | null>(null);
  const [lookup, setLookup] = React.useState<'idle' | 'loading' | 'failed'>('idle');
  const [lookupError, setLookupError] = React.useState('');
  const [lookupRetry, setLookupRetry] = React.useState(0);
  const pending = React.useRef<ChefBankSubmission | null>(null);
  const inFlight = React.useRef(false);

  // The branch comes from the IFSC as it is typed.
  React.useEffect(() => {
    setBranch(null);
    setLookup('idle');
    if (!IFSC_PATTERN.test(ifsc)) return undefined;
    let live = true;
    setLookup('loading');
    chefOnboardingApi.bankBranch(ifsc).then(
      found => {
        if (!live) return;
        setBranch({ifsc, ...found});
        setLookup('idle');
      },
      failure => {
        if (!live) return;
        setLookup('failed');
        setLookupError(
          toAppApiError(failure).status === 404 ? 'IFSC not found. Check your bank document.' : "We couldn't look up this bank. Try again.",
        );
      },
    );
    return () => {
      live = false;
    };
  }, [ifsc, lookupRetry]);

  // Any edit starts a new request; a retry with nothing changed replays the same one.
  const edit = (change: () => void) => {
    pending.current = null;
    setError(null);
    change();
  };

  const mismatch = confirmation.length > 0 && confirmation.length >= account.length && confirmation !== account;
  const matches = account.length > 0 && confirmation === account;
  const valid =
    ACCOUNT_PATTERN.test(account) && matches && IFSC_PATTERN.test(ifsc) && branch?.ifsc === ifsc && consent && holderName.length >= 2;

  const clear = () => {
    pending.current = null;
    setAccount('');
    setConfirmation('');
    setIfsc('');
    setConsent(false);
    setShowAccount(false);
    setError(null);
  };

  const save = async () => {
    if (!valid || busy || inFlight.current) return;
    let submission = pending.current;
    if (!submission) {
      try {
        submission = buildChefBankSubmission({
          requestKey: uuid.v4(),
          expectedCurrentId: currentId,
          accountHolderName: holderName,
          accountNumber: account,
          accountNumberConfirmation: confirmation,
          ifsc,
          consent,
        });
      } catch {
        setError('Check the bank details and try again.');
        return;
      }
      pending.current = submission;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await chefBankOnboardingApi.submit(submission);
      clear();
      onSaved(result);
    } catch (caught) {
      setError(saveFailure(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return {
    holderName,
    account,
    confirmation,
    ifsc,
    consent,
    showAccount,
    busy,
    error,
    branch,
    lookup,
    lookupError,
    mismatch,
    matches,
    valid,
    /** Something was typed or ticked: leaving would throw it away. */
    dirty: account !== '' || confirmation !== '' || ifsc !== '' || consent,
    setAccount: (value: string) => edit(() => setAccount(value.replace(/\D/g, ''))),
    setConfirmation: (value: string) => edit(() => setConfirmation(value.replace(/\D/g, ''))),
    setIfsc: (value: string) => edit(() => setIfsc(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))),
    toggleConsent: () => edit(() => setConsent(value => !value)),
    toggleShowAccount: () => setShowAccount(value => !value),
    retryLookup: () => setLookupRetry(count => count + 1),
    save,
    /** Forget everything typed (the chef chose to discard it). */
    reset: clear,
  };
}

export type BankAccountForm = ReturnType<typeof useBankAccountForm>;
