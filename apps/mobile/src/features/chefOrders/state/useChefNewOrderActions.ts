import React from 'react';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {chefOrderDetailApi, type ChefOrderDetail} from '../api/chefOrderDetailApi';
import {
  ChefOrderDecisionConflictError,
  createChefOrderDecisionCoordinator,
  formatChefOrderStatus,
} from '../domain/chefOrderDecision';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';

export type ChefNewOrderAction = 'accepting' | 'rejecting';

export interface ChefNewOrderFeedback {
  kind: 'success' | 'error';
  message: string;
}

export interface ChefNewOrderActionsState {
  actionStateByOrder: Record<string, ChefNewOrderAction | undefined>;
  feedback: ChefNewOrderFeedback | null;
  accept: (orderId: string, prepTimeMinutes: number) => Promise<ChefOrderDetail>;
  reject: (orderId: string, reason: string) => Promise<ChefOrderDetail>;
  clearFeedback: () => void;
}

export function useChefNewOrderActions(): ChefNewOrderActionsState {
  const coordinatorRef = React.useRef(createChefOrderDecisionCoordinator());
  const inFlightRef = React.useRef(new Set<string>());
  const [actionStateByOrder, setActionStateByOrder] = React.useState<
    Record<string, ChefNewOrderAction | undefined>
  >({});
  const [feedback, setFeedback] = React.useState<ChefNewOrderFeedback | null>(null);
  const {reconcileOrderStatus, refresh} = useChefOperationalState();

  const reconcile = React.useCallback(
    (order: ChefOrderDetail) => {
      reconcileOrderStatus(
        order.id,
        order.status,
        order.updatedAt,
        order.prepTimeMinutes,
      );
    },
    [reconcileOrderStatus],
  );

  const run = React.useCallback(
    async (
      orderId: string,
      action: ChefNewOrderAction,
      execute: () => Promise<ChefOrderDetail>,
    ): Promise<ChefOrderDetail> => {
      if (inFlightRef.current.has(orderId)) {
        throw new AppApiError(
          'CHEF_ORDER_DECISION_IN_PROGRESS',
          'An order decision is already in progress.',
          409,
        );
      }

      inFlightRef.current.add(orderId);
      setActionStateByOrder(current => ({...current, [orderId]: action}));
      setFeedback(null);

      try {
        const order = await execute();
        reconcile(order);
        setFeedback({
          kind: 'success',
          message:
            action === 'accepting'
              ? 'Order accepted and moved to Preparing.'
              : 'Order rejected and removed from New orders.',
        });
        refresh().catch(() => undefined);
        return order;
      } catch (cause: unknown) {
        if (cause instanceof ChefOrderDecisionConflictError) {
          reconcile(cause.latestOrder);
          const conflict = toAppApiError(cause);
          setFeedback({kind: 'error', message: conflict.message});
          refresh().catch(() => undefined);
          throw conflict;
        }

        const appError = toAppApiError(cause);
        if (appError.status === 409) {
          try {
            const latest = await chefOrderDetailApi.getOrder(orderId);
            reconcile(latest);
            setFeedback({
              kind: 'error',
              message: `This order is now ${formatChefOrderStatus(latest.status)}. The latest status is shown.`,
            });
          } catch {
            setFeedback({kind: 'error', message: appError.message});
          }
          refresh().catch(() => undefined);
        } else {
          setFeedback({kind: 'error', message: appError.message});
        }
        throw appError;
      } finally {
        inFlightRef.current.delete(orderId);
        setActionStateByOrder(current => {
          const next = {...current};
          delete next[orderId];
          return next;
        });
      }
    },
    [reconcile, refresh],
  );

  const accept = React.useCallback(
    (orderId: string, prepTimeMinutes: number) =>
      run(orderId, 'accepting', async () => {
        const result = await coordinatorRef.current.execute({
          kind: 'accept',
          orderId,
          prepTimeMinutes,
        });
        return result.order;
      }),
    [run],
  );

  const reject = React.useCallback(
    (orderId: string, reason: string) =>
      run(orderId, 'rejecting', async () => {
        const result = await coordinatorRef.current.execute({
          kind: 'reject',
          orderId,
          reason,
        });
        return result.order;
      }),
    [run],
  );

  return {
    actionStateByOrder,
    feedback,
    accept,
    reject,
    clearFeedback: React.useCallback(() => setFeedback(null), []),
  };
}
