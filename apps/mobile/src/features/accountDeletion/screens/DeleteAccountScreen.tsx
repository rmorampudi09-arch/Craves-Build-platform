import React, {useCallback, useMemo, useRef, useState} from 'react';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import type {ChefProfileStackParamList, CustomerSettingsChildStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {toAppApiError, type AppApiError} from '../../../core/http/apiError';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import {ChefActionButton} from '../../chefShell/components/ui';
import {accountDeletionApi} from '../api/accountDeletionApi';
import {DeletionConfirmSheet} from '../components/DeletionConfirmSheet';
import {DeletionStateView} from '../components/DeletionStateView';
import {DeletionSummary} from '../components/DeletionSummary';
import {ScopeChooser} from '../components/ScopeChooser';
import {deletionCopy} from '../domain/deletionCopy';
import {entryStateFor, formatDeletionDate, scopePlanFor, summaryKindFor, type ScopePlan, type SummaryKind} from '../domain/deletionModel';
import type {AppMode, DeletionScope} from '../domain/deletionTypes';
import {accountDeletionQueryKey} from '../query/accountDeletionQueryKey';
import {useLatestDeletion} from '../query/useLatestDeletion';
import {refreshAfterDeletionChange} from '../state/refreshAfterDeletionChange';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface DeleteAccountScaffoldProps {
  title: string;
  children: React.ReactNode;
  /** Pinned under the content: the screen's one main button. */
  footer?: React.ReactNode;
}

interface Props {
  mode: AppMode;
  /** The customer settings page or the chef page around the content; the flow is the same in both. */
  Scaffold: React.ComponentType<DeleteAccountScaffoldProps>;
}

function sendErrorText(error: AppApiError): string {
  const {sendErrors} = deletionCopy;
  if (error.status === 503 || error.code === 'ACCOUNT_DELETION_NOT_ENABLED') {
    return sendErrors.notEnabled;
  }
  return error.code === 'ACCOUNT_DELETION_SCOPE_NOT_ALLOWED' ? sendErrors.scopeNotAllowed : sendErrors.failed;
}

/** Sends the request, once however often the button is hit, and hands the answer to the screen. */
function useSendDeletion(refetch: () => void, closeSheet: () => void) {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref: two taps in one frame both still see sending === false.
  const inFlight = useRef(false);

  const send = useCallback(
    async (scope: DeletionScope) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      setSending(true);
      setError(null);
      try {
        const view = await accountDeletionApi.request(scope);
        // The screen shows the new state from this answer, without a second status call.
        if (identityId) {
          const queryKey = accountDeletionQueryKey(identityId);
          // A status call still in flight would answer with the old "nothing open" and overwrite this.
          await queryClient.cancelQueries({queryKey});
          queryClient.setQueryData(queryKey, view);
        }
        await refreshAfterDeletionChange();
      } catch (caught) {
        const apiError = toAppApiError(caught);
        if (
          apiError.code === 'ACCOUNT_DELETION_ALREADY_REQUESTED' ||
          apiError.code === 'ACCOUNT_DELETION_INVALID_RESPONSE'
        ) {
          // A request is open, or the server may have taken ours: never say "not sent", show what the server holds.
          closeSheet();
          refetch();
          await refreshAfterDeletionChange();
        } else {
          setError(sendErrorText(apiError));
        }
      } finally {
        inFlight.current = false;
        setSending(false);
      }
    },
    [closeSheet, identityId, queryClient, refetch],
  );

  return {send, sending, error, clearError: useCallback(() => setError(null), [])};
}

function summaryTitle(kind: SummaryKind): string {
  if (kind === 'chefSide') {
    return deletionCopy.chefSummary.titleSide;
  }
  return kind === 'chefAll' ? deletionCopy.chefSummary.titleAll : deletionCopy.customerSummary.title;
}

function ScopeStep({
  plan,
  Scaffold,
  onContinue,
}: {
  plan: Extract<ScopePlan, {kind: 'choose'}>;
  Scaffold: Props['Scaffold'];
  onContinue: (scope: DeletionScope) => void;
}) {
  const [picked, setPicked] = useState<DeletionScope | null>(null);
  return (
    <Scaffold
      footer={
        <ChefActionButton
          disabled={picked === null}
          label={deletionCopy.chooser.continue}
          onPress={() => picked && onContinue(picked)}
        />
      }
      title={deletionCopy.chooser.title}>
      <ScopeChooser onChange={setPicked} options={plan.options} riderNote={plan.riderNote} value={picked} />
    </Scaffold>
  );
}

function DeletionStart({mode, Scaffold, refetch}: Props & {refetch: () => void}) {
  const identity = useAppSelector(state => state.auth.identity);
  const roles = identity?.roles ?? [];
  const plan = scopePlanFor(roles, mode);
  const [chosen, setChosen] = useState<DeletionScope | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Customer scopes are deleted 30 days from today, worked out on the phone.
  const dueAt = useMemo(() => new Date(Date.now() + THIRTY_DAYS_MS).toISOString(), []);
  const closeSheet = useCallback(() => setConfirming(false), []);
  const {send, sending, error, clearError} = useSendDeletion(refetch, closeSheet);

  // The person's pick wins over a plan recomputed from roles that may have changed since.
  const scope = chosen ?? (plan.kind === 'direct' ? plan.scope : null);
  if (scope === null) {
    return plan.kind === 'choose' ? <ScopeStep onContinue={setChosen} plan={plan} Scaffold={Scaffold} /> : null;
  }

  const kind = summaryKindFor(scope, roles);
  const hasChef = roles.includes('CHEF');
  const shortDate = formatDeletionDate(dueAt, 'short');
  const customerKind = kind === 'customerAll' || kind === 'customerSide';
  return (
    <>
      <Scaffold
        footer={
          <ChefActionButton
            label={customerKind ? deletionCopy.customerSummary.button : deletionCopy.chefSummary.button}
            onPress={() => {
              clearError();
              setConfirming(true);
            }}
          />
        }
        title={summaryTitle(kind)}>
        <DeletionSummary
          chefSideStays={hasChef}
          customerSideStays={roles.includes('CUSTOMER')}
          kind={kind}
          longDate={formatDeletionDate(dueAt, 'long')}
          shortDate={shortDate}
        />
      </Scaffold>
      <DeletionConfirmSheet
        busy={sending}
        chefSideStays={hasChef}
        error={error}
        kind={kind}
        onCancel={closeSheet}
        onConfirm={() => {
          send(scope).catch(() => undefined);
        }}
        shortDate={shortDate}
        visible={confirming}
      />
    </>
  );
}

/** Delete account: the start flow when nothing is open, otherwise where the request stands. */
export function DeleteAccountScreen({mode, Scaffold}: Props) {
  const {latest, status, refetch} = useLatestDeletion();
  const navigation = useNavigation<NavigationProp<CustomerSettingsChildStackParamList & ChefProfileStackParamList>>();
  // The declined request the person chose to ask again after; a newer request shows its own state.
  const [askedAgainAfter, setAskedAgainAfter] = useState<string | null>(null);
  const identity = useAppSelector(state => state.auth.identity);
  const entry = entryStateFor(latest);
  const title = mode === 'CUSTOMER' ? deletionCopy.customerSummary.title : deletionCopy.chefSummary.titleAll;

  if (status === 'pending') {
    return (
      <Scaffold title={title}>
        <LoadingIndicator />
      </Scaffold>
    );
  }
  if (status === 'error') {
    // Unknown is not "nothing open": a person with a request on record must never be offered a new one.
    return (
      <Scaffold title={title}>
        <TerminalState
          actionLabel={deletionCopy.loadError.retry}
          description={deletionCopy.loadError.body}
          onAction={refetch}
          title={deletionCopy.loadError.title}
        />
      </Scaffold>
    );
  }
  if (entry.kind !== 'start' && !(entry.kind === 'declined' && entry.view.requestId === askedAgainAfter)) {
    return (
      <DeletionStateView
        Scaffold={Scaffold}
        onAskAgain={() => setAskedAgainAfter(entry.view.requestId)}
        onContactSupport={() => navigation.navigate(mode === 'CUSTOMER' ? 'CustomerSettingsSupport' : 'ChefSupport')}
        onKept={refetch}
        roles={identity?.roles ?? []}
        state={entry}
        title={title}
      />
    );
  }
  return <DeletionStart Scaffold={Scaffold} mode={mode} refetch={refetch} />;
}
