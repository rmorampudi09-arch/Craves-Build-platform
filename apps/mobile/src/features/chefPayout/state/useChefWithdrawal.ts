import React from 'react';
import {toAppApiError, type AppApiError} from '../../../core/http/apiError';
import {chefPayoutApi} from '../api/chefPayoutApi';

export type WithdrawalNotice =
  | {kind: 'sent'; amount: string}
  | {kind: 'failed'; message: string}
  /** The answer never arrived: the same request must be replayed, never a new one. */
  | {kind: 'uncertain'};

interface PendingWithdrawal {
  requestKey: string;
  expectedAvailableAmount: string;
}

function createWithdrawalRequestKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === 'x' ? value : 8 + (value % 4);
    return nibble.toString(16);
  });
}

/** The server answered with a clear no, so the request did not happen and a fresh one is allowed. */
function isDefinitiveRejection(error: AppApiError): boolean {
  if (error.cancelled || error.status == null) return false;
  return [400, 401, 403, 404, 409, 422, 429].includes(error.status);
}

function failureMessage(error: AppApiError): string {
  if (error.status === 409) return 'Your balance changed. Check the amount and try again.';
  if (error.status === 429) return 'You can withdraw once a day. Try again tomorrow.';
  return "We couldn't send your withdrawal. Please try again.";
}

/**
 * One withdrawal request at a time. A press while one is in flight does nothing (a ref, because state is a render
 * late), and a request whose answer never arrived is replayed with the same key rather than asked for again.
 */
export function useChefWithdrawal({onSettled}: {onSettled: () => Promise<unknown> | void}) {
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<WithdrawalNotice | null>(null);
  const pending = React.useRef<PendingWithdrawal | null>(null);
  const inFlight = React.useRef(false);
  const settled = React.useRef(onSettled);
  settled.current = onSettled;

  const send = React.useCallback(async (request: PendingWithdrawal) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    let refresh = true;
    try {
      await chefPayoutApi.requestWithdrawal(request.requestKey, request.expectedAvailableAmount);
      pending.current = null;
      setNotice({kind: 'sent', amount: request.expectedAvailableAmount});
    } catch (caught) {
      const failure = toAppApiError(caught);
      if (isDefinitiveRejection(failure)) {
        pending.current = null;
        setNotice({kind: 'failed', message: failureMessage(failure)});
      } else {
        pending.current = request;
        setNotice({kind: 'uncertain'});
        refresh = false;
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    if (refresh) {
      try {
        await settled.current();
      } catch {
        // The result above stands; pulling down reads the balance again.
      }
    }
  }, []);

  const start = React.useCallback(
    (availableAmount: string) => {
      if (inFlight.current || pending.current) return;
      const request = {requestKey: createWithdrawalRequestKey(), expectedAvailableAmount: availableAmount};
      pending.current = request;
      send(request).catch(() => undefined);
    },
    [send],
  );

  const resolve = React.useCallback(() => {
    if (pending.current) send(pending.current).catch(() => undefined);
  }, [send]);

  /** Clears an old "on its way" or refusal note; one waiting to be checked stays until it is. */
  const dismiss = React.useCallback(() => setNotice(current => (current?.kind === 'uncertain' ? current : null)), []);

  return {busy, notice, uncertain: notice?.kind === 'uncertain', start, resolve, dismiss};
}
