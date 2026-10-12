import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {OrderCardOrder} from '../../chefShell/components/ui/OrderCard';
import type {VegMarkType} from '../../chefShell/components/ui/VegMark';

/** What the shared OrderCard shows for an order from the live list: customer, area, age, total, dishes and the customer's note. */
export function toOrderCardOrder(order: ChefOperationalOrder): OrderCardOrder {
  return {
    id: order.id,
    customerName: order.customerName,
    area: order.deliverySummary ? order.deliverySummary.areaName ?? order.deliverySummary.city : undefined,
    placedAt: order.createdAt ?? undefined,
    total: order.foodSubtotal,
    items: (order.items ?? []).map(item => ({
      name: item.itemName,
      quantity: item.quantity,
      foodType: item.foodType as VegMarkType | undefined,
    })),
    note: order.customerNote,
  };
}

/** `1 × Dum Chicken biriyani, 2 × Mirapakaya bajji`. Empty when the list sent no dishes. */
export function itemsSummary(items: readonly {quantity: number; itemName: string}[] | undefined): string {
  return (items ?? []).map(item => `${item.quantity} × ${item.itemName}`).join(', ');
}
