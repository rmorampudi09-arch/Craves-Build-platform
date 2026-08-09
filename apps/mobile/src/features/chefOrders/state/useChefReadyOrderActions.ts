import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {
  chefOrderDetailApi,
  type ChefOrderDetail,
} from '../api/chefOrderDetailApi';
import {createChefOrderDetailQueryKey} from './useChefOrderDetailContract';

export type ChefReadyOrderAction = 'checking-pickup' | 'reporting-delay';

export interface ChefReadyOrderFeedback {
  kind: 'success' | 'error';
  message: string;
}

export interface ChefReadyOrderActions {
  actionStateByOrder: Record<string, ChefReadyOrderAction>;
  feedback: ChefReadyOrderFeedback | null;
  checkPickup: (orderId: string) => Promise<void>;
  reportPickupDelay: (orderId: string) => Promise<void>;
  clearFeedback: () => void;
}

function isPostPickupStatus(status: ChefOrderDetail['status']): boolean {
  return status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED';
}

export function useChefReadyOrderActions(): ChefReadyOrderActions {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const operational = useChefOperationalState();
  const activeByOrderRef = React.useRef(new Set<string>());
  const [actionStateByOrder, setActionStateByOrder] = React.useState<
    Record<string, ChefReadyOrderAction>
  >({});
  const [feedback, setFeedback] = React.useState<ChefReadyOrderFeedback | null>(null);

  const cacheDetail = React.useCallback(
    (detail: ChefOrderDetail) => {
      if (identityId) {
        queryClient.setQueryData(
          createChefOrderDetailQueryKey(identityId, detail.id),
          detail,
        );
      }
    },
    [identityId, queryClient],
  );

  const beginAction = React.useCallback(
    (orderId: string, action: ChefReadyOrderAction): boolean => {
      if (activeByOrderRef.current.has(orderId)) {
        return false;
      }
      activeByOrderRef.current.add(orderId);
      setFeedback(null);
      setActionStateByOrder(current => ({...current, [orderId]: action}));
      return true;
    },
    [],
  );

  const endAction = React.useCallback((orderId: string) => {
    activeByOrderRef.current.delete(orderId);
    setActionStateByOrder(current => {
      if (!(orderId in current)) {
        return current;
      }
      const next = {...current};
      delete next[orderId];
      return next;
    });
  }, []);

  const fetchLatest = React.useCallback(
    async (orderId: string): Promise<ChefOrderDetail> => {
      const latest = await chefOrderDetailApi.getOrder(orderId);
      cacheDetail(latest);
      operational.reconcileOrderStatus(
        latest.id,
        latest.status,
        latest.updatedAt,
        latest.prepTimeMinutes,
      );
      operational.refresh().catch(() => undefined);
      return latest;
    },
    [cacheDetail, operational],
  );

  const checkPickup = React.useCallback(
    async (orderId: string) => {
      if (!beginAction(orderId, 'checking-pickup')) {
        throw new AppApiError(
          'CHEF_READY_ACTION_IN_PROGRESS',
          'An action is already in progress for this order.',
          409,
        );
      }

      try {
        const latest = await fetchLatest(orderId);
        if (isPostPickupStatus(latest.status)) {
          setFeedback({
            kind: 'success',
            message:
              latest.status === 'DELIVERED'
                ? 'The latest status shows this order was delivered.'
                : 'The latest status shows this order is out for delivery.',
          });
          return;
        }
        if (latest.status !== 'READY_FOR_PICKUP') {
          setFeedback({
            kind: 'error',
            message: 'This order is no longer Ready. The latest status has been loaded.',
          });
          return;
        }

        setFeedback({
          kind: 'error',
          message:
            'Pickup confirmation is not exposed by the current Chef API. No order status was changed.',
        });
      } catch (cause: unknown) {
        const appError = cause instanceof AppApiError ? cause : toAppApiError(cause);
        setFeedback({
          kind: 'error',
          message: appError.message || 'Could not refresh the pickup status. Try again.',
        });
        throw appError;
      } finally {
        endAction(orderId);
      }
    },
    [beginAction, endAction, fetchLatest],
  );

  const reportPickupDelay = React.useCallback(
    async (orderId: string) => {
      if (!beginAction(orderId, 'reporting-delay')) {
        throw new AppApiError(
          'CHEF_READY_ACTION_IN_PROGRESS',
          'An action is already in progress for this order.',
          409,
        );
      }

      try {
        const latest = await fetchLatest(orderId);
        if (latest.status !== 'READY_FOR_PICKUP') {
          setFeedback({
            kind: isPostPickupStatus(latest.status) ? 'success' : 'error',
            message: isPostPickupStatus(latest.status)
              ? 'Pickup already progressed. The latest order status has been loaded.'
              : 'This order is no longer Ready. The latest status has been loaded.',
          });
          return;
        }

        setFeedback({
          kind: 'error',
          message:
            'Pickup escalation is not exposed by the current Chef API. No support or escalation request was sent.',
        });
      } catch (cause: unknown) {
        const appError = cause instanceof AppApiError ? cause : toAppApiError(cause);
        setFeedback({
          kind: 'error',
          message: appError.message || 'Could not refresh this pickup. Try again.',
        });
        throw appError;
      } finally {
        endAction(orderId);
      }
    },
    [beginAction, endAction, fetchLatest],
  );

  return {
    actionStateByOrder,
    feedback,
    checkPickup,
    reportPickupDelay,
    clearFeedback: React.useCallback(() => setFeedback(null), []),
  };
}
