import React from 'react';
import {useCustomerAddressesQuery} from '../../customerAddresses/query/customerAddressQueries';
import {
  isCustomerAddressDeliveryReady,
  type CustomerAddress,
} from '../../customerAddresses/domain/customerAddressContract';

export interface MealPlanCheckoutValue {
  startDate: string | null;
  setStartDate: (date: string) => void;
  deliveryAddressId: string | null;
  setDeliveryAddressId: (id: string) => void;
}

const MealPlanCheckoutContext = React.createContext<MealPlanCheckoutValue | null>(null);

/** Holds the start date and delivery address picked on Review/Address for the lifetime of the meal-plan stack. */
export function MealPlanCheckoutProvider({children}: React.PropsWithChildren) {
  const [startDate, setStartDate] = React.useState<string | null>(null);
  const [deliveryAddressId, setDeliveryAddressId] = React.useState<string | null>(null);
  const value = React.useMemo(
    () => ({startDate, setStartDate, deliveryAddressId, setDeliveryAddressId}),
    [startDate, deliveryAddressId],
  );
  return (
    <MealPlanCheckoutContext.Provider value={value}>
      {children}
    </MealPlanCheckoutContext.Provider>
  );
}

export function useMealPlanCheckout(): MealPlanCheckoutValue {
  const value = React.useContext(MealPlanCheckoutContext);
  if (!value) {
    throw new Error('useMealPlanCheckout must be used inside MealPlanCheckoutProvider');
  }
  return value;
}

/**
 * Delivery-ready saved addresses only. The chosen one wins while it is still delivery-ready;
 * otherwise the default address, then the first. `address` is null when none qualifies.
 * Always send `address?.id` to the API, never the context's raw `deliveryAddressId` (it may be stale).
 * A failed fetch leaves `address` null with `isError` true: show a retry, not "Add an address".
 */
export function useSelectedDeliveryAddress(): {
  address: CustomerAddress | null;
  addresses: CustomerAddress[];
  loading: boolean;
  isError: boolean;
} {
  const {deliveryAddressId} = useMealPlanCheckout();
  const {data, isLoading, isError} = useCustomerAddressesQuery();
  const addresses = React.useMemo(
    () => (data ?? []).filter(isCustomerAddressDeliveryReady),
    [data],
  );
  const address =
    addresses.find(candidate => candidate.id === deliveryAddressId) ??
    addresses.find(candidate => candidate.isDefault) ??
    addresses[0] ??
    null;
  return {address, addresses, loading: isLoading, isError};
}
