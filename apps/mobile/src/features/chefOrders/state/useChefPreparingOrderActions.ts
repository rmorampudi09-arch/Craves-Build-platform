import React from 'react';
import {Linking} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError, toAppApiError} from '../../../core/http/apiError';
import {
  chefOrderDetailApi,
  type ChefOrderDetail,
} from '../api/chefOrderDetailApi';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {createChefOrderDetailQueryKey} from './useChefOrderDetailContract';

export type ChefPreparingOrderAction = 'marking-ready' | 'calling';

export interface ChefPreparingOrderFeedback {
  kind: 'success' | 'error';
  message: string;
}

export interface ChefPreparingOrderActions {
  actionStateByOrder: Record<string, ChefPreparingOrderAction>;
  feedback: ChefPreparingOrderFeedback | null;
  markReady: (orderId: string) => Promise<void>;
  callCustomer: (orderId: string) => Promise<void>;
  clearFeedback: () => void;
}

function isPreparingStatus(status: ChefOrderDetail['status']): boolean {
  return status === 'CHEF_ACCEPTED' || status === 'PREPARING';
}

function isReadyStatus(status: ChefOrderDetail['status']): boolean {
  return status === 'READY_FOR_PICKUP';
}

function callablePhone(detail: ChefOrderDetail): string | null {
  const phone = detail.deliveryAddress?.contactPhoneNumber.trim() ?? '';
  if (!phone) {
    return null;
  }
  const normalized = phone.replace(/[^+\d]/g, '');
  return normalized.length >= 7 ? normalized : null;
}

export function useChefPreparingOrderActions(): ChefPreparingOrderActions {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const operational = useChefOperationalState();
  const activeByOrderRef = React.useRef(new Set<string>());
  const [actionStateByOrder, setActionStateByOrder] = React.useState<
    Record<string, ChefPreparingOrderAction>
  >({});
  const [feedback, setFeedback] = React.useState<ChefPreparingOrderFeedback | null>(null);

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
    (orderId: string, action: ChefPreparingOrderAction): boolean => {
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

  const reconcileLatest = React.useCallback(
    async (orderId: string): Promise<ChefOrderDetail | null> => {
      try {
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
      } catch {
        return null;
      }
    },
    [cacheDetail, operational],
  );

  const markReady = React.useCallback(
    async (orderId: string) => {
      if (!beginAction(orderId, 'marking-ready')) {
        throw new AppApiError(
          'CHEF_ORDER_ACTION_IN_PROGRESS',
          'An action is already in progress for this order.',
          409,
        );
      }

      try {
        const latest = await chefOrderDetailApi.getOrder(orderId);
        cacheDetail(latest);
        operational.reconcileOrderStatus(
          latest.id,
          latest.status,
          latest.updatedAt,
          latest.prepTimeMinutes,
        );

        if (isReadyStatus(latest.status)) {
          operational.refresh().catch(() => undefined);
          setFeedback({kind: 'success', message: 'Order is already ready for pickup.'});
          return;
        }

        if (!isPreparingStatus(latest.status)) {
          operational.refresh().catch(() => undefined);
          throw new AppApiError(
            'CHEF_ORDER_NOT_PREPARING',
            'This order is no longer in Preparing. The latest status has been loaded.',
            409,
          );
        }

        const ready = await chefOrderDetailApi.markReadyForPickup(orderId);
        cacheDetail(ready);
        operational.reconcileOrderStatus(
          ready.id,
          ready.status,
          ready.updatedAt,
          ready.prepTimeMinutes,
        );
        operational.refresh().catch(() => undefined);
        setFeedback({kind: 'success', message: 'Order marked ready for pickup.'});
      } catch (cause: unknown) {
        const appError = cause instanceof AppApiError ? cause : toAppApiError(cause);
        if (appError.status === 409) {
          const latest = await reconcileLatest(orderId);
          if (latest && isReadyStatus(latest.status)) {
            setFeedback({kind: 'success', message: 'Order is already ready for pickup.'});
            return;
          }
        }
        setFeedback({
          kind: 'error',
          message: appError.message || 'Could not mark this order ready. Try again.',
        });
        throw appError;
      } finally {
        endAction(orderId);
      }
    }, [beginAction, cacheDetail, endAction, operational, reconcileLatest],
  );

  const callCustomer = React.useCallback(
    async (orderId: string) => {
      if (!beginAction(orderId, 'calling')) {
        throw new AppApiError(
          'CHEF_ORDER_ACTION_IN_PROGRESS',
          'An action is already in progress for this order.',
          409,
        );
      }

      try {
        const latest = await chefOrderDetailApi.getOrder(orderId);
        cacheDetail(latest);
        operational.reconcileOrderStatus(
          latest.id,
          latest.status,
          latest.updatedAt,
          latest.prepTimeMinutes,
        );
        const phone = callablePhone(latest);
        if (!phone) {
          throw new AppApiError(
            'CHEF_CUSTOMER_CONTACT_UNAVAILABLE',
            'Customer calling is unavailable for this order.',
            409,
          );
        }
        const url = `tel:${phone}`;
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          throw new AppApiError(
            'CHEF_PHONE_APP_UNAVAILABLE',
            'A phone app is not available on this device.',
            409,
          );
        }
        await Linking.openURL(url);
      } catch (cause: unknown) {
        const appError = cause instanceof AppApiError ? cause : toAppApiError(cause);
        setFeedback({
          kind: 'error',
          message: appError.message || 'Could not start the customer call.',
        });
        throw appError;
      } finally {
        endAction(orderId);
      }
    }, [beginAction, cacheDetail, endAction, operational],
  );

  return {
    actionStateByOrder,
    feedback,
    markReady,
    callCustomer,
    clearFeedback: React.useCallback(() => setFeedback(null), []),
  };
}
