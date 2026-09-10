import {useQuery} from '@tanstack/react-query';
import {queryStaleTimes} from '../../../app/query/queryPolicy';
import {customerCatalogPresentationApi} from '../../../shared/catalog/customerCatalogPresentationApi';

export function useCustomerOrderKitchenPresentationQuery(kitchenId: string) {
  return useQuery({
    queryKey: ['craves', 'v1', 'public', 'order-kitchen-presentation', kitchenId],
    queryFn: ({signal}) => customerCatalogPresentationApi.getKitchen(kitchenId, signal),
    staleTime: queryStaleTimes.discoveryMs,
  });
}

export function useCustomerOrderMenuItemImageQuery(menuItemId: string) {
  return useQuery({
    queryKey: ['craves', 'v1', 'public', 'order-menu-item-image', menuItemId],
    queryFn: ({signal}) =>
      customerCatalogPresentationApi.getMenuItemPrimaryImageUrl(menuItemId, signal),
    staleTime: queryStaleTimes.discoveryMs,
  });
}
