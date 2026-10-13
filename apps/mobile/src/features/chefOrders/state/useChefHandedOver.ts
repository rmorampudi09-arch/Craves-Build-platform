import React from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {useChefToast} from '../../chefShell/components/ui';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {chefOrderDetailApi} from '../api/chefOrderDetailApi';
import {createChefOrderDetailQueryKey} from './useChefOrderDetailContract';

/**
 * Set once the server says it has no hand-over route, so later taps say "coming soon" without asking again this app session.
 * shortcut: not stored on the phone, so the next launch asks the server once more; upgrade if that call ever costs anything.
 */
export const chefHandedOverRoute = {missing: false};

export const HANDED_OVER_COMING_SOON = 'Handed over is coming soon.';
export const HANDED_OVER_FAILED = "We couldn't save that. Check your connection and try again.";

export interface ChefHandedOver {
  /** The Handed over button shows only for an order the server lets the chef hand over, and only until it is done. A route that is not published yet answers "coming soon" when tapped. */
  canHandOver: (order: {id: string; chefHandedOverAt?: string | null}) => boolean;
  /** The order whose hand-over is being sent. */
  busyOrderId: string | null;
  /** Tells Craves the bag went to the courier. One request per order at a time; never throws. */
  handOver: (orderId: string) => Promise<void>;
}

export function useChefHandedOver(): ChefHandedOver {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();
  const operational = useChefOperationalState();
  const toast = useChefToast();
  const activeRef = React.useRef(new Set<string>());
  const [busyOrderId, setBusyOrderId] = React.useState<string | null>(null);
  const [doneIds, setDoneIds] = React.useState<readonly string[]>([]);
  const canHandOver = React.useCallback(
    (order: {id: string; chefHandedOverAt?: string | null}) =>
      order.chefHandedOverAt === null && !doneIds.includes(order.id),
    [doneIds],
  );

  const handOver = React.useCallback(
    async (orderId: string) => {
      if (activeRef.current.has(orderId)) {
        return;
      }
      if (chefHandedOverRoute.missing) {
        toast.show(HANDED_OVER_COMING_SOON);
        return;
      }
      activeRef.current.add(orderId);
      setBusyOrderId(orderId);
      try {
        const updated = await chefOrderDetailApi.handedOver(orderId);
        if (identityId) {
          queryClient.setQueryData(createChefOrderDetailQueryKey(identityId, updated.id), updated);
        }
        operational.reconcileOrderStatus(updated.id, updated.status, updated.updatedAt, updated.prepTimeMinutes);
        operational.refresh().catch(() => undefined);
        setDoneIds(current => [...current, orderId]);
        toast.show('Marked as handed over');
      } catch (error) {
        if (isRouteNotPublished(error)) {
          chefHandedOverRoute.missing = true;
          toast.show(HANDED_OVER_COMING_SOON);
        } else {
          toast.show(HANDED_OVER_FAILED);
        }
      } finally {
        activeRef.current.delete(orderId);
        setBusyOrderId(null);
      }
    },
    [identityId, operational, queryClient, toast],
  );

  return {canHandOver, busyOrderId, handOver};
}
