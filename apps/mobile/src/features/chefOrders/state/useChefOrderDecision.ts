import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {useAppSelector} from '../../../app/store/hooks';
import {chefOrderDetailApi, type ChefOrderDetail} from '../api/chefOrderDetailApi';
import {
  ChefOrderDecisionConflictError,
  createChefOrderDecisionCoordinator,
  type ChefOrderDecisionKind,
  type ChefOrderDecisionResult,
} from '../domain/chefOrderDecision';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {createChefOrderDetailQueryKey} from './useChefOrderDetailContract';

export interface ChefOrderDecisionState {
  action: ChefOrderDecisionKind | null;
  error: AppApiError | null;
  accept: (prepTimeMinutes: number) => Promise<ChefOrderDetail>;
  reject: (reason: string) => Promise<ChefOrderDetail>;
  clearError: () => void;
}

export function useChefOrderDecision(orderId: string): ChefOrderDecisionState {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const operational = useChefOperationalState();
  const coordinatorRef = React.useRef(createChefOrderDecisionCoordinator());
  const [action, setAction] = React.useState<ChefOrderDecisionKind | null>(null);
  const [error, setError] = React.useState<AppApiError | null>(null);
  const activeRef = React.useRef<Promise<ChefOrderDetail> | null>(null);

  const reconcile = React.useCallback(
    (order: ChefOrderDetail) => {
      if (!identityId) {
        return;
      }
      queryClient.setQueryData(
        createChefOrderDetailQueryKey(identityId, order.id),
        order,
      );
    },
    [identityId, queryClient],
  );

  const run = React.useCallback(
    (
      kind: ChefOrderDecisionKind,
      execute: () => Promise<ChefOrderDecisionResult>,
    ): Promise<ChefOrderDetail> => {
      if (activeRef.current) {
        return Promise.reject(
          new AppApiError(
            'CHEF_ORDER_DECISION_IN_PROGRESS',
            'An order decision is already in progress.',
            409,
          ),
        );
      }

      setAction(kind);
      setError(null);
      let actionPromise: Promise<ChefOrderDetail>;
      actionPromise = execute()
        .then(async result => {
          reconcile(result.order);
          await operational.refresh();
          return result.order;
        })
        .catch(async (cause: unknown) => {
          if (cause instanceof ChefOrderDecisionConflictError) {
            reconcile(cause.latestOrder);
            await operational.refresh();
            const conflict = toAppApiError(cause);
            setError(conflict);
            throw conflict;
          }

          const appError = toAppApiError(cause);
          if (appError.status === 409) {
            try {
              const latest = await chefOrderDetailApi.getOrder(orderId);
              reconcile(latest);
              await operational.refresh();
            } catch {
              // Preserve the authoritative mutation failure if reconciliation also fails.
            }
          }
          setError(appError);
          throw appError;
        })
        .finally(() => {
          if (activeRef.current === actionPromise) {
            activeRef.current = null;
            setAction(null);
          }
        });

      activeRef.current = actionPromise;
      return actionPromise;
    },
    [operational, orderId, reconcile],
  );

  const accept = React.useCallback(
    (prepTimeMinutes: number) =>
      run('accept', () =>
        coordinatorRef.current.execute({
          kind: 'accept',
          orderId,
          prepTimeMinutes,
        }),
      ),
    [orderId, run],
  );

  const reject = React.useCallback(
    (reason: string) =>
      run('reject', () =>
        coordinatorRef.current.execute({kind: 'reject', orderId, reason}),
      ),
    [orderId, run],
  );

  return {
    action,
    error,
    accept,
    reject,
    clearError: React.useCallback(() => setError(null), []),
  };
}
