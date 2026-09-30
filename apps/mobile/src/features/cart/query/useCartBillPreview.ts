import {useQuery} from '@tanstack/react-query';
import {useIsFocused} from '@react-navigation/native';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {CART_BILL_PREVIEW_AVAILABLE, cartBillPreviewApi} from '../api/cartBillPreviewApi';
import type {CartSnapshot} from '../domain/cartTypes';

export function cartBillPreviewInputKey(snapshot: CartSnapshot, addressId: string): string {
  return JSON.stringify({addressId, cartId: snapshot.cartId, currency: snapshot.currency,
    foodSubtotal: snapshot.totals.foodSubtotal.amount,
    items: snapshot.lines.map(line => ({id: line.lineId, menuItemId: line.menuItemId,
      kitchenId: line.kitchenId, quantity: line.quantity, price: line.unitPrice.amount,
      updatedAt: line.updatedAt})).sort((a, b) => a.id.localeCompare(b.id))});
}

export function useCartBillPreview(refreshWhileVisible = false) {
  const focused = useIsFocused();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const snapshot = useAppSelector(state => state.cart.snapshot);
  const snapshotStatus = useAppSelector(state => state.cart.snapshotStatus);
  const addressId = useAppSelector(state => state.customerShell.selectedLocation?.addressId ?? null);
  const pendingMutation = useAppSelector(state => Object.values(state.cart.mutations).some(entry => entry.status === 'PENDING'));
  const inputKey = snapshot && addressId ? cartBillPreviewInputKey(snapshot, addressId) : null;
  const enabled = CART_BILL_PREVIEW_AVAILABLE && Boolean(identityId && inputKey && snapshot?.lines.length && snapshotStatus === 'READY' && !pendingMutation);
  const query = useQuery({
    queryKey: identityId && inputKey
      ? createPrivateQueryKey('cart-bill-preview', {userId: identityId, role: 'CUSTOMER', entityId: inputKey})
      : ['craves', 'v1', 'private', 'cart-bill-preview', 'disabled'],
    queryFn: ({signal}) => cartBillPreviewApi.preview(snapshot!, addressId!, signal),
    enabled,
    staleTime: 30_000,
    gcTime: 120_000,
    retry: false,
    refetchInterval: current => current.state.error ? false : enabled && refreshWhileVisible && focused ? 60_000 : false,
  });
  const preview = enabled && query.data && Date.parse(query.data.expiresAt) > Date.now() ? query.data : null;
  return {...query, preview, addressId, enabled, available: CART_BILL_PREVIEW_AVAILABLE};
}

/** Warm the bill as soon as a confirmed cart mutation arrives, before Cart opens. */
export function CartBillPreviewSync() {
  useCartBillPreview();
  return null;
}
